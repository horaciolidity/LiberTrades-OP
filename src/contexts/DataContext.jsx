// src/contexts/DataContext.jsx
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const DataContext = createContext(null);

// ========= Helpers =========
const ensureArray = (v) => (Array.isArray(v) ? v : []);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const nowMs = () => Date.now();

// Toggle para no pegarle a una tabla que no tenés
const USE_PUBLIC_SETTINGS =
  String(import.meta.env.VITE_USE_PUBLIC_SETTINGS || '').trim() === '1';

// Lee una clave de la tabla pública (opcional)
async function getSetting(key) {
  if (!USE_PUBLIC_SETTINGS) return null;
  try {
    const { data, error } = await supabase
      .from('public_settings')
      .select('value')
      .eq('key', key)
      .single();
    if (error) return null;
    return data?.value ?? null;
  } catch {
    return null;
  }
}

// ========= Price Feed Config =========
const BINANCE_WS = 'wss://stream.binance.com:9443/ws';
/**
 * Pairs a trackear. key es el símbolo que usará la UI.
 * stream es el stream de Binance (en minúsculas) contra USDT.
 * USDT no tiene stream (lo mantenemos fijo/ruido muy bajo en sim).
 */
const DEFAULT_PAIRS = [
  { key: 'BTC', stream: 'btcusdt' },
  { key: 'ETH', stream: 'ethusdt' },
  { key: 'BNB', stream: 'bnbusdt' },
  { key: 'ADA', stream: 'adausdt' },
  { key: 'USDT', stream: null },
];

// Semillas si no hay precio previo
const DEFAULT_START = {
  BTC: 45000,
  ETH: 3200,
  BNB: 320,
  ADA: 0.85,
  USDT: 1.0,
};

// Longitud del historial de precios en memoria
const MAX_POINTS = 300;

// Sim vol por activo (en % step)
const SIM_VOL = {
  BTC: 0.35,
  ETH: 0.45,
  BNB: 0.50,
  ADA: 0.70,
  USDT: 0.02,
};

