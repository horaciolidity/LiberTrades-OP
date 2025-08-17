import React, { useEffect, useMemo, useState } from 'react';
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
  Bot,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

// Precio robusto (distintos shapes posibles)
const getPrice = (data) => {
  if (data == null) return 0;
  if (typeof data === 'number') return data;
  return Number(data?.price ?? data?.usd ?? data?.value ?? 0);
};

// Barra de progreso minimal
function ProgressBar({ value }) {
  const v = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="w-full h-2 rounded bg-slate-800 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500" style={{ width: `${v}%` }} />
    </div>
  );
}

// Normaliza un investment {snake|camel} -> shape común
const normInvestment = (inv) => ({
  id: inv?.id,
  userId: inv?.user_id ?? inv?.userId,
  planName: inv?.plan_name ?? inv?.planName,
  amount: Number(inv?.amount ?? 0),
  dailyReturn: Number(inv?.daily_return ?? inv?.dailyReturn ?? 0),
  duration: Number(inv?.duration ?? 0),
  status: inv?.status ?? 'active',
  createdAt: inv?.createdAt ?? inv?.created_at ?? null,
});

// Calcula progreso/ganancia acumulada
const calcProgress = (inv, now = Date.now()) => {
  const start = inv.createdAt ? new Date(inv.createdAt).getTime() : now;
  const dayMs = 86_400_000;
  const elapsedDays = Math.max(0, Math.floor((now - start) / dayMs));
  const cappedDays = Math.min(Number(inv.duration || 0), elapsedDays);
  const pct = Number(inv.duration || 0) > 0 ? (cappedDays / Number(inv.duration)) * 100 : 0;
  const accrued = Number(inv.amount || 0) * (Number(inv.dailyReturn || 0) / 100) * cappedDays;
  return { elapsedDays, cappedDays, pct, accrued };
};

