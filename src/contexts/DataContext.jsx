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

const ensureArray = (v) => (Array.isArray(v) ? v : []);

export function DataProvider({ children }) {
  const { user } = useAuth();

  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [referrals, setReferrals] = useState([]);

  const [botActivations, setBotActivations] = useState([]);

  // ======= Proyectos tokenizados =======
  const [projects, setProjects] = useState([]);
  const [projectRaise, setProjectRaise] = useState({});
  const [myProjectInvestments, setMyProjectInvestments] = useState([]);

  // ======= Precios (real + micro-ticks) =======
  const LIVE_SYMBOLS = {
    BTC: 'BTCUSDT',
    ETH: 'ETHUSDT',
    BNB: 'BNBUSDT',
    ADA: 'ADAUSDT',
    USDC: null, // estable
  };

  const emptyBook = {
    BTC: { price: 45000, change: 0, history: [] },
    ETH: { price: 3200, change: 0, history: [] },
    USDC: { price: 1.0, change: 0, history: [] },
    BNB: { price: 320, change: 0, history: [] },
    ADA: { price: 0.85, change: 0, history: [] },
  };

  const [cryptoPrices, setCryptoPrices] = useState(emptyBook);
  const liveCacheRef = React.useRef({});

  useEffect(() => {
    let mounted = true;
    let tickTimer = null;
    let liveTimer = null;

    const seedHistory = (p, n = 60) => {
      const now = Date.now();
      const hist = [];
      for (let i = n - 1; i >= 0; i--) {
        hist.push({ time: now - i * 2000, value: p });
      }
      return hist;
    };

    async function fetchLiveOnce() {
      const entries = await Promise.all(
        Object.entries(LIVE_SYMBOLS).map(async ([sym, binSym]) => {
          if (!binSym) return [sym, sym === 'USDC' ? 1 : null];
          try {
            const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binSym}`);
            const j = await r.json();
            const px = Number(j?.price);
            return [sym, Number.isFinite(px) ? px : null];
          } catch {
            return [sym, null];
          }
        })
      );
      const live = Object.fromEntries(entries);
      liveCacheRef.current = { ...liveCacheRef.current, ...live };
      return live;
    }

    (async () => {
      const live = await fetchLiveOnce();
      if (!mounted) return;
      setCryptoPrices((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(emptyBook)) {
          const p = Number(live[k]) || prev[k]?.price || emptyBook[k].price;
          next[k] = { price: p, change: 0, history: seedHistory(p) };
        }
        return next;
      });
    })();

    tickTimer = setInterval(() => {
      setCryptoPrices((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(prev)) {
          const last = prev[k].price;
          const live = Number(liveCacheRef.current[k]) || last;
          const blended = last + (live - last) * 0.2;
          const jitterPct = (Math.random() - 0.5) * 0.15 / 100;
          const price = Math.max(0.000001, blended * (1 + jitterPct));
          const change = ((price - last) / (last || 1)) * 100;
          const history = [...prev[k].history, { time: Date.now(), value: price }].slice(-120);
          next[k] = { price, change, history };
        }
        next.USDC.price = 1.0;
        next.USDC.change = 0;
        return next;
      });
    }, 2000);

    liveTimer = setInterval(fetchLiveOnce, 15000);

    return () => {
      mounted = false;
      clearInterval(tickTimer);
      clearInterval(liveTimer);
    };
  }, []);

  const investmentPlans = useMemo(
    () => [
      { id: 1, name: 'Plan Básico', minAmount: 100, maxAmount: 999, dailyReturn: 1.5, duration: 30, description: 'Perfecto para principiantes' },
      { id: 2, name: 'Plan Estándar', minAmount: 1000, maxAmount: 4999, dailyReturn: 2.0, duration: 30, description: 'Para inversores intermedios' },
      { id: 3, name: 'Plan Premium', minAmount: 5000, maxAmount: 19999, dailyReturn: 2.5, duration: 30, description: 'Para inversores avanzados' },
      { id: 4, name: 'Plan VIP', minAmount: 20000, maxAmount: 100000, dailyReturn: 3.0, duration: 30, description: 'Para grandes inversores' },
    ],
    []
  );

  // ======= Fetchers =======
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

    const mapped = (Array.isArray(data) ? data : []).map((tx) => {
      let base = (tx.type || '').toLowerCase();
      if (base === 'plan_purchase') base = 'investment';

      const ref = (tx.reference_type || '').toLowerCase();
      let displayType = base;
      if (ref === 'bot_activation') displayType = 'bot_activation';
      if (ref === 'bot_profit') displayType = 'bot_profit';
      if (ref === 'bot_refund') displayType = 'bot_refund';
      if (ref === 'bot_fee') displayType = 'bot_fee';

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

  // ======= Proyectos tokenizados =======
  const refreshProjects = async () => {
    const { data: p } = await supabase
      .from('tokenized_projects')
      .select('*')
      .order('launch_date', { ascending: true });
    setProjects(p || []);

    const { data: r } = await supabase.from('project_raise_view').select('*');
    const map = {};
    (r || []).forEach((row) => {
      map[row.project_id] = Number(row.raised_usd || 0);
    });
    setProjectRaise(map);
  };

  const refreshMyProjectInvestments = async () => {
    if (!user?.id) {
      setMyProjectInvestments([]);
      return;
    }
    const { data } = await supabase
      .from('project_investments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setMyProjectInvestments(data || []);
  };

  useEffect(() => {
    refreshProjects();
  }, []);
  useEffect(() => {
    refreshMyProjectInvestments();
  }, [user?.id]);

  useEffect(() => {
    const ch1 = supabase
      .channel('rt-projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tokenized_projects' }, () => {
        refreshProjects();
      })
      .subscribe();

    let ch2 = null;
    if (user?.id) {
      ch2 = supabase
        .channel('rt-project-investments')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'project_investments', filter: `user_id=eq.${user.id}` },
          () => refreshMyProjectInvestments()
        )
        .subscribe();
    }

    return () => {
      supabase.removeChannel(ch1);
      if (ch2) supabase.removeChannel(ch2);
    };
  }, [user?.id]);

  // ======= Bots =======
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
      status: b.status,
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
    if (error) {
      console.error('[activateBot] error:', error);
      return { ok: false, code: 'RPC_ERROR', error };
    }
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
    if (error) {
      console.error('[pauseBot] error:', error);
      return { ok: false, code: 'RPC_ERROR', error };
    }
    await refreshBotActivations();
    return data;
  }

  async function resumeBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    const { data, error } = await supabase.rpc('resume_trading_bot', {
      p_activation_id: activationId,
      p_user_id: user.id,
    });
    if (error) {
      console.error('[resumeBot] error:', error);
      return { ok: false, code: 'RPC_ERROR', error };
    }
    await refreshBotActivations();
    return data;
  }

  async function cancelBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    const { data, error } = await supabase.rpc('cancel_trading_bot', {
      p_activation_id: activationId,
      p_user_id: user.id,
    });
    if (error) {
      console.error('[cancelBot] error:', error);
      return { ok: false, code: 'RPC_ERROR', error };
    }
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
    if (error) {
      console.error('[creditBotProfit] error:', error);
      return { ok: false, code: 'RPC_ERROR', error };
    }
    await refreshTransactions();
    return data;
  }

  // ======= Efecto: refetch al loguear/cambiar user =======
  useEffect(() => {
    setInvestments([]);
    setTransactions([]);
    setReferrals([]);
    setBotActivations([]);
    setMyProjectInvestments([]);

    refreshInvestments();
    refreshTransactions();
    refreshReferrals();
    refreshBotActivations();
    refreshMyProjectInvestments();
  }, [user?.id]);

  // ======= Utilidad moneda para FK =======
  async function ensureCurrency(code) {
    if (!code) return;
    await supabase
      .from('currencies')
      .upsert({ code: String(code).toUpperCase() }, { onConflict: 'code' });
  }

  // ======= Mutaciones =======
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
    currency = 'USDC',
    description = '',
    referenceType = null,
    referenceId = null,
    status = 'completed',
  }) {
    if (!user?.id) return null;

    await ensureCurrency(currency);

    const payload = {
      user_id: user.id,
      amount: Number(amount),
      type,
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
      currency: data.currency || 'USDC',
      description: data.description || '',
      createdAt: data.created_at,
      referenceType: data.reference_type,
      referenceId: data.reference_id,
    };
  }

  async function requestWithdrawal({ amount, currency = 'USDC', description = '' }) {
    return addTransaction({
      amount,
      type: 'withdrawal',
      currency,
      description,
      status: 'pending',
      referenceType: 'withdrawal_request',
      referenceId: null,
    });
  }

  // ======= API pública =======
  const value = useMemo(
    () => ({
      investments,
      transactions,
      referrals,
      botActivations,

      projects,
      getProjects: () => projects,
      getProjectRaise: (projectId) => projectRaise[projectId] || 0,
      myProjectInvestments,
      getMyProjectInvestments: () => myProjectInvestments,

      getInvestments: () => investments,
      getTransactions: () => transactions,
      getReferrals: () => referrals,

      refreshInvestments,
      refreshTransactions,
      refreshReferrals,

      refreshProjects,
      refreshMyProjectInvestments,

      addInvestment,
      addTransaction,
      requestWithdrawal,

      refreshBotActivations,
      activateBot,
      pauseBot,
      resumeBot,
      cancelBot,
      creditBotProfit,

      cryptoPrices,
      investmentPlans,
    }),
    [
      investments,
      transactions,
      referrals,
      botActivations,
      projects,
      projectRaise,
      myProjectInvestments,
      cryptoPrices,
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
      projects: [],
      myProjectInvestments: [],
      getProjects: () => [],
      getProjectRaise: () => 0,
      getMyProjectInvestments: () => [],
      getInvestments: () => [],
      getTransactions: () => [],
      getReferrals: () => [],
      refreshInvestments: async () => {},
      refreshTransactions: async () => {},
      refreshReferrals: async () => {},
      refreshProjects: async () => {},
      refreshMyProjectInvestments: async () => {},
      addInvestment: async () => null,
      addTransaction: async () => null,
      requestWithdrawal: async () => null,
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
