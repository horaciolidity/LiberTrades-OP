// src/pages/InvestmentPlans.jsx
import React, { useMemo, useState } from 'react';
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
  AlertTriangle,
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

export default function InvestmentPlans() {
  const {
    investmentPlans: defaultPlans,
    cryptoPrices = {},
    addInvestment,
    addTransaction,
    refreshInvestments,
    refreshTransactions,
  } = useData();

  const { user, balances } = useAuth();
  const { playSound } = useSound();

  // agrego lista de monedas aceptadas por plan
  const investmentPlans = useMemo(
    () => (defaultPlans || []).map((plan) => ({ ...plan, currencies: ['USDT', 'BTC', 'ETH'] })),
    [defaultPlans]
  );

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('USDT');
  const [isInvesting, setIsInvesting] = useState(false);

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
    // Quick buttons usando saldo USD de la app
    const usd = usdBalance * pct;
    const inCurr = fromUsd(usd, selectedCurrency);
    setInvestmentAmount(
      selectedCurrency === 'USDT' ? fmt(inCurr, 2) : fmt(inCurr, 8)
    );
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
      toast({ title: 'Precio no disponible', description: `No se pudo obtener el precio de ${selectedCurrency}.`, variant: 'destructive' });
      return;
    }

    const amountInUSD = amt * price;
    const min = Number(selectedPlan?.minAmount || 0);
    const max = Number(selectedPlan?.maxAmount || 0);

    if (amountInUSD < min || (Number.isFinite(max) && max > 0 && amountInUSD > max)) {
      playSound?.('error');
      toast({
        title: 'Monto fuera de rango',
        description: `El monto en USD ($${fmt(amountInUSD)}) debe estar entre $${fmt(min)} y $${fmt(max)}.`,
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
      // 1) Crear inversión usando el DataContext (inserta en DB y mapea para la UI)
      const inv = await addInvestment?.({
        planName: selectedPlan.name,
        amount: amountInUSD,
        dailyReturn: selectedPlan.dailyReturn,
        duration: selectedPlan.duration,
        currency: selectedCurrency, // guarda en qué moneda el usuario ingresó
      });

      if (!inv) throw new Error('No se pudo crear la inversión');

      // 2) Registrar el movimiento en el wallet (plan_purchase) para el historial
      await addTransaction?.({
        amount: amountInUSD,
        type: 'plan_purchase',
        currency: 'USDC', // la app descuenta USD del saldo interno
        description: `Compra de ${selectedPlan.name} (${fmt(amt, selectedCurrency === 'USDT' ? 2 : 8)} ${selectedCurrency} ≈ $${fmt(amountInUSD)})`,
        referenceType: 'investment',
        referenceId: inv.id,
        status: 'completed',
      });

      // 3) Descontar el saldo interno en la tabla balances (USDC)
      const { error: balErr } = await supabase
        .from('balances')
        .update({ usdc: Math.max(0, usdBalance - amountInUSD), updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      if (balErr) {
        // No frenamos la UX si falló, pero avisamos
        console.error('[balances update] error:', balErr);
      }

      // 4) Refresh listas para reflejar en UI
      await Promise.all([refreshInvestments?.(), refreshTransactions?.()]);

      toast({
        title: '¡Inversión exitosa!',
        description: `Invertiste ${fmt(amt, selectedCurrency === 'USDT' ? 2 : 8)} ${selectedCurrency} (≈ $${fmt(amountInUSD)}) en ${selectedPlan.name}.`,
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

  const minWarning =
    selectedPlan && amountUsd > 0 && amountUsd < Number(selectedPlan.minAmount || 0);
  const maxWarning =
    selectedPlan &&
    Number(selectedPlan.maxAmount || 0) > 0 &&
    amountUsd > Number(selectedPlan.maxAmount);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <h1 className="text-3xl font-bold text-white mb-2">Planes de Inversión</h1>
        <p className="text-slate-300">Elegí el plan que mejor se adapte a tu perfil de inversor.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}>
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
                Ingresá el monto en la moneda seleccionada.
              </CardDescription>
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
                  placeholder={`Ej: ${
                    selectedCurrency === 'USDT' ? '100' : selectedCurrency === 'BTC' ? '0.01' : '0.1'
                  }`}
                  className="bg-slate-800 border-slate-600 text-white"
                />
                {investmentAmount && (
                  <p className="text-xs text-slate-400">
                    Equivalente a: ${fmt(amountUsd, 2)} USD
                  </p>
                )}
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-4 gap-2">
                <Button type="button" variant="secondary" className="bg-slate-800 text-slate-200" onClick={() => handleQuickPct(0.25)}>
                  25%
                </Button>
                <Button type="button" variant="secondary" className="bg-slate-800 text-slate-200" onClick={() => handleQuickPct(0.5)}>
                  50%
                </Button>
                <Button type="button" variant="secondary" className="bg-slate-800 text-slate-200" onClick={() => handleQuickPct(0.75)}>
                  75%
                </Button>
                <Button type="button" variant="secondary" className="bg-slate-800 text-slate-200" onClick={() => handleQuickPct(1)}>
                  100%
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={handleMin}>Mínimo</Button>
                <Button type="button" variant="outline" onClick={handleMax}>Máximo</Button>
              </div>

              {/* Resumen */}
              {investmentAmount && (
                <div className="bg-slate-800/50 p-4 rounded-lg space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Inversión ({selectedCurrency}):</span>
                    <span className="text-white">
                      {fmt(investmentAmount, selectedCurrency === 'USDT' ? 2 : 8)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Equivalente USD:</span>
                    <span className="text-white">${fmt(amountUsd, 2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Retorno diario (USD):</span>
                    <span className="text-green-400">
                      $
                      {fmt(
                        amountUsd * Number(selectedPlan.dailyReturn || 0) / 100,
                        2
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Retorno total (USD):</span>
                    <span className="text-green-400 font-semibold">
                      $
                      {fmt(
                        amountUsd *
                          Number(selectedPlan.dailyReturn || 0) *
                          Number(selectedPlan.duration || 0) / 100,
                        2
                      )}
                    </span>
                  </div>

                  {(minWarning || maxWarning) && (
                    <div className="mt-2 flex items-start gap-2 text-amber-300">
                      <AlertTriangle className="h-4 w-4 mt-0.5" />
                      <span>
                        El monto debe estar entre <b>${fmt(selectedPlan.minAmount)}</b> y{' '}
                        <b>${fmt(selectedPlan.maxAmount)}</b> (equivalente en USD).
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
                  disabled={
                    isInvesting ||
                    !investmentAmount ||
                    getPrice(selectedCurrency) <= 0 ||
                    amountUsd <= 0
                  }
                  className="flex-1 bg-gradient-to-r from-green-500 to-blue-500"
                >
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
