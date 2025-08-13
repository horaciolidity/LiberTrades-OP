// src/pages/RewardsPage.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Gift, CheckCircle, Zap, Star, DollarSign, Users, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const initialTasks = [
  { id: 1, title: 'Primer Depósito', description: 'Realiza tu primer depósito de al menos $50.', reward: '$5 Bonus', icon: DollarSign, completed: false, category: 'Depósito' },
  { id: 2, title: 'Invierte en un Plan', description: 'Activa tu primer plan de inversión.', reward: '$10 Bonus', icon: TrendingUp, completed: false, category: 'Inversión' },
  { id: 3, title: 'Verifica tu Cuenta', description: 'Completa la verificación KYC de tu perfil.', reward: 'Acceso a Retiros Mayores', icon: CheckCircle, completed: false, category: 'Perfil' },
  { id: 4, title: 'Refiere a un Amigo', description: 'Invita a un amigo y que complete su primer depósito.', reward: '$20 Bonus por Amigo', icon: Users, completed: false, category: 'Referidos' },
  { id: 5, title: 'Completa 10 Trades', description: 'Realiza 10 operaciones en el simulador de trading.', reward: '$1000 Saldo Virtual Extra', icon: Zap, completed: false, category: 'Trading' },
  { id: 6, title: 'Lealtad Mensual', description: 'Mantén una inversión activa por 30 días consecutivos.', reward: '2% Bonus sobre Ganancias', icon: Star, completed: false, category: 'Lealtad' },
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

// helpers para parsear el reward
const parseDollarBonus = (rewardStr = '') => {
  const m = rewardStr.match(/\$(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
};
const isDemoBonus = (rewardStr = '') => /saldo\s*virtual/i.test(rewardStr);

const TX_TABLE = 'wallet_transactions';

export default function RewardsPage() {
  const { user, refreshBalances } = useAuth();
  const { playSound } = useSound();

  const keyTasks = user?.id ? `crypto_rewards_tasks_${user.id}` : null;
  const keyClaim = user?.id ? `crypto_claimed_rewards_${user.id}` : null;

  const [tasks, setTasks] = useState(() => {
    const raw = keyTasks ? localStorage.getItem(keyTasks) : null;
    const base = raw ? safeParse(raw, initialTasks) : initialTasks;
    return restoreIcons(base);
  });

  const [claimedRewards, setClaimedRewards] = useState(() => {
    const raw = keyClaim ? localStorage.getItem(keyClaim) : null;
    return raw ? safeParse(raw, []) : [];
  });

  useEffect(() => {
    if (!keyTasks) return;
    const toSave = tasks.map(({ icon, ...rest }) => rest); // guardamos sin la función
    localStorage.setItem(keyTasks, JSON.stringify(toSave));
  }, [tasks, keyTasks]);

  useEffect(() => {
    if (!keyClaim) return;
    localStorage.setItem(keyClaim, JSON.stringify(claimedRewards));
  }, [claimedRewards, keyClaim]);

  // --- Acredita recompensa en Supabase ---
  const creditReward = async (task) => {
    if (!user?.id) return;

    // DEMO bonus (ej: "$1000 Saldo Virtual Extra")
    if (isDemoBonus(task.reward)) {
      const addDemo = parseDollarBonus(task.reward) || 1000;

      // leer (si no hay fila, row = null)
      const { data: row, error: selErr } = await supabase
        .from('balances')
        .select('demo_balance')
        .eq('user_id', user.id)
        .maybeSingle();
      if (selErr) throw selErr;

      if (!row) {
        const { error: upErr } = await supabase
          .from('balances')
          .upsert({ user_id: user.id, usdc: 0, demo_balance: addDemo, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
        if (upErr) throw upErr;
      } else {
        const newDemo = Number(row?.demo_balance || 0) + addDemo;
        const { error: updErr } = await supabase
          .from('balances')
          .update({ demo_balance: newDemo, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        if (updErr) throw updErr;
      }

      return; // demo no genera transacción real
    }

    // USDC real bonus (ej: "$5 Bonus")
    const addUsdc = parseDollarBonus(task.reward);
    if (addUsdc <= 0) return;

    const { data: row, error: selErr } = await supabase
      .from('balances')
      .select('usdc')
      .eq('user_id', user.id)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!row) {
      const { error: upErr } = await supabase
        .from('balances')
        .upsert({ user_id: user.id, usdc: addUsdc, demo_balance: 0, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (upErr) throw upErr;
    } else {
      const newUsdc = Number(row?.usdc || 0) + addUsdc;
      const { error: updErr } = await supabase
        .from('balances')
        .update({ usdc: newUsdc, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (updErr) throw updErr;
    }

    // registro en historial
    await supabase.from(TX_TABLE).insert({
      user_id: user.id,
      type: 'reward',
      amount: addUsdc,
      status: 'completed',
      description: `Recompensa: ${task.title}`,
    });
  };

  const handleClaimReward = async (taskId) => {
    playSound('success');
    const task = tasks.find(t => t.id === taskId);

    if (!task) return;
    if (task.completed) {
      toast({ title: 'Tarea ya completada', description: `Ya reclamaste "${task.title}".`, variant: 'destructive' });
      return;
    }

    // Optimista en UI
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: true } : t));
    const claimedAt = new Date().toISOString();
    setClaimedRewards(prev => [...prev, { id: task.id, title: task.title, reward: task.reward, claimedAt }]);

    try {
      await creditReward(task);
      // refresca el header si el contexto lo permite
      try { await refreshBalances?.(); } catch {}

      toast({
        title: '¡Recompensa Reclamada!',
        description: `Has reclamado "${task.reward}" por completar "${task.title}".`
      });
    } catch (e) {
      // revertir si falla
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: false } : t));
      setClaimedRewards(prev => prev.filter(r => !(r.id === task.id && r.claimedAt === claimedAt)));

      console.error('Error acreditando recompensa:', e?.message || e);
      playSound('error');
      toast({
        title: 'No se pudo acreditar',
        description: e?.message || 'Intenta nuevamente.',
        variant: 'destructive'
      });
    }
  };

  const categories = [...new Set(tasks.map(task => task.category))];

  return (
    <>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <Gift className="h-8 w-8 mr-3 text-yellow-400" />
            Centro de Recompensas
          </h1>
          <p className="text-slate-300">Completa tareas y gana recompensas exclusivas para potenciar tus inversiones.</p>
        </motion.div>

        {categories.map((category, i) => (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 * i }}
          >
            <h2 className="text-2xl font-semibold text-purple-300 mb-4 mt-6">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tasks.filter(task => task.category === category).map((task) => {
                const Icon = typeof task.icon === 'function' ? task.icon : Gift;
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
                      <p className="text-green-400 font-semibold">Recompensa: {task.reward}</p>
                    </CardContent>
                    <CardFooter>
                      <Button
                        onClick={() => handleClaimReward(task.id)}
                        disabled={task.completed}
                        className={`w-full ${task.completed ? 'bg-green-700 hover:bg-green-800 cursor-not-allowed' : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600'}`}
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
                  {claimedRewards.map(reward => (
                    <li key={`${reward.id}-${reward.claimedAt}`} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-md">
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
}
      