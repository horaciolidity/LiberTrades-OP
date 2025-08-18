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

const ensureArray = (v) => (Array.isArray(v) ? v : []);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const nowMs = () => Date.now();

const USE_PUBLIC_SETTINGS =
  String(import.meta.env.VITE_USE_PUBLIC_SETTINGS || '').trim() === '1';

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

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';
const DEFAULT_PAIRS = [
  { key: 'BTC', stream: 'btcusdt' },
  { key: 'ETH', stream: 'ethusdt' },
  { key: 'BNB', stream: 'bnbusdt' },
  { key: 'ADA', stream: 'adausdt' },
  { key: 'USDT', stream: null },
];
const DEFAULT_START = { BTC: 45000, ETH: 3200, BNB: 320, ADA: 0.85, USDT: 1.0 };
const MAX_POINTS = 300;
const SIM_VOL = { BTC: 0.35, ETH: 0.45, BNB: 0.50, ADA: 0.70, USDT: 0.02 };

export function DataProvider({ children }) {
  const { user } = useAuth();

  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [botActivations, setBotActivations] = useState([]);

  const [marketMode, setMarketMode] = useState(
    () => localStorage.getItem('market_mode') || 'real'
  );

  const [cryptoPrices, setCryptoPrices] = useState(() => {
    const base = {};
    for (const { key } of DEFAULT_PAIRS) {
      base[key] = { price: DEFAULT_START[key] ?? 0, change: 0, history: [], source: 'sim' };
    }
    return base;
  });

  const [pairs, setPairs] = useState(DEFAULT_PAIRS);
  const wsRefs = useRef({});
  const simTimer = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const dbMode = await getSetting('market_mode');
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

  const pushPoint = (key, value, source) => {
    setCryptoPrices((prev) => {
      const p = prev[key] ?? { price: 0, change: 0, history: [], source };
      const last = p.price || Number(value) || 0;
      const price = Number(value) || last;
      const change = last ? ((price - last) / last) * 100 : 0;

      const history = [...p.history, { time: nowMs(), value: price }];
      if (history.length > MAX_POINTS) history.splice(0, history.length - MAX_POINTS);

      return { ...prev, [key]: { price, change, history, source } };
    });
  };

  const resetHistory = () => {
    setCryptoPrices((prev) => {
      const next = {};
      for (const k of Object.keys(prev)) next[k] = { ...prev[k], history: [] };
      return next;
    });
  };

  const openSocket = (symbolKey, streamName) => {
    if (!streamName) return null;
    const url = `${BINANCE_WS}/${streamName}@trade`;
    const ws = new WebSocket(url);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const raw = msg?.p ?? msg?.data?.p ?? msg?.price;
        if (raw) pushPoint(symbolKey, Number(raw), 'real');
      } catch {}
    };

    ws.onclose = () => {
      if (wsRefs.current[symbolKey] === ws) {
        setTimeout(() => {
          if (marketMode === 'real') {
            wsRefs.current[symbolKey] = openSocket(symbolKey, streamName);
          }
        }, 1200);
      }
    };

    ws.onerror = () => { try { ws.close(); } catch {} };

    return ws;
  };

  const startRealFeed = () => {
    if (simTimer.current) { clearInterval(simTimer.current); simTimer.current = null; }
    resetHistory();
    for (const { key, stream } of pairs) {
      if (!stream) continue;
      try { wsRefs.current[key]?.close?.(); } catch {}
      wsRefs.current[key] = openSocket(key, stream);
    }
    pushPoint('USDT', 1.0, 'real');
  };

  const stopRealFeed = () => {
    Object.values(wsRefs.current || {}).forEach((ws) => { try { ws.close(); } catch {} });
    wsRefs.current = {};
  };

  const startSimFeed = () => {
    stopRealFeed();
    resetHistory();

    setCryptoPrices((prev) => {
      const next = { ...prev };
      for (const { key } of pairs) {
        const base = (prev[key]?.price && Number(prev[key].price)) || DEFAULT_START[key] || 1;
        next[key] = { price: base, change: 0, history: [], source: 'sim' };
      }
      return next;
    });

    simTimer.current = setInterval(() => {
      setCryptoPrices((prev) => {
        const next = { ...prev };
        for (const { key } of pairs) {
          const old = prev[key] ?? { price: DEFAULT_START[key] || 1, history: [] };
          const vol = SIM_VOL[key] ?? 0.3;
          const step = (Math.random() - 0.5) * 2 * vol;
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
    if (simTimer.current) { clearInterval(simTimer.current); simTimer.current = null; }
  };

  useEffect(() => {
    if (!mountedRef.current) mountedRef.current = true;
    localStorage.setItem('market_mode', marketMode);
    if (marketMode === 'real') startRealFeed(); else startSimFeed();
    return () => { stopRealFeed(); stopSimFeed(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketMode, pairs.map(p => p.key).join('|')]);

  const toggleMarketMode = () => setMarketMode((m) => (m === 'real' ? 'sim' : 'real'));
  const getMarketMode = () => marketMode;
  const setTrackedPairs = (newPairs) => { if (Array.isArray(newPairs) && newPairs.length) setPairs(newPairs); };
  const getPrice = (symbol) => Number(cryptoPrices?.[symbol]?.price || 0);
  const getSeries = (symbol) => ensureArray(cryptoPrices?.[symbol]?.history);

  const investmentPlans = useMemo(
    () => [
      { id: 1, name: 'Plan Básico',   minAmount: 100,   maxAmount: 999,   dailyReturn: 1.5, duration: 30, description: 'Perfecto para principiantes' },
      { id: 2, name: 'Plan Estándar', minAmount: 1000,  maxAmount: 4999,  dailyReturn: 2.0, duration: 30, description: 'Para inversores intermedios' },
      { id: 3, name: 'Plan Premium',  minAmount: 5000,  maxAmount: 19999, dailyReturn: 2.5, duration: 30, description: 'Para inversores avanzados' },
      { id: 4, name: 'Plan VIP',      minAmount: 20000, maxAmount: 100000,dailyReturn: 3.0, duration: 30, description: 'Para grandes inversores' },
    ],
    []
  );

  async function refreshInvestments() {
    if (!user?.id) { setInvestments([]); return; }
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('[refreshInvestments] error:', error); setInvestments([]); return; }

    const now = dayjs();
    const mapped = ensureArray(data).map((inv) => {
      const start = dayjs(inv.created_at);
      const duration = Number(inv.duration || 0);
      const daysElapsed = Math.min(now.diff(start, 'day'), duration);
      const dailyReturn = Number(inv.daily_return || 0);
      const earnings = (Number(inv.amount || 0) * (dailyReturn / 100)) * daysElapsed;

      return {
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

  const mapTx = (tx) => {
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
      currency: tx.currency || 'USDC',
      description: tx.description || '',
      createdAt: tx.created_at,
      referenceType: tx.reference_type,
      referenceId: tx.reference_id,
    };
  };

  async function refreshTransactions() {
    if (!user?.id) { setTransactions([]); return; }
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('[refreshTransactions] error:', error); setTransactions([]); return; }

    const mapped = ensureArray(data).map(mapTx);
    setTransactions(mapped);
  }

  async function refreshReferrals() {
    if (!user?.id) { setReferrals([]); return; }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at, username, referred_by')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('[refreshReferrals] error:', error); setReferrals([]); return; }
    setReferrals(ensureArray(data));
  }

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
      status: b.status,
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
    if (!data?.ok) return data;
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

  useEffect(() => {
    setInvestments([]);
    setTransactions([]);
    setReferrals([]);
    setBotActivations([]);
    if (user?.id) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

  async function addInvestment({
    planName,
    amount,
    dailyReturn,
    duration,
    currency = 'USDC',
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

    if (error) { console.error('[addInvestment] error:', error); return null; }

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

  // NUEVO: para depósitos “pendientes” aprobados por admin y moneda por defecto USDC
  async function requestDeposit({
    amount,
    currency = 'USDC',
    method = 'crypto',
    description,
  }) {
    if (!user?.id) return { ok: false, error: 'NO_AUTH' };

    const payload = {
      user_id: user.id,
      amount: Number(amount),
      type: 'deposit',
      status: 'pending',
      currency,
      description: description ?? `Depósito vía ${method}`,
      reference_type: 'deposit_request',
      reference_id: null,
    };

    const { data, error } = await supabase
      .from('wallet_transactions')
      .insert(payload)
      .select('*')
      .single();

    if (error) { console.error('[requestDeposit] error:', error); return { ok: false, error }; }

    await refreshTransactions();
    return { ok: true, data: mapTx(data) };
  }

  async function addTransaction({
    amount,
    type,
    currency = 'USDC',
    description = '',
    referenceType = null,
    referenceId = null,
    status,
  }) {
    if (!user?.id) return null;

    const lower = String(type || '').toLowerCase();
    const defaultStatus =
      lower === 'deposit' || lower === 'withdrawal' ? 'pending' : 'completed';

    const payload = {
      user_id: user.id,
      amount: Number(amount),
      type,
      status: status ?? defaultStatus,
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

    if (error) { console.error('[addTransaction] error:', error); return null; }

    await refreshTransactions();
    return mapTx(data);
  }

  const value = useMemo(
    () => ({
      investments,
      transactions,
      referrals,
      botActivations,

      cryptoPrices,
      marketMode,
      setMarketMode,
      toggleMarketMode,
      getMarketMode,
      getPrice,
      getSeries,
      pairs,
      setTrackedPairs,

      investmentPlans,

      refreshInvestments,
      refreshTransactions,
      refreshReferrals,
      refreshBotActivations,
      refreshAll,

      addInvestment,
      addTransaction,
      requestDeposit,

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

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    return {
      investments: [],
      transactions: [],
      referrals: [],
      botActivations: [],
      cryptoPrices: {},
      marketMode: 'real',
      pairs: DEFAULT_PAIRS,
      investmentPlans: [],

      setMarketMode: () => {},
      toggleMarketMode: () => {},
      getMarketMode: () => 'real',
      getPrice: () => 0,
      getSeries: () => [],
      setTrackedPairs: () => {},

      refreshInvestments: async () => {},
      refreshTransactions: async () => {},
      refreshReferrals: async () => {},
      refreshBotActivations: async () => {},
      refreshAll: async () => {},

      addInvestment: async () => null,
      addTransaction: async () => null,
      requestDeposit: async () => ({ ok: false }),

      activateBot: async () => ({ ok: false }),
      pauseBot: async () => ({ ok: false }),
      resumeBot: async () => ({ ok: false }),
      cancelBot: async () => ({ ok: false }),
      creditBotProfit: async () => ({ ok: false }),
    };
  }
  return ctx;
}
