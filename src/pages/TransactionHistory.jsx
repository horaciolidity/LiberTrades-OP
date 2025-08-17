import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import TransactionStats from '@/components/transactions/TransactionStats';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionTabs from '@/components/transactions/TransactionTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

// Normaliza investment {snake|camel} -> shape consistente
const normInvestment = (inv) => ({
  id: inv?.id,
  user_id: inv?.user_id ?? inv?.userId,
  plan_name: inv?.plan_name ?? inv?.planName,
  amount: Number(inv?.amount ?? 0),
  daily_return: Number(inv?.daily_return ?? inv?.dailyReturn ?? 0),
  duration: Number(inv?.duration ?? 0),
  status: inv?.status ?? 'active',
  currency_input: inv?.currency_input ?? inv?.currencyInput ?? 'USDC',
  created_at: inv?.created_at ?? inv?.createdAt ?? null,
});

// Progreso/ganancia acumulada dado un investment normalizado
const calcProgress = (inv, now = Date.now()) => {
  const start = inv.created_at ? new Date(inv.created_at).getTime() : now;
  const dayMs = 86_400_000;
  const elapsedDays = Math.max(0, Math.floor((now - start) / dayMs));
  const cappedDays = Math.min(Number(inv.duration || 0), elapsedDays);
  const pct = Number(inv.duration || 0) > 0 ? (cappedDays / Number(inv.duration)) * 100 : 0;
  const accrued = Number(inv.amount || 0) * (Number(inv.daily_return || 0) / 100) * cappedDays;
  return { elapsedDays, cappedDays, pct, accrued };
};

const TransactionHistory = () => {
  const { user } = useAuth();

  // ✅ Arrays reactivos + refrescos desde DataContext
  const {
    transactions: ctxTransactions,
    investments:  ctxInvestments,
    refreshTransactions,
    refreshInvestments,
  } = useData();

  const [transactions, setTransactions] = useState([]);
  const [investments, setInvestments]   = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);

  const [searchTerm, setSearchTerm]     = useState('');
  const [filterType, setFilterType]     = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Tick para refrescar progreso en UI
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Al montar / cambiar user -> pedimos datos al server
  useEffect(() => {
    if (!user?.id) return;
    refreshTransactions?.();
    refreshInvestments?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: wallet_transactions del usuario
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('hist-wallet-tx')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setTransactions((prev) => {
            const list = Array.isArray(prev) ? [...prev] : [];
            if (payload.eventType === 'INSERT') {
              if (!list.some((x) => x.id === payload.new.id)) list.unshift(payload.new);
              return list;
            }
            if (payload.eventType === 'UPDATE') {
              return list.map((x) => (x.id === payload.new.id ? payload.new : x));
            }
            if (payload.eventType === 'DELETE') {
              return list.filter((x) => x.id !== payload.old?.id);
            }
            return list;
          });
          // Opcional: refrescar métricas de arriba si DataContext las consume // TODO
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Realtime: investments del usuario (para ver compras en vivo y su progreso)
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('hist-investments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setInvestments((prev) => {
            const list = Array.isArray(prev) ? [...prev] : [];
            if (payload.eventType === 'INSERT') {
              const ni = normInvestment(payload.new);
              if (!list.some((x) => x.id === ni.id)) list.unshift(ni);
              return list;
            }
            if (payload.eventType === 'UPDATE') {
              const ni = normInvestment(payload.new);
              return list.map((x) => (x.id === ni.id ? ni : x));
            }
            if (payload.eventType === 'DELETE') {
              return list.filter((x) => x.id !== payload.old?.id);
            }
            return list;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Sincroniza estados locales cuando cambian los arrays del contexto
  useEffect(() => {
    if (!user?.id) {
      setTransactions([]);
      setInvestments([]);
      setFilteredTransactions([]);
      return;
    }
    const uid = user.id;

    const tx = Array.isArray(ctxTransactions) ? ctxTransactions : [];
    const inv = Array.isArray(ctxInvestments)  ? ctxInvestments  : [];

    const userTx  = tx.filter(t => (t.user_id ?? t.userId ?? uid) === uid);
    const userInv = inv
      .filter(i => (i.user_id ?? i.userId ?? uid) === uid)
      .map(normInvestment);

    // Orden default por fecha desc
    userTx.sort((a, b) => new Date(b?.created_at ?? b?.createdAt ?? 0) - new Date(a?.created_at ?? a?.createdAt ?? 0));
    userInv.sort((a, b) => new Date(b?.created_at ?? 0) - new Date(a?.created_at ?? 0));

    setTransactions(userTx);
    setInvestments(userInv);
    setFilteredTransactions(userTx);
  }, [ctxTransactions, ctxInvestments, user?.id]);

  // Filtros
  useEffect(() => {
    let filtered = Array.isArray(transactions) ? [...transactions] : [];

    if (filterType !== 'all') {
      filtered = filtered.filter(
        t => (t.type || '').toLowerCase() === filterType.toLowerCase()
      );
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(
        t => (t.status || '').toLowerCase() === filterStatus.toLowerCase()
      );
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(t =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.type || '').toLowerCase().includes(q)
      );
    }

    setFilteredTransactions(filtered);
  }, [transactions, filterType, filterStatus, searchTerm]);

  // Enriquecemos inversiones con progreso/ganancias para tabs (no rompemos shape existente)
  const investmentsEnriched = useMemo(() => {
    return investments.map((inv) => {
      const pr = calcProgress(inv, nowTick);
      return {
        ...inv,
        progressPct: pr.pct,
        accruedUsd: pr.accrued,
        elapsedDays: pr.elapsedDays,
        elapsedDaysCapped: pr.cappedDays,
      };
    });
  }, [investments, nowTick]);

  const exportTransactions = () => {
    const rows = [
      ['Fecha', 'Tipo', 'Descripción', 'Monto', 'Estado'],
      ...filteredTransactions.map(t => {
        const date =
          t.created_at || t.createdAt || t.date || new Date().toISOString();
        const amt = Number(t.amount);
        return [
          new Date(date).toLocaleDateString(),
          t.type || '',
          t.description || '',
          Number.isFinite(amt) ? amt.toFixed(2) : '0.00',
          t.status || '',
        ];
      }),
    ];
    const csvContent = rows.map(r => r.map(String).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transacciones.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            Historial de Transacciones
          </h1>
          <p className="text-slate-300">
            Revisa todas tus transacciones e inversiones
          </p>
        </motion.div>

        {/* Métricas rápidas */}
        {/* Nota: TransactionStats debería tolerar tipos nuevos como 'investment_purchase' */}
        <TransactionStats transactions={transactions} />

        {/* Filtros + export */}
        <TransactionFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filterType={filterType}
          setFilterType={setFilterType}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          exportTransactions={exportTransactions}
        />

        {/* Tabs (Transacciones / Inversiones) */}
        {/* Pasamos inversiones enriquecidas con progreso y ganancias acumuladas */}
        <TransactionTabs
          filteredTransactions={filteredTransactions}
          investments={investmentsEnriched}
          // TODO: si TransactionTabs soporta props extra, podemos pasar nowTick para forzar re-render periódico.
        />

        {/* Vacío elegante */}
        {(!transactions?.length && !investments?.length) && (
          <div className="text-slate-400 text-sm">
            No hay movimientos todavía. Cuando realices depósitos, retiros,
            compras de planes o alquiler de bots, aparecerán acá.
          </div>
        )}
      </div>
    </>
  );
};

export default TransactionHistory;
