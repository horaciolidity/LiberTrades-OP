// src/pages/TransactionHistory.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import TransactionStats from '@/components/transactions/TransactionStats';
import TransactionFilters from '@/components/transactions/TransactionFilters';
import TransactionTabs from '@/components/transactions/TransactionTabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';

const TransactionHistory = () => {
  const { user } = useAuth();

  const [transactions, setTransactions] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Wallet transactions
      const { data: txs, error: txErr } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (txErr) throw txErr;

      // Normalizar descripción desde metadata si no existe
      const normalizedTxs = (txs || []).map((t) => {
        let desc = t.description || '';
        try {
          if (!desc && t.metadata && typeof t.metadata === 'object') {
            const reason = t.metadata.reason || '';
            const extra =
              t.metadata.plan ||
              t.metadata.project ||
              t.metadata.symbol ||
              t.metadata.bot ||
              '';
            desc = [reason, extra].filter(Boolean).join(' ').replace(/_/g, ' ');
          }
        } catch (_) {}
        return { ...t, description: desc };
      });

      setTransactions(normalizedTxs);
      setFilteredTransactions(normalizedTxs);

      // Investments
      const { data: invs, error: invErr } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (invErr) throw invErr;

      setInvestments(invs || []);
    } catch (e) {
      console.error('TransactionHistory fetchData error:', e);
      toast({
        title: 'Error al cargar historial',
        description: e?.message || 'Intenta nuevamente en unos segundos.',
        variant: 'destructive',
      });
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime: refrescar al cambiar tx o investments
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('history-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        fetchData
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${user.id}` },
        fetchData
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchData]);

  // Filtros locales
  useEffect(() => {
    let filtered = [...transactions];

    if (filterType !== 'all') {
      filtered = filtered.filter(
        (t) => (t.type || '').toLowerCase() === filterType.toLowerCase()
      );
    }
    if (filterStatus !== 'all') {
      filtered = filtered.filter(
        (t) => (t.status || '').toLowerCase() === filterStatus.toLowerCase()
      );
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((t) =>
        (t.description || '').toLowerCase().includes(q) ||
        (t.type || '').toLowerCase().includes(q)
      );
    }

    setFilteredTransactions(filtered);
  }, [transactions, filterType, filterStatus, searchTerm]);

  const exportTransactions = () => {
    const rows = [
      ['Fecha', 'Tipo', 'Descripción', 'Monto', 'Moneda', 'Estado'],
      ...filteredTransactions.map((t) => {
        const date = t.created_at || t.createdAt || t.date || new Date().toISOString();
        const amt = Number(t.amount);
        return [
          new Date(date).toLocaleDateString(),
          t.type || '',
          t.description || '',
          Number.isFinite(amt) ? amt.toFixed(2) : '0.00',
          t.currency || 'USDC',
          t.status || '',
        ];
      }),
    ];
    const csvContent = rows.map((r) => r.map(String).join(',')).join('\n');
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
