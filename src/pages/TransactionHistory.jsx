import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TransactionStats from '@/components/transactions/TransactionStats';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionTabs from '@/components/transactions/TransactionTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

const TransactionHistory = () => {
  const { user } = useAuth();
  const { getTransactions, getInvestments } = useData();

  const [transactions, setTransactions] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    if (!user) return;

    const allTx = (getTransactions?.() || []);
    const allInv = (getInvestments?.() || []);

    // Acepta user_id o userId
    const uid = user.id;
    const userTransactions = allTx.filter(t => (t.user_id ?? t.userId) === uid);
    const userInvestments  = allInv.filter(i => (i.user_id ?? i.userId) === uid);

    setTransactions(userTransactions);
    setInvestments(userInvestments);
    setFilteredTransactions(userTransactions);
  }, [user, getTransactions, getInvestments]);

  useEffect(() => {
    let filtered = [...transactions];

    if (filterType !== 'all') {
      filtered = filtered.filter(t => (t.type || '').toLowerCase() === filterType.toLowerCase());
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => (t.status || '').toLowerCase() === filterStatus.toLowerCase());
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
        const date = t.created_at || t.createdAt || t.date || new Date().toISOString();
        const amt = Number(t.amount);
        return [
          new Date(date).toLocaleDateString(),
          t.type || '',
          t.description || '',
          Number.isFinite(amt) ? amt.toFixed(2) : '0.00',
          t.status || ''
        ];
      })
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

        <TransactionStats transactions={transactions} />

        <TransactionFilters
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filterType={filterType}
          setFilterType={setFilterType}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          exportTransactions={exportTransactions}
        />

        <TransactionTabs
          filteredTransactions={filteredTransactions}
          investments={investments}
        />
      </div>
    </>
  );
};

export default TransactionHistory;
