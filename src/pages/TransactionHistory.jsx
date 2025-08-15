import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TransactionStats from '@/components/transactions/TransactionStats';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionTabs from '@/components/transactions/TransactionTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

const TransactionHistory = () => {
  const { user } = useAuth();

  // ✅ Traemos arrays reactivos + refrescos desde DataContext
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

  // Al montar / cambiar user -> pedimos datos al server
  useEffect(() => {
    if (!user?.id) return;
    // Estas llamadas llenan los estados del DataContext, que a su vez
    // dispara el efecto de abajo (que sincroniza estados locales)
    refreshTransactions?.();
    refreshInvestments?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Sincroniza estados locales cuando cambian los arrays del contexto
  useEffect(() => {
    if (!user?.id) {
      setTransactions([]);
      setInvestments([]);
      setFilteredTransactions([]);
      return;
    }

    // DataContext YA trae datos del usuario logueado,
    // pero conservamos el filtro por compatibilidad si en algún
    // momento recibís datos globales.
    const uid = user.id;

    const tx = Array.isArray(ctxTransactions) ? ctxTransactions : [];
    const inv = Array.isArray(ctxInvestments)  ? ctxInvestments  : [];

    const userTx  = tx.filter(t => (t.user_id ?? t.userId ?? uid) === uid);
    const userInv = inv.filter(i => (i.user_id ?? i.userId ?? uid) === uid);

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
        <TransactionTabs
          filteredTransactions={filteredTransactions}
          investments={investments}
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
