// src/pages/Dashboard.jsx
import React, { useState, useEffect, useMemo } from 'react';
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
  Activity,
  Gauge,
  Zap,
  Target,
  Bot,
  CalendarDays,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

// ===== Helpers =====
const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const asDate = (t) => new Date(t?.createdAt || t?.created_at || t || Date.now());
const sameDayKey = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);

export default function Dashboard() {
  const { user, displayName, balances, loading } = useAuth();

  const {
    // precios + helpers de mercado
    cryptoPrices = {},
    instruments = [],
    getPairInfo,               // <— usamos este helper para leer siempre la misma fuente
    // negocio
    investments: ctxInvestments = [],
    referrals:   ctxReferrals = [],
    transactions: ctxTransactions = [],
    botActivations: ctxBots = [],
    refreshInvestments,
    refreshReferrals,
    refreshTransactions,
    refreshBotActivations,
    getInvestments,
  } = useData();

  const [investments, setInvestments] = useState([]);
  const [referrals, setReferrals]     = useState([]);
  const [error, setError]             = useState(null);

  // ===== Fetch initial =====
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        await Promise.all([
          refreshInvestments?.(),
          refreshReferrals?.(),
          refreshTransactions?.(),
          refreshBotActivations?.(),
        ]);
        // mantener compat con tu UI que usa getters
        const invs = (await getInvestments?.()) || ctxInvestments;
        setInvestments(invs?.filter((inv) => (inv?.userId ?? inv?.user_id) === user.id) || []);
        setReferrals(ctxReferrals || []);
      } catch (err) {
        console.error('Error cargando datos del dashboard:', err);
        setError('No se pudieron cargar los datos.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ===== React to context changes =====
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const mine = (ctxInvestments || []).filter((inv) => (inv?.userId ?? inv?.user_id) === uid);
    setInvestments(mine);
    setReferrals(ctxReferrals || []);
  }, [ctxInvestments, ctxReferrals, user?.id]);

  if (loading) return <div className="p-8 text-white">Cargando...</div>;
  if (error)   return <div className="p-8 text-red-500">{error}</div>;
  if (!user)   return <div className="p-8 text-white">Iniciá sesión para ver el dashboard.</div>;

  // ===== Derived metrics =====
  const totalInvested = useMemo(
    () => (investments || []).reduce((sum, inv) => sum + Number(inv?.amount || 0), 0),
    [investments]
  );

  const totalEarnings = useMemo(
    () =>
      (investments || []).reduce((sum, inv) => {
        if (typeof inv?.earnings === 'number') return sum + inv.earnings;
        const createdAtMs = inv?.createdAt ? new Date(inv.createdAt).getTime() : Date.now();
        const daysPassed = Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60 * 24));
        const dailyReturnPct = Number(inv?.dailyReturn || 0);
        const duration = Number(inv?.duration || 0);
        const amount = Number(inv?.amount || 0);
        return sum + (amount * (dailyReturnPct / 100)) * Math.min(daysPassed, duration);
      }, 0),
    [investments]
  );

  const activeInvests   = (investments || []).filter(i => (i?.status || '').toLowerCase() === 'active');
  const maturedInvests  = (investments || []).filter(i => Number(i?.daysElapsed || 0) >= Number(i?.duration || 0));
  const avgPlanProgress = useMemo(() => {
    if (!activeInvests.length) return 0;
    const sumPct = activeInvests.reduce((acc, i) => {
      const d = Number(i?.duration || 0) || 1;
      const e = clamp((Number(i?.daysElapsed || 0) / d) * 100);
      return acc + e;
    }, 0);
    return sumPct / activeInvests.length;
  }, [activeInvests]);

  const roiPct = totalInvested > 0 ? (totalEarnings / totalInvested) * 100 : 0;

  // Bots
  const activeBots = (ctxBots || []).filter((b) => (b?.status || '').toLowerCase() === 'active');
  const botsRunning = activeBots.length;
  const botsAmount  = activeBots.reduce((a, b) => a + Number(b?.amountUsd || 0), 0);
  const botProfitTx = (ctxTransactions || []).filter((t) => (t?.type || '') === 'bot_profit' && (t?.status || '').toLowerCase() === 'completed');
  const botProfit   = botProfitTx.reduce((a, t) => a + Number(t?.amount || 0), 0);

  // Actividad (últimos 30 días)
  const recentTx = (ctxTransactions || []).filter((t) => {
    const d = asDate(t);
    return Date.now() - d.getTime() <= 30 * 24 * 60 * 60 * 1000;
  });
  const activeDays = new Set(recentTx.map((t) => sameDayKey(asDate(t)))).size;

  // ===== Overall "Energy Bar" =====
  const GOALS = {
    roiTarget: 10,
    botsTarget: 1,
    referralsTarget: 10,
    activityTargetDays: 15,
  };

  const pctInvestProg = clamp(avgPlanProgress);
  const pctRoi        = clamp((roiPct / GOALS.roiTarget) * 100);
  const pctBots       = clamp((botsRunning / GOALS.botsTarget) * 100);
  const pctReferrals  = clamp(((referrals?.length || 0) / GOALS.referralsTarget) * 100);
  const pctActivity   = clamp((activeDays / GOALS.activityTargetDays) * 100);

  const segs = [
    { key: 'Inversiones',  pct: pctInvestProg, color: 'from-emerald-500 to-emerald-400' },
    { key: 'ROI',          pct: pctRoi,        color: 'from-sky-500 to-sky-400' },
    { key: 'Bots',         pct: pctBots,       color: 'from-violet-500 to-violet-400' },
    { key: 'Referidos',    pct: pctReferrals,  color: 'from-amber-500 to-amber-400' },
    { key: 'Actividad',    pct: pctActivity,   color: 'from-pink-500 to-pink-400' },
  ];
  const overallEnergy = clamp(segs.reduce((acc, s) => acc + (s.pct / 100) * 20, 0));

  // ===== Balances visibles =====
  const usdc = Number(balances?.usdc ?? 0);
  const usdt = Number(balances?.usdt ?? 0);
  const btc  = Number(balances?.btc  ?? 0);
  const eth  = Number(balances?.eth  ?? 0);

  // ===== Stats cards =====
  const stats = [
    { title: 'Saldo USDC',      value: fmt(usdc, 2),    icon: Wallet,     color: 'text-green-400',  bgColor: 'bg-green-500/10' },
    { title: 'Saldo USDT',      value: fmt(usdt, 2),    icon: Wallet,     color: 'text-teal-300',   bgColor: 'bg-teal-500/10' },
    { title: 'Total Invertido', value: fmt(totalInvested, 2), icon: DollarSign, color: 'text-blue-400',   bgColor: 'bg-blue-500/10' },
    { title: 'Ganancias',       value: fmt(totalEarnings, 2), icon: TrendingUp, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
    { title: 'BTC (saldo)',     value: fmt(btc, 6),     icon: Activity,   color: 'text-orange-300', bgColor: 'bg-orange-500/10' },
    { title: 'ETH (saldo)',     value: fmt(eth, 6),     icon: Activity,   color: 'text-yellow-300', bgColor: 'bg-yellow-500/10' },
    { title: 'Bots activos',    value: String(botsRunning || 0), icon: Bot, color: 'text-violet-300', bgColor: 'bg-violet-500/10' },
    { title: 'Referidos',       value: String(referrals?.length || 0), icon: Users, color: 'text-amber-300', bgColor: 'bg-amber-500/10' },
  ];

  // ===== Lista limpia de precios (sin duplicados) =====
  const priceRows = useMemo(() => {
    const rows = [];
    const seen = new Set();

    // 1) Prioriza instrumentos habilitados
    (instruments || [])
      .filter(i => (i.enabled ?? true))
      .forEach(i => {
        const sym = String(i.symbol || '').toUpperCase();
        if (!sym || seen.has(sym)) return;
        seen.add(sym);

        const quote = String(i.quote || 'USDT').toUpperCase();
        const pair  = `${sym}/${quote}`;
        const feed  = typeof getPairInfo === 'function'
          ? getPairInfo(pair)
          : (cryptoPrices[pair] || cryptoPrices[sym] || {});

        const decimals = Number.isFinite(Number(i.decimals))
          ? Number(i.decimals)
          : (sym === 'USDT' || sym === 'USDC' ? 4 : 2);

        rows.push({
          key: pair,
          sym,
          pair,
          price: Number(feed?.price),
          change: Number(feed?.change),
          decimals,
        });
      });

    // 2) Asegurar BTC/ETH aunque no estén en instrumentos
    for (const sym of ['BTC', 'ETH']) {
      if (seen.has(sym)) continue;
      const pair  = `${sym}/USDT`;
      const feed  = typeof getPairInfo === 'function'
        ? getPairInfo(pair)
        : (cryptoPrices[pair] || cryptoPrices[sym] || {});
      if (!feed || !Number(feed?.price)) continue;
      rows.push({
        key: pair,
        sym,
        pair,
        price: Number(feed.price),
        change: Number(feed.change),
        decimals: 2,
      });
    }

    return rows;
  }, [instruments, cryptoPrices, getPairInfo]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <h1 className="text-3xl font-bold text-white mb-2">
          ¡Bienvenido de vuelta, {displayName || 'Usuario'}!
        </h1>
        <p className="text-slate-300">Resumen de tu actividad, progreso y mercado en tiempo real.</p>
      </motion.div>

      {/* Energy / Progreso general */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
        <Card className="crypto-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2">
              <Gauge className="h-5 w-5 text-emerald-400" />
              Progreso General
              <span className="text-sm text-slate-400 font-normal">(barra de energía)</span>
            </CardTitle>
            <CardDescription className="text-slate-300">
              Indicador compuesto: avance de inversiones, ROI, bots activos, referidos y días con actividad.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-slate-300 text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                Nivel de energía
              </div>
              <div className="text-white font-semibold text-lg">{fmt(overallEnergy, 0)}%</div>
            </div>

            <div className="w-full h-5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className="flex h-full">
                {segs.map((s) => {
                  const width = ((s.pct / 100) * 20);
                  return (
                    <div
                      key={s.key}
                      title={`${s.key}: ${fmt(s.pct, 0)}%`}
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
                  <div className="text-slate-100 font-semibold">{fmt(s.pct, 0)}%</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Target className="w-4 h-4 text-sky-300" />
                ROI: <span className="text-slate-100 font-semibold">{fmt(roiPct, 2)}%</span>
              </div>
              <div className="text-xs text-slate-400">
                Planes activos: <span className="text-slate-100 font-semibold">{activeInvests.length}</span> · Vencidos: <span className="text-slate-100 font-semibold">{maturedInvests.length}</span>
              </div>
              <div className="text-xs text-slate-400">
                Bots: <span className="text-slate-100 font-semibold">{botsRunning}</span> · Monto en bots: <span className="text-slate-100 font-semibold">{fmt(botsAmount, 2)} USDT</span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-amber-300" />
                Días activos (30d): <span className="text-slate-100 font-semibold">{activeDays}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 * index }}
            >
              <Card className="crypto-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-400 text-sm font-medium">{stat.title}</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {stat.title.startsWith('Saldo') ? '' : '$'}
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

      {/* Mercado + Inversiones */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Crypto Prices */}
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Activity className="h-5 w-5 mr-2 text-green-400" />
                Precios en Tiempo Real
              </CardTitle>
              <CardDescription className="text-slate-300">
                Alimentado por Binance/Servidor (stream).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {priceRows.map((row) => {
                  const { key, sym, pair, price, change, decimals } = row;
                  const safePrice  = Number.isFinite(price) ? price : 0;
                  const safeChange = Number.isFinite(change) ? change : 0;

                  return (
                    <div key={key} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full flex items-center justify-center mr-3">
                          <span className="text-white text-xs font-bold">{sym}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-white font-medium">{sym}</span>
                          <span className="text-slate-400 text-xs">{pair}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold">
                          ${fmt(safePrice, decimals)}
                        </div>
                        <div className={`text-sm flex items-center justify-end ${safeChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {safeChange >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                          {fmt(Math.abs(safeChange), 2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Inversiones Activas + progreso por plan */}
        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.25 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <PieChart className="h-5 w-5 mr-2 text-blue-400" />
                Inversiones Activas
              </CardTitle>
            <CardDescription className="text-slate-300">Avance y rendimiento por plan.</CardDescription>
            </CardHeader>
            <CardContent>
              {(investments?.length || 0) > 0 ? (
                <div className="space-y-4">
                  {investments.slice(0, 6).map((inv) => {
                    const amount = Number(inv?.amount || 0);
                    const dr     = Number(inv?.dailyReturn || 0);
                    const dur    = Number(inv?.duration || 0) || 1;
                    const elapsed= Number(inv?.daysElapsed || 0);
                    const pct    = clamp((elapsed / dur) * 100);
                    const estGain= amount * (dr / 100) * Math.min(elapsed, dur);
                    return (
                      <div key={inv?.id} className="p-3 bg-slate-800/50 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-white font-medium">{inv?.planName || 'Plan'}</div>
                          <div className="text-slate-400 text-xs">
                            {inv?.createdAt ? asDate(inv.createdAt).toLocaleDateString() : '--/--/----'}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <div className="text-slate-300">${fmt(amount, 2)} • {fmt(dr, 2)}% diario • {elapsed}/{dur} días</div>
                          <div className="text-emerald-300 font-semibold">+{fmt(estGain, 2)} USDT</div>
                        </div>
                        <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-emerald-400"
                            style={{ width: `${pct}%` }}
                            title={`${fmt(pct,0)}%`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No tenés inversiones activas</p>
                  <p className="text-slate-500 text-sm">Comenzá invirtiendo en nuestros planes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Acciones rápidas */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
        <Card className="crypto-card">
          <CardHeader>
            <CardTitle className="text-white">Acciones Rápidas</CardTitle>
            <CardDescription className="text-slate-300">
              Accedé rápido a las funciones principales
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
