// src/pages/UserStatsPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import {
  BarChartHorizontalBig,
  TrendingUp,
  Users,
  DollarSign,
  Star,
  Activity,
  CheckCircle,
  PieChart as PieIcon
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
  AreaChart,
  Area,
  CartesianGrid
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
const fmt = (n) => Number(n || 0);

export default function UserStatsPage() {
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [walletNet, setWalletNet] = useState(0);     // ✅ saldo real desde v_user_stats
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]); // transacciones con monto firmado
  const [referralsCount, setReferralsCount] = useState(0);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // 1) Inversiones del usuario
      const { data: inv, error: invErr } = await supabase
        .from('investments')
        .select('id, user_id, plan_name, amount, daily_return, duration, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!invErr) setInvestments(inv || []);

      // 2) Transacciones firmadas (vista)
      const { data: tx, error: txErr } = await supabase
        .from('v_wallet_history_signed')
        .select('id, user_id, amount_signed, type, status, description, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!txErr) {
        // Normalizamos estructura
        const txNorm = (tx || []).map((t) => ({
          id: t.id,
          user_id: t.user_id,
          amount_signed: Number(t.amount_signed ?? 0),
          type: (t.type || '').toLowerCase(), // ej: deposit | withdrawal | plan_purchase | ...
          status: (t.status || '').toLowerCase(), // completed | pending | ...
          description: t.description || '',
          created_at: t.created_at
        }));
        setTransactions(txNorm);
      }

      // 3) Wallet net (vista v_user_stats)
      const { data: statsRow, error: statsErr } = await supabase
        .from('v_user_stats')
        .select('wallet_net')
        .eq('user_id', user.id)
        .single();
      if (!statsErr) setWalletNet(Number(statsRow?.wallet_net ?? 0));

      // 4) Referidos
      const { data: me } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', user.id)
        .maybeSingle();
      if (me?.referral_code) {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('referred_by', me.referral_code);
        setReferralsCount(count || 0);
      } else {
        setReferralsCount(0);
      }
    } catch (e) {
      console.warn('UserStats load error:', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    loadAll();
  }, [user?.id, loadAll]);

  // Realtime: refrescar en cambios de inversiones / transacciones
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`rt-user-stats-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${user.id}` },
        loadAll
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        loadAll
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id, loadAll]);

  if (authLoading || !user) return <div className="p-6 text-slate-300">Cargando datos del usuario…</div>;
  if (loading) return <div className="p-6 text-slate-300">Cargando estadísticas…</div>;

  // -------- Helpers de tipo --------
  const txType = (t) => (t.type || '').toLowerCase();
  const isDeposit = (t) => txType(t) === 'deposit';
  const isWithdrawal = (t) => txType(t) === 'withdrawal' || txType(t) === 'withdraw';
  const isPlanPurchase = (t) => txType(t) === 'plan_purchase';
  const isCompleted = (t) => (t.status || '').toLowerCase() === 'completed';

  // -------- KPIs base (usando montos firmados) --------
  // Firmado: deposit/bono positivo, withdrawal/plan_purchase negativo.
  const totalDeposits = useMemo(
    () => transactions
      .filter((t) => isCompleted(t) && isDeposit(t) && t.amount_signed > 0)
      .reduce((s, t) => s + fmt(t.amount_signed), 0),
    [transactions]
  );

  const totalWithdrawals = useMemo(
    () => transactions
      .filter((t) => isCompleted(t) && isWithdrawal(t) && t.amount_signed < 0)
      .reduce((s, t) => s + Math.abs(fmt(t.amount_signed)), 0),
    [transactions]
  );

  // Flujo Neto (depósitos - retiros)
  const netCashFlow = useMemo(
    () => totalDeposits - totalWithdrawals,
    [totalDeposits, totalWithdrawals]
  );

  const totalInvested = useMemo(
    () => investments.reduce((sum, inv) => sum + fmt(inv.amount), 0),
    [investments]
  );

  const totalEarningsFromInvestments = useMemo(() => {
    const now = Date.now();
    return investments.reduce((sum, inv) => {
      const created = new Date(inv.created_at || Date.now()).getTime();
      const daysPassed = Math.max(0, Math.floor((now - created) / 86400000));
      const dailyPct = fmt(inv.daily_return) / 100;
      const dur = Math.min(daysPassed, fmt(inv.duration));
      return sum + fmt(inv.amount) * dailyPct * dur;
    }, 0);
  }, [investments]);

  // -------- Distribución de portafolio --------
  const portfolioDistributionData = useMemo(
    () => investments.map((inv) => ({ name: inv.plan_name || 'Plan', value: fmt(inv.amount) })),
    [investments]
  );

  // -------- Actividad mensual últimos 6 meses (desde tx firmadas) --------
  const monthlyActivityData = useMemo(() => {
    const arr = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const m = d.getMonth();
      const y = d.getFullYear();
      const label = d.toLocaleString('default', { month: 'short' });

      const monthTx = transactions.filter((t) => {
        const dt = new Date(t.created_at || Date.now());
        return dt.getMonth() === m && dt.getFullYear() === y && isCompleted(t);
      });

      const dep = monthTx
        .filter((t) => isDeposit(t) && t.amount_signed > 0)
        .reduce((s, t) => s + fmt(t.amount_signed), 0);

      const wit = monthTx
        .filter((t) => isWithdrawal(t) && t.amount_signed < 0)
        .reduce((s, t) => s + Math.abs(fmt(t.amount_signed)), 0);

      // inversiones: usamos plan_purchase (débito)
      const invSum = monthTx
        .filter((t) => isPlanPurchase(t) && t.amount_signed < 0)
        .reduce((s, t) => s + Math.abs(fmt(t.amount_signed)), 0);

      arr.push({ month: label, deposits: dep, withdrawals: wit, investments: invSum });
    }
    return arr;
  }, [transactions]);

  // -------- Serie de saldo acumulado (solo tx completadas) --------
  const balanceSeries = useMemo(() => {
    const rows = transactions
      .filter((t) => isCompleted(t))
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let bal = 0;
    return rows.map((t) => {
      bal += fmt(t.amount_signed); // ya está firmado
      return {
        date: new Date(t.created_at).toLocaleDateString(),
        balance: Number(bal.toFixed(2)),
      };
    });
  }, [transactions]);

  // -------- Resumen reciente --------
  const recentActivity = useMemo(() => {
    const txMapped = transactions.slice(0, 200).map((t) => ({
      id: `tx_${t.id}`,
      created_at: t.created_at,
      type: isPlanPurchase(t) ? 'investment' : txType(t), // para mostrar "Inversión"
      amount: Math.abs(fmt(t.amount_signed)),
      description: t.description || '',
      sign: fmt(t.amount_signed) >= 0 ? '+' : '-',
      status: (t.status || '').toLowerCase(),
    }));

    const invMapped = investments.map((inv) => ({
      id: `inv_${inv.id}`,
      created_at: inv.created_at,
      type: 'investment',
      amount: fmt(inv.amount),
      description: inv.plan_name || 'Inversión',
      sign: '-',
      status: 'completed',
    }));

    return [...txMapped, ...invMapped]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
  }, [transactions, investments]);

  // -------- KPIs (con WalletNet real) --------
  const generalStats = [
    { title: 'Balance Actual', value: `$${walletNet.toFixed(2)}`, icon: DollarSign, color: 'text-green-400' },
    { title: 'Total Invertido', value: `$${totalInvested.toFixed(2)}`, icon: TrendingUp, color: 'text-blue-400' },
    { title: 'Ganancias de Inversión', value: `$${totalEarningsFromInvestments.toFixed(2)}`, icon: Star, color: 'text-yellow-400' },
    { title: 'Total Referidos', value: referralsCount, icon: Users, color: 'text-purple-400' },
    { title: 'Flujo Neto', value: `$${netCashFlow.toFixed(2)}`, icon: Activity, color: netCashFlow >= 0 ? 'text-green-400' : 'text-red-400' },
  ];

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

        {/* KPIs */}
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

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.4 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Activity className="mr-2 h-5 w-5 text-indigo-400" />
                  Actividad Mensual
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Depósitos, retiros e inversiones (últimos 6 meses).
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyActivityData}>
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
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
                {portfolioDistributionData.length > 0 ? (
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

        {/* Evolución del Saldo (reconstruido desde montos firmados) */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.55 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Evolución del Saldo (reconstruido)</CardTitle>
              <CardDescription className="text-slate-300">
                Calculado desde 0 aplicando sólo movimientos <span className="text-slate-200 font-medium">completados</span> de tu wallet.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              {balanceSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={balanceSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Saldo']}
                      contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', border: 'none', borderRadius: '0.5rem' }}
                      labelStyle={{ color: '#cbd5e1' }}
                    />
                    <Area type="monotone" dataKey="balance" stroke="#22c55e" fill="url(#saldoGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-slate-400 text-center py-8">Aún no hay movimientos completados.</div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Resumen reciente */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.6 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <CheckCircle className="mr-2 h-5 w-5 text-cyan-400" />
                Resumen de Actividad Reciente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.map((item) => {
                const date = item.created_at || Date.now();
                const isPositive = item.sign === '+';
                return (
                  <div key={item.id} className="flex justify-between items-center p-3 mb-2 bg-slate-800/50 rounded-md">
                    <div>
                      <p className="text-white capitalize">
                        {item.type === 'deposit'
                          ? 'Depósito'
                          : item.type === 'withdrawal' || item.type === 'withdraw'
                          ? 'Retiro'
                          : 'Inversión'}
                      </p>
                      {item.status && <p className="text-xs text-slate-400">Estado: {item.status}</p>}
                      <p className="text-xs text-slate-400">{item.description || ''}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {item.sign}${fmt(item.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500">{new Date(date).toLocaleDateString()}</p>
                    </div>
                  </div>
                );
              })}
              {recentActivity.length === 0 && (
                <p className="text-slate-400 text-center py-4">No hay transacciones recientes.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
}
