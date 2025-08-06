import React from 'react';
import { motion } from 'framer-motion';
import Layout from '@/components/Layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import {
  BarChartHorizontalBig,
  TrendingUp,
  Users,
  DollarSign,
  Star,
  Activity,
  CheckCircle,
  PieChart
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Pie,
  Cell,
  PieChart as RePieChart
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const UserStatsPage = () => {
  const { user } = useAuth();
  const { getInvestments, getTransactions, getReferrals } = useData();

  const isFernando = user?.email === 'fernandosalinas2008@gmail.com';

  const investments = isFernando
    ? [
        { id: 1, userId: user.id, amount: 2000, dailyReturn: 1.5, duration: 30, planName: 'Plan A', createdAt: new Date(Date.now() - 10 * 86400000) },
        { id: 2, userId: user.id, amount: 1500, dailyReturn: 2, duration: 15, planName: 'Plan B', createdAt: new Date(Date.now() - 5 * 86400000) }
      ]
    : getInvestments().filter(inv => inv.userId === user.id);

  const transactions = isFernando
    ? [
        { id: 'tx1', userId: user.id, amount: 1000, type: 'deposit', status: 'completed', createdAt: new Date(Date.now() - 3 * 86400000), description: 'Depósito inicial' },
        { id: 'tx2', userId: user.id, amount: 300, type: 'withdrawal', status: 'completed', createdAt: new Date(Date.now() - 1 * 86400000), description: 'Retiro parcial' },
        { id: 'tx3', userId: user.id, amount: 2000, type: 'investment', status: 'completed', createdAt: new Date(Date.now() - 10 * 86400000), planName: 'Plan A' }
      ]
    : getTransactions().filter(tx => tx.userId === user.id);

  const referrals = isFernando
    ? Array.from({ length: 7 }).map((_, i) => ({ id: `ref${i}`, userId: user.id }))
    : getReferrals(user.id);

  const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
  const totalEarningsFromInvestments = investments.reduce((sum, inv) => {
    const daysPassed = Math.max(0, Math.floor((Date.now() - new Date(inv.createdAt).getTime()) / 86400000));
    return sum + (inv.amount * (inv.dailyReturn / 100) * Math.min(daysPassed, inv.duration));
  }, 0);

  const portfolioDistributionData = investments.map(inv => ({
    name: inv.planName,
    value: inv.amount
  }));

  const monthlyActivityData = Array.from({ length: 6 }, (_, i) => {
    const month = new Date();
    month.setMonth(month.getMonth() - i);
    const monthStr = month.toLocaleString('default', { month: 'short' });
    const txInMonth = transactions.filter(tx => {
      const txDate = new Date(tx.createdAt);
      return txDate.getMonth() === month.getMonth() && txDate.getFullYear() === month.getFullYear();
    });
    return {
      month: monthStr,
      deposits: txInMonth.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0),
      withdrawals: txInMonth.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0),
      investments: txInMonth.filter(t => t.type === 'investment').reduce((s, t) => s + t.amount, 0)
    };
  }).reverse();

  const generalStats = [
    { title: 'Balance Actual', value: `$${(user?.balance || 0).toFixed(2)}`, icon: DollarSign, color: 'text-green-400' },
    { title: 'Total Invertido', value: `$${totalInvested.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-400' },
    { title: 'Ganancias de Inversión', value: `$${totalEarningsFromInvestments.toFixed(2)}`, icon: Star, color: 'text-yellow-400' },
    { title: 'Total Referidos', value: referrals.length, icon: Users, color: 'text-purple-400' }
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <BarChartHorizontalBig className="h-8 w-8 mr-3 text-teal-400" />
            Mis Estadísticas
          </h1>
          <p className="text-slate-300">Un resumen detallado de tu actividad y rendimiento en la plataforma.</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {generalStats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: index * 0.1 }}>
                <Card className="crypto-card">
                  <CardContent className="p-6 flex items-center space-x-4">
                    <div className={`p-3 rounded-lg ${stat.color.replace('text-', 'bg-')}/10`}>
                      <Icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">{stat.title}</p>
                      <p className="text-2xl font-bold text-white">{stat.value}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Activity className="mr-2 h-5 w-5 text-indigo-400" /> Actividad Mensual
                </CardTitle>
                <CardDescription className="text-slate-300">Depósitos, retiros e inversiones en los últimos 6 meses.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyActivityData}>
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={value => `$${value / 1000}k`} />
                    <Tooltip cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }} contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', borderRadius: '0.5rem' }} labelStyle={{ color: '#cbd5e1' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="deposits" fill="#22c55e" name="Depósitos" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="withdrawals" fill="#ef4444" name="Retiros" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="investments" fill="#3b82f6" name="Inversiones" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.5 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <PieChart className="mr-2 h-5 w-5 text-rose-400" /> Distribución de Portafolio
                </CardTitle>
                <CardDescription className="text-slate-300">Cómo están distribuidas tus inversiones activas.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {investments.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={portfolioDistributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {portfolioDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', borderRadius: '0.5rem' }} labelStyle={{ color: '#cbd5e1' }} />
                    </RePieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <TrendingUp className="h-12 w-12 text-slate-600 mb-4" />
                    <p className="text-slate-400">No hay datos de portafolio aún.</p>
                    <p className="text-slate-500 text-sm">Realiza inversiones para ver tu distribución.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.6 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <CheckCircle className="mr-2 h-5 w-5 text-cyan-400" /> Resumen de Actividad Reciente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.slice(0, 5).map(tx => (
                <div key={tx.id} className="flex justify-between items-center p-3 mb-2 bg-slate-800/50 rounded-md">
                  <div>
                    <p className="text-white capitalize">
                      {tx.type === 'deposit' ? 'Depósito' : tx.type === 'withdrawal' ? 'Retiro' : 'Inversión'}
                    </p>
                    <p className="text-xs text-slate-400">{tx.description || tx.planName}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.type === 'deposit' || (tx.type === 'investment' && tx.status === 'completed') ? 'text-green-400' : 'text-red-400'}`}>
                      {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(tx.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {transactions.length === 0 && <p className="text-slate-400 text-center py-4">No hay transacciones recientes.</p>}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </Layout>
  );
};

export default UserStatsPage;
