import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';

const fmt = (n, dec = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(dec) : (0).toFixed(dec);
};
const toInt = (n) => (Number.isFinite(Number(n)) ? Math.trunc(n) : 0);

const TradingStats = ({
  virtualBalance,
  totalProfit,
  openTradesCount,
  totalTradesCount,
  mode = 'demo',
}) => {
  const vb = Number(virtualBalance ?? 0);
  const tp = Number(totalProfit ?? 0);
  const otc = toInt(openTradesCount);
  const ttc = toInt(totalTradesCount);

  const isProfitUp = tp >= 0;
  const isReal = mode === 'real';

  // 🔹 Detectar cambios en balance / profit para animar
  const [flashColor, setFlashColor] = useState(null);
  const [prevProfit, setPrevProfit] = useState(tp);

  useEffect(() => {
    if (tp > prevProfit) setFlashColor('bg-green-500/30');
    else if (tp < prevProfit) setFlashColor('bg-red-500/30');
    setPrevProfit(tp);

    const t = setTimeout(() => setFlashColor(null), 400);
    return () => clearTimeout(t);
  }, [tp]);

  const stats = [
    {
      title: isReal ? 'Saldo Real' : 'Saldo Demo',
      value: `$${fmt(vb, 2)}`,
      icon: DollarSign,
      color: isReal ? 'text-emerald-400' : 'text-sky-400',
      bgColor: isReal ? 'bg-emerald-500/10' : 'bg-sky-500/10',
    },
    {
      title: 'Ganancia Total',
      value: `${isProfitUp ? '+' : ''}$${fmt(tp, 2)}`,
      icon: isProfitUp ? TrendingUp : TrendingDown,
      color: isProfitUp ? 'text-green-400' : 'text-red-400',
      bgColor: flashColor || (isProfitUp ? 'bg-green-500/10' : 'bg-red-500/10'),
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.07 }}
          >
            <Card
              className={`crypto-card backdrop-blur-md hover:scale-[1.02] transition-transform duration-300 ${
                stat.title === 'Ganancia Total' && flashColor ? flashColor : ''
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center gap-1">
                      {stat.title}
                      {i === 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                            isReal
                              ? 'bg-emerald-600/30 text-emerald-300'
                              : 'bg-sky-600/30 text-sky-300'
                          }`}
                        >
                          {isReal ? 'REAL' : 'DEMO'}
                        </span>
                      )}
                    </p>
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={stat.value}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.3 }}
                        className={`text-2xl font-bold mt-1 ${stat.color}`}
                      >
                        {stat.value}
                      </motion.p>
                    </AnimatePresence>
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
