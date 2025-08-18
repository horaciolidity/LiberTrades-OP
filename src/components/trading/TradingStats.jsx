import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';

const TradingStats = ({ virtualBalance, totalProfit, openTradesCount, totalTradesCount }) => {
  const stats = [
    {
      title: 'Saldo Virtual',
      value: `$${virtualBalance.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Ganancia Total',
      value: `${totalProfit >= 0 ? '+' : ''}$${totalProfit.toFixed(2)}`,
      icon: totalProfit >= 0 ? TrendingUp : TrendingDown,
      color: totalProfit >= 0 ? 'text-green-400' : 'text-red-400',
      bgColor: totalProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
    },
    {
      title: 'Trades Abiertos',
      value: openTradesCount.toString(),
      icon: Activity,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Total Trades',
      value: totalTradesCount.toString(),
      icon: BarChart3,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: index * 0.1 + 0.1 }}
          >
            <Card className="crypto-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm font-medium">{stat.title}</p>
                    <p className={`text-2xl font-bold mt-1 ${stat.color}`}>
                      {stat.value}
                    </p>
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