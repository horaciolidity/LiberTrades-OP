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
import useHybridLivePrices from '@/hooks/useHybridLivePrices';

const DataContext = createContext(null);

// Utilidad
const ensureArray = (v) => (Array.isArray(v) ? v : []);

export function DataProvider({ children }) {
  const { user } = useAuth();

  // ======= Estado que la UI consume SINCRÓNICAMENTE =======
  const [investments, setInvestments] = useState([]);   // []
  const [transactions, setTransactions] = useState([]); // []
  const [referrals, setReferrals] = useState([]);       // []

  // ======= NUEVO: Bot activations =======
  const [botActivations, setBotActivations] = useState([]);

  // ======= Precios en vivo (Binance, sin simulación) =======
  const { prices: livePrices, histories } = useHybridLivePrices({
    symbols: ['BTC', 'ETH', 'BNB', 'ADA', 'USDT'],
    vs: 'USDT',
    maxHist: 600,
    selectedPair: 'BTC/USDT',
  });

  const cryptoPrices = useMemo(() => {
    const out = {};
    Object.entries(livePrices || {}).forEach(([sym, v]) => {
      out[sym] = { ...v, history: histories?.[sym] || [] };
    });
    if (!out.USDT) out.USDT = { price: 1, change: 0, history: [] };
    return out;
  }, [livePrices, histories]);

  const investmentPlans = useMemo(
    () => [
      {
        id: 1,
        name: 'Plan Básico',
        minAmount: 100,
        maxAmount: 999,
        dailyReturn: 1.5,
        duration: 30,
        description: 'Perfecto para principiantes',
      },
      {
        id: 2,
        name: 'Plan Estándar',
        minAmount: 1000,
        maxAmount: 4999,
        dailyReturn: 2.0,
        duration: 30,
        description: 'Para inversores intermedios',
      },
      {
        id: 3,
        name: 'Plan Premium',
        minAmount: 5000,
        maxAmount: 19999,
        dailyReturn: 2.5,
        duration: 30,
        description: 'Para inversores avanzados',
      },
      {
        id: 4,
        name: 'Plan VIP',
        minAmount: 20000,
        maxAmount: 100000,
        dailyReturn: 3.0,
        duration: 30,
        description: 'Para grandes inversores',
      },
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
      // tipo base que viene de la tabla
      let base = (tx.type || '').toLowerCase();

      // normalización por compat
      if (base === 'plan_purchase') base = 'investment';

      // mapeo “amigable” si viene de bots (usa reference_type)
      const ref = (tx.reference_type || '').toLowerCase();
      let displayType = base;

      if (ref === 'bot_activation') displayType = 'bot_activation';
      if (ref === 'bot_profit')     displayType = 'bot_profit';
      if (ref === 'bot_refund')     displayType = 'bot_refund';
      if (ref === 'bot_fee')        displayType = 'bot_fee';

      return {
        // compat filtros
        user_id: tx.user_id,
        userId: tx.user_id,

        id: tx.id,
        type: displayType,                   // <<< usar este en la UI
        rawType: tx.type,                    // (por si lo necesitás)
        status: tx.status,
        amount: Number(tx.amount || 0),
        currency: tx.currency || 'USDT',
        description: tx.description || '',
        createdAt: tx.created_at,
        referenceType: tx.reference_type,    // bot_activation | bot_profit | ...
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

  // ======= NUEVO: Bots =======
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
    await refreshTransactions(); // refleja el crédito en el historial
    return data;
  }

  // ======= Efecto: refetch al loguear/cambiar de user =======
  useEffect(() => {
    setInvestments([]);
    setTransactions([]);
    setReferrals([]);
    setBotActivations([]);

    refreshInvestments();
    refreshTransactions();
    refreshReferrals();
    refreshBotActivations();
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
      // compat filtros
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
      // compat filtros
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

  // ======= API pública (compat sincrónica + métodos de refresh) =======
  const value = useMemo(
    () => ({
      // datos listos para usar sin await
      investments,
      transactions,
      referrals,
      botActivations,

      // getters compatibles con tu UI actual (sincrónicos)
      getInvestments: () => investments,
      getTransactions: () => transactions,
      getReferrals: () => referrals,

      // acciones y refrescos
      refreshInvestments,
      refreshTransactions,
      refreshReferrals,
      addInvestment,
      addTransaction,

      // BOTS
      refreshBotActivations,
      activateBot,
      pauseBot,
      resumeBot,
      cancelBot,
      creditBotProfit,

      // otros datos de UI
      cryptoPrices,
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

  return (
    <DataContext.Provider value={value}>{children}</DataContext.Provider>
  );
}

// Hook con fallback seguro
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    return {
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
      investmentPlans: [],
    };
  }
  return ctx;
}
