import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';

const DataContext = createContext(null);

// --- helpers ---
function safeParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const val = JSON.parse(raw);
    return Array.isArray(val) ? val : (val ?? fallback);
  } catch {
    return fallback;
  }
}

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

  // Simula histórico y actualizaciones de precios
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

  // ------ API segura (siempre arrays) ------
  const getInvestments = () => safeParse('cryptoinvest_investments', []);
  const addInvestment = (investment) => {
    const arr = getInvestments();
    const item = {
      id: Date.now().toString(),
      ...investment,
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    const next = [...arr, item];
    localStorage.setItem('cryptoinvest_investments', JSON.stringify(next));
    return item;
  };

  const getTransactions = () => safeParse('cryptoinvest_transactions', []);
  const addTransaction = (tx) => {
    const arr = getTransactions();
    const item = {
      id: Date.now().toString(),
      ...tx,
      createdAt: new Date().toISOString(),
    };
    const next = [...arr, item];
    localStorage.setItem('cryptoinvest_transactions', JSON.stringify(next));
    return item;
  };

  const getReferrals = (userId) => {
    try {
      const users = JSON.parse(localStorage.getItem('cryptoinvest_users') || '[]');
      const user = users.find(u => u?.id === userId);
      if (!user?.referralCode) return [];
      return users.filter(u => u?.referredBy === user.referralCode);
    } catch {
      return [];
    }
  };

  const value = useMemo(() => ({
    cryptoPrices,
    investmentPlans,
    getInvestments,
    addInvestment,
    getTransactions,
    addTransaction,
    getReferrals,
  }), [cryptoPrices, investmentPlans]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// ========================
// Hook (con fallback: NO tira error si no hay provider)
// ========================
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    return {
      cryptoPrices: {},
      investmentPlans: [],
      getInvestments: () => [],
      addInvestment: () => null,
      getTransactions: () => [],
      addTransaction: () => null,
      getReferrals: () => [],
    };
  }
  return ctx;
}
