// src/pages/RewardsPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Gift,
  CheckCircle,
  Zap,
  Star,
  DollarSign,
  Users,
  TrendingUp,
  Gauge,
  Info,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/supabaseClient';

// ===== TAREAS BASE =====
const initialTasks = [
  {
    id: 1,
    key: 'first_deposit',
    title: 'Primer Depósito',
    description: 'Realizá tu primer depósito de al menos $50 (equivalente).',
    reward: '$5 Bonus',
    icon: DollarSign,
    category: 'Depósito',
    goal: 50, // USD
    link: '/deposit',
  },
  {
    id: 2,
    key: 'first_investment',
    title: 'Invertí en un Plan',
    description: 'Activá tu primer plan de inversión.',
    reward: '$10 Bonus',
    icon: TrendingUp,
    category: 'Inversión',
    goal: 1,
    link: '/plans',
  },
  {
    id: 3,
    key: 'kyc_verify',
    title: 'Verificá tu Cuenta',
    description: 'Completá la verificación KYC de tu perfil.',
    reward: 'Acceso a retiros mayores',
    icon: CheckCircle,
    category: 'Perfil',
    goal: 1,
    link: '/profile',
  },
  {
    id: 4,
    key: 'refer_friend',
    title: 'Referí a un Amigo',
    description: 'Invitá a un amigo (cuenta como 1 referido activo).',
    reward: '$20 Bonus por amigo',
    icon: Users,
    category: 'Referidos',
    goal: 1,
    link: '/referrals',
  },
  {
    id: 5,
    key: 'ten_trades',
    title: 'Completá 10 Trades',
    description: 'Realizá 10 operaciones (simulador o real).',
    reward: '$1000 saldo virtual extra',
    icon: Zap,
    category: 'Trading',
    goal: 10,
    link: '/simulator',
  },
  {
    id: 6,
    key: 'monthly_loyalty',
    title: 'Lealtad Mensual',
    description: 'Mantené una inversión activa por 30 días consecutivos.',
    reward: '2% Bonus sobre ganancias',
    icon: Star,
    category: 'Lealtad',
    goal: 30, // días
    link: '/history',
  },
];

// -- rehidratar íconos si venían del localStorage (no se pueden serializar funciones)
const restoreIcons = (arr = []) =>
  arr.map((t) => {
    const fallback = initialTasks.find((x) => x.id === t.id)?.icon || Gift;
    const validIcon = typeof t.icon === 'function' ? t.icon : fallback;
    return { ...t, icon: validIcon };
  });

const safeParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const fmt = (n, dec = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(dec) : (0).toFixed(dec);
};
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));

// helpers para calcular ganancia acumulada aprox. de planes (para la tarea de lealtad)
const daysBetween = (from, to) => {
  const A = new Date(from);
  const B = new Date(to);
  return Math.max(0, Math.floor((B.getTime() - A.getTime()) / (1000 * 60 * 60 * 24)));
};

const earnedOfInvestment = (inv) => {
  const amount = Number(inv?.amount ?? 0);
  const dailyPct = Number(inv?.dailyReturn ?? inv?.daily_return ?? 0);
  const duration = Number(inv?.duration ?? 0);
  const created = inv?.createdAt ?? inv?.created_at ?? new Date().toISOString();
  const elapsed = Math.min(daysBetween(created, Date.now()), duration);
  const dailyUsd = (amount * dailyPct) / 100;
  return dailyUsd * elapsed; // ganancia acumulada al día
};

