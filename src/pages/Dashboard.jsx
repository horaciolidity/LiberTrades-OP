import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Users,
  DollarSign,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

export default function Dashboard() {
  const { user, displayName, balances, loading } = useAuth();
  const { cryptoPrices = {}, getInvestments, getReferrals } = useData();
  const [investments, setInvestments] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;
      try {
        const invs = await getInvestments?.();
        const refs = await getReferrals?.(user.id);
        setInvestments(invs?.filter(inv => inv?.userId === user.id) || []);
        setReferrals(refs || []);
      } catch (err) {
        console.error('Error cargando datos del dashboard:', err);
        setError('No se pudieron cargar los datos.');
      }
    };
    fetchData();
  }, [user?.id, getInvestments, getReferrals]);

  if (loading) return <div className="p-8 text-white">Cargando...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!user) return <div className="p-8 text-white">Iniciá sesión para ver el dashboard.</div>;

  const totalInvested = (investments || []).reduce(
    (sum, inv) => sum + Number(inv?.amount || 0), 0
  );

  const totalEarnings = (investments || []).reduce((sum, inv) => {
    const createdAtMs = inv?.createdAt ? new Date(inv.createdAt).getTime() : Date.now();
    const daysPassed = Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60 * 24));
    const dailyReturnPct = Number(inv?.dailyReturn || 0);
    const duration = Number(inv?.duration || 0);
    const amount = Number(inv?.amount || 0);
    return sum + (amount * (dailyReturnPct / 100)) * Math.min(daysPassed, duration);
  }, 0);

  const stats = [
    {
      title: 'Saldo Total',
      value: fmt(balances?.usdc ?? 0, 2),
      icon: Wallet,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Total Invertido',
      value: fmt(totalInvested, 2),
      icon: DollarSign,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Ganancias',
      value: fmt(totalEarnings, 2),
      icon: TrendingUp,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Referidos',
      value: String(referrals.length || 0),
      icon: Users,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
    },
  ];

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <h1 className="text-3xl font-bold text-white mb-2">
          ¡Bienvenido de vuelta, {displayName || 'Usuario'}!
        </h1>
        <p className="text-slate-300">Aquí tienes un resumen de tu actividad de inversión</p>
      </motion.div>

      {/* Stats */}
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
                      <p className="text-2xl font-bold text-white mt-1">${stat.value}</p>
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

      {/* Crypto Prices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.4 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Activity className="h-5 w-5 mr-2 text-green-400" />
                Precios en Tiempo Real
              </CardTitle>
              <CardDescription className="text-slate-300">Precios actuales de criptomonedas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(cryptoPrices).map(([crypto, data]) => {
                  const price = Number(data?.price ?? 0);
                  const change = Number(data?.change ?? 0);
                  return (
                    <div key={crypto} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full flex items-center justify-center mr-3">
                          <span className="text-white text-xs font-bold">{crypto}</span>
                        </div>
                        <span className="text-white font-medium">{crypto}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold">
                          ${price.toFixed(crypto === 'USDT' ? 4 : 2)}
                        </div>
                        <div className={`text-sm flex items-center ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {change >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                          {Math.abs(change).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Inversiones */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.6 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <PieChart className="h-5 w-5 mr-2 text-blue-400" />
                Inversiones Activas
              </CardTitle>
              <CardDescription className="text-slate-300">Tus inversiones más recientes</CardDescription>
            </CardHeader>
            <CardContent>
              {(investments?.length || 0) > 0 ? (
                <div className="space-y-4">
                  {investments.slice(0, 5).map((investment) => (
                    <div key={investment?.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <div className="text-white font-medium">{investment?.planName || 'Plan'}</div>
                        <div className="text-slate-400 text-sm">
                          {investment?.createdAt ? new Date(investment.createdAt).toLocaleDateString() : '--/--/----'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold">
                          ${fmt(investment?.amount, 2)}
                        </div>
                        <div className="text-green-400 text-sm">
                          {fmt(investment?.dailyReturn, 2)}% diario
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No tienes inversiones activas</p>
                  <p className="text-slate-500 text-sm">Comienza invirtiendo en nuestros planes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Acciones rápidas */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.8 }}>
        <Card className="crypto-card">
          <CardHeader>
            <CardTitle className="text-white">Acciones Rápidas</CardTitle>
            <CardDescription className="text-slate-300">
              Accede rápidamente a las funciones principales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link to="/plans" className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Wallet className="h-8 w-8 text-green-400 mb-2" />
                <span className="text-white text-sm font-medium">Invertir</span>
              </Link>
              <Link to="/simulator" className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
                <TrendingUp className="h-8 w-8 text-blue-400 mb-2" />
                <span className="text-white text-sm font-medium">Trading</span>
              </Link>
              <Link to="/referrals" className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Users className="h-8 w-8 text-purple-400 mb-2" />
                <span className="text-white text-sm font-medium">Referidos</span>
              </Link>
              <Link to="/history" className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
                <BarChart3 className="h-8 w-8 text-orange-400 mb-2" />
                <span className="text-white text-sm font-medium">Historial</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