export function DataProvider({ children }) {
  const { user, profile } = useAuth();

  // ======= Estado que la UI consume SINCRÓNICAMENTE =======
  const [investments, setInvestments] = useState([]);   // []
  const [transactions, setTransactions] = useState([]); // []
  const [referrals, setReferrals] = useState([]);       // []
  const [botActivations, setBotActivations] = useState([]); // []

  // ======= Precio y modo de mercado =======
  /**
   * marketMode:
   *  - 'real' => Binance WebSocket
   *  - 'sim'  => simulación local (random walk)
   */
  const [marketMode, setMarketMode] = useState(
    () => localStorage.getItem('market_mode') || 'real'
  );

  /**
   * cryptoPrices estructura:
   * {
   *   BTC: { price: number, change: number, history: [{time, value}], source: 'real'|'sim' }
   *   ...
   * }
   */
  const [cryptoPrices, setCryptoPrices] = useState(() => {
    const base = {};
    for (const { key } of DEFAULT_PAIRS) {
      base[key] = {
        price: DEFAULT_START[key] ?? 0,
        change: 0,
        history: [],
        source: 'sim',
      };
    }
    return base;
  });

  // Exponer lista de pares (por si a futuro querés cambiar dinámicamente)
  const [pairs, setPairs] = useState(DEFAULT_PAIRS);

  // refs para WS/intervals
  const wsRefs = useRef({});
  const simTimer = useRef(null);
  const mountedRef = useRef(false);

  // ======= Cargar modo de public_settings / env en arranque =======
  useEffect(() => {
    let alive = true;
    (async () => {
      const dbMode = await getSetting('market_mode'); // null si no usás la tabla
      const envMode = import.meta.env.VITE_MARKET_MODE_DEFAULT;
      const nextMode = (dbMode || envMode || marketMode || 'real').toLowerCase();
      if (alive) {
        const norm = nextMode === 'sim' ? 'sim' : 'real';
        setMarketMode(norm);
        localStorage.setItem('market_mode', norm);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ======= Helpers de precio =======
  const pushPoint = (key, value, source) => {
    setCryptoPrices((prev) => {
      const p = prev[key] ?? { price: 0, change: 0, history: [], source };
      const last = p.price || Number(value) || 0;
      const price = Number(value) || last;
      const change = last ? ((price - last) / last) * 100 : 0;

      const history = [...p.history, { time: nowMs(), value: price }];
      if (history.length > MAX_POINTS) history.splice(0, history.length - MAX_POINTS);

      return {
        ...prev,
        [key]: { price, change, history, source },
      };
    });
  };

  const resetHistory = () => {
    setCryptoPrices((prev) => {
      const next = {};
      for (const k of Object.keys(prev)) {
        next[k] = { ...prev[k], history: [] };
      }
      return next;
    });
  };

  // ======= FEED: REAL (Binance WebSocket) =======
  const openSocket = (symbolKey, streamName) => {
    if (!streamName) return null; // USDT u otros sin stream
    const url = `${BINANCE_WS}/${streamName}@trade`;
    const ws = new WebSocket(url);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        // Precio puede venir en p o data.p
        const raw = msg?.p ?? msg?.data?.p ?? msg?.price;
        if (raw) pushPoint(symbolKey, Number(raw), 'real');
      } catch {}
    };

    ws.onclose = () => {
      // reconectar simple
      if (wsRefs.current[symbolKey] === ws) {
        setTimeout(() => {
          if (marketMode === 'real') {
            wsRefs.current[symbolKey] = openSocket(symbolKey, streamName);
          }
        }, 1200);
      }
    };

    ws.onerror = () => {
      try { ws.close(); } catch {}
    };

    return ws;
  };

  const startRealFeed = () => {
    // cerrar sim si estaba
    if (simTimer.current) {
      clearInterval(simTimer.current);
      simTimer.current = null;
    }
    resetHistory();

    // abrir 1 socket por par (excepto USDT)
    for (const { key, stream } of pairs) {
      if (!stream) continue;
      try {
        wsRefs.current[key]?.close?.();
      } catch {}
      wsRefs.current[key] = openSocket(key, stream);
    }

    // USDT: congela en 1
    pushPoint('USDT', 1.0, 'real');
  };

  const stopRealFeed = () => {
    Object.values(wsRefs.current || {}).forEach((ws) => {
      try { ws.close(); } catch {}
    });
    wsRefs.current = {};
  };

  // ======= FEED: SIMULADO (random walk) =======
  const startSimFeed = () => {
    stopRealFeed();
    resetHistory();

    // Si había precio "real" previo, lo tomamos como base; sino DEFAULT_START
    setCryptoPrices((prev) => {
      const next = { ...prev };
      for (const { key } of pairs) {
        const base =
          (prev[key]?.price && Number(prev[key].price)) || DEFAULT_START[key] || 1;
        next[key] = {
          price: base,
          change: 0,
          history: [],
          source: 'sim',
        };
      }
      return next;
    });

    simTimer.current = setInterval(() => {
      setCryptoPrices((prev) => {
        const next = { ...prev };
        for (const { key } of pairs) {
          const old = prev[key] ?? { price: DEFAULT_START[key] || 1, history: [] };
          const vol = SIM_VOL[key] ?? 0.3;
          const step = (Math.random() - 0.5) * 2 * vol; // +/- vol %
          const np = clamp(old.price * (1 + step / 100), 0.0000001, 10_000_000);
          const change = old.price ? ((np - old.price) / old.price) * 100 : 0;
          const hist = [...(old.history || []), { time: nowMs(), value: np }];
          if (hist.length > MAX_POINTS) hist.splice(0, hist.length - MAX_POINTS);
          next[key] = { price: np, change, history: hist, source: 'sim' };
        }
        return next;
      });
    }, 1000);
  };

  const stopSimFeed = () => {
    if (simTimer.current) {
      clearInterval(simTimer.current);
      simTimer.current = null;
    }
  };

  // ======= Efecto: arrancar/alternar feed según marketMode =======
  useEffect(() => {
    if (!mountedRef.current) mountedRef.current = true;

    localStorage.setItem('market_mode', marketMode);

    if (marketMode === 'real') {
      startRealFeed();
    } else {
      startSimFeed();
    }

    // Limpieza al desmontar o cambiar de modo
    return () => {
      stopRealFeed();
      stopSimFeed();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketMode, pairs.map(p => p.key).join('|')]);

  // ======= API de feed para la UI/Trading =======
  const toggleMarketMode = () =>
    setMarketMode((m) => (m === 'real' ? 'sim' : 'real'));

  const getMarketMode = () => marketMode;

  const setTrackedPairs = (newPairs) => {
    // newPairs: [{key:'SOL', stream:'solusdt'}, ...]
    if (!Array.isArray(newPairs) || newPairs.length === 0) return;
    setPairs(newPairs);
  };

  const getPrice = (symbol) => Number(cryptoPrices?.[symbol]?.price || 0);
  const getSeries = (symbol) => ensureArray(cryptoPrices?.[symbol]?.history);

  // ======= Investment Plans (como tenías) =======
  const investmentPlans = useMemo(
    () => [
      { id: 1, name: 'Plan Básico',   minAmount: 100,   maxAmount: 999,   dailyReturn: 1.5, duration: 30, description: 'Perfecto para principiantes' },
      { id: 2, name: 'Plan Estándar', minAmount: 1000,  maxAmount: 4999,  dailyReturn: 2.0, duration: 30, description: 'Para inversores intermedios' },
      { id: 3, name: 'Plan Premium',  minAmount: 5000,  maxAmount: 19999, dailyReturn: 2.5, duration: 30, description: 'Para inversores avanzados' },
      { id: 4, name: 'Plan VIP',      minAmount: 20000, maxAmount: 100000,dailyReturn: 3.0, duration: 30, description: 'Para grandes inversores' },
    ],
    []
  );

  // ======= Fetchers (async) que ACTUALIZAN el estado =======
  async function refreshInvestments() {
    if (!user?.id) {
      setInvestments([]);
      return;
    }
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshInvestments] error:', error);
      setInvestments([]);
      return;
    }

    const now = dayjs();
    const mapped = ensureArray(data).map((inv) => {
      const start = dayjs(inv.created_at);
      const duration = Number(inv.duration || 0);
      const daysElapsed = Math.min(now.diff(start, 'day'), duration);
      const dailyReturn = Number(inv.daily_return || 0);
      // ganancias = monto * (porcentaje diario) * días
      const earnings = (Number(inv.amount || 0) * (dailyReturn / 100)) * daysElapsed;

      return {
        // compat filtros
        user_id: inv.user_id,
        userId: inv.user_id,

        id: inv.id,
        planName: inv.plan_name,
        amount: Number(inv.amount || 0),
        dailyReturn,
        duration,
        createdAt: inv.created_at,
        status: inv.status,
        currency: inv.currency_input,
        daysElapsed,
        earnings,
      };
    });

    setInvestments(mapped);
  }

  async function refreshTransactions() {
    if (!user?.id) {
      setTransactions([]);
      return;
    }
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshTransactions] error:', error);
      setTransactions([]);
      return;
    }

    const mapped = (Array.isArray(data) ? data : []).map((tx) => {
      let base = (tx.type || '').toLowerCase();
      if (base === 'plan_purchase') base = 'investment';

      const ref = (tx.reference_type || '').toLowerCase();
      let displayType = base;
      if (ref === 'bot_activation') displayType = 'bot_activation';
      if (ref === 'bot_profit')     displayType = 'bot_profit';
      if (ref === 'bot_refund')     displayType = 'bot_refund';
      if (ref === 'bot_fee')        displayType = 'bot_fee';

      return {
        user_id: tx.user_id,
        userId: tx.user_id,
        id: tx.id,
        type: displayType,
        rawType: tx.type,
        status: tx.status,
        amount: Number(tx.amount || 0),
        currency: tx.currency || 'USDT',
        description: tx.description || '',
        createdAt: tx.created_at,
        referenceType: tx.reference_type,
        referenceId: tx.reference_id,
      };
    });

    setTransactions(mapped);
  }

  async function refreshReferrals() {
    // En tu base, referred_by es UUID. Filtramos sólo por user.id.
    if (!user?.id) {
      setReferrals([]);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at, username, referred_by')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshReferrals] error:', error);
      setReferrals([]);
      return;
    }
    setReferrals(ensureArray(data));
  }

  // ======= Bots =======
  async function refreshBotActivations() {
    if (!user?.id) { setBotActivations([]); return; }
    const { data, error } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('[refreshBotActivations] error:', error); setBotActivations([]); return; }

    const mapped = ensureArray(data).map((b) => ({
      id: b.id,
      user_id: b.user_id,
      userId: b.user_id,
      botId: b.bot_id,
      botName: b.bot_name,
      strategy: b.strategy,
      amountUsd: Number(b.amount_usd || 0),
      status: b.status, // active | paused | cancelled
      createdAt: b.created_at,
    }));
    setBotActivations(mapped);
  }

  async function refreshAll() {
    await Promise.all([
      refreshInvestments(),
      refreshTransactions(),
      refreshReferrals(),
      refreshBotActivations(),
    ]);
  }

  async function activateBot({ botId, botName, strategy = 'default', amountUsd }) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    const { data, error } = await supabase.rpc('rent_trading_bot', {
      p_user_id: user.id,
      p_bot_id: botId,
      p_bot_name: botName,
      p_strategy: strategy,
      p_amount_usd: Number(amountUsd),
    });
    if (error) { console.error('[activateBot] error:', error); return { ok:false, code:'RPC_ERROR', error }; }
    if (!data?.ok) return data; // puede devolver INSUFFICIENT_FUNDS
    await Promise.all([refreshBotActivations(), refreshTransactions()]);
    return data;
  }

  async function pauseBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    const { data, error } = await supabase.rpc('pause_trading_bot', {
      p_activation_id: activationId,
      p_user_id: user.id,
    });
    if (error) { console.error('[pauseBot] error:', error); return { ok:false, code:'RPC_ERROR', error }; }
    await refreshBotActivations();
    return data;
  }

  async function resumeBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    const { data, error } = await supabase.rpc('resume_trading_bot', {
      p_activation_id: activationId,
      p_user_id: user.id,
    });
    if (error) { console.error('[resumeBot] error:', error); return { ok:false, code:'RPC_ERROR', error }; }
    await refreshBotActivations();
    return data;
  }

  async function cancelBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    const { data, error } = await supabase.rpc('cancel_trading_bot', {
      p_activation_id: activationId,
      p_user_id: user.id,
    });
    if (error) { console.error('[cancelBot] error:', error); return { ok:false, code:'RPC_ERROR', error }; }
    await refreshBotActivations();
    return data;
  }

  async function creditBotProfit(activationId, amountUsd, note = null) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    const { data, error } = await supabase.rpc('credit_bot_profit', {
      p_activation_id: activationId,
      p_user_id: user.id,
      p_amount_usd: Number(amountUsd),
      p_note: note,
    });
    if (error) { console.error('[creditBotProfit] error:', error); return { ok:false, code:'RPC_ERROR', error }; }
    await refreshTransactions();
    return data;
  }

  // ======= Refetch al cambiar de user =======
  useEffect(() => {
    setInvestments([]);
    setTransactions([]);
    setReferrals([]);
    setBotActivations([]);

    if (user?.id) {
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ======= Subs en tiempo real =======
  useEffect(() => {
    if (!user?.id) return;

    const chTx = supabase
      .channel(`tx_user_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        refreshTransactions
      )
      .subscribe();

    const chInv = supabase
      .channel(`inv_user_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${user.id}` },
        refreshInvestments
      )
      .subscribe();

    const chBots = supabase
      .channel(`bots_user_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bot_activations', filter: `user_id=eq.${user.id}` },
        refreshBotActivations
      )
      .subscribe();

    return () => {
      try { chTx.unsubscribe(); } catch {}
      try { chInv.unsubscribe(); } catch {}
      try { chBots.unsubscribe(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ======= Mutaciones básicas =======
  async function addInvestment({
    planName,
    amount,
    dailyReturn,
    duration,
    currency = 'USDT',
  }) {
    if (!user?.id) return null;
    const payload = {
      user_id: user.id,
      plan_name: planName,
      amount: Number(amount),
      daily_return: Number(dailyReturn),
      duration: Number(duration),
      status: 'active',
      currency_input: currency,
    };
    const { data, error } = await supabase
      .from('investments')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('[addInvestment] error:', error);
      return null;
    }

    await refreshInvestments();

    return {
      user_id: data.user_id,
      userId: data.user_id,
      id: data.id,
      planName: data.plan_name,
      amount: Number(data.amount || 0),
      dailyReturn: Number(data.daily_return || 0),
      duration: Number(data.duration || 0),
      createdAt: data.created_at,
      status: data.status,
      currency: data.currency_input,
      daysElapsed: 0,
      earnings: 0,
    };
  }

  async function addTransaction({
    amount,
    type,
    currency = 'USDT',
    description = '',
    referenceType = null,
    referenceId = null,
    status = 'completed',
  }) {
    if (!user?.id) return null;

    const payload = {
      user_id: user.id,
      amount: Number(amount),
      type, // 'deposit' | 'withdrawal' | 'plan_purchase' | ...
      status,
      currency,
      description,
      reference_type: referenceType,
      reference_id: referenceId,
    };

    const { data, error } = await supabase
      .from('wallet_transactions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.error('[addTransaction] error:', error);
      return null;
    }

    await refreshTransactions();

    let mappedType = data.type;
    if (mappedType === 'plan_purchase') mappedType = 'investment';

    return {
      user_id: data.user_id,
      userId: data.user_id,
      id: data.id,
      type: mappedType,
      status: data.status,
      amount: Number(data.amount || 0),
      currency: data.currency || 'USDT',
      description: data.description || '',
      createdAt: data.created_at,
      referenceType: data.reference_type,
      referenceId: data.reference_id,
    };
  }

  // ======= API pública del contexto =======
  const value = useMemo(
    () => ({
      // datos listos sin await
      investments,
      transactions,
      referrals,
      botActivations,

      // precios y market mode
      cryptoPrices,
      marketMode,
      setMarketMode,
      toggleMarketMode,
      getMarketMode,
      getPrice,
      getSeries,
      pairs,
      setTrackedPairs,

      // helpers y datos
      investmentPlans,

      // refrescos
      refreshInvestments,
      refreshTransactions,
      refreshReferrals,
      refreshBotActivations,
      refreshAll,

      // mutaciones
      addInvestment,
      addTransaction,

      // bots
      activateBot,
      pauseBot,
      resumeBot,
      cancelBot,
      creditBotProfit,
    }),
    [
      investments,
      transactions,
      referrals,
      botActivations,
      cryptoPrices,
      marketMode,
      pairs,
      investmentPlans,
    ]
  );

  return (
    <DataContext.Provider value={value}>{children}</DataContext.Provider>
  );
}

// Hook con fallback seguro (por si se usa fuera del provider)
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    return {
      // datos
      investments: [],
      transactions: [],
      referrals: [],
      botActivations: [],
      cryptoPrices: {},
      marketMode: 'real',
      pairs: DEFAULT_PAIRS,
      investmentPlans: [],

      // precio helpers
      setMarketMode: () => {},
      toggleMarketMode: () => {},
      getMarketMode: () => 'real',
      getPrice: () => 0,
      getSeries: () => [],
      setTrackedPairs: () => {},

      // refresh
      refreshInvestments: async () => {},
      refreshTransactions: async () => {},
      refreshReferrals: async () => {},
      refreshBotActivations: async () => {},
      refreshAll: async () => {},

      // mutaciones
      addInvestment: async () => null,
      addTransaction: async () => null,

      // bots
      activateBot: async () => ({ ok: false }),
      pauseBot: async () => ({ ok: false }),
      resumeBot: async () => ({ ok: false }),
      cancelBot: async () => ({ ok: false }),
      creditBotProfit: async () => ({ ok: false }),
    };
  }
  return ctx;
}
