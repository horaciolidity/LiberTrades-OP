// src/components/trading/TransactionStats.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownLeft, DollarSign, History } from 'lucide-react';

const safeArr = (a) => (Array.isArray(a) ? a : []);
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v, d = 2) => n(v).toFixed(d);

const TransactionStats = ({ transactions }) => {
  const tx = safeArr(transactions);

  const totalDeposits = tx
    .filter((t) => String(t.type) === 'deposit' && String(t.status) === 'completed')
    .reduce((sum, t) => sum + n(t.amount), 0);

  const totalWithdrawals = tx
    .filter((t) => String(t.type) === 'withdrawal' && String(t.status) === 'completed')
    .reduce((sum, t) => sum + n(t.amount), 0);

  const totalInvestments = tx
    .filter((t) => String(t.type) === 'investment' && String(t.status) === 'completed')
    .reduce((sum, t) => sum + n(t.amount), 0);

  const stats = [
    {
      title: 'Total Depósitos',
      value: `$${fmt(totalDeposits)}`,
      icon: ArrowDownLeft,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Total Retiros',
      value: `$${fmt(totalWithdrawals)}`,
      icon: ArrowUpRight,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Total Invertido',
      value: `$${fmt(totalInvestments)}`,
      icon: DollarSign,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Transacciones',
      value: String(tx.length),
      icon: History,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: index * 0.1 }}
          >
            <Card className="crypto-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">{stat.title}</p>
                    <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
};

export default TransactionStats;
