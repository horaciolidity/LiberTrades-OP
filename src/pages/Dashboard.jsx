import React, { useState, useEffect } from 'react';
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
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

const Dashboard = () => {
  const { user } = useAuth();
  const { cryptoPrices, getInvestments, getReferrals } = useData();
  const [investments, setInvestments] = useState([]);
  const [referrals, setReferrals] = useState([]);

  useEffect(() => {
    if (user) {
      setInvestments(getInvestments().filter(inv => inv.userId === user.id));
      setReferrals(getReferrals(user.id));
    }
  }, [user, getInvestments, getReferrals]);

  const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
  const totalEarnings = investments.reduce((sum, inv) => {
    const daysPassed = Math.floor((Date.now() - new Date(inv.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return sum + (inv.amount * (inv.dailyReturn / 100) * Math.min(daysPassed, inv.duration));
  }, 0);

  const stats = [
    {
      title: 'Saldo Total',
      value: `${(user?.balance || 0).toFixed(2)}`,
      icon: Wallet,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Total Invertido',
      value: `${totalInvested.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Ganancias',
      value: `${totalEarnings.toFixed(2)}`,
      icon: TrendingUp,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Referidos',
      value: referrals.length.toString(),
      icon: Users,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10'
    }
  ];

  return (
    <Layout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            ¡Bienvenido de vuelta, {user?.name}!
          </h1>
          <p className="text-slate-300">
            Aquí tienes un resumen de tu actividad de inversión
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
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

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Crypto Prices */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Activity className="h-5 w-5 mr-2 text-green-400" />
                  Precios en Tiempo Real
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Precios actuales de criptomonedas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(cryptoPrices).map(([crypto, data]) => (
                    <div key={crypto} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full flex items-center justify-center mr-3">
                          <span className="text-white text-xs font-bold">{crypto}</span>
                        </div>
                        <span className="text-white font-medium">{crypto}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold">
                          ${data.price.toFixed(crypto === 'USDT' ? 4 : 2)}
                        </div>
                        <div className={`text-sm flex items-center ${
                          data.change >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {data.change >= 0 ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {Math.abs(data.change).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Investments */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <PieChart className="h-5 w-5 mr-2 text-blue-400" />
                  Inversiones Activas
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Tus inversiones más recientes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {investments.length > 0 ? (
                  <div className="space-y-4">
                    {investments.slice(0, 5).map((investment) => (
                      <div key={investment.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                        <div>
                          <div className="text-white font-medium">{investment.planName}</div>
                          <div className="text-slate-400 text-sm">
                            {new Date(investment.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-semibold">
                            ${investment.amount.toFixed(2)}
                          </div>
                          <div className="text-green-400 text-sm">
                            {investment.dailyReturn}% diario
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

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Acciones Rápidas</CardTitle>
              <CardDescription className="text-slate-300">
                Accede rápidamente a las funciones principales
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <a
                  href="/plans"
                  className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  <Wallet className="h-8 w-8 text-green-400 mb-2" />
                  <span className="text-white text-sm font-medium">Invertir</span>
                </a>
                <a
                  href="/trading"
                  className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  <TrendingUp className="h-8 w-8 text-blue-400 mb-2" />
                  <span className="text-white text-sm font-medium">Trading</span>
                </a>
                <a
                  href="/referrals"
                  className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  <Users className="h-8 w-8 text-purple-400 mb-2" />
                  <span className="text-white text-sm font-medium">Referidos</span>
                </a>
                <a
                  href="/history"
                  className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  <BarChart3 className="h-8 w-8 text-orange-400 mb-2" />
                  <span className="text-white text-sm font-medium">Historial</span>
                </a>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </Layout>
  );
};

export default Dashboard;