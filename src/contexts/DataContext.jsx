// src/contexts/DataContext.jsx
import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';

// ✅ Este contexto NO maneja dinero real ni escribe/lee del backend.
// Solo catálogos (planes/bots si querés) y precios simulados para la UI.

const DataContext = createContext(null);

// ========================
// Provider
// ========================
export function DataProvider({ children }) {
  // Precios simulados (random-walk para que la UI se vea “viva”)
  const [cryptoPrices, setCryptoPrices] = useState({
    BTC: { price: 45000, change: 2.5, history: [] },
    ETH: { price: 3200,  change: -1.2, history: [] },
    USDT:{ price: 1.0,   change: 0.1,  history: [] },
    BNB: { price: 320,   change: 3.8,  history: [] },
    ADA: { price: 0.85,  change: -2.1, history: [] },
  });

  // Catálogo de planes (solo lectura; la compra real la hace AuthContext via RPC)
  const [investmentPlans] = useState([
    { id: 1, name: 'Plan Básico',   minAmount: 100,   maxAmount: 999,    dailyReturn: 1.5, duration: 30, description: 'Perfecto para principiantes' },
    { id: 2, name: 'Plan Estándar', minAmount: 1000,  maxAmount: 4999,   dailyReturn: 2.0, duration: 30, description: 'Para inversores intermedios' },
    { id: 3, name: 'Plan Premium',  minAmount: 5000,  maxAmount: 19999,  dailyReturn: 2.5, duration: 30, description: 'Para inversores avanzados' },
    { id: 4, name: 'Plan VIP',      minAmount: 20000, maxAmount: 100000, dailyReturn: 3.0, duration: 30, description: 'Para grandes inversores' },
  ]);

  // Simulador de precios (igual que antes, sin persistir)
  useEffect(() => {
    const initialHistoryLength = 60;
    const next = JSON.parse(JSON.stringify(cryptoPrices));
    Object.keys(next).forEach(k => {
      let p = next[k].price;
      const hist = [];
      for (let i = 0; i < initialHistoryLength; i++) {
        const ch = (Math.random() - 0.5) * 2; // -1%..+1%
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

  // 🔒 Nada de funciones de dinero aquí.
  // Para no romper componentes viejos, dejamos stubs que no tocan backend:
  const value = useMemo(() => ({
    cryptoPrices,
    investmentPlans,
    // stubs (no hacen nada; reemplazá llamadas por lecturas directas a Supabase en las pages)
    getInvestments: async () => [],
    addInvestment: async () => null,
    getTransactions: async () => [],
    addTransaction: async () => null,
    getReferrals: async () => [],
  }), [cryptoPrices, investmentPlans]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// ========================
// Hook
// ========================
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    // Fallback si no hay provider
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
