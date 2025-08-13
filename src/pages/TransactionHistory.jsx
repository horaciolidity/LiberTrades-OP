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
      // 1) HISTORY: leer desde la VISTA con monto firmado
      const { data: hist, error: eh } = await supabase
        .from('v_wallet_history_signed')
        .select('created_at, direction, type, amount_signed, currency, description, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (eh) throw eh;

      // Mapear a la forma que esperan tus componentes
      // - amount: ya firmado (credit/debit)
      // - type: mapeamos plan_purchase -> investment para íconos/tabs existentes
      const tx = (hist || []).map((r) => ({
        created_at: r.created_at,
        direction: r.direction, // 'credit' | 'debit'
        type: r.type === 'plan_purchase' ? 'investment' : (r.type || ''),
        amount: Number(r.amount_signed ?? 0), // firmado
        currency: r.currency || 'USDC',
        description: r.description || '',
        status: (r.status || 'completed').toLowerCase(),
      }));

      setTransactions(tx);
      setFilteredTransactions(tx);

      // 2) INVESTMENTS: (para la pestaña de inversiones)
      const { data: invs, error: ei } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (ei) throw ei;
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

  // Realtime: SIEMPRE escuchar TABLAS (no vistas) y re-fetch
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`history-sync-${user.id}`)
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // opcional: console.log('Realtime conectado');
        }
      });

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

        {/* Stats: usa el arreglo completo (ya con montos firmados) */}
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

        {/* Tabs: le pasamos la lista filtrada y las inversiones */}
        <TransactionTabs
          filteredTransactions={filteredTransactions}
          investments={investments}
        />
      </div>
    </>
  );
};

export default TransactionHistory;
