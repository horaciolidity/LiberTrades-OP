import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { BarChartHorizontalBig, TrendingUp, Users, DollarSign, Star, Activity, CheckCircle, PieChart as PieIcon } from 'lucide-react';
import { ResponsiveContainer, BarChart, XAxis, YAxis, Tooltip, Legend, Bar, PieChart, Pie, Cell } from 'recharts';

const UserStatsPage = () => {
  const { user, loading, balances } = useAuth();
  const { getInvestments, getTransactions, getReferrals } = useData();

  // Estado de carga simple (sin Layout)
  if (loading || !user) {
    return <div className="p-6 text-slate-300">Cargando datos del usuario…</div>;
  }

  // Helpers seguros
  const safeArr = (val) => (Array.isArray(val) ? val : (val ?? []));
  const allInvestments = safeArr(getInvestments?.());
  const allTx          = safeArr(getTransactions?.());
  const referrals      = safeArr(getReferrals?.(user.id));

  // Acepta user_id o userId
  const investments  = allInvestments.filter(inv => (inv?.user_id ?? inv?.userId) === user.id);
  const transactions = allTx.filter(tx => (tx?.user_id ?? tx?.userId) === user.id);

  // Campos tolerantes: amount/daily_return/dailyReturn/duration/created_at/createdAt
  const totalInvested = investments.reduce((sum, inv) => sum + Number(inv?.amount ?? 0), 0);

  const totalEarningsFromInvestments = investments.reduce((sum, inv) => {
    const created = new Date(inv?.created_at ?? inv?.createdAt ?? Date.now());
    const daysPassed = Math.max(0, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)));
    const daily = Number(inv?.daily_return ?? inv?.dailyReturn ?? 0) / 100;
    const dur = Math.min(daysPassed, Number(inv?.duration ?? 0));
    return sum + (Number(inv?.amount ?? 0) * daily * dur);
  }, 0);

  const totalDeposits = transactions
    .filter(t => (t?.type ?? '').toLowerCase() === 'deposit' && (t?.status ?? '').toLowerCase() === 'completed')
    .reduce((sum, t) => sum + Number(t?.amount ?? 0), 0);

  const totalWithdrawals = transactions
    .filter(t => (t?.type ?? '').toLowerCase() === 'withdrawal' && (t?.status ?? '').toLowerCase() === 'completed')
    .reduce((sum, t) => sum + Number(t?.amount ?? 0), 0);

  const portfolioDistributionData = investments.map(inv => ({
    name: inv?.plan_name ?? inv?.planName ?? 'Plan',
    value: Number(inv?.amount ?? 0),
  }));
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const monthlyActivityData = Array.from({ length: 6 }, (_, i) => {
    const month = new Date();
    month.setMonth(month.getMonth() - i);
    const monthStr = month.toLocaleString('default', { month: 'short' });
    const txInMonth = transactions.filter(tx => {
      const d = new Date(tx?.created_at ?? tx?.createdAt ?? Date.now());
      return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    });
    return {
      month: monthStr,
      deposits: txInMonth
        .filter(t => (t?.type ?? '').toLowerCase() === 'deposit')
        .reduce((s, t) => s + Number(t?.amount ?? 0), 0),
      withdrawals: txInMonth
        .filter(t => (t?.type ?? '').toLowerCase() === 'withdrawal')
        .reduce((s, t) => s + Number(t?.amount ?? 0), 0),
      investments: txInMonth
        .filter(t => (t?.type ?? '').toLowerCase() === 'investment')
        .reduce((s, t) => s + Number(t?.amount ?? 0), 0),
    };
  }).reverse();

  const generalStats = [
    { title: 'Balance Actual', value: `$${Number(balances?.usdc ?? 0).toFixed(2)}`, icon: DollarSign, color: 'text-green-400' },
    { title: 'Total Invertido', value: `$${totalInvested.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-400' },
    { title: 'Ganancias de Inversión', value: `$${totalEarningsFromInvestments.toFixed(2)}`, icon: Star, color: 'text-yellow-400' },
    { title: 'Total Referidos', value: referrals.length, icon: Users, color: 'text-purple-400' },
  ];

  return (
    <>
      <div className="space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <BarChartHorizontalBig className="h-8 w-8 mr-3 text-teal-400" />
            Mis Estadísticas
          </h1>
          <p className="text-slate-300">
            Un resumen detallado de tu actividad y rendimiento en la plataforma.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {generalStats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
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
                  <Activity className="mr-2 h-5 w-5 text-indigo-400"/>
                  Actividad Mensual
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Depósitos, retiros e inversiones en los últimos 6 meses.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyActivityData}>
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `$${value/1000}k`} />
                    <Tooltip
                      cursor={{fill: 'rgba(100, 116, 139, 0.1)'}}
                      contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', border: 'none', borderRadius: '0.5rem' }}
                      labelStyle={{ color: '#cbd5e1' }}
                    />
                    <Legend wrapperStyle={{fontSize: '12px'}} />
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
                  <PieIcon className="mr-2 h-5 w-5 text-rose-400"/>
                  Distribución de Portafolio
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Cómo están distribuidas tus inversiones activas.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {investments.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={portfolioDistributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        fontSize={12}
                      >
                        {portfolioDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', border: 'none', borderRadius: '0.5rem' }}
                        labelStyle={{ color: '#cbd5e1' }}
                      />
                    </PieChart>
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
                <CheckCircle className="mr-2 h-5 w-5 text-cyan-400"/>
                Resumen de Actividad Reciente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.slice(0, 5).map(tx => {
                const date = tx?.created_at ?? tx?.createdAt ?? Date.now();
                const type = (tx?.type ?? '').toLowerCase();
                const desc = tx?.description ?? tx?.plan_name ?? tx?.planName ?? '';
                const amount = Number(tx?.amount ?? 0);
                const isPositive = type === 'deposit' || (type === 'investment' && (tx?.status ?? '').toLowerCase() === 'completed' && (tx?.daily_return ?? tx?.dailyReturn));
                return (
                  <div key={tx.id} className="flex justify-between items-center p-3 mb-2 bg-slate-800/50 rounded-md">
                    <div>
                      <p className="text-white capitalize">
                        {type === 'deposit' ? 'Depósito' : type === 'withdrawal' ? 'Retiro' : 'Inversión'}
                      </p>
                      <p className="text-xs text-slate-400">{desc}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {type === 'deposit' ? '+' : '-'}${amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500">{new Date(date).toLocaleDateString()}</p>
                    </div>
                  </div>
                );
              })}
              {transactions.length === 0 && (
                <p className="text-slate-400 text-center py-4">No hay transacciones recientes.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default UserStatsPage;