export default function Dashboard() {
  const { user, displayName, balances, loading } = useAuth();
  const {
    cryptoPrices = {},
    getInvestments,
    getReferrals,
    getTransactions,
    botActivations = [],
  } = useData();

  const [investments, setInvestments] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState(null);

  // Tick para refrescar progreso en pantalla
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Carga inicial desde DataContext (compat snake/camel)
  useEffect(() => {
    if (!user?.id) return;
    try {
      const invs = getInvestments?.() || [];
      const refs = getReferrals?.() || [];
      const txs = getTransactions?.() || [];
      const uid = user.id;

      const myInv = invs
        .map(normInvestment)
        .filter((inv) => inv.userId === uid);

      const myTx = txs.filter((t) => (t?.user_id ?? t?.userId) === uid);

      setInvestments(myInv);
      setReferrals(refs);
      setTransactions(myTx);
    } catch (err) {
      console.error('Error cargando datos del dashboard:', err);
      setError('No se pudieron cargar los datos.');
    }
  }, [user?.id, getInvestments, getReferrals, getTransactions]);

  // Realtime: inversiones del usuario
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('dash-investments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setInvestments((prev) => {
            const list = Array.isArray(prev) ? [...prev] : [];
            if (payload.eventType === 'INSERT') {
              const ni = normInvestment(payload.new);
              // Evitar duplicados
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

  // Realtime: wallet_transactions del usuario (para Actividad Reciente)
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('dash-wallet-tx')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setTransactions((prev) => {
            const list = Array.isArray(prev) ? [...prev] : [];
            if (payload.eventType === 'INSERT') {
              const nx = payload.new;
              if (!list.some((x) => x.id === nx.id)) list.unshift(nx);
              return list;
            }
            if (payload.eventType === 'UPDATE') {
              const nx = payload.new;
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

  if (loading) return <div className="p-8 text-white">Cargando...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!user) return <div className="p-8 text-white">Iniciá sesión para ver el dashboard.</div>;

  // Totales/ganancias usando createdAt || created_at
  const totalInvested = investments.reduce((sum, inv) => sum + Number(inv?.amount || 0), 0);

  const totalEarnings = investments.reduce((sum, inv) => {
    const { accrued } = calcProgress(inv, nowTick);
    return sum + accrued;
  }, 0);

  const activeBots = (botActivations || []).filter((b) => (b?.status || '').toLowerCase() === 'active');
  const totalInBots = activeBots.reduce((s, b) => s + Number(b?.amountUsd || 0), 0);

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
    {
      title: 'Bots Activos',
      value: `${activeBots.length} (${fmt(totalInBots, 2)} USD)`,
      icon: Bot,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
    },
  ];

  const recentTx = useMemo(() => {
    const sorted = [...transactions].sort(
      (a, b) =>
        new Date(b?.createdAt ?? b?.created_at ?? 0) - new Date(a?.createdAt ?? a?.created_at ?? 0)
    );
    return sorted.slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <h1 className="text-3xl font-bold text-white mb-2">
          ¡Bienvenido de vuelta, {displayName || 'Usuario'}!
        </h1>
        <p className="text-slate-300">Aquí tienes un resumen de tu actividad de inversión</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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
                      <p className="text-2xl font-bold text-white mt-1">
                        {stat.title === 'Saldo Total' ? '$' : ''}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Precios en tiempo real */}
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
              <CardDescription className="text-slate-300">Precios actuales de criptomonedas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(cryptoPrices).map(([crypto, data]) => {
                  const symbol = crypto === 'USDT' ? 'USDC' : crypto;
                  const price = getPrice(data);
                  const change = Number(data?.change ?? 0);
                  const decimals = symbol === 'USDC' ? 4 : 2;
                  return (
                    <div
                      key={crypto}
                      className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                    >
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full flex items-center justify-center mr-3">
                          <span className="text-white text-xs font-bold">{symbol}</span>
                        </div>
                        <span className="text-white font-medium">{symbol}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold">${price.toFixed(decimals)}</div>
                        <div
                          className={`text-sm flex items-center ${
                            change >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {change >= 0 ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
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

        {/* Inversiones Activas con progreso */}
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
              <CardDescription className="text-slate-300">Tus inversiones más recientes</CardDescription>
            </CardHeader>
            <CardContent>
              {(investments?.length || 0) > 0 ? (
                <div className="space-y-4">
                  {investments.slice(0, 5).map((inv) => {
                    const progress = calcProgress(inv, nowTick);
                    return (
                      <div
                        key={inv?.id}
                        className="p-3 bg-slate-800/50 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-white font-medium">{inv?.planName || 'Plan'}</div>
                            <div className="text-slate-400 text-sm">
                              {inv?.createdAt ? new Date(inv.createdAt).toLocaleDateString() : '--/--/----'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white font-semibold">${fmt(inv?.amount, 2)}</div>
                            <div className="text-green-400 text-sm">{fmt(inv?.dailyReturn, 2)}% diario</div>
                          </div>
                        </div>
                        <div className="mt-3">
                          <ProgressBar value={progress.pct} />
                          <div className="flex justify-between text-xs text-slate-400 mt-1">
                            <span>
                              Día {progress.cappedDays}/{inv?.duration}
                            </span>
                            <span>+${fmt(progress.accrued, 2)} ganados</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

      {/* Actividad reciente (historial) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      >
        <Card className="crypto-card">
          <CardHeader>
            <CardTitle className="text-white">Actividad Reciente</CardTitle>
            <CardDescription className="text-slate-300">
              Últimos movimientos de tu cuenta (depósitos, retiros, inversiones y bots)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentTx.length > 0 ? (
              <div className="space-y-3">
                {recentTx.map((tx) => {
                  const type = (tx?.type || '').toLowerCase();
                  const date = new Date(tx?.createdAt ?? tx?.created_at ?? Date.now()).toLocaleString();
                  const label =
                    type === 'deposit' ? 'Depósito' :
                    type === 'withdrawal' ? 'Retiro' :
                    type === 'investment' || type === 'investment_purchase' ? 'Inversión' :
                    type === 'bot_activation' ? 'Bot activado' :
                    type === 'admin_credit' ? 'Crédito admin' :
                    type === 'transfer' ? 'Transferencia' :
                    (tx?.type || 'Movimiento');

                  const sign =
                    type === 'deposit' ? '+' :
                    type === 'withdrawal' || type === 'bot_activation' || type === 'investment_purchase' ? '-' :
                    '';

                  const color =
                    type === 'deposit' ? 'text-green-400' :
                    type === 'withdrawal' || type === 'bot_activation' || type === 'investment_purchase'
                      ? 'text-red-400'
                      : 'text-slate-300';

                  const desc = tx?.description ||
                    ((tx?.referenceType ?? tx?.reference_type) === 'bot_activation' ? 'Activación de bot' : '');

                  return (
                    <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <div className="text-white font-medium">{label}</div>
                        <div className="text-slate-400 text-xs">{desc}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold ${color}`}>
                          {sign}${fmt(tx?.amount, 2)}
                        </div>
                        <div className="text-slate-500 text-xs">{date}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-400">No hay actividad reciente.</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 1.0 }}>
        <Card className="crypto-card">
          <CardHeader>
            <CardTitle className="text-white">Acciones Rápidas</CardTitle>
            <CardDescription className="text-slate-300">
              Accede rápidamente a las funciones principales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link
                to="/plans"
                className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <Wallet className="h-8 w-8 text-green-400 mb-2" />
                <span className="text-white text-sm font-medium">Invertir</span>
              </Link>
              <Link
                to="/simulator"
                className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <TrendingUp className="h-8 w-8 text-blue-400 mb-2" />
                <span className="text-white text-sm font-medium">Trading</span>
              </Link>
              <Link
                to="/referrals"
                className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <Users className="h-8 w-8 text-purple-400 mb-2" />
                <span className="text-white text-sm font-medium">Referidos</span>
              </Link>
              <Link
                to="/history"
                className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
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
