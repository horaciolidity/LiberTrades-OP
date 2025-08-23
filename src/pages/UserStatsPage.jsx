// src/pages/UserStatsPage.jsx
import React, { useMemo } from 'react';
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
  Activity,
  CheckCircle,
  PieChart as PieIcon,
  Gauge,
  Bot,
  CalendarDays,
  Target,
  Zap,
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

/* ========= helpers ========= */
const safeArr = (v) => (Array.isArray(v) ? v : []);
const asDate = (t) => new Date(t?.createdAt ?? t?.created_at ?? t ?? Date.now());
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#a78bfa', '#ef4444', '#14b8a6', '#e879f9', '#06b6d4', '#84cc16'];

export default function UserStatsPage() {
  const { user, loading, balances } = useAuth();

  const {
    // arrays ya mapeados por DataContext (si no, usamos getters)
    investments: ctxInvestments,
    transactions: ctxTransactions,
    referrals: ctxReferrals,
    botActivations: ctxBots,
    getInvestments,
    getTransactions,
    getReferrals,
  } = useData();

  if (loading || !user) {
    return <div className="p-6 text-slate-300">Cargando datos del usuario…</div>;
  }

  /* ===== normalización segura por usuario ===== */
  const allInvestmentsRaw = safeArr(ctxInvestments?.length ? ctxInvestments : getInvestments?.());
  const allTxRaw = safeArr(ctxTransactions?.length ? ctxTransactions : getTransactions?.());
  const allReferralsRaw = safeArr(ctxReferrals?.length ? ctxReferrals : getReferrals?.(user.id));
  const allBotsRaw = safeArr(ctxBots);

  const investments = allInvestmentsRaw.filter((i) => (i?.user_id ?? i?.userId) === user.id);
  const userTx = allTxRaw
    .filter((t) => (t?.user_id ?? t?.userId) === user.id)
    .map((t) => ({
      ...t,
      type: String(t?.type ?? t?.rawType ?? '').toLowerCase(),
      status: String(t?.status ?? '').toLowerCase(), // puede venir vacío
      amount: Number(t?.amount ?? 0),
    }));

  const referrals = allReferralsRaw;
  const userBots = allBotsRaw.filter((b) => (b?.user_id ?? b?.userId) === user.id);

  /* ===== inversiones ===== */
  const activeInvests = investments.filter((i) => String(i?.status ?? '').toLowerCase() === 'active');
  const maturedInvests = investments.filter(
    (i) => Number(i?.daysElapsed ?? 0) >= Number(i?.duration ?? 0)
  );

  // ganancia “acumulada” SOLO para activas (evitamos doble conteo con payouts)
  const accrualActive = activeInvests.reduce((sum, inv) => {
    if (typeof inv?.earnings === 'number') return sum + inv.earnings;
    const created = asDate(inv);
    const daysPassed = Math.max(
      0,
      Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
    );
    const daily = Number(inv?.daily_return ?? inv?.dailyReturn ?? 0) / 100;
    const dur = Number(inv?.duration ?? 0);
    const amount = Number(inv?.amount ?? 0);
    return sum + amount * daily * Math.min(daysPassed, dur);
  }, 0);

  // pagos reales de planes (varios alias posibles)
  const PLAN_PAYOUT_TYPES = new Set([
    'plan_payout',
    'investment_profit',
    'plan_profit',
    'roi_payout',
    'plan_earnings',
  ]);
  const planPayouts = userTx
    .filter((t) => PLAN_PAYOUT_TYPES.has(t.type) && (t.status === 'completed' || t.status === ''))
    .reduce((a, t) => a + t.amount, 0);

  // fallback: si NO hay pagos, estimamos para vencidos
  const maturedFallback = planPayouts > 0
    ? 0
    : maturedInvests.reduce((sum, inv) => {
        const daily = Number(inv?.daily_return ?? inv?.dailyReturn ?? 0) / 100;
        const amount = Number(inv?.amount ?? 0);
        const dur = Number(inv?.duration ?? 0);
        return sum + amount * daily * dur;
      }, 0);

  const totalEarningsFromInvestments = accrualActive + planPayouts + maturedFallback;

  const totalInvested = investments.reduce((sum, inv) => sum + Number(inv?.amount ?? 0), 0);
  const roiPct = totalInvested > 0 ? (totalEarningsFromInvestments / totalInvested) * 100 : 0;

  /* ===== bots ===== */
  const activeBots = userBots.filter((b) => String(b?.status ?? '').toLowerCase() === 'active');
  const botsRunning = activeBots.length;
  const botsAmount = activeBots.reduce((a, b) => a + Number(b?.amountUsd ?? b?.amount ?? 0), 0);

  const BOT_PROFIT_TYPES = new Set(['bot_profit', 'bot_gain', 'bot_payout', 'bot_earnings']);
  const botProfit = userTx
    .filter((t) => BOT_PROFIT_TYPES.has(t.type) && (t.status === 'completed' || t.status === ''))
    .reduce((a, t) => a + t.amount, 0);

  /* ===== actividad 30 días y energía ===== */
  const last30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeDaySet = new Set(
    userTx.filter((t) => asDate(t).getTime() >= last30).map((t) => {
      const d = asDate(t);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate())
        .toISOString()
        .slice(0, 10);
    })
  );
  const activeDays30 = activeDaySet.size;

  const GOALS = { roi: 10, bots: 1, referrals: 10, activityDays: 15 };
  const avgPlanProgress = useMemo(() => {
    if (!activeInvests.length) return 0;
    return (
      activeInvests.reduce((acc, i) => {
        const d = Number(i?.duration ?? 0) || 1;
        const e = clamp((Number(i?.daysElapsed ?? 0) / d) * 100);
        return acc + e;
      }, 0) / activeInvests.length
    );
  }, [activeInvests]);

  const segs = [
    { key: 'Inversiones', pct: clamp(avgPlanProgress), color: 'from-emerald-500 to-emerald-400' },
    { key: 'ROI', pct: clamp((roiPct / GOALS.roi) * 100), color: 'from-sky-500 to-sky-400' },
    { key: 'Bots', pct: clamp((botsRunning / GOALS.bots) * 100), color: 'from-violet-500 to-violet-400' },
    { key: 'Referidos', pct: clamp((referrals.length / GOALS.referrals) * 100), color: 'from-amber-500 to-amber-400' },
    { key: 'Actividad', pct: clamp((activeDays30 / GOALS.activityDays) * 100), color: 'from-pink-500 to-pink-400' },
  ];
  const overallEnergy = clamp(segs.reduce((acc, s) => acc + (s.pct / 100) * 20, 0));

  /* ===== gráficos ===== */
  // Distribución de portafolio (por plan)
  const portfolioDistributionData = investments.map((inv) => ({
    name: inv?.plan_name ?? inv?.planName ?? 'Plan',
    value: Number(inv?.amount ?? 0),
  }));

  // Actividad mensual (6m) — usamos userTx normalizadas
  const monthlyActivityData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const month = d.getMonth();
    const year = d.getFullYear();
    const label = d.toLocaleString('default', { month: 'short' });

    const inMonth = userTx.filter((tx) => {
      const dt = asDate(tx);
      return dt.getMonth() === month && dt.getFullYear() === year;
    });

    const completed = inMonth.filter((t) => t.status === 'completed' || t.status === '');

    const deposits = completed
      .filter((t) => t.type === 'deposit')
      .reduce((s, t) => s + t.amount, 0);
    const withdrawals = completed
      .filter((t) => t.type === 'withdrawal')
      .reduce((s, t) => s + t.amount, 0);
    const investmentsBar = completed
      .filter(
        (t) =>
          t.type === 'investment' ||
          t.type === 'plan_purchase' ||
          t.type === 'invest'
      )
      .reduce((s, t) => s + t.amount, 0);
    const botProfitBar = completed
      .filter((t) => BOT_PROFIT_TYPES.has(t.type))
      .reduce((s, t) => s + t.amount, 0);
    const planPayoutBar = completed
      .filter((t) => PLAN_PAYOUT_TYPES.has(t.type))
      .reduce((s, t) => s + t.amount, 0);

    return {
      month: label,
      deposits,
      withdrawals,
      investments: investmentsBar,
      botProfit: botProfitBar,
      planPayouts: planPayoutBar,
    };
  });

  /* ===== billetera ===== */
  const walletDistribution = [
    { name: 'USDC', value: Number(balances?.usdc ?? 0) },
    { name: 'USDT', value: Number(balances?.usdt ?? 0) },
    { name: 'BTC', value: Number(balances?.btc ?? 0) },
    { name: 'ETH', value: Number(balances?.eth ?? 0) },
  ].filter((d) => d.value > 0);

  const generalStats = [
    { title: 'Balance USDC', value: `$${(Number(balances?.usdc ?? 0)).toFixed(2)}`, icon: DollarSign, color: 'text-green-400' },
    { title: 'Total Invertido', value: `$${totalInvested.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-400' },
    { title: 'Ganancias (Inv.)', value: `$${totalEarningsFromInvestments.toFixed(2)}`, icon: Star, color: 'text-yellow-400' },
    { title: 'Referidos', value: String(referrals.length), icon: Users, color: 'text-purple-400' },
    { title: 'Bots activos', value: String(botsRunning), icon: Bot, color: 'text-violet-400' },
    { title: 'Ganancia Bots', value: `$${botProfit.toFixed(2)}`, icon: Activity, color: 'text-rose-400' },
  ];

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <BarChartHorizontalBig className="h-8 w-8 mr-3 text-teal-400" />
            Mis Estadísticas
          </h1>
          <p className="text-slate-300">Un resumen detallado de tu actividad, progreso y distribución.</p>
        </motion.div>

        {/* Progreso / energía */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <Card className="crypto-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-white flex items-center gap-2">
                <Gauge className="h-5 w-5 text-emerald-400" />
                Progreso General
              </CardTitle>
              <CardDescription className="text-slate-300">
                Inversiones, ROI, bots, referidos y días activos (30d).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-slate-300 text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Nivel de energía
                </div>
                <div className="text-white font-semibold text-lg">{Math.round(overallEnergy)}%</div>
              </div>

              <div className="w-full h-5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                <div className="flex h-full">
                  {segs.map((s) => {
                    const width = (s.pct / 100) * 20; // cada segmento aporta hasta 20%
                    return (
                      <div
                        key={s.key}
                        title={`${s.key}: ${Math.round(s.pct)}%`}
                        className={`h-full bg-gradient-to-r ${s.color}`}
                        style={{ width: `${width}%` }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {segs.map((s) => (
                  <div key={s.key} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                    <div className="text-xs text-slate-400">{s.key}</div>
                    <div className="text-slate-100 font-semibold">{Math.round(s.pct)}%</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-sky-300" />
                  ROI: <span className="text-slate-100 font-semibold">{roiPct.toFixed(2)}%</span>
                </div>
                <div>
                  Planes activos: <span className="text-slate-100 font-semibold">{activeInvests.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-300" />
                  Bots: <span className="text-slate-100 font-semibold">{botsRunning}</span> · Monto:{' '}
                  <span className="text-slate-100 font-semibold">${botsAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-amber-300" />
                  Días activos (30d): <span className="text-slate-100 font-semibold">{activeDays30}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-6">
          {generalStats.map((stat, idx) => {
            const Icon = stat.icon;
            const bg = `${stat.color.replace('text-', 'bg-')}/10`;
            return (
              <motion.div key={stat.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: idx * 0.05 }}>
                <Card className="crypto-card">
                  <CardContent className="p-6 flex items-center space-x-4">
                    <div className={`p-3 rounded-lg ${bg}`}>
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

        {/* Actividad mensual + Distribución por plan */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.1 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Activity className="mr-2 h-5 w-5 text-indigo-400" />
                  Actividad Mensual (6m)
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Depósitos, retiros, inversiones, pagos de planes y ganancias de bots.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyActivityData}>
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip
                      cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }}
                      contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', border: 'none', borderRadius: '0.5rem' }}
                      labelStyle={{ color: '#cbd5e1' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="deposits" fill="#22c55e" name="Depósitos" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="withdrawals" fill="#ef4444" name="Retiros" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="investments" fill="#3b82f6" name="Inversiones" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="planPayouts" fill="#f59e0b" name="Pagos de Planes" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="botProfit" fill="#a78bfa" name="Ganancia Bots" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.15 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <PieIcon className="mr-2 h-5 w-5 text-rose-400" />
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
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        fontSize={12}
                      >
                        {portfolioDistributionData.map((_, i) => (
                          <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
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
                    <p className="text-slate-500 text-sm">Realizá inversiones para ver tu distribución.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Billetera + últimas transacciones */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.2 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <PieIcon className="mr-2 h-5 w-5 text-emerald-400" />
                  Distribución de Billetera
                </CardTitle>
                <CardDescription className="text-slate-300">Saldo por moneda (USDC/USDT/BTC/ETH).</CardDescription>
              </CardHeader>
              <CardContent className="h-[260px]">
                {walletDistribution.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={walletDistribution}
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        fontSize={12}
                      >
                        {walletDistribution.map((_, i) => (
                          <Cell key={`wcell-${i}`} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', border: 'none', borderRadius: '0.5rem' }}
                        labelStyle={{ color: '#cbd5e1' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-slate-400 text-sm">Sin saldo disponible.</div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, delay: 0.25 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <CheckCircle className="mr-2 h-5 w-5 text-cyan-400" />
                  Resumen de Actividad Reciente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {userTx.slice(0, 6).map((tx) => {
                  const date = asDate(tx);
                  const type = tx.type;
                  const desc = tx?.description ?? tx?.plan_name ?? tx?.planName ?? '';
                  const amount = tx.amount;
                  const isPositive = ['deposit', 'refund', 'admin_credit', 'bot_profit', 'bot_gain', 'bot_payout', 'plan_payout', 'investment_profit', 'roi_payout', 'plan_profit'].includes(type);
                  return (
                    <div key={tx.id} className="flex justify-between items-center p-3 mb-2 bg-slate-800/50 rounded-md border border-slate-700">
                      <div>
                        <p className="text-white capitalize">
                          {type === 'deposit' ? 'Depósito' :
                           type === 'withdrawal' ? 'Retiro' :
                           type === 'investment' || type === 'plan_purchase' ? 'Inversión' :
                           BOT_PROFIT_TYPES.has(type) ? 'Ganancia Bot' :
                           PLAN_PAYOUT_TYPES.has(type) ? 'Pago Plan' :
                           type || 'Movimiento'}
                        </p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                          {isPositive ? '+' : '-'}${amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-500">{date.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
                {userTx.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No hay transacciones recientes.</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
}
