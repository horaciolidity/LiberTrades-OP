// src/pages/TradingBotsPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bot, Zap, TrendingUp, BarChart2, DollarSign, Activity, CheckCircle, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

const tradingBots = [
  {
    id: 1, name: 'Bot Conservador Alfa', strategy: 'Bajo Riesgo, Ingresos Estables',
    monthlyReturn: '~5-8%', minInvestment: 250, pairs: ['BTC/USDT', 'ETH/USDT'],
    icon: BarChart2, color: 'text-blue-400', bgColor: 'bg-blue-500/10',
    features: ['Stop-loss dinámico', 'Análisis de sentimiento básico', 'Rebalanceo semanal']
  },
  {
    id: 2, name: 'Bot Agresivo Beta', strategy: 'Alto Riesgo, Alto Rendimiento Potencial',
    monthlyReturn: '~15-25%', minInvestment: 1000, pairs: ['ALTCOINS/USDT', 'MEMES/USDT'],
    icon: Zap, color: 'text-red-400', bgColor: 'bg-red-500/10',
    features: ['Trading de alta frecuencia', 'Detección de pumps', 'Scalping en M1/M5']
  },
  {
    id: 3, name: 'Bot Balanceado Gamma', strategy: 'Riesgo Moderado, Crecimiento Constante',
    monthlyReturn: '~8-12%', minInvestment: 500, pairs: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT'],
    icon: TrendingUp, color: 'text-green-400', bgColor: 'bg-green-500/10',
    features: ['Grid trading', 'Dollar Cost Averaging (DCA)', 'Seguimiento de tendencia']
  },
];

