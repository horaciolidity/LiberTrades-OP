// src/pages/InvestmentPlans.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle,
  Zap,
  ShoppingBag,
  AlertTriangle,
  BarChart2,
  LineChart as LineChartIcon,
  Info,
  Star,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';
import { supabase } from '@/lib/supabaseClient';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};
const daysBetween = (from, to) => {
  const A = new Date(from);
  const B = new Date(to);
  return Math.max(0, Math.floor((B.getTime() - A.getTime()) / (1000 * 60 * 60 * 24)));
};
const addDays = (d, days) => {
  const base = new Date(d);
  base.setDate(base.getDate() + days);
  return base;
};
const shortDate = (d) =>
  new Date(d).toLocaleDateString(undefined, { month: 'short', day: '2-digit' });

// Fallback para settings
const SETTINGS_FALLBACK = { 'plans.default_daily_return_pct': 1.2 };

export default function InvestmentPlans() {
  const {
    investmentPlans: defaultPlans,
    cryptoPrices = {},
    addInvestment,
    addTransaction,
    refreshInvestments,
    refreshTransactions,
    getInvestments,
    getTransactions,
  } = useData();

  const { user, balances, refreshBalances } = useAuth();
  const { playSound } = useSound();

  // ===== Admin settings =====
  const [adminSettings, setAdminSettings] = useState(SETTINGS_FALLBACK);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_admin_settings', { prefix: 'plans.' });
        if (error) throw error;
        const map = { ...SETTINGS_FALLBACK };
        (data || []).forEach((row) => {
          // la función expone setting_key y setting_value
          map[row.setting_key] = Number(row.setting_value);
        });
        setAdminSettings(map);
      } catch {
        setAdminSettings(SETTINGS_FALLBACK);
      }
    })();
  }, []);

  // ===== Catálogo de planes =====
  const investmentPlans = useMemo(() => {
    const defaultDaily = Number(adminSettings['plans.default_daily_return_pct'] ?? 1.2);
    return (defaultPlans || []).map((plan) => ({
      ...plan,
      dailyReturn: Number(plan.dailyReturn ?? defaultDaily),
      currencies: ['USDT', 'BTC', 'ETH'],
    }));
  }, [defaultPlans, adminSettings]);

  // ===== Mis inversiones =====
  const [myInvestments, setMyInvestments] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      await refreshInvestments?.();
      const arr = (getInvestments?.() || []).filter((inv) => (inv.user_id ?? inv.userId) === user.id);
      setMyInvestments(arr);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ===== Estado de compra =====
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('USDT');
  const [isInvesting, setIsInvesting] = useState(false);

  // ===== Modal detalle =====
  const [inspectInvestment, setInspectInvestment] = useState(null);

  const usdBalance = Number(balances?.usdc ?? 0);

  const getPrice = (symbol) => {
    if (symbol === 'USDT' || symbol === 'USDC' || symbol === 'USD') return 1;
    return Number(cryptoPrices?.[symbol]?.price ?? 0);
  };

  const toUsd = (amount, currency) => {
    const a = Number(amount || 0);
    const p = getPrice(currency);
    return p > 0 ? a * p : 0;
  };
  const fromUsd = (usd, currency) => {
    const p = getPrice(currency);
    if (currency === 'USDT') return usd;
    return p > 0 ? usd / p : 0;
  };

  const amountUsd = toUsd(investmentAmount, selectedCurrency);

  const handleQuickPct = (pct) => {
    const usd = usdBalance * pct;
    const inCurr = fromUsd(usd, selectedCurrency);
    setInvestmentAmount(selectedCurrency === 'USDT' ? fmt(inCurr, 2) : fmt(inCurr, 8));
  };

  const handleMin = () => {
    if (!selectedPlan) return;
    const inCurr = fromUsd(Number(selectedPlan.minAmount || 0), selectedCurrency);
    setInvestmentAmount(selectedCurrency === 'USDT' ? fmt(inCurr, 2) : fmt(inCurr, 8));
  };

  const handleMax = () => {
    if (!selectedPlan) return;
    const maxUsd = Math.min(Number(selectedPlan.maxAmount || Infinity), usdBalance);
    const inCurr = fromUsd(maxUsd, selectedCurrency);
    setInvestmentAmount(selectedCurrency === 'USDT' ? fmt(inCurr, 2) : fmt(inCurr, 8));
  };

  // ===== Comprar plan =====
  const handleInvest = async () => {
    if (!user?.id) {
      playSound?.('error');
      toast({ title: 'Sin sesión', description: 'Iniciá sesión para invertir.', variant: 'destructive' });
      return;
    }
    if (!selectedPlan || !investmentAmount) {
      playSound?.('error');
      toast({ title: 'Error', description: 'Seleccioná un plan e ingresá un monto.', variant: 'destructive' });
      return;
    }

    const amt = Number(investmentAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      playSound?.('error');
      toast({ title: 'Monto inválido', description: 'Ingresá un monto válido.', variant: 'destructive' });
      return;
    }

    const price = getPrice(selectedCurrency);
    if (!price) {
      playSound?.('error');
      toast({
        title: 'Precio no disponible',
        description: `No se pudo obtener el precio de ${selectedCurrency}.`,
        variant: 'destructive',
      });
      return;
    }

    const amountInUSD = amt * price;
    const min = Number(selectedPlan?.minAmount || 0);
    const max = Number(selectedPlan?.maxAmount || 0);

    if (amountInUSD < min || (Number.isFinite(max) && max > 0 && amountInUSD > max)) {
      playSound?.('error');
      toast({
        title: 'Monto fuera de rango',
        description: `El monto en USD ($${fmt(amountInUSD)}) debe estar entre $${fmt(min)} y ${
          max > 0 ? `$${fmt(max)}` : 'sin tope'
        }.`,
        variant: 'destructive',
      });
      return;
    }

    if (amountInUSD > usdBalance) {
      playSound?.('error');
      toast({
        title: 'Fondos insuficientes',
        description: 'No tenés suficiente saldo en la app para esta inversión.',
        variant: 'destructive',
      });
      return;
    }

    setIsInvesting(true);
    playSound?.('invest');

    try {
      // ===== 1) Intento server-side (RPC). Usa la versión con p_currency para evitar ambigüedad de firmas.
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('invest_in_plan_v1', {
          p_user_id: user.id,
          p_plan_name: selectedPlan.name,
          p_amount_usd: amountInUSD,
          p_daily_pct: Number(selectedPlan.dailyReturn),
          p_duration_days: Number(selectedPlan.duration),
          p_currency: selectedCurrency,
        });

        // Si no hubo error, consideramos éxito (la función puede devolver void o un objeto {ok: true})
        if (!rpcErr) {
          await Promise.all([refreshInvestments?.(), refreshTransactions?.(), refreshBalances?.()]);
          const arr = (getInvestments?.() || []).filter((it) => (it.user_id ?? it.userId) === user.id);
          setMyInvestments(arr);

          toast({
            title: '¡Inversión exitosa!',
            description: `Invertiste ${fmt(amt, selectedCurrency === 'USDT' ? 2 : 8)} ${selectedCurrency} (≈ $${fmt(
              amountInUSD
            )}) en ${selectedPlan.name}.`,
          });

          setSelectedPlan(null);
          setInvestmentAmount('');
          setSelectedCurrency('USDT');
          setIsInvesting(false);
          return;
        }
      } catch {
        // continúa al flujo local
      }

      // ===== 2) Fallback client-side (para modo demo / sin RPC)
      const inv = await addInvestment?.({
        planName: selectedPlan.name,
        amount: amountInUSD,
        dailyReturn: Number(selectedPlan.dailyReturn),
        duration: Number(selectedPlan.duration),
        currency: selectedCurrency,
      });
      if (!inv) throw new Error('No se pudo crear la inversión');

      await addTransaction?.({
        amount: amountInUSD,
        type: 'plan_purchase',
        currency: 'USDC',
        description: `Compra de ${selectedPlan.name} (${fmt(
          amt,
          selectedCurrency === 'USDT' ? 2 : 8
        )} ${selectedCurrency} ≈ $${fmt(amountInUSD)})`,
        referenceType: 'investment',
        referenceId: inv.id,
        status: 'completed',
      });

      // En prod esto lo hace el RPC; aquí sólo como fallback.
      const { error: balErr } = await supabase
        .from('balances')
        .update({ usdc: Math.max(0, usdBalance - amountInUSD), updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (balErr) console.error('[balances update] error:', balErr);

      await Promise.all([refreshInvestments?.(), refreshTransactions?.(), refreshBalances?.()]);
      const arr = (getInvestments?.() || []).filter((it) => (it.user_id ?? it.userId) === user.id);
      setMyInvestments(arr);

      toast({
        title: '¡Inversión exitosa!',
        description: `Invertiste ${fmt(amt, selectedCurrency === 'USDT' ? 2 : 8)} ${selectedCurrency} (≈ $${fmt(
          amountInUSD
        )}) en ${selectedPlan.name}.`,
      });

      setSelectedPlan(null);
      setInvestmentAmount('');
      setSelectedCurrency('USDT');
    } catch (error) {
      console.error('Error al invertir:', error?.message || error);
      playSound?.('error');
      toast({
        title: 'Error de inversión',
        description: 'Hubo un problema al procesar tu inversión.',
        variant: 'destructive',
      });
    } finally {
      setIsInvesting(false);
    }
  };

  const getPlanIcon = (planName) => {
    switch (planName) {
      case 'Plan Básico':
        return Star;
      case 'Plan Estándar':
        return TrendingUp;
      case 'Plan Premium':
        return Zap;
      case 'Plan VIP':
        return DollarSign;
      default:
        return Wallet;
    }
  };

  const getPlanColor = (planName) => {
    switch (planName) {
      case 'Plan Básico':
        return 'from-blue-500 to-cyan-500';
      case 'Plan Estándar':
        return 'from-green-500 to-emerald-500';
      case 'Plan Premium':
        return 'from-purple-500 to-pink-500';
      case 'Plan VIP':
        return 'from-yellow-500 to-orange-500';
      default:
        return 'from-gray-500 to-slate-500';
    }
  };

  const minWarning = selectedPlan && amountUsd > 0 && amountUsd < Number(selectedPlan.minAmount || 0);
  const maxWarning =
    selectedPlan && Number(selectedPlan.maxAmount || 0) > 0 && amountUsd > Number(selectedPlan.maxAmount);

  // ===== Helpers progreso =====
  const computeStats = (inv) => {
    const amount = Number(inv?.amount ?? 0);
    const dailyPct = Number(inv?.dailyReturn ?? inv?.daily_return ?? 0);
    const duration = Number(inv?.duration ?? 0);
    const created = inv?.createdAt ?? inv?.created_at ?? new Date().toISOString();
    const elapsed = Math.min(daysBetween(created, Date.now()), duration);
    const remaining = Math.max(0, duration - elapsed);
    const dailyUsd = (amount * dailyPct) / 100;
    const earnedUsd = dailyUsd * elapsed;
    const projectedTotal = amount + dailyUsd * duration;
    const progressPct = duration > 0 ? (elapsed / duration) * 100 : 0;

    return {
      amount,
      dailyPct,
      duration,
      created,
      elapsed,
      remaining,
      dailyUsd,
      earnedUsd,
      projectedTotal,
      progressPct,
      endDate: addDays(created, duration),
    };
  };

  const buildSeries = (inv) => {
    const s = computeStats(inv);
    const out = [];
    for (let i = 0; i <= s.duration; i++) {
      out.push({
        day: i,
        date: shortDate(addDays(s.created, i)),
        actual: s.amount + s.dailyUsd * Math.min(i, s.elapsed),
        projected: s.amount + s.dailyUsd * i,
      });
    }
    return out;
  };

  // ===== Sincronizar payouts (idempotente en cliente) =====
  const syncingRef = useRef(false);

const syncPlanPayouts = useCallback(async () => {
  if (!user?.id || syncingRef.current) return;
  syncingRef.current = true;
  try {
    await Promise.all([refreshInvestments?.(), refreshTransactions?.()]);

    const invs = (getInvestments?.() || []).filter((inv) => (inv.user_id ?? inv.userId) === user.id);
    const txns = (getTransactions?.() || []).filter(
      (t) => (t.user_id ?? t.userId) === user.id && String(t.status || '').toLowerCase() === 'completed'
    );

    for (const inv of invs) {
      const s = computeStats(inv);
      const expected = Number((s.dailyUsd * s.elapsed).toFixed(2));
      const already = txns
        .filter(
          (t) => String(t.type).toLowerCase() === 'plan_payout' && String(t.referenceId) === String(inv.id)
        )
        .reduce((acc, t) => acc + Number(t.amount || 0), 0);

      const delta = Number((expected - already).toFixed(2));

      if (delta >= 0.01) {
        // Registrar el payout en el historial
        await addTransaction?.({
          amount: delta,
          type: 'plan_payout',
          currency: 'USDC',
          description: `Rendimiento diario ${inv.planName || inv.plan_name}`,
          referenceType: 'investment_payout',
          referenceId: inv.id,
          status: 'completed',
        });

        // Asegurar la wallet y actualizar saldo real
        await supabase.rpc('ensure_wallet', { p_user_id: user.id });
        const { error: incErr } = await supabase.rpc('inc_wallet', {
          p_user_id: user.id,
          p_currency: 'USDC',
          p_amount: delta,
        });
        if (incErr) console.error('[inc_wallet] error:', incErr.message);
        else console.log(`✅ +${delta} USDC acreditado al saldo de ${user.id}`);
      }
    }

    await Promise.all([refreshInvestments?.(), refreshTransactions?.(), refreshBalances?.()]);
    const arr = (getInvestments?.() || []).filter((it) => (it.user_id ?? it.userId) === user.id);
    setMyInvestments(arr);
  } catch (err) {
    console.error('Error en syncPlanPayouts:', err);
  } finally {
    syncingRef.current = false;
  }
}, [
  user?.id,
  getInvestments,
  getTransactions,
  refreshInvestments,
  refreshTransactions,
  refreshBalances,
  addTransaction,
]);


  useEffect(() => {
    if (!user?.id) return;
    syncPlanPayouts();
  }, [user?.id, syncPlanPayouts]);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) syncPlanPayouts();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [syncPlanPayouts]);

  // ===== UI =====
  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <h1 className="text-3xl font-bold text-white mb-2">Planes de Inversión</h1>
        <p className="text-slate-300">Elegí el plan que mejor se adapte a tu perfil de inversor.</p>
      </motion.div>

      {/* Saldo */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1 }}
      >
        <Card className="crypto-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Saldo Disponible (App)</p>
                <p className="text-3xl font-bold text-green-400 mt-1">${fmt(usdBalance)}</p>
              </div>
              <div className="p-4 rounded-lg bg-green-500/10">
                <Wallet className="h-8 w-8 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Catálogo de planes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(investmentPlans || []).map((plan, index) => {
          const Icon = getPlanIcon(plan.name);
          const isSelected = selectedPlan?.id === plan.id;

          return (
            <motion.div
              key={plan.id || plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: index * 0.1 + 0.2 }}
            >
              <Card
                className={`crypto-card cursor-pointer transition-all duration-300 ${
                  isSelected ? 'ring-2 ring-green-400 scale-105' : 'hover:scale-105'
                }`}
                onClick={() => {
                  playSound?.('click');
                  setSelectedPlan(plan);
                  setSelectedCurrency('USDT');
                  setInvestmentAmount('');
                }}
              >
                <CardHeader className="text-center">
                  <div
                    className={`mx-auto w-16 h-16 bg-gradient-to-r ${getPlanColor(
                      plan.name
                    )} rounded-full flex items-center justify-center mb-4`}
                  >
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <CardTitle className="text-white text-xl">{plan.name}</CardTitle>
                  <CardDescription className="text-slate-300">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <div className="space-y-1">
                    <div className="text-3xl font-bold text-green-400">{fmt(plan.dailyReturn, 2)}%</div>
                    <p className="text-slate-400 text-sm">Retorno diario</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-center space-x-1 text-slate-300 text-sm">
                      <DollarSign className="h-4 w-4" />
                      <span>
                        ${fmt(plan.minAmount)} - ${fmt(plan.maxAmount)} (USD equiv.)
                      </span>
                    </div>
                    <div className="flex items-center justify-center space-x-1 text-slate-300 text-sm">
                      <Clock className="h-4 w-4" />
                      <span>{plan.duration} días</span>
                    </div>
                  </div>
                  <div className="pt-2 space-y-1">
                    {['Retiros diarios', 'Capital protegido', 'Soporte 24/7'].map((feat) => (
                      <div key={feat} className="flex items-center justify-center space-x-1 text-green-400 text-xs">
                        <CheckCircle className="h-3 w-3" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2">
                    <div className="text-slate-400 text-sm">
                      ROI Total:{' '}
                      <span className="text-white font-semibold">
                        {(Number(plan.dailyReturn) * Number(plan.duration)).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound?.('click');
                      setSelectedPlan(plan);
                      setSelectedCurrency('USDT');
                      setInvestmentAmount('');
                    }}
                    className="w-full mt-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                  >
                    <ShoppingBag className="h-4 w-4 mr-2" /> Comprar Plan
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Mis Planes Activos */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25 }}>
        <Card className="crypto-card">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <BarChart2 className="h-5 w-5 mr-2 text-blue-400" />
              Mis Planes Activos
            </CardTitle>
            <CardDescription className="text-slate-300">Seguimiento en tiempo real de tus inversiones.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {myInvestments.length === 0 && (
              <div className="text-slate-400 text-sm">Aún no tenés inversiones activas.</div>
            )}

            {myInvestments.map((inv) => {
              const stats = computeStats(inv);
              const pct = Math.min(100, Math.max(0, stats.progressPct));
              const daysLabel = `${stats.elapsed}/${stats.duration} días`;
              const Icon = getPlanIcon(inv.planName || inv.plan_name || 'Plan');

              return (
                <div
                  key={inv.id}
                  className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/60 hover:border-slate-600/80 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-700/70 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-slate-200" />
                      </div>
                      <div>
                        <div className="text-white font-semibold">{inv.planName || inv.plan_name || 'Plan'}</div>
                        <div className="text-xs text-slate-400">
                          Inicio: {new Date(inv.createdAt ?? inv.created_at).toLocaleDateString()} • Fin:{' '}
                          {new Date(stats.endDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-slate-400 text-xs">Invertido</div>
                      <div className="text-white font-semibold">${fmt(stats.amount)}</div>
                    </div>
                  </div>

                  {/* Progreso */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Progreso</span>
                      <span className="text-slate-300">
                        {daysLabel} • {fmt(pct, 1)}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full bg-gradient-to-r from-green-500 to-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                    <div>
                      <div className="text-slate-400 text-xs">Ganado (acum.)</div>
                      <div className="text-green-400 font-semibold">${fmt(stats.earnedUsd)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Diario estimado</div>
                      <div className="text-slate-200 font-semibold">${fmt(stats.dailyUsd)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">ROI a hoy</div>
                      <div className="text-slate-200 font-semibold">
                        {fmt((stats.earnedUsd / Math.max(1e-9, stats.amount)) * 100, 2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Total proyectado</div>
                      <div className="text-slate-200 font-semibold">${fmt(stats.projectedTotal)}</div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="bg-slate-800 text-slate-200"
                      onClick={() => {
                        playSound?.('click');
                        setInspectInvestment(inv);
                      }}
                    >
                      <LineChartIcon className="h-4 w-4 mr-2" />
                      Ver detalle
                    </Button>
                    <div className="flex items-center text-xs text-slate-400 gap-2">
                      <Info className="h-4 w-4" />
                      Rendimiento diario fijo de {fmt(stats.dailyPct, 2)}% sobre capital.
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* Modal de Compra */}
      {selectedPlan && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPlan(null)}
        >
          <Card className="crypto-card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="text-center">
              <CardTitle className="text-white">Invertir en {selectedPlan.name}</CardTitle>
              <CardDescription className="text-slate-300">Ingresá el monto en la moneda seleccionada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-white">Moneda de Inversión</Label>
                <Select
                  value={selectedCurrency}
                  onValueChange={(value) => {
                    playSound?.('click');
                    setSelectedCurrency(value);
                  }}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-600">
                    {selectedPlan.currencies.map((curr) => (
                      <SelectItem key={curr} value={curr}>
                        {curr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Monto de Inversión ({selectedCurrency})</Label>
                <Input
                  type="number"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  placeholder={`Ej: ${selectedCurrency === 'USDT' ? '100' : selectedCurrency === 'BTC' ? '0.01' : '0.1'}`}
                  className="bg-slate-800 border-slate-600 text-white"
                />
                {investmentAmount && <p className="text-xs text-slate-400">Equivalente a: ${fmt(amountUsd, 2)} USD</p>}
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-slate-800 text-slate-200"
                  onClick={() => handleQuickPct(0.25)}
                >
                  25%
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-slate-800 text-slate-200"
                  onClick={() => handleQuickPct(0.5)}
                >
                  50%
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-slate-800 text-slate-200"
                  onClick={() => handleQuickPct(0.75)}
                >
                  75%
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="bg-slate-800 text-slate-200"
                  onClick={() => handleQuickPct(1)}
                >
                  100%
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={handleMin}>
                  Mínimo
                </Button>
                <Button type="button" variant="outline" onClick={handleMax}>
                  Máximo
                </Button>
              </div>

              {/* Resumen */}
              {investmentAmount && (
                <div className="bg-slate-800/50 p-4 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Inversión ({selectedCurrency}):</span>
                    <span className="text-white">{fmt(investmentAmount, selectedCurrency === 'USDT' ? 2 : 8)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Equivalente USD:</span>
                    <span className="text-white">${fmt(amountUsd, 2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Retorno diario (USD):</span>
                    <span className="text-green-400">
                      ${fmt((amountUsd * Number(selectedPlan.dailyReturn || 0)) / 100, 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Retorno total (USD):</span>
                    <span className="text-green-400 font-semibold">
                      $
                      {fmt(
                        (amountUsd * Number(selectedPlan.dailyReturn || 0) * Number(selectedPlan.duration || 0)) / 100,
                        2
                      )}
                    </span>
                  </div>

                  {(minWarning || maxWarning) && (
                    <div className="mt-2 flex items-start gap-2 text-amber-300">
                      <AlertTriangle className="h-4 w-4 mt-0.5" />
                      <span>
                        El monto debe estar entre <b>${fmt(selectedPlan.minAmount)}</b> y{' '}
                        <b>
                          {Number(selectedPlan.maxAmount || 0) > 0 ? `$${fmt(selectedPlan.maxAmount)}` : 'sin tope'}
                        </b>{' '}
                        (equivalente en USD).
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex space-x-4">
                <Button
                  onClick={() => {
                    playSound?.('click');
                    setSelectedPlan(null);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleInvest}
                  disabled={isInvesting || !investmentAmount || getPrice(selectedCurrency) <= 0 || amountUsd <= 0}
                  className="flex-1 bg-gradient-to-r from-green-500 to-blue-500"
                >
                  {isInvesting ? 'Procesando...' : 'Invertir Ahora'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Modal Detalle del Plan */}
      {inspectInvestment &&
        (() => {
          const s = computeStats(inspectInvestment);
          const data = buildSeries(inspectInvestment);
          const planTitle = inspectInvestment.planName || inspectInvestment.plan_name || 'Plan';

          return (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setInspectInvestment(null)}
            >
              <Card className="crypto-card w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <LineChartIcon className="h-5 w-5 mr-2 text-cyan-400" />
                    Progreso de {planTitle}
                  </CardTitle>
                  <CardDescription className="text-slate-300">
                    Inicio {new Date(s.created).toLocaleDateString()} • Fin {new Date(s.endDate).toLocaleDateString()} •{' '}
                    {fmt(s.progressPct, 1)}% completado
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-slate-800/50 rounded-md">
                      <div className="text-xs text-slate-400">Capital</div>
                      <div className="text-white font-semibold">${fmt(s.amount)}</div>
                    </div>
                    <div className="p-3 bg-slate-800/50 rounded-md">
                      <div className="text-xs text-slate-400">Diario</div>
                      <div className="text-slate-100 font-semibold">
                        ${fmt(s.dailyUsd)} <span className="text-slate-400 text-xs">({fmt(s.dailyPct, 2)}%)</span>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-800/50 rounded-md">
                      <div className="text-xs text-slate-400">Ganado</div>
                      <div className="text-green-400 font-semibold">${fmt(s.earnedUsd)}</div>
                    </div>
                    <div className="p-3 bg-slate-800/50 rounded-md">
                      <div className="text-xs text-slate-400">Proyectado</div>
                      <div className="text-slate-100 font-semibold">${fmt(s.projectedTotal)}</div>
                    </div>
                  </div>

                  {/* Gráfico */}
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="actual" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                          </linearGradient>
                          <linearGradient id="proj" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(148,163,184,0.15)" />
                        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `$${fmt(v, 0)}`} />
                        <Tooltip
                          cursor={{ fill: 'rgba(100,116,139,0.1)' }}
                          contentStyle={{ backgroundColor: 'rgba(30,41,59,0.95)', border: 'none', borderRadius: 8 }}
                          labelStyle={{ color: '#cbd5e1' }}
                          formatter={(val, name) => [`$${fmt(val)}`, name === 'actual' ? 'Valor actual' : 'Proyección']}
                        />
                        <Legend wrapperStyle={{ color: '#cbd5e1' }} />
                        <ReferenceLine x={shortDate(Date.now())} stroke="#eab308" strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="actual" name="Valor actual" stroke="#22c55e" fill="url(#actual)" strokeWidth={2} />
                        <Area type="monotone" dataKey="projected" name="Proyección" stroke="#3b82f6" fill="url(#proj)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button variant="outline" onClick={() => setInspectInvestment(null)}>
                      Cerrar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}
    </div>
  );
}