export default function RewardsPage() {
  const { user, balances, refreshBalances } = useAuth();
  const { playSound } = useSound();

  // Datos en vivo para progreso/eligibilidad y para registrar transacciones
  const {
    transactions = [],
    investments = [],
    referrals = [],
    cryptoPrices = {},
    addTransaction,
    refreshTransactions,
  } = useData();

  const [tradesCount, setTradesCount] = useState(0);
  const [loadingTrades, setLoadingTrades] = useState(true);

  const keyTasks = user?.id ? `crypto_rewards_tasks_${user.id}` : null;
  const keyClaim = user?.id ? `crypto_claimed_rewards_${user.id}` : null;

  // Estado local (persistido en localStorage por usuario)
  const [tasks, setTasks] = useState(() => {
    const raw = keyTasks ? localStorage.getItem(keyTasks) : null;
    const base = raw ? safeParse(raw, initialTasks) : initialTasks;
    return restoreIcons(base);
  });

  const [claimedRewards, setClaimedRewards] = useState(() => {
    const raw = keyClaim ? localStorage.getItem(keyClaim) : null;
    return raw ? safeParse(raw, []) : [];
  });

  // Persistir en localStorage (sin funciones)
  useEffect(() => {
    if (!keyTasks) return;
    const toSave = tasks.map(({ icon, ...rest }) => rest);
    localStorage.setItem(keyTasks, JSON.stringify(toSave));
  }, [tasks, keyTasks]);

  useEffect(() => {
    if (!keyClaim) return;
    localStorage.setItem(keyClaim, JSON.stringify(claimedRewards));
  }, [claimedRewards, keyClaim]);

  // === Cargar cantidad de trades desde Supabase ===
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.id) return;
      setLoadingTrades(true);
      const { count, error } = await supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (!active) return;
      if (error) {
        console.error('[rewards] trades count error:', error);
        setTradesCount(0);
      } else {
        setTradesCount(Number(count || 0));
      }
      setLoadingTrades(false);
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  // === Derivar progreso/eligibilidad ===
  const depositUsdTotal = useMemo(() => {
    const toUsd = (amt, cur) => {
      const c = String(cur || '').toUpperCase();
      if (c === 'USDT' || c === 'USDC' || c === 'USD') return Number(amt) || 0;
      if (c === 'BTC') return (Number(amt) || 0) * (Number(cryptoPrices?.BTC?.price || 0) || 0);
      if (c === 'ETH') return (Number(amt) || 0) * (Number(cryptoPrices?.ETH?.price || 0) || 0);
      return 0;
    };
    const completedDeposits = (Array.isArray(transactions) ? transactions : []).filter(
      (t) => (t?.type || '').toLowerCase() === 'deposit' && (t?.status || '').toLowerCase() === 'completed'
    );
    return completedDeposits.reduce((sum, t) => sum + toUsd(t.amount, t.currency), 0);
  }, [transactions, cryptoPrices]);

  const kycVerified = useMemo(() => {
    const meta = user?.user_metadata || {};
    return Boolean(
      meta.kyc === true ||
        meta.kyc_verified === true ||
        meta.isVerified === true ||
        meta.verified === true
    );
  }, [user?.user_metadata]);

  const activeInvestments = useMemo(
    () => (Array.isArray(investments) ? investments : []).filter(
      (i) => (i?.status || '').toLowerCase() === 'active'
    ),
    [investments]
  );

  const loyaltyDays = useMemo(() => {
    const days = activeInvestments.map((i) => Number(i?.daysElapsed || 0));
    return days.length ? Math.max(...days) : 0;
  }, [activeInvestments]);

  const referralsCount = useMemo(
    () => (Array.isArray(referrals) ? referrals.length : 0),
    [referrals]
  );

  const eligibility = useMemo(() => {
    const map = new Map();
    for (const t of initialTasks) {
      switch (t.key) {
        case 'first_deposit': {
          const progress = depositUsdTotal;
          const pct = clamp((progress / t.goal) * 100);
          map.set(t.id, { eligible: progress >= t.goal, progress, pct, hint: `Depositado: $${fmt(progress)} / $${fmt(t.goal, 0)}` });
          break;
        }
        case 'first_investment': {
          const count = activeInvestments.length || (Array.isArray(investments) ? investments.length : 0);
          const pct = clamp((count / t.goal) * 100);
          map.set(t.id, { eligible: count >= t.goal, progress: count, pct, hint: `Inversiones: ${count}/${t.goal}` });
          break;
        }
        case 'kyc_verify': {
          map.set(t.id, { eligible: kycVerified, progress: kycVerified ? 1 : 0, pct: kycVerified ? 100 : 0, hint: kycVerified ? 'KYC verificado' : 'KYC pendiente' });
          break;
        }
        case 'refer_friend': {
          const count = referralsCount;
          const pct = clamp((count / t.goal) * 100);
          map.set(t.id, { eligible: count >= t.goal, progress: count, pct, hint: `Referidos: ${count}/${t.goal}` });
          break;
        }
        case 'ten_trades': {
          const cnt = Number(tradesCount || 0);
          const pct = clamp((cnt / t.goal) * 100);
          map.set(t.id, { eligible: cnt >= t.goal, progress: cnt, pct, hint: `Trades: ${cnt}/${t.goal}` });
          break;
        }
        case 'monthly_loyalty': {
          const days = Number(loyaltyDays || 0);
          const pct = clamp((days / t.goal) * 100);
          map.set(t.id, { eligible: days >= t.goal, progress: days, pct, hint: `Días acumulados: ${days}/${t.goal}` });
          break;
        }
        default:
          map.set(t.id, { eligible: false, progress: 0, pct: 0, hint: '' });
      }
    }
    return map;
  }, [depositUsdTotal, activeInvestments, investments, kycVerified, referralsCount, tradesCount, loyaltyDays]);

  // === Estado de reclamo ===
  const isClaimed = (id) => claimedRewards.some((r) => r.id === id);

  // ---- calcular monto USD de recompensa (real) ----
  const computeUsdReward = (task) => {
    switch (task.key) {
      case 'first_deposit':
        return 5;
      case 'first_investment':
        return 10;
      case 'refer_friend':
        return 20;
      case 'monthly_loyalty': {
        // 2% de ganancias acumuladas actuales (aprox) si ya cumplió 30 días
        const earnedTotal = (activeInvestments || []).reduce((acc, inv) => acc + earnedOfInvestment(inv), 0);
        const bonus = earnedTotal * 0.02;
        return bonus > 0 ? bonus : 0;
      }
      // KYC y Ten Trades NO acreditan saldo real en este diseño
      default:
        return 0;
    }
  };

  // ---- reclamar recompensa (acreditar + transacción + refrescar) ----
  const handleClaimReward = async (taskId) => {
    const task = tasks.find((t) => t.id === taskId) || initialTasks.find((t) => t.id === taskId);
    const info = eligibility.get(taskId);
    if (!task) return;

    if (!user?.id) {
      toast({ title: 'Sin sesión', description: 'Iniciá sesión para continuar.', variant: 'destructive' });
      return;
    }
    if (!info?.eligible) {
      playSound?.('error');
      toast({
        title: 'Aún no disponible',
        description: `Completá los requisitos primero. ${info?.hint ? `(${info.hint})` : ''}`,
        variant: 'destructive',
      });
      return;
    }
    if (isClaimed(taskId)) {
      playSound?.('click');
      toast({ title: 'Ya reclamado', description: `Ya reclamaste la recompensa de "${task.title}".` });
      return;
    }

    // 1) Determinar premio
    const usdReward = computeUsdReward(task);

    try {
      // 2) Si hay dinero real, acreditar balance + registrar transacción visible en Wallet/History
      if (usdReward > 0) {
        const current = Number(balances?.usdc ?? 0);
        const newBal = current + usdReward;

        // 2a) Transacción (tipo que sí aparece en WalletPage -> admin_credit)
        await addTransaction?.({
          amount: usdReward,
          type: 'admin_credit',
          currency: 'USDC',
          description: `Recompensa: ${task.title}`,
          referenceType: 'reward',
          referenceId: task.key,
          status: 'completed',
        });

        // 2b) Actualizar saldo real USDC
        const { error: balErr } = await supabase
          .from('balances')
          .update({ usdc: newBal, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);

        if (balErr) {
          console.error('[rewards] balances.update', balErr);
          throw balErr;
        }

        // refrescar caches
        await Promise.all([refreshTransactions?.(), refreshBalances?.()]);
      } else {
        // Bonos no monetarios reales
        if (task.key === 'ten_trades') {
          toast({
            title: 'Saldo virtual',
            description: 'El bonus de 10 trades es saldo de práctica. Si querés, lo conecto para sumar $1000 a tu saldo demo.',
          });
        }
        if (task.key === 'kyc_verify') {
          toast({
            title: 'Beneficio activado',
            description: 'Tu KYC otorga mayores límites de retiro. (No acredita saldo real).',
          });
        }
      }

      // 3) Marcar como reclamado (local)
      playSound?.('success');
      setClaimedRewards((prev) => [
        ...prev,
        { id: task.id, title: task.title, reward: task.reward, claimedAt: new Date().toISOString() },
      ]);

      toast({
        title: '¡Recompensa reclamada!',
        description:
          usdReward > 0
            ? `Acreditamos $${fmt(usdReward)} USDC en tu billetera por "${task.title}".`
            : `Completaste "${task.title}".`,
      });
    } catch (e) {
      console.error('[rewards] claim error:', e);
      toast({
        title: 'No se pudo acreditar',
        description: e?.message || 'Intentá nuevamente en unos instantes.',
        variant: 'destructive',
      });
    }
  };

  const categories = useMemo(
    () => [...new Set(tasks.map((t) => t.category))],
    [tasks]
  );

  const overallPct = useMemo(() => {
    const eligibleCount = tasks.filter((t) => eligibility.get(t.id)?.eligible).length;
    return clamp((eligibleCount / tasks.length) * 100);
  }, [tasks, eligibility]);

  const claimedPct = useMemo(() => {
    return clamp((claimedRewards.length / tasks.length) * 100);
  }, [claimedRewards.length, tasks.length]);

  return (
    <>
      <div className="space-y-8">
        {/* Header + progreso global */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <Gift className="h-8 w-8 mr-3 text-yellow-400" />
            Centro de Recompensas
          </h1>
          <p className="text-slate-300">
            Completá tareas y ganá recompensas para potenciar tus inversiones.
          </p>
        </motion.div>

        <Card className="crypto-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-white flex items-center gap-2">
              <Gauge className="h-5 w-5 text-emerald-400" />
              Progreso General
            </CardTitle>
            <CardDescription className="text-slate-300">
              Verde: tareas reclamadas · Celeste: tareas listas para reclamar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="w-full h-5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className="flex h-full">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                  style={{ width: `${claimedPct}%` }}
                  title={`Reclamadas: ${fmt(claimedPct, 0)}%`}
                />
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-sky-400"
                  style={{ width: `${Math.max(overallPct - claimedPct, 0)}%` }}
                  title={`Listas para reclamar: ${fmt(Math.max(overallPct - claimedPct, 0), 0)}%`}
                />
              </div>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <Info className="w-4 h-4" />
              {claimedRewards.length}/{tasks.length} reclamadas ·{' '}
              {tasks.filter((t) => eligibility.get(t.id)?.eligible && !isClaimed(t.id)).length}/{tasks.length} listas para reclamar
            </div>
          </CardContent>
        </Card>

        {/* Grupos por categoría */}
        {categories.map((category) => (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 * categories.indexOf(category) }}
          >
            <h2 className="text-2xl font-semibold text-purple-300 mb-4 mt-6">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tasks
                .filter((task) => task.category === category)
                .map((task) => {
                  const Icon = typeof task.icon === 'function' ? task.icon : Gift;
                  const info = eligibility.get(task.id) || { eligible: false, pct: 0, hint: '' };
                  const claimed = isClaimed(task.id);
                  const canClaim = info.eligible && !claimed;
                  const busy = task.key === 'ten_trades' && loadingTrades;

                  return (
                    <Card
                      key={task.id}
                      className={`crypto-card h-full flex flex-col border ${
                        claimed
                          ? 'border-emerald-500/60'
                          : canClaim
                          ? 'border-sky-500/60'
                          : 'border-purple-500/40'
                      }`}
                    >
                      <CardHeader>
                        <div className="flex items-center space-x-3 mb-2">
                          <div
                            className={`p-2 rounded-lg ${
                              claimed ? 'bg-emerald-500/20' : canClaim ? 'bg-sky-500/20' : 'bg-purple-500/20'
                            }`}
                          >
                            <Icon
                              className={`h-6 w-6 ${
                                claimed ? 'text-emerald-400' : canClaim ? 'text-sky-400' : 'text-purple-400'
                              }`}
                            />
                          </div>
                          <CardTitle className="text-lg text-white">{task.title}</CardTitle>
                        </div>
                        <CardDescription className="text-slate-300 text-sm h-12 overflow-hidden">
                          {task.description}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="flex-grow space-y-3">
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${
                              claimed
                                ? 'bg-emerald-500'
                                : canClaim
                                ? 'bg-sky-500'
                                : 'bg-purple-500'
                            }`}
                            style={{ width: `${info.pct || 0}%` }}
                          />
                        </div>
                        <div className="text-xs text-slate-400">{info.hint}</div>
                        <p className="text-green-400 font-semibold">Recompensa: {task.reward}</p>
                      </CardContent>

                      <CardFooter className="flex gap-2">
                        <Button
                          onClick={() => handleClaimReward(task.id)}
                          disabled={!canClaim || busy}
                          className={`w-full ${
                            claimed
                              ? 'bg-green-700 hover:bg-green-800 cursor-not-allowed'
                              : canClaim
                              ? 'bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-600 hover:to-emerald-600'
                              : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                          }`}
                        >
                          {claimed ? (
                            <>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Reclamado
                            </>
                          ) : canClaim ? (
                            'Reclamar Recompensa'
                          ) : busy ? (
                            'Calculando…'
                          ) : (
                            'En progreso'
                          )}
                        </Button>

                        {task.link && (
                          <a href={task.link}>
                            <Button variant="outline">Ir</Button>
                          </a>
                        )}
                      </CardFooter>
                    </Card>
                  );
                })}
            </div>
          </motion.div>
        ))}

        {claimedRewards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 * categories.length }}
          >
            <h2 className="text-2xl font-semibold text-green-300 mb-4 mt-8">
              Recompensas Reclamadas
            </h2>
            <Card className="crypto-card">
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {claimedRewards.map((reward) => (
                    <li
                      key={reward.id}
                      className="flex justify-between items-center p-3 bg-slate-800/50 rounded-md"
                    >
                      <div className="flex items-center">
                        <Gift className="h-5 w-5 mr-3 text-yellow-400" />
                        <div>
                          <p className="text-white">{reward.title}</p>
                          <p className="text-sm text-green-400">+{reward.reward}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">
                        Reclamado: {new Date(reward.claimedAt).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </>
  );
}
