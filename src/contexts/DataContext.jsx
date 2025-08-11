// src/contexts/DataContext.jsx
import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

const DataContext = createContext(null);

// --- helpers ---
const fmtNum = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

// ========================
// Provider
// ========================
export function DataProvider({ children }) {
  const [cryptoPrices, setCryptoPrices] = useState({
    BTC: { price: 45000, change: 2.5, history: [] },
    ETH: { price: 3200,  change: -1.2, history: [] },
    USDT:{ price: 1.0,   change: 0.1,  history: [] },
    BNB: { price: 320,   change: 3.8,  history: [] },
    ADA: { price: 0.85,  change: -2.1, history: [] },
  });

  const [investmentPlans] = useState([
    { id: 1, name: 'Plan Básico',   minAmount: 100,   maxAmount: 999,    dailyReturn: 1.5, duration: 30, description: 'Perfecto para principiantes' },
    { id: 2, name: 'Plan Estándar', minAmount: 1000,  maxAmount: 4999,   dailyReturn: 2.0, duration: 30, description: 'Para inversores intermedios' },
    { id: 3, name: 'Plan Premium',  minAmount: 5000,  maxAmount: 19999,  dailyReturn: 2.5, duration: 30, description: 'Para inversores avanzados' },
    { id: 4, name: 'Plan VIP',      minAmount: 20000, maxAmount: 100000, dailyReturn: 3.0, duration: 30, description: 'Para grandes inversores' },
  ]);

  // Simulador de precios (igual que antes)
  useEffect(() => {
    const initialHistoryLength = 60;
    const next = JSON.parse(JSON.stringify(cryptoPrices));
    Object.keys(next).forEach(k => {
      let p = next[k].price;
      const hist = [];
      for (let i = 0; i < initialHistoryLength; i++) {
        const ch = (Math.random() - 0.5) * 2;
        p = Math.max(0.01, p * (1 + ch / 100));
        hist.unshift({ time: Date.now() - (initialHistoryLength - i) * 2000, value: p });
      }
      next[k].history = hist;
      next[k].price = p;
    });
    setCryptoPrices(next);

    const id = setInterval(() => {
      setCryptoPrices(prev => {
        const up = { ...prev };
        Object.keys(up).forEach(k => {
          const ch = (Math.random() - 0.5) * 2; // -1% a +1%
          const np = Math.max(0.01, up[k].price * (1 + ch / 100));
          const nh = [...up[k].history, { time: Date.now(), value: np }].slice(-100);
          up[k] = { price: np, change: ch, history: nh };
        });
        return up;
      });
    }, 2000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------ API con Supabase ------
  // Inversiones (para dashboard/estadísticas)
  const getInvestments = async (userId = null) => {
    let q = supabase
      .from('investments')
      .select('id, user_id, plan_name, amount, daily_return, duration, created_at')
      .order('created_at', { ascending: false });

    if (userId) q = q.eq('user_id', userId);

    const { data, error } = await q;
    if (error) throw error;

    return (data || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      planName: r.plan_name,
      amount: fmtNum(r.amount),
      dailyReturn: fmtNum(r.daily_return),
      duration: fmtNum(r.duration),
      createdAt: r.created_at,   // importante para el cálculo de ganancias
      status: 'active',          // si no tenés columna status, usamos 'active'
    }));
  };

  // Inserta inversión (wrapper opcional)
  // Nota: tu pantalla de Planes ya inserta directo; esto es por si lo querés usar desde otro lado.
  const addInvestment = async ({ user_id, plan_name, amount, daily_return, duration, description }) => {
    if (!user_id) throw new Error('addInvestment: falta user_id');
    const { data, error } = await supabase
      .from('investments')
      .insert({
        user_id,
        plan_name,
        amount: fmtNum(amount),
        daily_return: fmtNum(daily_return),
        duration: fmtNum(duration),
      })
      .select('id, user_id, plan_name, amount, daily_return, duration, created_at')
      .single();
    if (error) throw error;

    // Registrar en historial
    await supabase.from('wallet_transactions').insert({
      user_id,
      type: 'investment',
      status: 'completed',
      amount: fmtNum(amount),
      description: description || `Plan: ${plan_name}`,
    });

    return {
      id: data.id,
      userId: data.user_id,
      planName: data.plan_name,
      amount: fmtNum(data.amount),
      dailyReturn: fmtNum(data.daily_return),
      duration: fmtNum(data.duration),
      createdAt: data.created_at,
      status: 'active',
    };
  };

  // Movimientos (wallet_transactions)
  const getTransactions = async (userId = null) => {
    let q = supabase
      .from('wallet_transactions')
      .select('id, user_id, amount, type, status, description, created_at')
      .order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  };

  const addTransaction = async ({ user_id, amount, type, status = 'completed', description }) => {
    if (!user_id) throw new Error('addTransaction: falta user_id');
    const { data, error } = await supabase
      .from('wallet_transactions')
      .insert({ user_id, amount: fmtNum(amount), type, status, description })
      .select('id, user_id, amount, type, status, description, created_at')
      .single();
    if (error) throw error;
    return data;
  };

  // Referidos (desde tabla profiles)
  const getReferrals = async (userId) => {
    if (!userId) return [];
    // 1) obtener mi referral_code
    const { data: me, error: meErr } = await supabase
      .from('profiles')
      .select('referral_code')
      .eq('id', userId)
      .maybeSingle();
    if (meErr || !me?.referral_code) return [];

    // 2) buscar quienes tengan referred_by = mi referral_code
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, referred_by, created_at')
      .eq('referred_by', me.referral_code)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  };

  const value = useMemo(() => ({
    cryptoPrices,
    investmentPlans,
    // Supabase API:
    getInvestments,      // (userId?) -> Promise<Array>
    addInvestment,       // payload -> Promise<Investment>
    getTransactions,     // (userId?) -> Promise<Array>
    addTransaction,      // payload -> Promise<Tx>
    getReferrals,        // (userId) -> Promise<Array>
  }), [cryptoPrices, investmentPlans]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// ========================
// Hook (fallback por si no hay provider)
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
