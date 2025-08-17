import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle,
  Star,
  Zap,
  ShoppingBag,
  Activity,
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

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

// Precio compatible con shapes distintos de cryptoPrices
const getPrice = (cryptoPrices, symbol) => {
  if (!symbol) return 0;
  const s = String(symbol).toUpperCase();
  if (s === 'USDC') return 1; // estable en UI
  const v = cryptoPrices?.[s];
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const cand = v.price ?? v.usd ?? v.last ?? v.value;
    return Number(cand) || 0;
  }
  return 0;
};

// Barra de progreso simple (evita depender de otros componentes)
function ProgressBar({ value }) {
  const v = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="w-full h-2 rounded bg-slate-800 overflow-hidden">
      <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export default function InvestmentPlans() {
  const { investmentPlans: defaultPlans, cryptoPrices, addTransaction, addInvestment } = useData(); // TODO: si addTransaction/addInvestment no existe en DataContext, se ignora.
  const { user, balances, refreshBalances } = useAuth();
  const { playSound } = useSound();

  // Compat: los planes aceptan estas monedas
  const investmentPlans = (defaultPlans || []).map((plan) => ({
    ...plan,
    currencies: ['USDC', 'BTC', 'ETH'],
  }));

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('USDC');
  const [isInvesting, setIsInvesting] = useState(false);

  // -------- Mis inversiones (tiempo real) --------
  const [myInvestments, setMyInvestments] = useState([]);
  const [nowTick, setNowTick] = useState(Date.now());

  // Carga inicial
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('investments')
        .select('id, user_id, plan_name, amount, daily_return, duration, status, currency_input, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.error(error);
        return;
      }
      if (!cancel) setMyInvestments(Array.isArray(data) ? data : []);
    };
    load();
    return () => { cancel = true; };
  }, [user?.id]);

  // Realtime: cambios en mis inversiones
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('investments-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setMyInvestments((prev) => {
            const old = Array.isArray(prev) ? prev : [];
            switch (payload.eventType) {
              case 'INSERT':
                return [payload.new, ...old];
              case 'UPDATE':
                return old.map((r) => (r.id === payload.new.id ? payload.new : r));
              case 'DELETE':
                return old.filter((r) => r.id !== payload.old.id);
              default:
                return old;
            }
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  // Tick para actualizar progreso/ganancias en pantalla
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Helpers de cálculo por inversión
  const dayMs = 86_400_000;
  const calcProgressFor = (row) => {
    const start = new Date(row?.created_at || Date.now()).getTime();
    const elapsedDays = Math.max(0, Math.floor((nowTick - start) / dayMs));
    const cappedDays = Math.min(Number(row?.duration || 0), elapsedDays);
    const pct = Number(row?.duration || 0) > 0 ? (cappedDays / Number(row.duration)) * 100 : 0;
    const accrued = Number(row?.amount || 0) * (Number(row?.daily_return || 0) / 100) * cappedDays;
    return { elapsedDays, cappedDays, pct, accrued };
  };

  // Agregado por plan (para pintar debajo de cada card)
  const aggByPlan = useMemo(() => {
    const map = new Map();
    for (const inv of myInvestments) {
      const key = inv.plan_name || '—';
      const prev = map.get(key) || { totalAmount: 0, totalAccrued: 0, totalDurationDays: 0, items: [] };
      const { pct, accrued, cappedDays } = calcProgressFor(inv);
      prev.totalAmount += Number(inv.amount || 0);
      prev.totalAccrued += accrued;
      prev.totalDurationDays += Number(inv.duration || 0);
      prev.items.push({ ...inv, pct, accrued, cappedDays });
      map.set(key, prev);
    }
    return map;
  }, [myInvestments, nowTick]);

  const calculateEquivalentValue = (amount, currency) => {
    const a = Number(amount || 0);
    if (!a) return 0;
    if (currency === 'USDC') return a;
    const price = getPrice(cryptoPrices, currency);
    return price > 0 ? a * price : 0;
  };

  const handleInvest = async () => {
    if (!user?.id) {
      playSound('error');
      toast({ title: 'Sin sesión', description: 'Inicia sesión para invertir.', variant: 'destructive' });
      return;
    }
    if (!selectedPlan || !investmentAmount) {
      playSound('error');
      toast({ title: 'Error', description: 'Selecciona un plan e ingresa un monto.', variant: 'destructive' });
      return;
    }

    const amount = Number(investmentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      playSound('error');
      toast({ title: 'Monto inválido', description: 'Ingresa un monto válido.', variant: 'destructive' });
      return;
    }

    let amountInUSD = amount;
    if (selectedCurrency !== 'USDC') {
      const price = getPrice(cryptoPrices, selectedCurrency);
      if (!price) {
        playSound('error');
        toast({
          title: 'Error de Precio',
          description: `No se pudo obtener el precio de ${selectedCurrency}.`,
          variant: 'destructive',
        });
        return;
      }
      amountInUSD = amount * price;
    }

    const min = Number(selectedPlan?.minAmount || 0);
    const max = Number(selectedPlan?.maxAmount || 0);
    if (amountInUSD < min || (max > 0 && amountInUSD > max)) {
      playSound('error');
      toast({
        title: 'Monto inválido',
        description: `El monto en USD ($${fmt(amountInUSD)}) debe estar entre $${fmt(min)} y $${fmt(max)}.`,
        variant: 'destructive',
      });
      return;
    }

    const currentUsdc = Number(balances?.usdc ?? 0);
    if (amountInUSD > currentUsdc) {
      playSound('error');
      toast({
        title: 'Fondos insuficientes',
        description: 'No tienes suficiente saldo en la app para esta inversión.',
        variant: 'destructive',
      });
      return;
    }

    setIsInvesting(true);
    playSound('invest');

    try {
      // Guardar inversión (devolvemos fila creada)
      const { data: inserted, error: invErr } = await supabase
        .from('investments')
        .insert({
          user_id: user.id,
          plan_name: selectedPlan.name,
          amount: amountInUSD,
          daily_return: selectedPlan.dailyReturn,
          duration: selectedPlan.duration,
          currency_input: selectedCurrency,
        })
        .select('id, user_id, plan_name, amount, daily_return, duration, status, currency_input, created_at')
        .single();
      if (invErr) throw invErr;

      // Debitar del saldo (USDC)
      const newUsdc = Math.max(0, currentUsdc - amountInUSD);
      const { error: balErr } = await supabase
        .from('balances')
        .update({ usdc: newUsdc, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (balErr) throw balErr;

      // Registrar en historial (wallet_transactions) para que aparezca en /history y métricas del Dashboard/Estadísticas
      const txPayload = {
        user_id: user.id,
        amount: amountInUSD,
        type: 'investment_purchase',
        status: 'completed',
        currency: 'USDC',
        description: `Compra de plan ${selectedPlan.name}`,
        reference_type: 'investment',
        reference_id: inserted?.id || null,
      };
      const { error: txErr } = await supabase.from('wallet_transactions').insert(txPayload);
      if (txErr) {
        // No rompemos el flujo por historial (RLS puede bloquear); solo avisamos en consola.
        console.warn('wallet_transactions insert warning:', txErr?.message || txErr);
      }

      // Intentar refrescar estados globales si existen helpers
      if (typeof addInvestment === 'function' && inserted) {
        try { addInvestment(inserted); } catch { /* noop */ }
      }
      if (typeof addTransaction === 'function') {
        try { addTransaction({ ...txPayload, created_at: new Date().toISOString() }); } catch { /* noop */ }
      }
      if (typeof refreshBalances === 'function') {
        try { await refreshBalances(); } catch { /* noop */ }
      }

      toast({
        title: '¡Inversión exitosa!',
        description: `Invertiste ${fmt(amount)} ${selectedCurrency} (≈ $${fmt(amountInUSD)}) en ${selectedPlan.name}.`,
      });

      // Cerrar modal y limpiar
      setSelectedPlan(null);
      setInvestmentAmount('');
      setSelectedCurrency('USDC');

      // Añadir inmediatamente a mi estado local (por si Realtime demora)
      if (inserted) {
        setMyInvestments((prev) => [inserted, ...(prev || [])]);
      }
    } catch (error) {
      console.error('Error al invertir:', error?.message || error);
      playSound('error');
      toast({
        title: 'Error de Inversión',
        description: error?.message || 'Hubo un problema al procesar tu inversión.',
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

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <h1 className="text-3xl font-bold text-white mb-2">Planes de Inversión</h1>
        <p className="text-slate-300">Elige el plan que mejor se adapte a tu perfil de inversor.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}>
        <Card className="crypto-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Saldo Disponible (App)</p>
                <p className="text-3xl font-bold text-green-400 mt-1">${fmt(balances?.usdc ?? 0)}</p>
              </div>
              <div className="p-4 rounded-lg bg-green-500/10">
                <Wallet className="h-8 w-8 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(investmentPlans || []).map((plan, index) => {
          const Icon = getPlanIcon(plan.name);
          const isSelected = selectedPlan?.id === plan.id;

          // Datos agregados de mis inversiones de este plan
          const agg = aggByPlan.get(plan.name);
          const count = agg?.items?.length || 0;
          const sumAmount = agg?.totalAmount || 0;
          const sumAccrued = agg?.totalAccrued || 0;

          // Progreso promedio (si hay varias compras del mismo plan). // TODO: ofrecer vista detallada por compra.
          const avgPct =
            count > 0
              ? Math.min(
                  100,
                  agg.items.reduce((s, it) => s + (Number(it.pct) || 0), 0) / count
                )
              : 0;

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
                  playSound('click');
                  setSelectedPlan(plan);
                  setSelectedCurrency('USDC');
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
                    <div className="text-3xl font-bold text-green-400">{plan.dailyReturn}%</div>
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

                  {/* Bloque dinámico si tengo compras de este plan */}
                  {count > 0 && (
                    <div className="mt-2 p-3 rounded-lg bg-slate-800/60 text-left">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-300 text-sm flex items-center gap-1">
                          <Activity className="h-4 w-4 text-cyan-300" /> Seguimiento en tiempo real
                        </span>
                        <span className="text-xs text-slate-400">{count} compra{count > 1 ? 's' : ''}</span>
                      </div>
                      <div className="text-sm flex justify-between">
                        <span className="text-slate-400">Invertido total</span>
                        <span className="text-white font-semibold">${fmt(sumAmount)}</span>
                      </div>
                      <div className="text-sm flex justify-between">
                        <span className="text-slate-400">Ganancia acumulada</span>
                        <span className="text-green-400 font-semibold">+${fmt(sumAccrued)}</span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar value={avgPct} />
                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                          <span>Progreso</span>
                          <span>{fmt(avgPct, 1)}%</span>
                        </div>
                      </div>
                    </div>
                  )}

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
                      playSound('click');
                      setSelectedPlan(plan);
                      setSelectedCurrency('USDC');
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
              <CardDescription className="text-slate-300">
                Ingresa el monto en la moneda seleccionada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-white">Moneda de Inversión</Label>
                <Select
                  value={selectedCurrency}
                  onValueChange={(value) => {
                    playSound('click');
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
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  placeholder={`Ej: ${selectedCurrency === 'USDC' ? '100' : selectedCurrency === 'BTC' ? '0.01' : '0.1'}`}
                  className="bg-slate-800 border-slate-600 text-white"
                />
                {investmentAmount && (
                  <p className="text-xs text-slate-400">
                    Equivalente a: ${fmt(calculateEquivalentValue(investmentAmount, selectedCurrency), 2)} USD
                  </p>
                )}
              </div>

              {investmentAmount && (
                <div className="bg-slate-800/50 p-4 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Inversión ({selectedCurrency}):</span>
                    <span className="text-white">
                      {fmt(investmentAmount, selectedCurrency === 'USDC' ? 2 : 8)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Equivalente USD:</span>
                    <span className="text-white">
                      ${fmt(calculateEquivalentValue(investmentAmount, selectedCurrency), 2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Retorno diario (USD):</span>
                    <span className="text-green-400">
                      $
                      {fmt(
                        calculateEquivalentValue(investmentAmount, selectedCurrency) *
                          Number(selectedPlan.dailyReturn || 0) /
                          100,
                        2
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Retorno total (USD):</span>
                    <span className="text-green-400 font-semibold">
                      $
                      {fmt(
                        calculateEquivalentValue(investmentAmount, selectedCurrency) *
                          Number(selectedPlan.dailyReturn || 0) *
                          Number(selectedPlan.duration || 0) /
                          100,
                        2
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex space-x-4">
                <Button onClick={() => { playSound('click'); setSelectedPlan(null); }} variant="outline" className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={handleInvest} disabled={isInvesting || !investmentAmount} className="flex-1 bg-gradient-to-r from-green-500 to-blue-500">
                  {isInvesting ? 'Procesando...' : 'Invertir Ahora'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
