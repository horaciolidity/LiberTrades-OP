// src/components/trading/TradingStats.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';

const num = (v, d = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d);
};

const TradingStats = ({
  // retrocompat: si no envías balance, usa virtualBalance
  balance,
  virtualBalance,
  totalProfit = 0,
  openTradesCount = 0,
  totalTradesCount = 0,
  mode = 'demo', // 'demo' | 'real' (opcional, solo para el label)
}) => {
  const shownBalance = Number.isFinite(Number(balance)) ? Number(balance) : Number(virtualBalance || 0);
  const profit = Number(totalProfit) || 0;
  const profitPositive = profit >= 0;

  const stats = [
    {
      title: mode === 'real' ? 'Saldo Real' : 'Saldo Virtual',
      value: `$${num(shownBalance, 2)}`,
      icon: DollarSign,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Ganancia Total',
      value: `${profitPositive ? '+' : ''}$${num(profit, 2)}`,
      icon: profitPositive ? TrendingUp : TrendingDown,
      color: profitPositive ? 'text-green-400' : 'text-red-400',
      bgColor: profitPositive ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      title: 'Trades Abiertos',
      value: String(openTradesCount || 0),
      icon: Activity,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Total Trades',
      value: String(totalTradesCount || 0),
      icon: BarChart3,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: index * 0.1 + 0.1 }}
          >
            <Card className="crypto-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">{stat.title}</p>
                    <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
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

export default TradingStats;
