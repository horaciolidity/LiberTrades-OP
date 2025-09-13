// src/pages/TradingBotsPage.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Bot as BotIcon,
  Zap,
  TrendingUp,
  BarChart2,
  DollarSign,
  Activity,
  CheckCircle,
  Gauge,
  Wallet,
  Target,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
  XCircle,
  Coins,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { Link } from 'react-router-dom';
import MiniSparkline from '@/components/bots/MiniSparkline';
import { BOT_BRAIN_CLIENT, runBotBrainOnce } from '@/lib/supabaseClient';

/* ========== Helpers ========== */
const fmt = (n, dec = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(dec) : (0).toFixed(dec);
};
const fmtSign = (n, dec = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return (0).toFixed(dec);
  return (v >= 0 ? '+' : '') + v.toFixed(dec);
};
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const parsePctRange = (txt) => {
  const m = String(txt || '').match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const s = String(txt || '').match(/(\d+(?:\.\d+)?)\s*%/);
  if (s) return { min: Number(s[1]), max: Number(s[1]) };
  return { min: 0, max: 0 };
};
const normStatus = (s) => String(s || '').trim().toLowerCase();
const pnlColor = (n) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-slate-200');
const riskBase = (r) => (r === 'Alto' ? 65 : r === 'Medio' ? 45 : 25);

