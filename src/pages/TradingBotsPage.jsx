// src/pages/TradingBotsPage.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  XCircle,
  Coins,
  History,
  Clock,
  CircleDollarSign,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { useData } from '@/contexts/DataContext';
import { Link } from 'react-router-dom';
import MiniSparkline from '@/components/bots/MiniSparkline';
import { BOT_BRAIN_CLIENT, runBotBrainOnce } from '@/lib/supabaseClient';

// 🔧 Sim visual (no toca saldo): Web Worker
import useBotSimWorker from '@/hooks/useBotSimWorker';

/* ===================== CONFIG ===================== */
const SIM_MODE = true;           // sólo visual
const CURRENCY = 'USDC';         // cambia a 'USD' si tu wallet usa USD

/* ===================== Utils ===================== */
const fmt = (n, dec = 2) => (Number.isFinite(+n) ? (+n).toFixed(dec) : (0).toFixed(dec));
const fmtSign = (n, dec = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return (0).toFixed(dec);
  return `${v >= 0 ? '+' : ''}${v.toFixed(dec)}`;
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

/* ===================== Catálogo (UI) ===================== */
const tradingBots = [
  { id: 1, name: 'Bot Conservador Alfa', risk: 'Bajo', strategy: 'Bajo Riesgo, Ingresos Estables', monthlyReturn: '~5-8%', minInvestment: 250, pairs: ['BTC/USDT','ETH/USDT'], icon: BarChart2, color: 'text-blue-400', bgColor: 'bg-blue-500/10', features: ['Stop-loss dinámico','Análisis de sentimiento básico','Rebalanceo semanal'] },
  { id: 2, name: 'Bot Agresivo Beta', risk: 'Alto', strategy: 'Alto Riesgo, Alto Rendimiento Potencial', monthlyReturn: '~15-25%', minInvestment: 1000, pairs: ['ALTCOINS/USDT','MEMES/USDT'], icon: Zap, color: 'text-red-400', bgColor: 'bg-red-500/10', features: ['Trading de alta frecuencia','Detección de pumps','Scalping en M1/M5'] },
  { id: 3, name: 'Bot Balanceado Gamma', risk: 'Medio', strategy: 'Riesgo Moderado, Crecimiento Constante', monthlyReturn: '~8-12%', minInvestment: 500, pairs: ['BTC/USDT','ETH/USDT','BNB/USDT','ADA/USDT'], icon: TrendingUp, color: 'text-green-400', bgColor: 'bg-green-500/10', features: ['Grid trading','Dollar Cost Averaging (DCA)','Seguimiento de tendencia'] },
];

/* ===================== Subcomponentes UI ===================== */
function ConfirmModal({
  open, title, description, confirmText = 'Confirmar', cancelText = 'Cancelar',
  onConfirm, onCancel, destructive = false, children,
}) {
  if (!open) return null;
  return (
    <AnimatePresence>
      <motion.div
        key="confirm-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
        onMouseDown={onCancel}
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">{title}</CardTitle>
              {description && <CardDescription className="text-slate-300">{description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-3">{children}</CardContent>
            <CardFooter className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onCancel}>{cancelText}</Button>
              <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>{confirmText}</Button>
            </CardFooter>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

const EventRow = ({ ev }) => {
  const kind = String(ev?.kind || '').toLowerCase();
  const at = ev?.created_at ? new Date(ev.created_at).toLocaleTimeString() : '—';
  const p = ev?.payload || {};
  const pnl = Number(p?.pnl);
  const pair = p?.pair || p?.symbol || p?.pair_symbol || '';
  const reason = p?.reason || '';
  const Icon =
    kind === 'open' ? Activity :
    kind === 'close' ? CheckCircle :
    kind === 'cancel' ? XCircle :
    kind === 'withdraw' ? CircleDollarSign :
    Clock;
  const color =
    kind === 'open' ? 'text-sky-300' :
    kind === 'close' ? 'text-emerald-300' :
    kind === 'cancel' ? 'text-rose-300' :
    kind === 'withdraw' ? 'text-amber-300' :
    'text-slate-300';
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{at}</span>
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-slate-200 capitalize">{kind}</span>
        {pair && <span className="text-slate-400">{pair}</span>}
        {reason && <span className="text-slate-500">({reason})</span>}
      </div>
      {Number.isFinite(pnl) && (
        <span className={pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
          {pnl >= 0 ? `+${fmt(pnl)}` : `${fmt(pnl)}`}
        </span>
      )}
    </div>
  );
};
const EventTimeline = ({ list = [] }) => {
  if (!list?.length) return null;
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
      <div className="text-xs text-slate-400 mb-1">Actividad</div>
      <div className="space-y-1 max-h-36 overflow-auto">
        {list.slice(0, 8).map((ev) => (<EventRow key={ev.id} ev={ev} />))}
      </div>
    </div>
  );
};

/* ===================== Página ===================== */
const TradingBotsPage = () => {
  const { user } = useAuth();
  const { playSound } = useSound();

  // Negocio real (saldo/txns/activaciones)
  const api = useData();

  // Simulación visual (no toca saldo)
  const sim = SIM_MODE ? useBotSimWorker() : null;

  // Arranca/pará el worker y dale un tick ágil
  useEffect(() => {
    if (!SIM_MODE || !sim) return;
    sim.setTick?.(1500);
    sim.start?.();
    return () => sim.stop?.();
  }, [sim]);

  // Escogemos de dónde leer trades/eventos (sim o API real)
  const listTrades = (SIM_MODE && sim?.listBotTrades) ? sim.listBotTrades : api.listBotTrades;
  const subTrades  = (SIM_MODE && sim?.subscribeBotTrades) ? sim.subscribeBotTrades : api.subscribeBotTrades;
  const listEvents = (SIM_MODE && sim?.listBotEvents) ? sim.listBotEvents : api.listBotEvents;
  const subEvents  = (SIM_MODE && sim?.subscribeBotEvents) ? sim.subscribeBotEvents : api.subscribeBotEvents;

  const {
    botActivations,
    activeBots,
    canceledBots,
    activateBot,
    cancelBot,
    creditBotProfit,
    refreshBotActivations,
    refreshTransactions,
    settings,

    getBotPnl,
    totalBotProfit = 0,
    totalBotFees = 0,
    totalBotNet = 0,

    getPairInfo,
    getAvailableBalance,
  } = api;

  const [selectedBot, setSelectedBot] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [busyActivate, setBusyActivate] = useState(false);
  const [busyById, setBusyById] = useState(() => new Map());
  const [showNet, setShowNet] = useState(true);
  const [busyBrain, setBusyBrain] = useState(false);

  const [confirmCancel, setConfirmCancel] = useState(null);
  const [tradesByActivation, setTradesByActivation] = useState({});
  const subsRef = useRef({});
  const [eventsByActivation, setEventsByActivation] = useState({});
  const eventsSubsRef = useRef({});

  const cancelFeePct = Number(settings?.['trading.bot_cancel_fee_pct'] ?? 0);
  const cancelFeeUsd = Number(settings?.['trading.bot_cancel_fee_usd'] ?? 0);
  const cancelFeeLabel = cancelFeeUsd > 0 || cancelFeePct > 0
    ? `Fee cancelación: ${cancelFeePct > 0 ? `${fmt(cancelFeePct)}%` : ''}${cancelFeePct > 0 && cancelFeeUsd > 0 ? ' + ' : ''}${cancelFeeUsd > 0 ? `$${fmt(cancelFeeUsd)}` : ''}`
    : null;

  const setRowBusy = useCallback((id, val) => {
    setBusyById(prev => {
      const m = new Map(prev);
      if (val) m.set(id, true); else m.delete(id);
      return m;
    });
  }, []);

  const myActiveBots = useMemo(() => {
    if (Array.isArray(activeBots)) return activeBots;
    return (botActivations || []).filter((b) => ['active', 'paused'].includes(normStatus(b?.status)));
  }, [activeBots, botActivations]);

  const myCanceledBots = useMemo(() => {
    if (Array.isArray(canceledBots)) return canceledBots;
    return (botActivations || []).filter((b) =>
      ['canceled', 'cancelled', 'archived', 'stopped', 'ended', 'inactive'].includes(normStatus(b?.status))
    );
  }, [canceledBots, botActivations]);

  // si el worker expone una API para "sembrar" activaciones, la llamamos
  useEffect(() => {
    if (!SIM_MODE || !sim) return;
    sim.setActiveBots?.(myActiveBots);
  }, [sim, myActiveBots]);

  const botsAllocated = useMemo(
    () => myActiveBots.reduce((a, b) => a + Number(b?.amountUsd || 0), 0),
    [myActiveBots]
  );
  const botsCount = myActiveBots.length;

  const activeEstimated = useMemo(() => {
    let minSum = 0; let maxSum = 0;
    for (const b of myActiveBots) {
      const cat = tradingBots.find((x) => x.name === b.botName);
      const { min, max } = parsePctRange(cat?.monthlyReturn);
      const amt = Number(b?.amountUsd || 0);
      minSum += (min / 100) * amt;
      maxSum += (max / 100) * amt;
    }
    return { min: minSum, max: maxSum };
  }, [myActiveBots]);

  const GOALS = { botsCount: 3, botsUsd: 2000 };
  const pctBotsCount = clamp((botsCount / GOALS.botsCount) * 100);
  const pctBotsUsd = clamp((botsAllocated / GOALS.botsUsd) * 100);
  const energyBots = clamp((pctBotsCount + pctBotsUsd) / 2);

  // Saldo disponible real
  const [availableUsd, setAvailableUsd] = useState(0);
  const refreshAvailable = useCallback(async () => {
    try {
      let v = await getAvailableBalance?.(CURRENCY);
      if (v == null) v = await getAvailableBalance?.(); // firma alternativa
      setAvailableUsd(Number(v || 0));
    } catch {
      setAvailableUsd(0);
    }
  }, [getAvailableBalance]);

  useEffect(() => {
    refreshAvailable();
  }, [refreshAvailable, botActivations, totalBotNet]);

  useEffect(() => {
    if (!user?.id) return;
    refreshBotActivations?.();
    refreshTransactions?.();
  }, [user?.id]); // eslint-disable-line

  // ===== Trades & Eventos =====
  const loadTrades = useCallback(async (activationId) => {
    try {
      const rows = await listTrades?.(activationId, 80);
      setTradesByActivation(p => ({ ...p, [activationId]: rows || [] }));
    } catch {}
  }, [listTrades]);

  useEffect(() => {
    (botActivations || []).forEach((a) => {
      const id = a.id;
      if (!id || subsRef.current[id]) return;
      loadTrades(id);
      const ch = subTrades?.(id, () => loadTrades(id));
      subsRef.current[id] = ch;
    });
    return () => {
      Object.values(subsRef.current).forEach((ch) => { try { ch?.unsubscribe?.(); } catch {} });
      subsRef.current = {};
    };
  }, [botActivations, subTrades, loadTrades]);

  const loadEvents = useCallback(async (activationId) => {
    if (!listEvents) return;
    try {
      const rows = await listEvents?.(activationId, 80);
      setEventsByActivation(p => ({ ...p, [activationId]: rows || [] }));
    } catch {}
  }, [listEvents]);

  useEffect(() => {
    if (!subEvents) return;
    (botActivations || []).forEach((a) => {
      const id = a.id;
      if (!id || eventsSubsRef.current[id]) return;
      loadEvents(id);
      const ch = subEvents?.(id, () => loadEvents(id));
      eventsSubsRef.current[id] = ch;
    });
    return () => {
      Object.values(eventsSubsRef.current).forEach((ch) => { try { ch?.unsubscribe?.(); } catch {} });
      eventsSubsRef.current = {};
    };
  }, [botActivations, subEvents, loadEvents]);

  // MTM con fallback a precios del worker
  const calcUnrealizedAndPair = useCallback((activationId, fallbackName) => {
    const rows = tradesByActivation[activationId] || [];
    let u = 0;
    const lastOpen = rows.find((r) => String(r.status).toLowerCase() === 'open');
    let mainPair = lastOpen?.pair;
    if (!mainPair) {
      const cat = tradingBots.find((x) => x.name === fallbackName);
      mainPair = cat?.pairs?.[0] || 'BTC/USDT';
    }
    for (const t of rows) {
      if (String(t.status).toLowerCase() !== 'open') continue;

      const info = getPairInfo?.(t.pair) || {};
      let last = Number(info.price);

      if (!Number.isFinite(last)) {
        // 🔥 fallback worker
        const key1 = t.pair;
        const key2 = t.pair?.replace('/', '');
        const key3 = t.pair?.split('/')?.[0];
        last = Number(
          sim?.prices?.[key1] ??
          sim?.prices?.[key2] ??
          sim?.prices?.[key3]
        );
      }

      if (!Number.isFinite(last) || !Number.isFinite(Number(t.entry))) continue;
      const sideMul = String(t.side).toLowerCase() === 'short' ? -1 : 1;
      const pct = (last - Number(t.entry)) / Number(t.entry);
      const uPnL = sideMul * pct * Number(t.leverage || 1) * Number(t.amount_usd || 0);
      if (Number.isFinite(uPnL)) u += uPnL;
    }
    return { unrealized: u, mainPair };
  }, [tradesByActivation, getPairInfo, sim?.prices]);

  /* ===================== Handlers ===================== */
  const handleActivateBot = async () => {
    try {
      playSound?.('invest');
      if (!user?.id) {
        toast({ title: 'No autenticado', description: 'Iniciá sesión para continuar.', variant: 'destructive' });
        return;
      }

      const bot = selectedBot;
      if (!bot || !investmentAmount) {
        toast({ title: 'Error', description: 'Seleccioná un bot e ingresá un monto.', variant: 'destructive' });
        return;
      }

      const amount = parseFloat(investmentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast({ title: 'Monto inválido', description: 'Ingresá un monto válido.', variant: 'destructive' });
        return;
      }
      if (amount < bot.minInvestment) {
        toast({ title: 'Monto insuficiente', description: `El mínimo para ${bot.name} es $${bot.minInvestment}.`, variant: 'destructive' });
        return;
      }
      if (amount > availableUsd) {
        toast({ title: 'Saldo insuficiente', description: `Tu saldo ${CURRENCY} es $${fmt(availableUsd)}.`, variant: 'destructive' });
        return;
      }

      setBusyActivate(true);

      const res = await activateBot?.({ botId: bot.id, botName: bot.name, strategy: bot.strategy, amountUsd: amount });
      if (res?.code === 'INSUFFICIENT_FUNDS') {
        toast({ title: 'Saldo insuficiente', description: `Te faltan $${fmt(Number(res?.needed || 0))}.`, variant: 'destructive' });
        return;
      }
      if (!res?.ok && res?.ok !== true) {
        toast({ title: 'No se pudo activar', description: res?.msg || 'Intentá nuevamente.', variant: 'destructive' });
        return;
      }
      // descuento optimista
      setAvailableUsd((v) => Math.max(0, Number(v || 0) - amount));
      toast({ title: 'Bot activado', description: `${bot.name} por $${fmt(amount)}.` });
      setSelectedBot(null);
      setInvestmentAmount('');
      await Promise.all([refreshBotActivations?.(), refreshTransactions?.()]);
      await refreshAvailable();
    } catch (e) {
      console.error('[handleActivateBot]', e);
      toast({ title: 'Error', description: 'Ocurrió un problema inesperado.', variant: 'destructive' });
    } finally {
      setBusyActivate(false);
    }
  };

  const askCancel = (a) => {
    const pctPart = Math.max(0, (cancelFeePct || 0) / 100) * Number(a.amountUsd || 0);
    const fixed = Math.max(0, cancelFeeUsd || 0);
    let feeEst = Number((pctPart + fixed).toFixed(2));
    if (feeEst > Number(a.amountUsd || 0)) feeEst = Number(a.amountUsd || 0);
    setConfirmCancel({ id: a.id, name: a.botName, amountUsd: a.amountUsd, feeEst });
  };

  const doCancel = async (id) => {
    if (!id) return;
    setRowBusy(id, true);
    try {
      const r = await cancelBot?.(id);
      if (r?.ok) {
        toast({ title: 'Bot cancelado' });
        await Promise.all([refreshBotActivations?.(), refreshTransactions?.()]);
        await refreshAvailable();
      } else {
        toast({ title: 'No se pudo cancelar', description: r?.msg || '', variant: 'destructive' });
      }
    } catch (e) {
      console.error('[cancelBot]', e);
      toast({ title: 'Error', description: 'No se pudo cancelar el bot.', variant: 'destructive' });
    } finally {
      setRowBusy(id, false);
      setConfirmCancel(null);
    }
  };

  const doTakeProfit = async (a) => {
    if (!a?.id) return;
    setRowBusy(a.id, true);
    try {
      const before = api.getBotPnl?.(a.id) || {};
      const withdrawable = Math.max(0, Number(before.net || 0) - Number(before.withdrawn || 0));
      if (withdrawable <= 0) {
        toast({ title: 'Sin ganancias para retirar', description: 'Aún no hay PnL realizado disponible.', variant: 'destructive' });
        setRowBusy(a.id, false);
        return;
      }
      const r = await creditBotProfit?.(a.id, withdrawable, `Take profit ${a.botName}`);
      if (r?.ok || r?.via === 'fallback') {
        toast({ title: 'Ganancias acreditadas', description: `Se pasaron $${fmt(withdrawable)} al saldo.` });
        await Promise.all([refreshTransactions?.()]);
        await refreshAvailable();
      } else {
        toast({ title: 'No se pudo tomar ganancias', variant: 'destructive' });
      }
    } catch (e) {
      console.error('[takeProfit]', e);
      toast({ title: 'Error', description: 'No se pudo tomar ganancias.', variant: 'destructive' });
    } finally {
      setRowBusy(a.id, false);
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
        ...(botActivations || []).map((a) => loadEvents(a.id)),
      ]);
    } catch (e) {
      console.error('[bot-brain]', e);
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setBusyBrain(false);
    }
  };

  const quickAmounts = useMemo(() => {
    const base = [250, 500, 1000, 2000];
    const extra = availableUsd > 0 ? [Math.min(availableUsd, 5000)] : [];
    return [...base, ...extra.filter((v) => !base.includes(v))];
  }, [availableUsd]);

  const summaryPnlValue = showNet ? totalBotNet : totalBotProfit;
  const summaryPnlLabel = showNet ? 'Ganancias (neto no retirado)' : 'Ganancias (bruto)';

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
                <BotIcon className="h-8 w-8 mr-3 text-purple-400" />
                Bots de Trading Automatizado
              </h1>
              <p className="text-slate-300">Simulación visual (en segundo plano) + saldo real para movimientos de capital.</p>
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

        {/* Resumen */}
        <Card className="crypto-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-emerald-400" />
                  Estado de tus Bots
                </CardTitle>
                <CardDescription className="text-slate-300">Progreso hacia tus objetivos (cantidad y capital asignado).</CardDescription>
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
                  Saldo {CURRENCY}
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
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-green-300" />
                    {summaryPnlLabel}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant={showNet ? 'secondary' : 'outline'} className="h-6 px-2 text-[11px]" onClick={() => setShowNet(true)}>Neto</Button>
                    <Button size="sm" variant={!showNet ? 'secondary' : 'outline'} className="h-6 px-2 text-[11px]" onClick={() => setShowNet(false)}>Bruto</Button>
                  </div>
                </div>
                <div className={`text-2xl font-semibold ${pnlColor(summaryPnlValue)}`}>
                  {fmtSign(summaryPnlValue)}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {showNet ? <>Bruto: +${fmt(totalBotProfit)} · fees ${fmt(totalBotFees)}</> : <>Neto no retirado: {fmtSign(totalBotNet)} · fees ${fmt(totalBotFees)}</>}
                </div>
              </div>
            </div>

            <div className="w-full h-5 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div className="flex h-full">
                <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400" style={{ width: `${(pctBotsCount / 2)}%` }} title={`Bots activos: ${fmt(pctBotsCount, 0)}%`} />
                <div className="h-full bg-gradient-to-r from-sky-500 to-sky-400" style={{ width: `${(pctBotsUsd / 2)}%` }} title={`Capital asignado: ${fmt(pctBotsUsd, 0)}%`} />
              </div>
            </div>
            <div className="text-right text-slate-300 text-sm">Energía de bots: <span className="text-white font-semibold">{fmt(energyBots, 0)}%</span></div>
            <div className="text-xs text-slate-400"><AlertTriangle className="w-4 h-4 inline mr-1 text-amber-300" /> Las estimaciones son orientativas.</div>
          </CardContent>
        </Card>

        {/* Catálogo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tradingBots.map((bot, index) => {
            const Icon = bot.icon;
            const gradient =
              bot.bgColor.includes('blue') ? 'from-blue-500 to-cyan-500'
                : bot.bgColor.includes('red') ? 'from-red-500 to-pink-500'
                  : 'from-green-500 to-teal-500';

            const { min, max } = parsePctRange(bot.monthlyReturn);
            const exAmount = Math.max(bot.minInvestment, Math.min(availableUsd, bot.minInvestment * 2));
            const estMin = (min / 100) * exAmount;
            const estMax = (max / 100) * exAmount;

            return (
              <motion.div key={bot.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: index * 0.1 }}>
                <Card className={`crypto-card h-full flex flex-col border-l-4 ${bot.bgColor.replace('bg-', 'border-')}`}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className={`p-2 rounded-lg ${bot.bgColor}`}>
                          <Icon className={`h-6 w-6 ${bot.color}`} />
                        </div>
                        <CardTitle className={`text-xl ${bot.color}`}>{bot.name}</CardTitle>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-md border ${
                        bot.risk === 'Alto' ? 'text-rose-300 border-rose-500/30 bg-rose-500/10'
                          : bot.risk === 'Medio' ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                            : 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                      }`}>Riesgo {bot.risk}</span>
                    </div>
                    <CardDescription className="text-slate-300">{bot.strategy}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-grow">
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-bold text-white">{bot.monthlyReturn}</p>
                      <p className="text-sm text-slate-400">/mes (estimado)</p>
                    </div>
                    <div className="text-sm text-slate-400"><DollarSign className="inline h-4 w-4 mr-1 text-green-400" /> Mínimo: <span className="font-semibold text-white">${bot.minInvestment}</span></div>
                    <div className="text-sm text-slate-400"><Activity className="inline h-4 w-4 mr-1 text-purple-400" /> Pares: <span className="font-semibold text-white">{bot.pairs.join(', ')}</span></div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3 text-sm">
                      <div className="text-slate-400">Ej. con ${fmt(exAmount, 0)}:</div>
                      <div className="text-slate-100 font-semibold">+${fmt(estMin)} – +${fmt(estMax)} / mes</div>
                    </div>
                    <div className="pt-2">
                      <p className="text-sm font-medium text-white mb-1">Características:</p>
                      <ul className="space-y-1">
                        {bot.features.map((feature) => (
                          <li key={feature} className="flex items-center text-xs text-slate-300">
                            <CheckCircle className="h-3 w-3 mr-2 text-green-500 shrink-0" /> {feature}
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
                    >Activar Bot</Button>
                    <Link to="/deposit" className="w-full">
                      <Button variant="outline" className="w-full">Depositar</Button>
                    </Link>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Modal de activación */}
        <AnimatePresence>
          {selectedBot && (() => {
            const ModalIcon = selectedBot.icon;
            const gradient =
              selectedBot.bgColor.includes('blue') ? 'from-blue-500 to-cyan-500'
                : selectedBot.bgColor.includes('red') ? 'from-red-500 to-pink-500'
                  : 'from-green-500 to-teal-500';

            const { min, max } = parsePctRange(selectedBot.monthlyReturn);
            const amountNum = Number(investmentAmount || 0);
            const estMin = (min / 100) * amountNum;
            const estMax = (max / 100) * amountNum;

            const disabled = busyActivate || !amountNum || amountNum < selectedBot.minInvestment || amountNum > availableUsd || amountNum <= 0;

            return (
              <motion.div
                key="activate-modal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                onMouseDown={() => !busyActivate && setSelectedBot(null)}
              >
                <Card className="crypto-card w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
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

                    <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                      <div className="text-xs text-slate-400">Estimación mensual (según monto)</div>
                      <div className="text-white font-semibold">
                        {amountNum > 0 ? (<>+${fmt(estMin)} – +${fmt(estMax)}</>) : '—'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">Estimación teórica; no garantiza resultados.</div>
                    </div>

                    <Button onClick={handleActivateBot} disabled={disabled} className={`w-full bg-gradient-to-r ${gradient} hover:opacity-90 disabled:opacity-60`}>
                      {busyActivate ? 'Activando...' : `Activar ${selectedBot.name}`}
                    </Button>
                    <Button variant="outline" disabled={busyActivate} onClick={() => setSelectedBot(null)} className="w-full">Cancelar</Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Mis bots */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Mis Bots</h2>
            {cancelFeeLabel && (
              <span className="text-[11px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 bg-slate-800/60">
                {cancelFeeLabel}
              </span>
            )}
          </div>

          {!myActiveBots?.length ? (
            <div className="opacity-60">No tenés bots activos. Activá uno desde el catálogo.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myActiveBots.map((a) => {
                const status = normStatus(a.status);
                const cat = tradingBots.find((x) => x.name === a.botName);
                const { min, max } = parsePctRange(cat?.monthlyReturn);
                const estMin = (min / 100) * Number(a.amountUsd || 0);
                const estMax = (max / 100) * Number(a.amountUsd || 0);
                const rowBusy = busyById.get(a.id);

                const createdAt = a.createdAt || a.created_at || (a.created_at_ms ? new Date(a.created_at_ms) : null);
                const { profit: grossProfit = 0, fees = 0, net: realizedNet = 0, withdrawn = 0 } = getBotPnl?.(a.id) || {};
                const { unrealized = 0, mainPair } = calcUnrealizedAndPair(a.id, a.botName);

                const totalNet = Number(realizedNet) + Number(unrealized);
                const roiNet = a.amountUsd > 0 ? (totalNet / Number(a.amountUsd)) * 100 : 0;

                const open = (tradesByActivation[a.id] || []).filter((t) => String(t.status).toLowerCase() === 'open');
                const exposure = open.reduce((s, t) => s + Number(t.amount_usd || 0) * Number(t.leverage || 1), 0);
                const exposurePct = a.amountUsd > 0 ? clamp((exposure / a.amountUsd) * 100, 0, 200) : 0;
                const riskPct = clamp(riskBase(cat?.risk) + Math.min(35, exposurePct / 2), 0, 100);

                return (
                  <Card key={a.id} className="crypto-card">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        <span>{a.botName}</span>
                        <span className="text-xs px-2 py-1 rounded-md border text-emerald-300 border-emerald-500/30 bg-emerald-500/10">
                          {status}
                        </span>
                      </CardTitle>
                      <CardDescription className="text-slate-300">{a.strategy} · Capital: ${fmt(a.amountUsd)} · Par: {mainPair}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Actividad del par ({mainPair})</div>
                        <MiniSparkline pair={mainPair} />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Estimación mensual</div>
                          <div className="text-white font-semibold">+${fmt(estMin)} – +${fmt(estMax)}</div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Creado</div>
                          <div className="text-white font-semibold">{createdAt ? new Date(createdAt).toLocaleString() : '—'}</div>
                        </div>

                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">PnL realizado</div>
                          <div className={`font-semibold ${pnlColor(realizedNet)}`}>{fmtSign(realizedNet)}</div>
                          <div className="text-[10px] text-slate-500 mt-1">Bruto {fmtSign(grossProfit)} · fees ${fmt(fees)} · retirado ${fmt(withdrawn)}</div>
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

                      <EventTimeline list={eventsByActivation[a.id]} />

                      {(tradesByActivation[a.id] || []).length > 0 && (
                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400 mb-1">Últimos trades</div>
                          <div className="space-y-1 max-h-36 overflow-auto">
                            {(tradesByActivation[a.id] || []).slice(0, 6).map((t) => (
                              <div key={t.id} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300">{t.opened_at ? new Date(t.opened_at).toLocaleTimeString() : '—'} · {t.pair}</span>
                                <span className={`uppercase ${String(t.side).toLowerCase() === 'short' ? 'text-rose-400' : 'text-emerald-400'}`}>{t.side}</span>
                                <span className="text-slate-400">{t.status}</span>
                                {Number.isFinite(Number(t.pnl)) && (<span className={pnlColor(Number(t.pnl))}>{fmtSign(Number(t.pnl))}</span>)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => doTakeProfit(a)}
                          disabled={rowBusy || Math.max(0, (getBotPnl?.(a.id)?.net || 0) - (getBotPnl?.(a.id)?.withdrawn || 0)) <= 0}
                        >
                          <CircleDollarSign className="w-4 h-4 mr-1" />
                          {Math.max(0, (getBotPnl?.(a.id)?.net || 0) - (getBotPnl?.(a.id)?.withdrawn || 0)) > 0
                            ? `Tomar ganancias $${fmt(Math.max(0, (getBotPnl?.(a.id)?.net || 0) - (getBotPnl?.(a.id)?.withdrawn || 0)))}`
                            : 'Sin ganancias'}
                        </Button>
                        <Button variant="destructive" onClick={() => askCancel(a)} disabled={rowBusy}>
                          <XCircle className="w-4 h-4 mr-1" /> {rowBusy ? 'Cancelando…' : 'Cancelar'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Historial cancelados */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-300" />
            <h3 className="text-lg font-semibold text-white">Historial de Bots Cancelados</h3>
          </div>

          {!myCanceledBots?.length ? (
            <div className="text-slate-400 text-sm">Aún no tenés cancelaciones.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myCanceledBots.map((a) => {
                const { profit = 0, fees = 0, net = 0, refunds = 0, withdrawn = 0 } = getBotPnl?.(a.id) || {};
                return (
                  <Card key={a.id} className="crypto-card border-l-4 border-rose-500/40">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        <span>{a.botName}</span>
                        <span className="text-xs px-2 py-1 rounded-md border text-rose-300 border-rose-500/30 bg-rose-500/10">{a.status}</span>
                      </CardTitle>
                      <CardDescription className="text-slate-300">
                        Capital original: ${fmt(a.amountUsd)} · PnL neto total: <span className={pnlColor(net)}>{fmtSign(net)}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Bruto acumulado</div>
                          <div className={`font-semibold ${pnlColor(profit)}`}>{fmtSign(profit)}</div>
                        </div>
                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Fees totales</div>
                          <div className="font-semibold text-slate-200">${fmt(fees)}</div>
                        </div>
                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Refunds</div>
                          <div className="font-semibold text-slate-200">${fmt(refunds)}</div>
                        </div>
                        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                          <div className="text-xs text-slate-400">Retirado</div>
                          <div className="font-semibold text-slate-200">${fmt(withdrawn)}</div>
                        </div>
                      </div>

                      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-3">
                        <div className="text-xs text-slate-400 mb-1">Actividad</div>
                        <div className="space-y-1 max-h-36 overflow-auto">
                          {(eventsByActivation[a.id] || []).slice(0, 8).map((ev) => <EventRow key={ev.id} ev={ev} />)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-xs text-slate-400">
          <CheckCircle className="w-4 h-4 inline mr-1 text-emerald-400" />
          Consejo: tomá ganancias periódicamente para ir llevando PnL al saldo real.
        </div>
      </div>

      {/* Confirm cancelar */}
      <ConfirmModal
        open={!!confirmCancel}
        title={`Cancelar bot ${confirmCancel?.name || ''}`}
        description="Al cancelar se libera el capital y se aplica el fee indicado."
        destructive
        confirmText="Cancelar bot"
        cancelText="Volver"
        onCancel={() => setConfirmCancel(null)}
        onConfirm={() => doCancel(confirmCancel?.id)}
      >
        <div className="text-sm text-slate-300 space-y-1">
          <div>Capital asignado: <span className="text-white font-semibold">${fmt(confirmCancel?.amountUsd || 0)}</span></div>
          <div>Fee estimado: <span className="text-white font-semibold">${fmt(confirmCancel?.feeEst || 0)}</span></div>
          {cancelFeeLabel && <div className="text-xs text-slate-400">{cancelFeeLabel}</div>}
        </div>
      </ConfirmModal>
    </>
  );
};

export default TradingBotsPage;