export default function TradingBotsPage() {
  const { user, balances, refreshBalances } = useAuth(); // refreshBalances es opcional
  const { playSound } = useSound();
  const [selectedBot, setSelectedBot] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleActivateBot = async () => {
    playSound('click');

    if (!user?.id) {
      playSound('error');
      toast({ title: 'Sin sesión', description: 'Inicia sesión para activar un bot.', variant: 'destructive' });
      return;
    }
    if (!selectedBot || !investmentAmount) {
      playSound('error');
      toast({ title: 'Error', description: 'Selecciona un bot e ingresa un monto.', variant: 'destructive' });
      return;
    }

    const amount = Number(investmentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      playSound('error');
      toast({ title: 'Monto inválido', description: 'Ingresa un número válido.', variant: 'destructive' });
      return;
    }
    if (amount < Number(selectedBot.minInvestment)) {
      playSound('error');
      toast({
        title: 'Monto insuficiente',
        description: `El mínimo para ${selectedBot.name} es $${fmt(selectedBot.minInvestment)}.`,
        variant: 'destructive'
      });
      return;
    }
    const currentUsdc = Number(balances?.usdc ?? 0);
    if (amount > currentUsdc) {
      playSound('error');
      toast({ title: 'Saldo insuficiente', description: 'No tienes suficiente saldo en la app.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    playSound('invest');

    try {
      // 1) Crear activación
      const { error: actErr } = await supabase
        .from('bot_activations')
        .insert({
          user_id: user.id,
          bot_id: selectedBot.id,
          bot_name: selectedBot.name,
          strategy: selectedBot.strategy,
          amount_usd: amount,
          status: 'active',
        });
      if (actErr) throw actErr;

      // 2) Descontar saldo
      const newUsdc = Math.max(0, currentUsdc - amount);
      const { error: balErr } = await supabase
        .from('balances')
        .update({ usdc: newUsdc, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (balErr) throw balErr;

      // 3) Registrar en historial
      const { error: txErr } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: user.id,
          type: 'bot_activation',
          status: 'completed',
          amount: amount,
          description: `Activación ${selectedBot.name}`,
        });
      if (txErr) throw txErr;

      // 4) Refrescar saldo en el UI (si está disponible)
      if (typeof refreshBalances === 'function') {
        try { await refreshBalances(); } catch {}
      }

      toast({
        title: '¡Bot activado!',
        description: `Activaste ${selectedBot.name} con $${fmt(amount)}.`,
      });
      setSelectedBot(null);
      setInvestmentAmount('');
    } catch (e) {
      console.error(e);
      playSound('error');
      toast({
        title: 'Error al activar',
        description: e?.message || 'No se pudo completar la activación.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <Bot className="h-8 w-8 mr-3 text-purple-400" />
            Bots de Trading Automatizado
          </h1>
          <p className="text-slate-300">Maximiza tus ganancias con nuestros bots de trading inteligentes.</p>
        </motion.div>

        {/* Saldo */}
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

        {/* Cards de bots */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tradingBots.map((bot, index) => {
            const Icon = bot.icon;
            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className={`crypto-card h-full flex flex-col border-l-4 ${bot.bgColor.replace('bg-', 'border-')}`}>
                  <CardHeader>
                    <div className="flex items-center space-x-3 mb-2">
                      <div className={`p-2 rounded-lg ${bot.bgColor}`}>
                        <Icon className={`h-6 w-6 ${bot.color}`} />
                      </div>
                      <CardTitle className={`text-xl ${bot.color}`}>{bot.name}</CardTitle>
                    </div>
                    <CardDescription className="text-slate-300">{bot.strategy}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-grow">
                    <div className="flex items-baseline">
                      <p className="text-3xl font-bold text-white">{bot.monthlyReturn}</p>
                      <p className="text-sm text-slate-400 ml-1">/mes (Estimado)</p>
                    </div>
                    <div className="text-sm text-slate-400">
                      <DollarSign className="inline h-4 w-4 mr-1 text-green-400" />
                      Mínimo: <span className="font-semibold text-white">${bot.minInvestment}</span>
                    </div>
                    <div className="text-sm text-slate-400">
                      <Activity className="inline h-4 w-4 mr-1 text-purple-400" />
                      Pares: <span className="font-semibold text-white">{bot.pairs.join(', ')}</span>
                    </div>
                    <div className="pt-2">
                      <p className="text-sm font-medium text-white mb-1">Características:</p>
                      <ul className="space-y-1">
                        {bot.features.map((feature) => (
                          <li key={feature} className="flex items-center text-xs text-slate-300">
                            <CheckCircle className="h-3 w-3 mr-2 text-green-500 shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      onClick={() => { playSound('click'); setSelectedBot(bot); setInvestmentAmount(''); }}
                      className={`w-full bg-gradient-to-r ${
                        bot.bgColor.includes('blue') ? 'from-blue-500 to-cyan-500'
                        : bot.bgColor.includes('red') ? 'from-red-500 to-pink-500'
                        : 'from-green-500 to-teal-500'
                      } hover:opacity-90`}
                    >
                      Activar Bot
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Modal */}
        {selectedBot && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedBot(null)}
          >
            <Card className="crypto-card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <div className="flex items-center space-x-3 mb-2">
                  <div className={`p-2 rounded-lg ${selectedBot.bgColor}`}>
                    <selectedBot.icon className={`h-6 w-6 ${selectedBot.color}`} />
                  </div>
                  <CardTitle className={`text-xl ${selectedBot.color}`}>{selectedBot.name}</CardTitle>
                </div>
                <CardDescription className="text-slate-300">{selectedBot.strategy}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-white">
                  Rendimiento Mensual Estimado: <span className="font-bold">{selectedBot.monthlyReturn}</span>
                </p>
                <p className="text-white">
                  Inversión Mínima: <span className="font-bold">${selectedBot.minInvestment}</span>
                </p>
                <div className="space-y-2">
                  <Label className="text-white">Monto a Invertir (USD)</Label>
                  <Input
                    type="number"
                    value={investmentAmount}
                    onChange={(e) => setInvestmentAmount(e.target.value)}
                    placeholder={`Mínimo $${selectedBot.minInvestment}, Disponible: $${fmt(balances?.usdc ?? 0)}`}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
                <Button
                  onClick={handleActivateBot}
                  disabled={isSubmitting || !investmentAmount}
                  className={`w-full bg-gradient-to-r ${
                    selectedBot.bgColor.includes('blue') ? 'from-blue-500 to-cyan-500'
                    : selectedBot.bgColor.includes('red') ? 'from-red-500 to-pink-500'
                    : 'from-green-500 to-teal-500'
                  } hover:opacity-90`}
                >
                  {isSubmitting ? 'Procesando…' : `Activar ${selectedBot.name}`}
                </Button>
                <Button variant="outline" onClick={() => setSelectedBot(null)} className="w-full">
                  Cancelar
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </>
  );
}
