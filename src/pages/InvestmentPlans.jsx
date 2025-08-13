// src/pages/InvestmentPlans.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  TrendingUp,
  Clock,
  DollarSign,
  CheckCircle,
  Star,
  Zap,
  ShoppingBag
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

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

export default function InvestmentPlans() {
  const { investmentPlans: defaultPlans, cryptoPrices } = useData();
  const { user, balances, buyPlan } = useAuth();
  const { playSound } = useSound();

  // agrego lista de monedas aceptadas por plan
  const investmentPlans = (defaultPlans || []).map((plan) => ({
    ...plan,
    currencies: ['USDT', 'BTC', 'ETH'],
  }));

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('USDT');
  const [isInvesting, setIsInvesting] = useState(false);

  const calculateEquivalentValue = (amount, currency) => {
    const a = Number(amount || 0);
    if (!a) return 0;
    if (currency === 'USDT') return a;
    const price = Number(cryptoPrices?.[currency]?.price ?? 0);
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
      toast({
        title: 'Error',
        description: 'Selecciona un plan e ingresa un monto.',
        variant: 'destructive',
      });
      return;
    }

    const amount = Number(investmentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      playSound('error');
      toast({ title: 'Monto inválido', description: 'Ingresa un monto válido.', variant: 'destructive' });
      return;
    }

    // Convertimos a USD para la RPC
    let amountInUSD = amount;
    if (selectedCurrency !== 'USDT') {
      const price = Number(cryptoPrices?.[selectedCurrency]?.price ?? 0);
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

    // Validaciones de rango
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

    // Chequeo previo de fondos (la RPC también valida y aborta atómicamente)
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
      // ✅ Llamada atómica: debita saldo, crea investment y registra transacción
      await buyPlan({
        planName: selectedPlan.name,
        amount: amountInUSD,
        dailyReturn: Number(selectedPlan.dailyReturn || 0),
        durationDays: Number(selectedPlan.duration || 0),
      });

      toast({
        title: '¡Inversión exitosa!',
        description: `Invertiste ${fmt(amount)} ${selectedCurrency} (≈ $${fmt(amountInUSD)}) en ${selectedPlan.name}.`,
      });

      // reset modal
      setSelectedPlan(null);
      setInvestmentAmount('');
      setSelectedCurrency('USDT');
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
                      playSound('click');
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
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  placeholder={`Ej: ${
                    selectedCurrency === 'USDT' ? '100' : selectedCurrency === 'BTC' ? '0.01' : '0.1'
                  }`}
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
                      {fmt(investmentAmount, selectedCurrency === 'USDT' ? 2 : 8)}
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
