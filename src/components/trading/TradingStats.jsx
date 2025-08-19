import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';

const fmt = (n, dec = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(dec) : (0).toFixed(dec);
};

const toInt = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : 0;
};

const TradingStats = ({
  virtualBalance,
  totalProfit,
  openTradesCount,
  totalTradesCount,
}) => {
  // Valores seguros para evitar "Cannot read properties of undefined (reading 'toString')"
  const vb = Number(virtualBalance ?? 0);
  const tp = Number(totalProfit ?? 0);
  const otc = toInt(openTradesCount);
  const ttc = toInt(totalTradesCount);

  const isProfitUp = tp >= 0;

  const stats = [
    {
      title: 'Saldo',
      value: `$${fmt(vb, 2)}`,
      icon: DollarSign,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Ganancia Total',
      value: `${isProfitUp ? '+' : ''}$${fmt(tp, 2)}`,
      icon: isProfitUp ? TrendingUp : TrendingDown,
      color: isProfitUp ? 'text-green-400' : 'text-red-400',
      bgColor: isProfitUp ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      title: 'Trades Abiertos',
      value: String(otc),
      icon: Activity,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Total Trades',
      value: String(ttc),
      icon: BarChart3,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: i * 0.08 }}
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
