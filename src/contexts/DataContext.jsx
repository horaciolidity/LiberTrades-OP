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

export function DataProvider({ children }) {
  const { user } = useAuth();

  // ======= Estado que la UI consume SINCRÓNICAMENTE =======
  const [investments, setInvestments] = useState([]);   // []
  const [transactions, setTransactions] = useState([]); // []
  const [referrals, setReferrals] = useState([]);       // []

  // ======= Precios (mock) =======
  const [cryptoPrices, setCryptoPrices] = useState({
    BTC: { price: 45000, change: 2.5, history: [] },
    ETH: { price: 3200, change: -1.2, history: [] },
    USDT: { price: 1.0, change: 0.1, history: [] },
    BNB: { price: 320, change: 3.8, history: [] },
    ADA: { price: 0.85, change: -2.1, history: [] },
  });

  useEffect(() => {
    const initialHistoryLength = 60;
    const next = JSON.parse(JSON.stringify(cryptoPrices));
    Object.keys(next).forEach((k) => {
      let p = next[k].price;
      const hist = [];
      for (let i = 0; i < initialHistoryLength; i++) {
        const ch = (Math.random() - 0.5) * 2;
        p = Math.max(0.01, p * (1 + ch / 100));
        hist.unshift({
          time: Date.now() - (initialHistoryLength - i) * 2000,
          value: p,
        });
      }
      next[k].history = hist;
      next[k].price = p;
    });
    setCryptoPrices(next);

    const id = setInterval(() => {
      setCryptoPrices((prev) => {
        const up = { ...prev };
        Object.keys(up).forEach((k) => {
          const ch = (Math.random() - 0.5) * 2;
          const np = Math.max(0.01, up[k].price * (1 + ch / 100));
          const nh = [...up[k].history, { time: Date.now(), value: np }].slice(
            -100
          );
          up[k] = { price: np, change: ch, history: nh };
        });
        return up;
      });
    }, 2000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      let type = tx.type;
      if (type === 'plan_purchase') type = 'investment';
      return {
        id: tx.id,
        type,
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

  // ======= Efecto: refetch al loguear/cambiar de user =======
  useEffect(() => {
    // Limpio mientras carga
    setInvestments([]);
    setTransactions([]);
    setReferrals([]);

    // Refrescos en paralelo
    refreshInvestments();
    refreshTransactions();
    refreshReferrals();
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

    // Optimista: actualizo estado local
    await refreshInvestments();

    return {
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

      // otros datos de UI
      cryptoPrices,
      investmentPlans,
    }),
    [
      investments,
      transactions,
      referrals,
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
      getInvestments: () => [],
      getTransactions: () => [],
      getReferrals: () => [],
      refreshInvestments: async () => {},
      refreshTransactions: async () => {},
      refreshReferrals: async () => {},
      addInvestment: async () => null,
      addTransaction: async () => null,
      cryptoPrices: {},
      investmentPlans: [],
    };
  }
  return ctx;
}
