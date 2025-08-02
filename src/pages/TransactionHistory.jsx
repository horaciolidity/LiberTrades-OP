import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Layout from '@/components/Layout';
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
    if (user) {
      const userTransactions = getTransactions().filter(t => t.userId === user.id);
      const userInvestments = getInvestments().filter(i => i.userId === user.id);
      
      setTransactions(userTransactions);
      setInvestments(userInvestments);
      setFilteredTransactions(userTransactions);
    }
  }, [user, getTransactions, getInvestments]);

  useEffect(() => {
    let filtered = transactions;

    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.type === filterType);
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(t => t.status === filterStatus);
    }
    if (searchTerm) {
      filtered = filtered.filter(t => 
        t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredTransactions(filtered);
  }, [transactions, filterType, filterStatus, searchTerm]);

  const exportTransactions = () => {
    const csvContent = [
      ['Fecha', 'Tipo', 'Descripción', 'Monto', 'Estado'],
      ...filteredTransactions.map(t => [
        new Date(t.createdAt).toLocaleDateString(),
        t.type,
        t.description || '',
        t.amount.toFixed(2),
        t.status
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transacciones.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Layout>
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
    </Layout>
  );
};

export default TransactionHistory;