// src/contexts/DataContext.jsx
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const DataContext = createContext(null);

// Utilidad
const ensureArray = (v) => (Array.isArray(v) ? v : []);

// ==== Config de cotizaciones reales (Binance) ====
const ASSET_TO_SYMBOL = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  BNB: 'BNBUSDT',
  ADA: 'ADAUSDT',
  // Podés agregar más: SOL: 'SOLUSDT', etc.
};
const HISTORY_MAX = 600; // ~20 min si llega un tick cada 2s aprox.

/**
 * DataProvider
 * - Lee: investments, wallet_transactions, referrals (profiles.referred_by), bot_activations
 * - Cotizaciones reales: WebSocket de Binance (@miniTicker) + fallback REST de arranque
 * - Métodos addInvestment / addTransaction
 * - Acciones de bots (RPC opcionales; si no existen, no rompen)
 */
export function DataProvider({ children }) {
  const { user } = useAuth();

  // ======= Estado que la UI consume SINCRÓNICAMENTE =======
  const [investments, setInvestments] = useState([]);   // []
  const [transactions, setTransactions] = useState([]); // []
  const [referrals, setReferrals] = useState([]);       // []
  const [botActivations, setBotActivations] = useState([]);

  // ======= Precios (reales) =======
  const [cryptoPrices, setCryptoPrices] = useState({
    BTC: { price: 0, change: 0, history: [] },
    ETH: { price: 0, change: 0, history: [] },
    USDT: { price: 1.0, change: 0, history: [{ time: Date.now(), value: 1 }] }, // estable
    BNB: { price: 0, change: 0, history: [] },
    ADA: { price: 0, change: 0, history: [] },
  });

  // ----- Inicialización con REST + stream en vivo con WS -----
  useEffect(() => {
    let ws;
    let reconnectTimer;
    let alive = true;

    const pairs = Object.values(ASSET_TO_SYMBOL);
    const streams = pairs.map((s) => `${s.toLowerCase()}@miniTicker`).join('/');

    async function initFromREST() {
      try {
        const entries = await Promise.all(
          Object.entries(ASSET_TO_SYMBOL).map(async ([asset, symbol]) => {
            const res = await fetch(
              `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
            );
            const j = await res.json();
            const price = Number(j.lastPrice ?? j.c ?? 0);
            const change = Number(j.priceChangePercent ?? j.P ?? 0);
            return [asset, { price, change, history: [{ time: Date.now(), value: price }] }];
          })
        );

        setCryptoPrices((prev) => {
          const next = { ...prev };
          entries.forEach(([asset, val]) => {
            next[asset] = {
              ...(prev[asset] || {}),
              ...val,
              history: (prev[asset]?.history?.length ? prev[asset].history : val.history),
            };
          });
          // USDT se mantiene estable en 1
          if (!next.USDT) {
            next.USDT = { price: 1, change: 0, history: [{ time: Date.now(), value: 1 }] };
          }
          return next;
        });
      } catch (e) {
        console.warn('[Binance REST] init fallo:', e?.message || e);
      }
    }

    function connectWS() {
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          const t = payload?.data;
          const pair = t?.s; // e.g. 'BTCUSDT'
          if (!pair) return;

          const asset = Object.keys(ASSET_TO_SYMBOL).find(
            (k) => ASSET_TO_SYMBOL[k] === pair
          );
          if (!asset) return;

          const price = Number(t.c);     // last price
          const change = Number(t.P);    // 24h percent
          const now = Date.now();

          setCryptoPrices((prev) => {
            const prevEntry = prev[asset] || { price: 0, change: 0, history: [] };
            const history = [...(prevEntry.history || []), { time: now, value: price }].slice(-HISTORY_MAX);
            return {
              ...prev,
              [asset]: { price, change, history },
            };
          });
        } catch (e) {
          console.warn('[Binance WS] parse error:', e?.message || e);
        }
      };

      ws.onclose = () => {
        if (!alive) return;
        reconnectTimer = setTimeout(connectWS, 1500);
      };

      ws.onerror = () => {
        try { ws.close(); } catch (_) {}
      };
    }

    (async () => {
      await initFromREST();
      connectWS();
    })();

    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch (_) {}
    };
  }, []);

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
      const earnings = dailyReturn * daysElapsed;

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

    const mapped = ensureArray(data).map((tx) => {
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
    if (!user?.id) {
      setReferrals([]);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at, username')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshReferrals] error:', error);
      setReferrals([]);
      return;
    }
    setReferrals(ensureArray(data));
  }

  async function refreshBotActivations() {
    if (!user?.id) {
      setBotActivations([]);
      return;
    }
    const { data, error } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshBotActivations] error:', error);
      setBotActivations([]);
      return;
    }

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

  // ======= Efecto: refetch al loguear/cambiar de user =======
  useEffect(() => {
    setInvestments([]);
    setTransactions([]);
    setReferrals([]);
    setBotActivations([]);

    if (user?.id) {
      refreshInvestments();
      refreshTransactions();
      refreshReferrals();
      refreshBotActivations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ======= Mutaciones (insert) =======
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
      type, // 'deposit' | 'withdrawal' | 'plan_purchase' | 'admin_credit' | ...
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

  // ======= Acciones de bots (RPC opcionales, no fallan si no existen) =======
  async function activateBot({ botId, botName, strategy = 'default', amountUsd }) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('rent_trading_bot', {
        p_user_id: user.id,
        p_bot_id: botId,
        p_bot_name: botName,
        p_strategy: strategy,
        p_amount_usd: Number(amountUsd),
      });
      if (error) {
        console.warn('[activateBot] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[activateBot] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  async function pauseBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('pause_trading_bot', {
        p_activation_id: activationId,
        p_user_id: user.id,
      });
      if (error) {
        console.warn('[pauseBot] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await refreshBotActivations();
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[pauseBot] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  async function resumeBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('resume_trading_bot', {
        p_activation_id: activationId,
        p_user_id: user.id,
      });
      if (error) {
        console.warn('[resumeBot] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await refreshBotActivations();
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[resumeBot] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  async function cancelBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('cancel_trading_bot', {
        p_activation_id: activationId,
        p_user_id: user.id,
      });
      if (error) {
        console.warn('[cancelBot] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await refreshBotActivations();
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[cancelBot] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  async function creditBotProfit(activationId, amountUsd, note = null) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('credit_bot_profit', {
        p_activation_id: activationId,
        p_user_id: user.id,
        p_amount_usd: Number(amountUsd),
        p_note: note,
      });
      if (error) {
        console.warn('[creditBotProfit] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await refreshTransactions();
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[creditBotProfit] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  // ======= API pública =======
  const value = useMemo(
    () => ({
      // datos listos para usar sin await
      investments,
      transactions,
      referrals,
      botActivations,

      // getters sincrónicos (compat UI)
      getInvestments: () => investments,
      getTransactions: () => transactions,
      getReferrals: () => referrals,

      // acciones y refrescos
      refreshInvestments,
      refreshTransactions,
      refreshReferrals,
      addInvestment,
      addTransaction,

      // Bots
      refreshBotActivations,
      activateBot,
      pauseBot,
      resumeBot,
      cancelBot,
      creditBotProfit,

      // otros datos de UI
      cryptoPrices,          // { BTC: {price, change, history[]}, ... }
      assetToSymbol: ASSET_TO_SYMBOL, // por si la UI necesita el par exacto
      investmentPlans,
    }),
    [
      investments,
      transactions,
      referrals,
      botActivations,
      cryptoPrices,
      investmentPlans,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// Hook con fallback seguro
export function useData() {
  const ctx = useContext(DataContext);
  return ctx || {
    investments: [],
    transactions: [],
    referrals: [],
    botActivations: [],
    getInvestments: () => [],
    getTransactions: () => [],
    getReferrals: () => [],
    refreshInvestments: async () => {},
    refreshTransactions: async () => {},
    refreshReferrals: async () => {},
    addInvestment: async () => null,
    addTransaction: async () => null,
    refreshBotActivations: async () => {},
    activateBot: async () => ({ ok: false }),
    pauseBot: async () => ({ ok: false }),
    resumeBot: async () => ({ ok: false }),
    cancelBot: async () => ({ ok: false }),
    creditBotProfit: async () => ({ ok: false }),
    cryptoPrices: {},
    assetToSymbol: ASSET_TO_SYMBOL,
    investmentPlans: [],
  };
}
