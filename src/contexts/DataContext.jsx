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

// ========================
// Provider
// ========================
export function DataProvider({ children }) {
  const { user } = useAuth();

  // Puedes dejar este simulador de precios hasta que conectes cotizaciones reales
  const [cryptoPrices, setCryptoPrices] = useState({
    BTC: { price: 45000, change: 2.5, history: [] },
    ETH: { price: 3200, change: -1.2, history: [] },
    USDT: { price: 1.0, change: 0.1, history: [] },
    BNB: { price: 320, change: 3.8, history: [] },
    ADA: { price: 0.85, change: -2.1, history: [] },
  });

  useEffect(() => {
    // histórico inicial
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

    // “ticks” cada 2s
    const id = setInterval(() => {
      setCryptoPrices((prev) => {
        const up = { ...prev };
        Object.keys(up).forEach((k) => {
          const ch = (Math.random() - 0.5) * 2; // -1% a +1%
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

  // Planes visibles en UI (no depende de BD)
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

  // ========================
  // Queries a Supabase
  // ========================

  // ---- INVESTMENTS (map snake_case -> camelCase) ----
  async function getInvestments() {
    if (!user?.id) return [];
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getInvestments] error:', error);
      return [];
    }

    const now = dayjs();

    return (data || []).map((inv) => {
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
        currency: inv.currency_input, // 'USDT' | 'BTC' | 'ETH'
        daysElapsed,
        earnings,
      };
    });
  }

  // Crear inversión en BD (opcional, si la UI lo usa)
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

    // normaliza al formato que espera la UI
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

  // ---- TRANSACTIONS (wallet_transactions) ----
  async function getTransactions() {
    if (!user?.id) return [];
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getTransactions] error:', error);
      return [];
    }

    return (data || []).map((tx) => {
      let type = tx.type;
      // la UI suele agrupar compras de plan como "investment"
      if (type === 'plan_purchase') type = 'investment';

      return {
        id: tx.id,
        type, // 'deposit' | 'withdrawal' | 'investment' | ...
        status: tx.status,
        amount: Number(tx.amount || 0),
        currency: tx.currency || 'USDT',
        description: tx.description || '',
        createdAt: tx.created_at,
        referenceType: tx.reference_type,
        referenceId: tx.reference_id,
      };
    });
  }

  // Crear transacción en BD (opcional, si la UI lo usa)
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

  // ---- REFERRALS (perfiles referidos por el usuario actual) ----
  async function getReferrals() {
    if (!user?.id) return [];
    // profiles.referred_by -> auth.users.id (== profiles.id == auth.users.id)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at, username')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getReferrals] error:', error);
      return [];
    }
    return data || [];
  }

  const value = useMemo(
    () => ({
      cryptoPrices,
      investmentPlans,
      getInvestments,
      addInvestment,
      getTransactions,
      addTransaction,
      getReferrals,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cryptoPrices, investmentPlans, user?.id]
  );

  return (
    <DataContext.Provider value={value}>{children}</DataContext.Provider>
  );
}

// ========================
// Hook (fallback seguro)
// ========================
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    return {
      cryptoPrices: {},
      investmentPlans: [],
      getInvestments: async () => [],
      addInvestment: async () => null,
      getTransactions: async () => [],
      addTransaction: async () => null,
      getReferrals: async () => [],
    };
  }
  return ctx;
}
