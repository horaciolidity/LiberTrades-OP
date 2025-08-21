// src/pages/TransactionHistory.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  CalendarDays,
} from 'lucide-react';
import TransactionStats from '@/components/transactions/TransactionStats';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionTabs from '@/components/transactions/TransactionTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

// ===== Helpers =====
const fmtMoney = (n = 0) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const getDate = (t) => new Date(t?.createdAt || t?.created_at || t?.date || Date.now());
const sameDayKey = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);

const RANGE_OPTIONS = [
  { key: 'all', label: 'Todo' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
];

const TransactionHistory = () => {
  const { user } = useAuth();

  // ✅ Traemos arrays reactivos + refrescos desde DataContext
  const {
    transactions: ctxTransactions,
    investments:  ctxInvestments,
    refreshTransactions,
    refreshInvestments,
    botActivations = [],
  } = useData();

  // ===== Local state =====
  const [transactions, setTransactions] = useState([]);
  const [investments, setInvestments]   = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);

  const [searchTerm, setSearchTerm]     = useState('');
  const [filterType, setFilterType]     = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [range, setRange]               = useState('all'); // 7d | 30d | 90d | all
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ===== Initial fetch on user change =====
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setIsRefreshing(true);
      await Promise.all([refreshTransactions?.(), refreshInvestments?.()]);
      setIsRefreshing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ===== Sync local when context changes =====
  useEffect(() => {
    if (!user?.id) {
      setTransactions([]); setInvestments([]); setFilteredTransactions([]);
      return;
    }
    const uid = user.id;
    const tx = Array.isArray(ctxTransactions) ? ctxTransactions : [];
    const inv = Array.isArray(ctxInvestments)  ? ctxInvestments  : [];
    const userTx  = tx.filter(t => (t.user_id ?? t.userId ?? uid) === uid);
    const userInv = inv.filter(i => (i.user_id ?? i.userId ?? uid) === uid);
    setTransactions(userTx);
    setInvestments(userInv);
    setFilteredTransactions(userTx);
  }, [ctxTransactions, ctxInvestments, user?.id]);

  // ===== Derived: Filters & Range =====
  const rangedTransactions = useMemo(() => {
    if (range === 'all') return transactions;
    const now = Date.now();
    const days =
      range === '7d'  ? 7  :
      range === '30d' ? 30 :
      range === '90d' ? 90 : 9999;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return transactions.filter((t) => getDate(t).getTime() >= cutoff);
  }, [transactions, range]);

  useEffect(() => {
    let filtered = [...rangedTransactions];

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
        (t.type || '').toLowerCase().includes(q) ||
        (t.currency || '').toLowerCase().includes(q)
      );
    }

    setFilteredTransactions(filtered);
  }, [rangedTransactions, filterType, filterStatus, searchTerm]);

  // ===== User progress & rich stats =====
  const enrichedStats = useMemo(() => {
    const completed = filteredTransactions.filter(t => (t.status || '').toLowerCase() === 'completed');
    const pending   = filteredTransactions.filter(t => (t.status || '').toLowerCase() === 'pending');
    const failed    = filteredTransactions.filter(t => (t.status || '').toLowerCase() === 'failed' || (t.status || '').toLowerCase() === 'cancelled');

    const sumBy = (arr, pred) =>
      arr.reduce((acc, t) => acc + (pred(t) ? Number(t.amount || 0) : 0), 0);

    // Normalizados desde DataContext
    const deposits     = sumBy(completed, t => (t.type || '') === 'deposit' || (t.type || '') === 'admin_credit');
    const withdrawals  = sumBy(completed, t => (t.type || '') === 'withdrawal');
    const investmentSp = sumBy(completed, t => (t.type || '') === 'investment' || (t.rawType || '') === 'plan_purchase');
    const fees         = sumBy(completed, t => (t.type || '') === 'fee');
    const refunds      = sumBy(completed, t => (t.type || '') === 'refund');
    const botProfit    = sumBy(completed, t => (t.type || '') === 'bot_profit');

    const netFlow = deposits + refunds + botProfit - withdrawals - fees - investmentSp;

    // Currency breakdown
    const byCurrency = {};
    for (const t of completed) {
      const ccy = String(t.currency || 'USDT').toUpperCase();
      const amt = Number(t.amount || 0);
      byCurrency[ccy] = (byCurrency[ccy] || 0) + amt;
    }

    // Activity streak (unique days with activity in range)
    const daySet = new Set(filteredTransactions.map(t => sameDayKey(getDate(t))));
    const activeDays = daySet.size;

    // Investments progress
    const totalInvested = investments.reduce((a, i) => a + Number(i.amount || 0), 0);
    const totalEarnings = investments.reduce((a, i) => a + Number(i.earnings || 0), 0);
    const activeInvests = investments.filter(i => (i.status || '').toLowerCase() === 'active').length;
    const maturedInvests = investments.filter(i => (Number(i.daysElapsed || 0) >= Number(i.duration || 0))).length;
    const roiPct = totalInvested > 0 ? (totalEarnings / totalInvested) * 100 : 0;

    // Bots status (opcional)
    const activeBots = (Array.isArray(botActivations) ? botActivations : []).filter(b => (b.status || '').toLowerCase() === 'active').length;

    // First/last
    const all = [...filteredTransactions].sort((a,b) => getDate(a) - getDate(b));
    const first = all[0] ? getDate(all[0]) : null;
    const last  = all[all.length - 1] ? getDate(all[all.length - 1]) : null;

    return {
      completedCount: completed.length,
      pendingCount: pending.length,
      failedCount: failed.length,
      deposits, withdrawals, investmentSp, fees, refunds, botProfit, netFlow,
      byCurrency,
      activeDays,
      totalInvested, totalEarnings, activeInvests, maturedInvests, roiPct,
      activeBots,
      firstActivity: first, lastActivity: last,
    };
  }, [filteredTransactions, investments, botActivations]);

  // ===== Export CSV =====
  const exportTransactions = () => {
    const rows = [
      ['Fecha', 'Moneda', 'Tipo', 'Descripción', 'Monto', 'Estado', 'Ref.Type', 'Ref.ID'],
      ...filteredTransactions.map(t => {
        const date =
          t.created_at || t.createdAt || t.date || new Date().toISOString();
        const amt = Number(t.amount);
        return [
          new Date(date).toLocaleString(),
          (t.currency || '').toUpperCase(),
          t.type || '',
          t.description || '',
          Number.isFinite(amt) ? amt.toFixed(2) : '0.00',
          t.status || '',
          t.referenceType || '',
          t.referenceId || '',
        ];
      }),
    ];
    const csvContent = rows.map(r => r.map(String).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'transacciones.csv'; a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshTransactions?.(), refreshInvestments?.()]);
    setIsRefreshing(false);
  };

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Historial de Transacciones</h1>
            <p className="text-slate-300">Revisa tus movimientos, progreso y rendimiento.</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            >
              {RANGE_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </motion.div>

        {/* Métricas rápidas existente (tu componente) */}
        <TransactionStats transactions={filteredTransactions} />

        {/* Métricas enriquecidas de progreso */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4"
        >
          {/* Net Flow */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-xs uppercase tracking-wide">Flujo neto</span>
              {enrichedStats.netFlow >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div className={`text-2xl font-semibold ${enrichedStats.netFlow >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {fmtMoney(enrichedStats.netFlow)} USDT
            </div>
            <div className="text-xs text-slate-400 mt-2">
              Depósitos+Refunds+Ganancia Bots − Retiros − Fees − Inversión
            </div>
          </div>

          {/* Inversiones (TOTAL INVERTIDO visible) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-xs uppercase tracking-wide">Inversión / Ganado</span>
              <PiggyBank className="w-4 h-4 text-sky-300" />
            </div>
            <div className="text-slate-100">
              <div className="text-lg font-semibold">
                {fmtMoney(enrichedStats.totalInvested)} USDT
                <span className="ml-2 text-sm text-slate-400">invertido</span>
              </div>
              <div className="text-emerald-300 font-semibold">
                +{fmtMoney(enrichedStats.totalEarnings)} USDT
                <span className="ml-2 text-sm text-slate-400">ganado</span>
              </div>
              <div className="text-sm text-slate-400 mt-1">
                ROI: {enrichedStats.roiPct.toFixed(2)}% · Activas: {enrichedStats.activeInvests} · Vencidas: {enrichedStats.maturedInvests}
              </div>
            </div>
          </div>

          {/* Depósitos / Retiros (RETIRADOS visible) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-xs uppercase tracking-wide">Depósitos / Retiros</span>
              <Wallet className="w-4 h-4 text-teal-300" />
            </div>
            <div className="text-slate-100">
              <div className="font-semibold">
                <span className="text-emerald-300">{fmtMoney(enrichedStats.deposits)} USDT</span>
                <span className="ml-2 text-xs text-slate-400">depositado</span>
              </div>
              <div className="font-semibold">
                <span className="text-rose-300">{fmtMoney(enrichedStats.withdrawals)} USDT</span>
                <span className="ml-2 text-xs text-slate-400">retirado</span>
              </div>
            </div>
          </div>

          {/* Bots */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-xs uppercase tracking-wide">Bots</span>
              <Wallet className="w-4 h-4 text-violet-300" />
            </div>
            <div className="text-slate-100">
              <div className="text-lg font-semibold">
                {fmtMoney(enrichedStats.botProfit)} USDT
                <span className="ml-2 text-sm text-slate-400">ganado por bots</span>
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Activos: {enrichedStats.activeBots} · Fees: {fmtMoney(enrichedStats.fees)} USDT
              </div>
            </div>
          </div>

          {/* Actividad */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 text-xs uppercase tracking-wide">Actividad</span>
              <CalendarDays className="w-4 h-4 text-amber-300" />
            </div>
            <div className="text-slate-100">
              <div className="text-lg font-semibold">{enrichedStats.activeDays}</div>
              <div className="text-sm text-slate-400">días con movimientos {range !== 'all' ? `(${RANGE_OPTIONS.find(r=>r.key===range)?.label})` : ''}</div>
              <div className="text-xs text-slate-500 mt-1">
                {enrichedStats.firstActivity ? `Desde ${enrichedStats.firstActivity.toLocaleDateString()}` : 'Sin actividad'}
                {enrichedStats.lastActivity ? ` · Último ${enrichedStats.lastActivity.toLocaleString()}` : ''}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Breakdown por moneda */}
        {Object.keys(enrichedStats.byCurrency || {}).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3"
          >
            {Object.entries(enrichedStats.byCurrency).map(([ccy, total]) => (
              <div key={ccy} className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-400">{ccy}</div>
                <div className="text-slate-100 font-semibold">{fmtMoney(total)}</div>
              </div>
            ))}
          </motion.div>
        )}

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
        <TransactionTabs
          filteredTransactions={filteredTransactions}
          investments={investments}
        />

        {/* Empty state */}
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
