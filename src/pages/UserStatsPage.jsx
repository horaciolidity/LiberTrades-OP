import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import {
  BarChartHorizontalBig,
  TrendingUp,
  Users,
  DollarSign,
  Star,
  Activity as ActivityIcon,
  CheckCircle,
  PieChart as PieIcon,
  Bot,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';

// Helpers numéricos
const num = (v, d = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : '0.00';
};
const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

// Normalizaciones suaves (snake/camel)
const normInvestment = (inv) => ({
  id: inv?.id,
  user_id: inv?.user_id ?? inv?.userId,
  plan_name: inv?.plan_name ?? inv?.planName,
  amount: Number(inv?.amount ?? 0),
  daily_return: Number(inv?.daily_return ?? inv?.dailyReturn ?? 0),
  duration: Number(inv?.duration ?? 0),
  status: inv?.status ?? 'active',
  currency_input: inv?.currency_input ?? inv?.currencyInput ?? 'USDC',
  created_at: inv?.created_at ?? inv?.createdAt ?? null,
});

const normTx = (t) => ({
  ...t,
  id: t?.id,
  user_id: t?.user_id ?? t?.userId,
  type: (t?.type || '').toLowerCase(),
  status: (t?.status || '').toLowerCase(),
  referenceType: (t?.referenceType ?? t?.reference_type ?? '').toLowerCase(),
  created_at: t?.created_at ?? t?.createdAt ?? new Date().toISOString(),
});

// Progreso/ganancias por inversión
const calcProgress = (inv, now = Date.now()) => {
  const start = inv.created_at ? new Date(inv.created_at).getTime() : now;
  const dayMs = 86_400_000;
  const elapsedDays = Math.max(0, Math.floor((now - start) / dayMs));
  const cappedDays = Math.min(Number(inv.duration || 0), elapsedDays);
  const pct = Number(inv.duration || 0) > 0 ? (cappedDays / Number(inv.duration)) * 100 : 0;
  const accrued = Number(inv.amount || 0) * (Number(inv.daily_return || 0) / 100) * cappedDays;
  return { elapsedDays, cappedDays, pct, accrued };
};

const UserStatsPage = () => {
  const { user, loading, balances } = useAuth();

  const {
    investments = [],
    transactions = [],
    botActivations = [],
    refreshTransactions,
    refreshBotActivations,
    getReferrals,
  } = useData();

  // Estado local reactivo para escuchar Realtime sin romper compat
  const [liveInv, setLiveInv] = useState([]);
  const [liveTx, setLiveTx] = useState([]);

  // Tick para refrescar métricas de progreso en pantalla
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Inicial: refrescos ligeros (server) y si hay Realtime, lo pisará
  useEffect(() => {
    if (!user?.id) return;
    refreshTransactions?.();
    refreshBotActivations?.();
  }, [user?.id, refreshTransactions, refreshBotActivations]);

  // Seed local desde DataContext cuando cambie
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const invMine = (Array.isArray(investments) ? investments : [])
      .filter((i) => (i?.user_id ?? i?.userId) === uid)
      .map(normInvestment)
      .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
    const txMine = (Array.isArray(transactions) ? transactions : [])
      .filter((t) => (t?.user_id ?? t?.userId) === uid)
      .map(normTx)
      .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
    setLiveInv(invMine);
    setLiveTx(txMine);
  }, [investments, transactions, user?.id]);

  // Realtime: investments del usuario
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('stats-investments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setLiveInv((prev) => {
            const list = Array.isArray(prev) ? [...prev] : [];
            if (payload.eventType === 'INSERT') {
              const ni = normInvestment(payload.new);
              if (!list.some((x) => x.id === ni.id)) list.unshift(ni);
              return list;
            }
            if (payload.eventType === 'UPDATE') {
              const ni = normInvestment(payload.new);
              return list.map((x) => (x.id === ni.id ? ni : x));
            }
            if (payload.eventType === 'DELETE') {
              return list.filter((x) => x.id !== payload.old?.id);
            }
            return list;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Realtime: wallet_transactions del usuario (para actividad mensual y tablas)
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('stats-wallet-tx')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setLiveTx((prev) => {
            const list = Array.isArray(prev) ? [...prev] : [];
            if (payload.eventType === 'INSERT') {
              const nx = normTx(payload.new);
              if (!list.some((x) => x.id === nx.id)) list.unshift(nx);
              return list;
            }
            if (payload.eventType === 'UPDATE') {
              const nx = normTx(payload.new);
              return list.map((x) => (x.id === nx.id ? nx : x));
            }
            if (payload.eventType === 'DELETE') {
              return list.filter((x) => x.id !== payload.old?.id);
            }
            return list;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (loading || !user) {
    return <div className="p-6 text-slate-300">Cargando datos del usuario…</div>;
  }

  const safeArr = (val) => (Array.isArray(val) ? val : val ? [val] : []);
  const referrals = safeArr(getReferrals?.(user.id));

  const userInvestments = liveInv; // ya normalizados
  const userTx = liveTx; // ya normalizados

  const totalInvested = sum(userInvestments.map((inv) => inv.amount));

  const totalEarningsFromInvestments = userInvestments.reduce((acc, inv) => {
    const pr = calcProgress(inv, nowTick);
    return acc + pr.accrued;
  }, 0);

  // Serie de 6 meses (incluye 'investment' y 'investment_purchase')
  const monthlyActivityData = useMemo(() => {
    const data = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth();
      const y = d.getFullYear();
      const monthLabel = d.toLocaleString('default', { month: 'short' });

      const txInMonth = userTx.filter((tx) => {
        const t = new Date(tx?.created_at ?? Date.now());
        return t.getMonth() === m && t.getFullYear() === y;
      });

      const deposits = sum(txInMonth.filter((t) => t.type === 'deposit' && t.status === 'completed').map((t) => t.amount));
      const withdrawals = sum(txInMonth.filter((t) => t.type === 'withdrawal' && t.status === 'completed').map((t) => t.amount));
      const investmentsAmt = sum(
        txInMonth
          .filter((t) => ['investment', 'investment_purchase'].includes(t.type) && t.status !== 'failed')
          .map((t) => t.amount)
      );

      return { month: monthLabel, deposits, withdrawals, investments: investmentsAmt };
    }).reverse();
    return data;
  }, [userTx]);

  const portfolioDistributionData = userInvestments.map((inv) => ({
    name: inv.plan_name ?? 'Plan',
    value: Number(inv.amount ?? 0),
  }));
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const generalStats = [
    { title: 'Balance Actual', value: `$${num(balances?.usdc ?? 0)}`, icon: DollarSign, color: 'text-green-400' },
    { title: 'Total Invertido', value: `$${num(totalInvested)}`, icon: TrendingUp, color: 'text-blue-400' },
    { title: 'Ganancias de Inversión', value: `$${num(totalEarningsFromInvestments)}`, icon: Star, color: 'text-yellow-400' },
    { title: 'Total Referidos', value: referrals.length, icon: Users, color: 'text-purple-400' },
  ];

  // Bots
  const {
    activeCount,
    pausedCount,
    capitalEnBots,
    profit30d,
    profitTotal,
    lastBotTx,
  } = useMemo(() => {
    const actives = botActivations.filter((b) => (b.status || '').toLowerCase() === 'active');
    const paused = botActivations.filter((b) => (b.status || '').toLowerCase() === 'paused');

    const capital = sum(
      botActivations
        .filter((b) => ['active', 'paused'].includes((b.status || '').toLowerCase()))
        .map((b) => b.amountUsd ?? b.amount_usd ?? 0)
    );

    const botTx = userTx.filter((t) =>
      ['bot_activation', 'bot_profit', 'bot_refund', 'bot_fee'].includes(t.referenceType)
    );

    const profits = botTx.filter((t) => t.referenceType === 'bot_profit' && t.status === 'completed');

    const now = Date.now();
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    const p30 = sum(
      profits
        .filter((t) => now - new Date(t.created_at).getTime() <= ms30d)
        .map((t) => t.amount)
    );
    const pTotal = sum(profits.map((t) => t.amount));

    const last = [...botTx]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

    return {
      activeCount: actives.length,
      pausedCount: paused.length,
      capitalEnBots: capital,
      profit30d: p30,
      profitTotal: pTotal,
      lastBotTx: last,
    };
  }, [botActivations, userTx]);

  return (
    <>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <BarChartHorizontalBig className="h-8 w-8 mr-3 text-teal-400" />
            Mis Estadísticas
          </h1>
          <p className="text-slate-300">Un resumen detallado de tu actividad y rendimiento en la plataforma.</p>
        </motion.div>

        {/* Stats generales */}
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

        {/* KPIs de bots */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="crypto-card">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Bots Activos</CardTitle>
                <CardDescription className="text-slate-300">Corriendo ahora</CardDescription>
              </div>
              <Bot className="h-7 w-7 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">{activeCount}</div>
              <div className="text-xs text-slate-400 mt-1">{pausedCount} en pausa</div>
            </CardContent>
          </Card>

          <Card className="crypto-card">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Capital en Bots</CardTitle>
                <CardDescription className="text-slate-300">Activo + Pausado</CardDescription>
              </div>
              <DollarSign className="h-7 w-7 text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-400">${num(capitalEnBots)}</div>
            </CardContent>
          </Card>

          <Card className="crypto-card">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Ganancia 30 días</CardTitle>
                <CardDescription className="text-slate-300">Sólo bots</CardDescription>
              </div>
              <TrendingUp className="h-7 w-7 text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">${num(profit30d)}</div>
            </CardContent>
          </Card>

          <Card className="crypto-card">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Ganancia Total (Bots)</CardTitle>
                <CardDescription className="text-slate-300">Histórico</CardDescription>
              </div>
              <ActivityIcon className="h-7 w-7 text-cyan-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-white">${num(profitTotal)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Gráficos: actividad mensual y distribución */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <ActivityIcon className="mr-2 h-5 w-5 text-indigo-400" />
                  Actividad Mensual
                </CardTitle>
                <CardDescription className="text-slate-300">Depósitos, retiros e inversiones en los últimos 6 meses.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyActivityData}>
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(value) => `$${value / 1000}k`} />
                    <Tooltip
                      cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }}
                      contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', border: 'none', borderRadius: '0.5rem' }}
                      labelStyle={{ color: '#cbd5e1' }}
                    />
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
                  <PieIcon className="mr-2 h-5 w-5 text-rose-400" />
                  Distribución de Portafolio
                </CardTitle>
                <CardDescription className="text-slate-300">Cómo están distribuidas tus inversiones activas.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {userInvestments.length > 0 ? (
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

        {/* Tabla de bot tx */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.6 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <CheckCircle className="mr-2 h-5 w-5 text-cyan-400" />
                Actividad reciente de Bots
              </CardTitle>
              <CardDescription className="text-slate-300">Últimas 10 transacciones relacionadas a bots.</CardDescription>
            </CardHeader>
            <CardContent>
              {lastBotTx.length === 0 ? (
                <div className="text-slate-400">Sin movimientos de bots todavía.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="py-2 pr-4">Fecha</th>
                        <th className="py-2 pr-4">Tipo</th>
                        <th className="py-2 pr-4">Descripción</th>
                        <th className="py-2 pr-4">Monto</th>
                        <th className="py-2 pr-4">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {lastBotTx.map((t) => {
                        const d = new Date(t.created_at);
                        const r = t.referenceType;
                        const nice =
                          r === 'bot_activation'
                            ? 'Activación'
                            : r === 'bot_profit'
                            ? 'Ganancia'
                            : r === 'bot_refund'
                            ? 'Reembolso'
                            : r === 'bot_fee'
                            ? 'Fee'
                            : (t.type || '—');
                        return (
                          <tr key={t.id} className="border-top border-slate-700/60">
                            <td className="py-2 pr-4">{d.toLocaleString()}</td>
                            <td className="py-2 pr-4">{nice}</td>
                            <td className="py-2 pr-4">{t.description || ''}</td>
                            <td className="py-2 pr-4">${num(t.amount)}</td>
                            <td className="py-2 pr-4">{t.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Resumen general de actividad (incluye investment_purchase) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.7 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <CheckCircle className="mr-2 h-5 w-5 text-cyan-400" />
                Resumen de Actividad Reciente (General)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {userTx.slice(0, 5).map((tx) => {
                const date = tx.created_at ?? Date.now();
                const type = tx.type;
                const desc = tx.description || '';
                const amount = Number(tx.amount ?? 0);
                const isPositive =
                  type === 'deposit' ||
                  type === 'admin_credit' ||
                  (type === 'investment' && tx.status === 'completed'); // legacy
                const isNegative =
                  type === 'withdrawal' ||
                  type === 'bot_activation' ||
                  type === 'investment_purchase';
                return (
                  <div key={tx.id} className="flex justify-between items-center p-3 mb-2 bg-slate-800/50 rounded-md">
                    <div>
                      <p className="text-white capitalize">
                        {type === 'deposit'
                          ? 'Depósito'
                          : type === 'withdrawal'
                          ? 'Retiro'
                          : type === 'investment_purchase'
                          ? 'Compra de plan'
                          : type === 'investment'
                          ? 'Inversión'
                          : 'Movimiento'}
                      </p>
                      <p className="text-xs text-slate-400">{desc}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          isPositive ? 'text-green-400' : isNegative ? 'text-red-400' : 'text-slate-300'
                        }`}
                      >
                        {isNegative ? '-' : isPositive ? '+' : ''}
                        ${num(amount)}
                      </p>
                      <p className="text-xs text-slate-500">{new Date(date).toLocaleDateString()}</p>
                    </div>
                  </div>
                );
              })}
              {userTx.length === 0 && <p className="text-slate-400 text-center py-4">No hay transacciones recientes.</p>}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default UserStatsPage;