/* ========== Catálogo visible (marketing) ========== */
const tradingBots = [
  {
    id: 1,
    name: 'Bot Conservador Alfa',
    risk: 'Bajo',
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
    risk: 'Alto',
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
    risk: 'Medio',
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

/* ========== Página ========== */
const TradingBotsPage = () => {
  const { user, balances } = useAuth();
  const { playSound } = useSound();

  const {
    botActivations,
    activateBot,
    pauseBot,
    resumeBot,
    cancelBot,
    refreshBotActivations,
    refreshTransactions,
    settings,

    // PnL (desde transacciones)
    getBotPnl,
    totalBotProfit = 0, // bruto
    totalBotFees = 0,   // fees (negativo si descuenta)
    totalBotNet = 0,    // neto

    // Trades live / precios
    listBotTrades,
    subscribeBotTrades,
    getPairInfo,
  } = useData();

  const [selectedBot, setSelectedBot] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [busyActivate, setBusyActivate] = useState(false);
  const [busyById, setBusyById] = useState(() => new Map());
  const [showNet, setShowNet] = useState(true);
  const [busyBrain, setBusyBrain] = useState(false);

  // ====== Trades por activación (para PnL no realizado y par del minigráfico)
  const [tradesByActivation, setTradesByActivation] = useState({});
  const subsRef = useRef({});

  // Fees de cancelación (claves reales + fallbacks)
  const cancelFeePct = Number(
    settings?.['trading.bot_cancel_fee_pct'] ??
    settings?.['trading.bot_rent_fee_pct'] ??
    settings?.['trading.cancel_fee_pct'] ??
    0
  );
  const cancelFeeUsd = Number(
    settings?.['trading.bot_cancel_fee_usd'] ??
    settings?.['trading.cancel_fee_usd'] ??
    0
  );
  const feeParts = [];
  if (cancelFeePct > 0) feeParts.push(`${fmt(cancelFeePct, 2)}%`);
  if (cancelFeeUsd > 0) feeParts.push(`$${fmt(cancelFeeUsd)}`);
  const cancelFeeLabel = feeParts.length ? `Fee cancelación: ${feeParts.join(' + ')}` : null;

  const setRowBusy = useCallback((id, val) => {
    setBusyById((prev) => {
      const m = new Map(prev);
      if (val) m.set(id, true);
      else m.delete(id);
      return m;
    });
  }, []);

  /* ---- Derivados: mis bots ---- */
  const myActiveBots = useMemo(
    () => (botActivations || []).filter((b) => normStatus(b?.status) === 'active'),
    [botActivations]
  );
  const botsAllocated = useMemo(
    () => myActiveBots.reduce((a, b) => a + Number(b?.amountUsd || 0), 0),
    [myActiveBots]
  );
  const botsCount = myActiveBots.length;

  // Estimación mensual de todos los bots activos
  const activeEstimated = useMemo(() => {
    let minSum = 0;
    let maxSum = 0;
    for (const b of myActiveBots) {
      const cat = tradingBots.find((x) => x.name === b.botName);
      const { min, max } = parsePctRange(cat?.monthlyReturn);
      const amt = Number(b?.amountUsd || 0);
      minSum += (min / 100) * amt;
      maxSum += (max / 100) * amt;
    }
    return { min: minSum, max: maxSum };
  }, [myActiveBots]);

  // Objetivos simples para “energía de bots”
  const GOALS = { botsCount: 3, botsUsd: 2000 };
  const pctBotsCount = clamp((botsCount / GOALS.botsCount) * 100);
  const pctBotsUsd = clamp((botsAllocated / GOALS.botsUsd) * 100);
  const energyBots = clamp((pctBotsCount + pctBotsUsd) / 2);

  /* ---- Refresh on mount / user change ---- */
  useEffect(() => {
    if (!user?.id) return;
    refreshBotActivations?.();
    refreshTransactions?.(); // el PnL deriva de transacciones
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const availableUsd = Number(balances?.usdc ?? 0);

  /* ===== Carga & subscripción de trades por activación ===== */
  const loadTrades = useCallback(async (activationId) => {
    try {
      const rows = await listBotTrades?.(activationId, 100);
      setTradesByActivation((prev) => ({ ...prev, [activationId]: rows || [] }));
    } catch {}
  }, [listBotTrades]);

  useEffect(() => {
    (botActivations || []).forEach((a) => {
      const id = a.id;
      if (!id || subsRef.current[id]) return;

      // Seed de trades
      loadTrades(id);

      // Subscribe live
      const ch = subscribeBotTrades?.(id, () => loadTrades(id));
      subsRef.current[id] = ch;
    });

    return () => {
      Object.values(subsRef.current).forEach((ch) => {
        try { ch?.unsubscribe?.(); } catch {}
      });
      subsRef.current = {};
    };
  }, [botActivations, subscribeBotTrades, loadTrades]);

  /* ===== PnL no realizado + par principal por activación ===== */
  const calcUnrealizedAndPair = useCallback((activationId, fallbackName) => {
    const rows = tradesByActivation[activationId] || [];
    let u = 0;
    // Par principal: último trade abierto o primer par del catálogo del bot
    const lastOpen = rows.find((r) => String(r.status).toLowerCase() === 'open');
    let mainPair = lastOpen?.pair;
    if (!mainPair) {
      const cat = tradingBots.find((x) => x.name === fallbackName);
      mainPair = cat?.pairs?.[0] || 'BTC/USDT';
    }

    for (const t of rows) {
      if (String(t.status).toLowerCase() !== 'open') continue;
      const info = getPairInfo?.(t.pair) || {};
      const last = Number(info.price);
      if (!Number.isFinite(last) || !Number.isFinite(Number(t.entry))) continue;

      const sideMul = String(t.side).toLowerCase() === 'short' ? -1 : 1;
      const pct = (last - Number(t.entry)) / Number(t.entry);
      const pnlTrade = sideMul * pct * Number(t.leverage || 1) * Number(t.amount_usd || 0);
      if (Number.isFinite(pnlTrade)) u += pnlTrade;
    }
    return { unrealized: u, mainPair };
  }, [tradesByActivation, getPairInfo]);

  /* ========== Handlers ========== */
  const handleActivateBot = async () => {
    try {
      playSound?.('invest');

      if (!user?.id) {
        toast({ title: 'No autenticado', description: 'Iniciá sesión para continuar.', variant: 'destructive' });
        return;
      }
      if (!selectedBot || !investmentAmount) {
        toast({ title: 'Error', description: 'Seleccioná un bot e ingresá un monto.', variant: 'destructive' });
        return;
      }
      const amount = parseFloat(investmentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast({ title: 'Monto inválido', description: 'Ingresá un monto válido.', variant: 'destructive' });
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
      if (amount > availableUsd) {
        toast({
          title: 'Saldo insuficiente',
          description: `Tu saldo USDC es $${fmt(availableUsd)}. Depositá o reducí el monto.`,
          variant: 'destructive',
        });
        return;
      }

      setBusyActivate(true);
      const res = await activateBot?.({
        botId: selectedBot.id,
        botName: selectedBot.name,
        strategy: selectedBot.strategy,
        amountUsd: amount,
      });

      if (res?.code === 'INSUFFICIENT_FUNDS') {
        toast({
          title: 'Saldo insuficiente',
          description: `Te faltan $${fmt(Number(res?.needed || 0))} para activar este bot.`,
          variant: 'destructive',
        });
        return;
      }
      if (!res?.ok) {
        toast({
          title: 'No se pudo activar el bot',
          description: res?.msg || 'Intentá nuevamente.',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Bot activado',
        description: `${selectedBot.name} activado por $${fmt(amount)}.`,
      });
      setSelectedBot(null);
      setInvestmentAmount('');
      await Promise.all([refreshBotActivations?.(), refreshTransactions?.()]);
    } catch (e) {
      console.error('[handleActivateBot]', e);
      toast({ title: 'Error', description: 'Ocurrió un problema inesperado.', variant: 'destructive' });
    } finally {
      setBusyActivate(false);
    }
  };

  const doPause = async (id) => {
    if (!id) return;
    setRowBusy(id, true);
    try {
      const r = await pauseBot?.(id);
      if (r?.ok) {
        toast({ title: 'Bot pausado' });
        await refreshBotActivations?.();
      } else {
        toast({ title: 'No se pudo pausar', description: r?.msg || '', variant: 'destructive' });
      }
    } catch (e) {
      console.error('[pauseBot]', e);
      toast({ title: 'Error', description: 'No se pudo pausar el bot.', variant: 'destructive' });
    } finally {
      setRowBusy(id, false);
    }
  };

  const doResume = async (id) => {
    if (!id) return;
    setRowBusy(id, true);
    try {
      const r = await resumeBot?.(id);
      if (r?.ok) {
        toast({ title: 'Bot reanudado' });
        await refreshBotActivations?.();
      } else {
        toast({ title: 'No se pudo reanudar', description: r?.msg || '', variant: 'destructive' });
      }
    } catch (e) {
      console.error('[resumeBot]', e);
      toast({ title: 'Error', description: 'No se pudo reanudar el bot.', variant: 'destructive' });
    } finally {
      setRowBusy(id, false);
    }
  };

  const doCancel = async (id) => {
    if (!id) return;
    setRowBusy(id, true);
    try {
      const r = await cancelBot?.(id);
      if (r?.ok) {
        toast({ title: 'Bot cancelado' });
        await Promise.all([refreshBotActivations?.(), refreshTransactions?.()]);
      } else {
        toast({ title: 'No se pudo cancelar', description: r?.msg || '', variant: 'destructive' });
      }
    } catch (e) {
      console.error('[cancelBot]', e);
      toast({ title: 'Error', description: 'No se pudo cancelar el bot.', variant: 'destructive' });
    } finally {
      setRowBusy(id, false);
    }
  };

  const runBrain = async () => {
    if (!BOT_BRAIN_CLIENT) return;
    setBusyBrain(true);
    try {
      await runBotBrainOnce();
      toast({ title: 'Bots actualizados', description: 'Se ejecutó un ciclo del cerebro.' });
      await Promise.all([
        refreshBotActivations?.(),
        refreshTransactions?.(),
        ...(botActivations || []).map((a) => loadTrades(a.id)),
      ]);
    } catch (e) {
      console.error('[bot-brain]', e);
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setBusyBrain(false);
    }
  };

  /* ---- Cantidades rápidas ---- */
  const quickAmounts = useMemo(() => {
    const base = [250, 500, 1000, 2000];
    const extra = availableUsd > 0 ? [Math.min(availableUsd, 5000)] : [];
    return [...base, ...extra.filter((v) => !base.includes(v))];
  }, [availableUsd]);

  // Valores para el toggle del resumen
  const summaryPnlValue = showNet ? totalBotNet : totalBotProfit;
  const summaryPnlLabel = showNet ? 'Ganancias (neto)' : 'Ganancias (bruto)';

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
                <BotIcon className="h-8 w-8 mr-3 text-purple-400" />
                Bots de Trading Automatizado
              </h1>
              <p className="text-slate-300">
                Maximizá tus ganancias con bots inteligentes conectados a tu saldo.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {cancelFeeLabel && (
                <span className="text-[11px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 bg-slate-800/60">
                  {cancelFeeLabel}
                </span>
              )}
              {BOT_BRAIN_CLIENT && (
                <Button onClick={runBrain} variant="outline" disabled={busyBrain} className="shrink-0">
                  <Zap className="w-4 h-4 mr-1" />
                  {busyBrain ? 'Actualizando…' : 'Actualizar bots'}
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Resumen / energía de bots */}
        <Card className="crypto-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-emerald-400" />
                  Estado de tus Bots
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Progreso hacia tus objetivos (cantidad y capital asignado).
                </CardDescription>
              </div>
              {cancelFeeLabel && (
                <span className="hidden md:inline text-[11px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 bg-slate-800/60">
                  {cancelFeeLabel}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-300" />
                  Saldo USDC
                </div>
                <div className="text-2xl text-white font-semibold">${fmt(availableUsd)}</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <BotIcon className="w-4 h-4 text-violet-300" />
                  Bots activos
                </div>
                <div className="text-2xl text-white font-semibold">{botsCount}</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-sky-300" />
                  Capital en bots
                </div>
                <div className="text-2xl text-white font-semibold">${fmt(botsAllocated)}</div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-300" />
                  Estimación mensual
                </div>
                <div className="text-2xl text-white font-semibold">
                  ${fmt(activeEstimated.min)} – ${fmt(activeEstimated.max)}
                </div>
              </div>

              {/* Ganancias con toggle Neto/Bruto */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-green-300" />
                    {summaryPnlLabel}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={showNet ? 'secondary' : 'outline'}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setShowNet(true)}
                    >
                      Neto
                    </Button>
                    <Button
                      size="sm"
                      variant={!showNet ? 'secondary' : 'outline'}
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setShowNet(false)}
                    >
                      Bruto
                    </Button>
                  </div>
                </div>
                <div className={`text-2xl font-semibold ${pnlColor(summaryPnlValue)}`}>
                  {fmtSign(summaryPnlValue)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {showNet ? (
                    <>Bruto: +${fmt(totalBotProfit)} · fees ${fmt(totalBotFees)}</>
                  ) : (
                    <>Neto: {fmtSign(totalBotNet)} · fees ${fmt(totalBotFees)}</>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full h-5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className="flex h-full">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-violet-400"
                  style={{ width: `${(pctBotsCount / 2)}%` }}
                  title={`Bots activos: ${fmt(pctBotsCount, 0)}%`}
                />
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-sky-400"
                  style={{ width: `${(pctBotsUsd / 2)}%` }}
                  title={`Capital asignado: ${fmt(pctBotsUsd, 0)}%`}
                />
              </div>
            </div>
            <div className="text-right text-slate-300 text-sm">
              Energía de bots: <span className="text-white font-semibold">{fmt(energyBots, 0)}%</span>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-300" />
              Las estimaciones son orientativas y pueden variar según condiciones de mercado.
            </div>
          </CardContent>
        </Card>

        {/* Catálogo de bots */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tradingBots.map((bot, index) => {
            const Icon = bot.icon;
            const gradient =
              bot.bgColor.includes('blue')
                ? 'from-blue-500 to-cyan-500'
                : bot.bgColor.includes('red')
                ? 'from-red-500 to-pink-500'
                : 'from-green-500 to-teal-500';

            const { min, max } = parsePctRange(bot.monthlyReturn);
            const exAmount = Math.max(bot.minInvestment, Math.min(availableUsd, bot.minInvestment * 2));
            const estMin = (min / 100) * exAmount;
            const estMax = (max / 100) * exAmount;

            return (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className={`crypto-card h-full flex flex-col border-l-4 ${bot.bgColor.replace('bg-', 'border-')}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className={`p-2 rounded-lg ${bot.bgColor}`}>
                          <Icon className={`h-6 w-6 ${bot.color}`} />
                        </div>
                        <CardTitle className={`text-xl ${bot.color}`}>{bot.name}</CardTitle>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-md border ${
                          bot.risk === 'Alto'
                            ? 'text-rose-300 border-rose-500/30 bg-rose-500/10'
                            : bot.risk === 'Medio'
                            ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                            : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                        }`}
                      >
                        Riesgo {bot.risk}
                      </span>
                    </div>
                    <CardDescription className="text-slate-300">{bot.strategy}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-grow">
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-white">{bot.monthlyReturn}</p>
                      <p className="text-sm text-slate-400">/mes (estimado)</p>
                    </div>

                    <div className="text-sm text-slate-400">
                      <DollarSign className="inline h-4 w-4 mr-1 text-green-400" />
                      Mínimo: <span className="font-semibold text-white">${bot.minInvestment}</span>
                    </div>
                    <div className="text-sm text-slate-400">
                      <Activity className="inline h-4 w-4 mr-1 text-purple-400" />
                      Pares: <span className="font-semibold text-white">{bot.pairs.join(', ')}</span>
                    </div>

                    {/* Ejemplo de rendimiento con un monto razonable */}
                    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 text-sm">
                      <div className="text-slate-400">Ej. con ${fmt(exAmount, 0)}:</div>
                      <div className="text-slate-100 font-semibold">+${fmt(estMin)} – +${fmt(estMax)} / mes</div>
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
                  <CardFooter className="flex gap-2">
                    <Button
                      onClick={() => {
                        playSound?.('click');
                        setSelectedBot(bot);
                        const suggested = Math.min(availableUsd, Math.max(bot.minInvestment, 250));
                        setInvestmentAmount(String(suggested > 0 ? suggested : bot.minInvestment));
                      }}
                      className={`w-full bg-gradient-to-r ${gradient} hover:opacity-90`}
                    >
                      Activar Bot
                    </Button>
                    <Link to="/deposit" className="w-full">
                      <Button variant="outline" className="w-full">
                        Depositar
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Modal de activación */}
        {selectedBot && (() => {
          const ModalIcon = selectedBot.icon;
          const gradient =
            selectedBot.bgColor.includes('blue')
              ? 'from-blue-500 to-cyan-500'
              : selectedBot.bgColor.includes('red')
              ? 'from-red-500 to-pink-500'
              : 'from-green-500 to-teal-500';

          const { min, max } = parsePctRange(selectedBot.monthlyReturn);
          const amountNum = Number(investmentAmount || 0);
          const estMin = (min / 100) * amountNum;
          const estMax = (max / 100) * amountNum;

          const disabled =
            busyActivate ||
            !amountNum ||
            amountNum < selectedBot.minInvestment ||
            amountNum > availableUsd ||
            amountNum <= 0;

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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                      <div className="text-xs text-slate-400">Rango mensual</div>
                      <div className="text-white font-semibold">{selectedBot.monthlyReturn}</div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                      <div className="text-xs text-slate-400">Mínimo</div>
                      <div className="text-white font-semibold">${fmt(selectedBot.minInvestment, 0)}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Monto a invertir (USD)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={selectedBot.minInvestment}
                      step="0.01"
                      value={investmentAmount}
                      onChange={(e) => setInvestmentAmount(e.target.value)}
                      placeholder={`Mínimo $${selectedBot.minInvestment}, Disponible: $${fmt(availableUsd)}`}
                      className="bg-slate-800 border-slate-600 text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      {quickAmounts.map((v) => (
                        <Button key={v} size="sm" variant="secondary" onClick={() => setInvestmentAmount(String(v))}>
                          ${fmt(v, 0)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Estimación en vivo */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                    <div className="text-xs text-slate-400">Estimación mensual (según monto ingresado)</div>
                    <div className="text-white font-semibold">
                      {amountNum > 0 ? (
                        <>+${fmt(estMin)} – +${fmt(estMax)}</>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Estimación teórica basada en el rango del bot. No garantiza resultados.
                    </div>
                  </div>

                  {/* Validaciones */}
                  {amountNum > availableUsd && (
                    <div className="text-xs text-rose-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Monto supera tu saldo USDC (${fmt(availableUsd)}).
                    </div>
                  )}
                  {amountNum > 0 && amountNum < selectedBot.minInvestment && (
                    <div className="text-xs text-amber-400 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Debe ser ≥ ${fmt(selectedBot.minInvestment, 0)}.
                    </div>
                  )}

                  <Button
                    onClick={handleActivateBot}
                    disabled={disabled}
                    className={`w-full bg-gradient-to-r ${gradient} hover:opacity-90 disabled:opacity-60`}
                  >
                    {busyActivate ? 'Activando...' : `Activar ${selectedBot.name}`}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedBot(null)} className="w-full">
                    Cancelar
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          );
        })()}

        {/* Mis bots (activaciones del usuario) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Mis Bots</h2>
            {cancelFeeLabel && (
              <span className="text-[11px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 bg-slate-800/60">
                {cancelFeeLabel}
              </span>
            )}
          </div>

          {!botActivations?.length ? (
            <div className="opacity-60">Sin activaciones.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {botActivations.map((a) => {
                const status = normStatus(a.status);
                const cat = tradingBots.find((x) => x.name === a.botName);
                const { min, max } = parsePctRange(cat?.monthlyReturn);
                const estMin = (min / 100) * Number(a.amountUsd || 0);
                const estMax = (max / 100) * Number(a.amountUsd || 0);
                const isActive = status === 'active';
                const isPaused = status === 'paused';
                const isCanceled = status === 'canceled' || status === 'cancelled';
                const rowBusy = busyById.get(a.id);

                const createdAt =
                  a.createdAt || a.created_at || (a.created_at_ms ? new Date(a.created_at_ms) : null);

                // PnL realizado (transacciones)
                const { profit: grossProfit = 0, fees = 0, net: realizedNet = 0 } = getBotPnl?.(a.id) || {};

                // PnL no realizado + par principal (para minigráfico)
                const { unrealized = 0, mainPair } = calcUnrealizedAndPair(a.id, a.botName);

                // ROI con neto total (realizado + no realizado)
                const totalNet = Number(realizedNet) + Number(unrealized);
                const roiNet = a.amountUsd > 0 ? (totalNet / Number(a.amountUsd)) * 100 : 0;

                // Exposición & riesgo
                const open = (tradesByActivation[a.id] || []).filter(
                  (t) => String(t.status).toLowerCase() === 'open'
                );
                const exposure = open.reduce(
                  (s, t) => s + Number(t.amount_usd || 0) * Number(t.leverage || 1),
                  0
                );
                const exposurePct = a.amountUsd > 0 ? clamp((exposure / a.amountUsd) * 100, 0, 200) : 0;
                const riskPct = clamp(riskBase(cat?.risk) + Math.min(35, exposurePct / 2), 0, 100);

                return (
                  <Card key={a.id} className="crypto-card">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        <span>{a.botName}</span>
                        <span
                          className={`text-xs px-2 py-1 rounded-md border ${
                            isActive
                              ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                              : isPaused
                              ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                              : isCanceled
                              ? 'text-rose-300 border-rose-500/30 bg-rose-500/10'
                              : 'text-slate-300 border-slate-600 bg-slate-700/30'
                          }`}
                        >
                          {a.status}
                        </span>
                      </CardTitle>
                      <CardDescription className="text-slate-300">
                        {a.strategy} · Capital: ${fmt(a.amountUsd)} · Par: {mainPair}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Micro-gráfico del par dinámico */}
                      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">
                          Actividad del par ({mainPair})
                        </div>
                        <MiniSparkline pair={mainPair} />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Estimación mensual</div>
                          <div className="text-white font-semibold">+${fmt(estMin)} – +${fmt(estMax)}</div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Creado</div>
                          <div className="text-white font-semibold">
                            {createdAt ? new Date(createdAt).toLocaleString() : '—'}
                          </div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">PnL realizado</div>
                          <div className={`font-semibold ${pnlColor(realizedNet)}`}>{fmtSign(realizedNet)}</div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Detalle: bruto {fmtSign(grossProfit)} · fees {fees < 0 ? `-$${fmt(Math.abs(fees))}` : fmtSign(fees)}
                          </div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">PnL no realizado</div>
                          <div className={`font-semibold ${pnlColor(unrealized)}`}>{fmtSign(unrealized)}</div>
                          <div className="text-[10px] text-slate-500 mt-1">Suma de trades abiertos (MTM)</div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">ROI neto</div>
                          <div className={`font-semibold ${pnlColor(roiNet)}`}>{fmtSign(roiNet)}%</div>
                          <div className="text-[10px] text-slate-500 mt-1">Incluye PnL no realizado</div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Exposición</div>
                          <div className="text-white font-semibold">{fmt(exposurePct, 0)}%</div>
                          <div className="h-2 mt-2 bg-slate-800 rounded">
                            <div className="h-2 bg-amber-400 rounded" style={{ width: `${clamp(exposurePct, 0, 100)}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">∑(monto × leverage) / capital</div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 col-span-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-slate-400">Riesgo</div>
                            <div className="text-white font-semibold">{fmt(riskPct, 0)}%</div>
                          </div>
                          <div className="h-2 mt-2 bg-slate-800 rounded">
                            <div className="h-2 bg-rose-400 rounded" style={{ width: `${riskPct}%` }} />
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">Riesgo base ± exposición</div>
                        </div>
                      </div>

                      {/* Últimos trades (compacto) */}
                      {(tradesByActivation[a.id] || []).length > 0 && (
                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400 mb-1">Últimos trades</div>
                          <div className="space-y-1 max-h-36 overflow-auto">
                            {(tradesByActivation[a.id] || []).slice(0, 6).map((t) => (
                              <div key={t.id} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300">
                                  {t.opened_at ? new Date(t.opened_at).toLocaleTimeString() : '—'} · {t.pair}
                                </span>
                                <span className={`uppercase ${String(t.side).toLowerCase() === 'short' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {t.side}
                                </span>
                                <span className="text-slate-400">{t.status}</span>
                                {Number.isFinite(Number(t.pnl)) && (
                                  <span className={pnlColor(Number(t.pnl))}>{fmtSign(Number(t.pnl))}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {isActive && (
                          <Button
                            variant="outline"
                            onClick={() => doPause(a.id)}
                            disabled={rowBusy}
                          >
                            <PauseCircle className="w-4 h-4 mr-1" />
                            {rowBusy ? 'Pausando…' : 'Pausar'}
                          </Button>
                        )}
                        {isPaused && (
                          <Button
                            onClick={() => doResume(a.id)}
                            disabled={rowBusy}
                          >
                            <PlayCircle className="w-4 h-4 mr-1" />
                            {rowBusy ? 'Reanudando…' : 'Reanudar'}
                          </Button>
                        )}
                        {!isCanceled && (
                          <Button
                            variant="destructive"
                            onClick={() => doCancel(a.id)}
                            disabled={rowBusy}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            {rowBusy ? 'Cancelando…' : 'Cancelar'}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Tip UX */}
        <div className="text-xs text-slate-400">
          <CheckCircle className="w-4 h-4 inline mr-1 text-emerald-400" />
          Consejo: diversificá entre bots para equilibrar rendimiento y riesgo.
        </div>
      </div>
    </>
  );
};

export default TradingBotsPage;
