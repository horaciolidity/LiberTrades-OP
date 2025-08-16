// src/pages/RewardsPage.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gift, CheckCircle, Zap, Star, DollarSign, Users, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

const DEFAULT_CCY = 'USDC';

const initialTasks = [
  { id: 1, title: 'Primer Depósito',       description: 'Realiza tu primer depósito de al menos $50.',          reward: '$5',     icon: DollarSign, completed: false, category: 'Depósito' },
  { id: 2, title: 'Invierte en un Plan',   description: 'Activa tu primer plan de inversión.',                   reward: '$10',    icon: TrendingUp, completed: false, category: 'Inversión' },
  { id: 3, title: 'Verifica tu Cuenta',    description: 'Completa la verificación KYC de tu perfil.',            reward: '—',      icon: CheckCircle, completed: false, category: 'Perfil' },
  { id: 4, title: 'Refiere a un Amigo',    description: 'Invita a un amigo y que complete su primer depósito.', reward: '$20',    icon: Users,      completed: false, category: 'Referidos' },
  { id: 5, title: 'Completa 10 Trades',    description: 'Realiza 10 operaciones en el simulador de trading.',    reward: 'Virtual',icon: Zap,        completed: false, category: 'Trading' },
  { id: 6, title: 'Lealtad Mensual',       description: 'Mantén una inversión activa por 30 días consecutivos.', reward: '2% bonus',icon: Star,      completed: false, category: 'Lealtad' },
];

// rehidrata íconos solo si son funciones válidas
const restoreIcons = (arr = []) =>
  arr.map(t => {
    const fallback = initialTasks.find(x => x.id === t.id)?.icon || Gift;
    const validIcon = typeof t.icon === 'function' ? t.icon : fallback;
    return { ...t, icon: validIcon };
  });

const safeParse = (raw, fallback) => {
  try { return JSON.parse(raw); } catch { return fallback; }
};

