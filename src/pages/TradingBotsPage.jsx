import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Bot,
  Zap,
  TrendingUp,
  BarChart2,
  DollarSign,
  Activity,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';

const tradingBots = [
  {
    id: 1,
    name: 'Bot Conservador Alfa',
    strategy: 'Bajo Riesgo, Ingresos Estables',
    monthlyReturn: '~5-8%',
    minInvestment: 250,
    pairs: ['BTC/USDT', 'ETH/USDT'],
    icon: BarChart2,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    features: ['Stop-loss dinámico', 'Análisis de sentimiento básico', 'Rebalanceo semanal'],
  },
  {
    id: 2,
    name: 'Bot Agresivo Beta',
    strategy: 'Alto Riesgo, Alto Rendimiento Potencial',
    monthlyReturn: '~15-25%',
    minInvestment: 1000,
    pairs: ['ALTCOINS/USDT', 'MEMES/USDT'],
    icon: Zap,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    features: ['Trading de alta frecuencia', 'Detección de pumps', 'Scalping en M1/M5'],
  },
  {
    id: 3,
    name: 'Bot Balanceado Gamma',
    strategy: 'Riesgo Moderado, Crecimiento Constante',
    monthlyReturn: '~8-12%',
    minInvestment: 500,
    pairs: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT'],
    icon: TrendingUp,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    features: ['Grid trading', 'Dollar Cost Averaging (DCA)', 'Seguimiento de tendencia'],
  },
];

const TradingBotsPage = () => {
  const { balances, refreshBalances } = useAuth();
  const { playSound } = useSound();

  const {
    botActivations,
    activateBot,
    pauseBot,
    resumeBot,
    cancelBot,
    refreshBotActivations,
  } = useData();

  const [selectedBot, setSelectedBot] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');

  const handleActivateBot = async () => {
    try {
      playSound?.('invest');
      if (!selectedBot || !investmentAmount) {
        toast({
          title: 'Error',
          description: 'Selecciona un bot e ingresa un monto.',
          variant: 'destructive',
        });
        return;
      }
      const amount = parseFloat(investmentAmount);
      if (Number.isNaN(amount) || amount <= 0) {
        toast({
          title: 'Monto inválido',
          description: 'Ingresa un monto válido.',
          variant: 'destructive',
        });
        return;
      }
      if (amount < selectedBot.minInvestment) {
        toast({
          title: 'Monto insuficiente',
          description: `El mínimo para ${selectedBot.name} es $${selectedBot.minInvestment}.`,
          variant: 'destructive',
        });
        return;
      }

      const res = await activateBot({
        botId: selectedBot.id,
        botName: selectedBot.name,
        strategy: selectedBot.strategy,
        amountUsd: amount,
      });

      if (res?.code === 'INSUFFICIENT_FUNDS') {
        toast({
          title: 'Saldo insuficiente',
          description: `Te faltan $${Number(res.needed || 0).toFixed(2)} para activar este bot.`,
          variant: 'destructive',
        });
        return;
      }
      if (!res?.ok) {
        toast({
          title: 'No se pudo activar el bot',
          description: res?.msg || 'Intenta nuevamente.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Bot activado',
        description: `${selectedBot.name} activado por $${amount.toFixed(2)}.`,
      });
      setSelectedBot(null);
      setInvestmentAmount('');
      await refreshBotActivations?.();
      await refreshBalances?.();
    } catch (e) {
      console.error('[handleActivateBot]', e);
      toast({
        title: 'Error',
        description: 'Ocurrió un problema inesperado.',
        variant: 'destructive',
      });
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
          <p className="text-slate-300">
            Maximiza tus ganancias con nuestros bots de trading inteligentes.
          </p>
        </motion.div>

        <Card className="crypto-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium">Saldo Disponible en App</p>
                <p className="text-3xl font-bold text-green-400 mt-1">
                  ${Number(balances?.usdc ?? 0).toFixed(2)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-green-500/10">
                <DollarSign className="h-8 w-8 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tradingBots.map((bot, index) => {
            const Icon = bot.icon;
            const gradient = bot.bgColor.includes('blue')
              ? 'from-blue-500 to-cyan-500'
              : bot.bgColor.includes('red')
              ? 'from-red-500 to-pink-500'
              : 'from-green-500 to-teal-500';

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
                      onClick={() => {
                        playSound?.('click');
                        setSelectedBot(bot);
                      }}
                      className={`w-full bg-gradient-to-r ${gradient} hover:opacity-90`}
                    >
                      Activar Bot
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {selectedBot && (() => {
          const ModalIcon = selectedBot.icon;
          const gradient = selectedBot.bgColor.includes('blue')
            ? 'from-blue-500 to-cyan-500'
            : selectedBot.bgColor.includes('red')
            ? 'from-red-500 to-pink-500'
            : 'from-green-500 to-teal-500';

          return (
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
                      <ModalIcon className={`h-6 w-6 ${selectedBot.color}`} />
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
                      placeholder={`Mínimo $${selectedBot.minInvestment}${
                        typeof balances?.usdc === 'number' ? `, Disponible: $${balances.usdc.toFixed(2)}` : ''
                      }`}
                      className="bg-slate-800 border-slate-600 text-white"
                    />
                  </div>
                  <Button onClick={handleActivateBot} className={`w-full bg-gradient-to-r ${gradient} hover:opacity-90`}>
                    Activar {selectedBot.name}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedBot(null)} className="w-full">
                    Cancelar
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">Mis Bots</h2>
          {botActivations.length === 0 ? (
            <div className="opacity-60">Sin activaciones.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {botActivations.map((a) => {
                const amount = a.amountUsd ?? a.amount_usd ?? 0;
                return (
                  <Card key={a.id} className="crypto-card">
                    <CardHeader>
                      <CardTitle className="text-white">{a.botName}</CardTitle>
                      <CardDescription className="text-slate-300">
                        {a.strategy} · ${Number(amount).toFixed(2)} · {a.status}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex gap-2">
                      {a.status === 'active' && (
                        <Button
                          variant="outline"
                          onClick={async () => {
                            const r = await pauseBot(a.id);
                            if (r?.ok) toast({ title: 'Bot pausado' });
                            else toast({ title: 'No se pudo pausar', variant: 'destructive' });
                          }}
                        >
                          Pausar
                        </Button>
                      )}
                      {a.status === 'paused' && (
                        <Button
                          onClick={async () => {
                            const r = await resumeBot(a.id);
                            if (r?.ok) toast({ title: 'Bot reanudado' });
                            else toast({ title: 'No se pudo reanudar', variant: 'destructive' });
                          }}
                        >
                          Reanudar
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          const r = await cancelBot(a.id);
                          if (r?.ok) toast({ title: 'Bot cancelado' });
                          else toast({ title: 'No se pudo cancelar', variant: 'destructive' });
                        }}
                      >
                        Cancelar
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default TradingBotsPage;