const RewardsPage = () => {
  const { user, balances, refreshBalances, profile } = useAuth();
  const { transactions, investments, referrals, getTransactions, getInvestments, getReferrals, refreshTransactions, refreshInvestments, refreshReferrals, addTransaction } = useData();
  const { playSound } = useSound();

  const keyTasks = user?.id ? `crypto_rewards_tasks_${user.id}` : null;
  const keyClaim = user?.id ? `crypto_claimed_rewards_${user.id}` : null;

  // Estado local (persistido) para UX; pero nos reconciliamos con backend más abajo
  const [tasks, setTasks] = useState(() => {
    const raw = keyTasks ? localStorage.getItem(keyTasks) : null;
    const base = raw ? safeParse(raw, initialTasks) : initialTasks;
    return restoreIcons(base);
  });
  const [claimedRewards, setClaimedRewards] = useState(() => {
    const raw = keyClaim ? localStorage.getItem(keyClaim) : null;
    return raw ? safeParse(raw, []) : [];
  });

  // Persistencia local simple (sin funciones/íconos)
  useEffect(() => {
    if (!keyTasks) return;
    const toSave = tasks.map(({ icon, ...rest }) => rest);
    localStorage.setItem(keyTasks, JSON.stringify(toSave));
  }, [tasks, keyTasks]);
  useEffect(() => {
    if (!keyClaim) return;
    localStorage.setItem(keyClaim, JSON.stringify(claimedRewards));
  }, [claimedRewards, keyClaim]);

  // Cargar/actualizar data desde DataContext (patrón consistente)
  useEffect(() => {
    if (!user?.id) return;
    refreshTransactions?.();
    refreshInvestments?.();
    refreshReferrals?.();
  }, [user?.id, refreshTransactions, refreshInvestments, refreshReferrals]);

  // Arrays tolerantes
  const txArr = useMemo(() => Array.isArray(transactions) ? transactions : (Array.isArray(getTransactions?.()) ? getTransactions() : []), [transactions, getTransactions]);
  const invArr = useMemo(() => Array.isArray(investments) ? investments : (Array.isArray(getInvestments?.()) ? getInvestments() : []), [investments, getInvestments]);
  const refArr = useMemo(() => Array.isArray(referrals) ? referrals : (Array.isArray(getReferrals?.()) ? getReferrals() : []), [referrals, getReferrals]);

  // Reconciliar completados con backend: si ya existe una tx de reward, marcamos la tarea como completada
  useEffect(() => {
    if (!user?.id) return;
    const next = tasks.map(t => {
      const needle = `Reward: ${t.title}`;
      const already = (txArr || []).some(tx =>
        (tx.user_id ?? tx.userId) === user.id &&
        (tx.type === 'admin_credit' || tx.type === 'other') &&
        (tx.status === 'completed') &&
        String(tx.description || '').includes(needle)
      );
      return already ? { ...t, completed: true } : t;
    });
    setTasks(restoreIcons(next));
  }, [user?.id, txArr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helpers
  const ensureBalanceRow = async () => {
    if (!user?.id) return;
    await supabase.from('balances').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  };
  const ensureCurrency = async (code) => {
    try { await supabase.from('currencies').upsert({ code }, { onConflict: 'code', ignoreDuplicates: true }); } catch {}
  };
  const rewardAmountOf = (taskId) => {
    switch (taskId) {
      case 1: return 5;
      case 2: return 10;
      case 4: return 20;
      default: return 0; // otras son no-monetarias/pendientes de backend
    }
  };

  // Reglas de elegibilidad (desde backend)
  const isEligible = (task) => {
    if (!user?.id) return false;
    const uid = user.id;

    switch (task.id) {
      case 1: { // Primer Depósito >= 50 y completed
        const deps = (txArr || []).filter(t =>
          (t.user_id ?? t.userId) === uid &&
          t.type === 'deposit' &&
          t.status === 'completed' &&
          Number(t.amount || 0) >= 50
        );
        return deps.length > 0;
      }
      case 2: { // Tiene al menos una inversión creada
        const invs = (invArr || []).filter(i =>
          (i.user_id ?? i.userId) === uid
        );
        return invs.length > 0;
      }
      case 3: { // KYC verificado (requiere campo en profile)
        // Ajusta cuando tengas `profile.kyc_status === 'verified'` u otro flag
        return String(profile?.kyc_status || '').toLowerCase() === 'verified';
      }
      case 4: { // Al menos 1 referido (puedes afinar a “depósito del referido” cuando tengas esos datos)
        const mine = (refArr || []).filter(r =>
          (r.referred_by ?? r.referredBy) === uid ||
          (r.referrer_id ?? r.referrerId) === uid ||
          (r.referral_code ?? r.referralCode) === (profile?.referral_code || '')
        );
        return mine.length > 0;
      }
      case 5: { // 10 trades en simulador (requiere exponer trades en DataContext)
        // Si luego expones `trades`, cuenta ahí. Por ahora, desactivado:
        return false;
      }
      case 6: { // Lealtad 30 días con inversión activa
        const now = Date.now();
        const ok = (invArr || []).some(i => {
          const created = new Date(i.created_at ?? i.createdAt ?? 0).getTime();
          const days = (now - created) / 86400000;
          return (i.user_id ?? i.userId) === uid && String(i.status || '').toLowerCase() === 'active' && days >= 30;
        });
        return ok;
      }
      default:
        return false;
    }
  };

  const hasAlreadyClaimed = (task) => {
    const needle = `Reward: ${task.title}`;
    return (txArr || []).some(tx =>
      (tx.user_id ?? tx.userId) === user?.id &&
      (tx.type === 'admin_credit' || tx.type === 'other') &&
      (tx.status === 'completed') &&
      String(tx.description || '').includes(needle)
    );
  };

  const handleClaimReward = async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Monetarias soportadas acá: 1, 2, 4
    const amount = rewardAmountOf(taskId);
    const eligible = isEligible(task);

    if (!eligible) {
      playSound?.('error');
      toast({
        title: 'No cumples los requisitos',
        description: 'Completa la condición de la tarea para reclamar la recompensa.',
        variant: 'destructive',
      });
      return;
    }

    if (hasAlreadyClaimed(task)) {
      playSound?.('error');
      toast({
        title: 'Ya reclamada',
        description: 'Esta recompensa ya fue acreditada en tu cuenta.',
        variant: 'destructive',
      });
      // también marcamos visualmente
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, completed: true } : t)));
      return;
    }

    // Si no es recompensa monetaria, informamos y marcamos completada localmente
    if (amount <= 0) {
      playSound?.('click');
      toast({
        title: 'Próximamente',
        description: 'Esta recompensa no es monetaria o requiere verificación adicional.',
      });
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, completed: true } : t)));
      setClaimedRewards(prev => [...prev, { id: task.id, title: task.title, reward: task.reward, claimedAt: new Date().toISOString() }]);
      return;
    }

    // Recompensa monetaria: acreditamos USDC y registramos transacción (patrón consistente)
    try {
      playSound?.('invest');
      await ensureCurrency(DEFAULT_CCY);
      await ensureBalanceRow();

      // 1) Sumar saldo al usuario
      const { data: balRow, error: gErr } = await supabase
        .from('balances')
        .select('usdc')
        .eq('user_id', user.id)
        .single();
      if (gErr) throw gErr;

      const current = Number(balRow?.usdc || 0);
      const next = current + Number(amount);

      const { error: uErr } = await supabase
        .from('balances')
        .update({ usdc: next, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (uErr) throw uErr;

      // 2) Registrar wallet_transaction completed (admin_credit)
      await addTransaction?.({
        amount: Number(amount),
        type: 'admin_credit',
        currency: DEFAULT_CCY,
        description: `Reward: ${task.title}`,
        referenceType: 'reward_task',
        referenceId: null,
        status: 'completed',
      });

      await refreshBalances?.();
      await refreshTransactions?.();

      playSound?.('success');
      toast({
        title: '¡Recompensa acreditada!',
        description: `Se acreditaron $${fmt(amount)} USDC por "${task.title}".`,
      });

      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, completed: true } : t)));
      setClaimedRewards(prev => [...prev, { id: task.id, title: task.title, reward: `$${amount}`, claimedAt: new Date().toISOString() }]);
    } catch (e) {
      console.error(e);
      playSound?.('error');
      toast({
        title: 'Error al acreditar',
        description: e?.message ?? 'No se pudo registrar la recompensa.',
        variant: 'destructive',
      });
    }
  };

  const categories = useMemo(() => [...new Set(tasks.map(task => task.category))], [tasks]);

  return (
    <>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <Gift className="h-8 w-8 mr-3 text-yellow-400" />
            Centro de Recompensas
          </h1>
          <p className="text-slate-300">Completa tareas y gana recompensas exclusivas para potenciar tus inversiones.</p>
          <p className="text-slate-400 mt-2">
            Saldo USDC: <span className="text-green-400 font-semibold">${fmt(balances?.usdc ?? 0)}</span>
          </p>
        </motion.div>

        {categories.map((category, idxCat) => (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 * idxCat }}
          >
            <h2 className="text-2xl font-semibold text-purple-300 mb-4 mt-6">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tasks
                .filter(task => task.category === category)
                .map((task) => {
                  const Icon = typeof task.icon === 'function' ? task.icon : Gift;
                  const eligible = isEligible(task);
                  const money = rewardAmountOf(task.id);
                  const label = money > 0 ? `Recompensa: $${fmt(money)}` : `Recompensa: ${task.reward}`;

                  return (
                    <Card key={task.id} className={`crypto-card h-full flex flex-col ${task.completed ? 'opacity-60 border-green-500' : 'border-purple-500'}`}>
                      <CardHeader>
                        <div className="flex items-center space-x-3 mb-2">
                          <div className={`p-2 rounded-lg ${task.completed ? 'bg-green-500/20' : 'bg-purple-500/20'}`}>
                            <Icon className={`h-6 w-6 ${task.completed ? 'text-green-400' : 'text-purple-400'}`} />
                          </div>
                          <CardTitle className="text-lg text-white">{task.title}</CardTitle>
                        </div>
                        <CardDescription className="text-slate-300 text-sm h-12 overflow-hidden">{task.description}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex-grow">
                        <p className="text-green-400 font-semibold">{label}</p>
                        {!task.completed && (
                          <p className={`text-xs mt-2 ${eligible ? 'text-green-400' : 'text-slate-400'}`}>
                            {eligible ? 'Requisitos cumplidos' : 'Aún no cumples los requisitos'}
                          </p>
                        )}
                      </CardContent>
                      <CardFooter>
                        <Button
                          onClick={() => handleClaimReward(task.id)}
                          disabled={task.completed || !eligible}
                          className={`w-full ${task.completed
                            ? 'bg-green-700 hover:bg-green-800 cursor-not-allowed'
                            : eligible
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'
                              : 'bg-slate-700 cursor-not-allowed'
                            }`}
                        >
                          {task.completed ? <><CheckCircle className="mr-2 h-4 w-4" />Reclamado</> : 'Reclamar Recompensa'}
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
            </div>
          </motion.div>
        ))}

        {claimedRewards.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 * categories.length }}>
            <h2 className="text-2xl font-semibold text-green-300 mb-4 mt-8">Recompensas Reclamadas</h2>
            <Card className="crypto-card">
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {claimedRewards.map((reward, i) => (
                    <li key={`${reward.id}-${i}`} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-md">
                      <div className="flex items-center">
                        <Gift className="h-5 w-5 mr-3 text-yellow-400" />
                        <div>
                          <p className="text-white">{reward.title}</p>
                          <p className="text-sm text-green-400">+{reward.reward}</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">Reclamado: {new Date(reward.claimedAt).toLocaleDateString()}</p>
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
};

export default RewardsPage;
