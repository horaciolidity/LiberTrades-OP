// src/hooks/useBotSimWorker.js
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

/**
 * Hook que envuelve tu DataContext real con una simulación de mercado/trades en WebWorker.
 * - Sincroniza activaciones reales -> worker
 * - Mantiene trades simulados y "payouts" por activación
 * - Expone list/subscribe de trades y eventos (para tu TradingBotsPage)
 * - Implementa takeProfit simulando un retiro y acreditándolo en el saldo real vía DataContext
 *
 * Uso en la page:
 *   const realData = useData();
 *   const data     = SIM_MODE ? useBotSimWorker(realData) : realData;
 */
export default function useBotSimWorker(ctx) {
  // Data reales
  const {
    botActivations = [],
    activateBot,
    cancelBot,
    creditBotProfit,
    refreshBotActivations,
    refreshTransactions,
    getAvailableBalance,
    getPairInfo,
    ...rest // el resto lo re-exponemos tal cual
  } = ctx || {};

  const workerRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [prices, setPrices] = useState({});
  const [tradesById, setTradesById] = useState({});   // id -> [{...}]
  const [payoutsById, setPayoutsById] = useState({}); // id -> {profit, fees, net, withdrawn}
  const [eventsById, setEventsById] = useState({});   // id -> [{id, kind, created_at, payload}]

  // Subscripciones en memoria
  const tradeSubsRef = useRef({}); // id -> Set<cb>
  const eventSubsRef = useRef({}); // id -> Set<cb>

  // Bucket para agrupar deltas desde el worker y flushear en lote
  const bucketRef = useRef({ priceDelta:{}, tradeDeltas:[], payoutDeltas:[] });
  const flushTimerRef = useRef(null);

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* ---------- Worker boot ---------- */
  useEffect(() => {
    const w = new Worker(new URL('@/workers/botSim.worker.js', import.meta.url), { type:'module' });
    workerRef.current = w;

    w.onmessage = (e) => {
      const { type, ...rest } = e.data || {};
      if (type === 'ready') { setRunning(!!rest.running); return; }
      if (type === 'delta') {
        const b = bucketRef.current;
        Object.assign(b.priceDelta, rest.priceDelta || {});
        b.tradeDeltas.push(...(rest.tradeDeltas || []));
        b.payoutDeltas.push(...(rest.payoutDeltas || []));
      }
    };

    w.postMessage({ type:'init' });

    const flush = () => {
      const b = bucketRef.current;

      const have =
        Object.keys(b.priceDelta).length ||
        b.tradeDeltas.length ||
        b.payoutDeltas.length;

      if (!have) return;

      if (Object.keys(b.priceDelta).length) {
        setPrices((prev) => ({ ...prev, ...b.priceDelta }));
      }

      if (b.tradeDeltas.length) {
        // 1) trades
        setTradesById((prev) => {
          const next = { ...prev };
          for (const d of b.tradeDeltas) {
            const arr = next[d.actId] || [];
            if (d.change === 'open') {
              next[d.actId] = [d.trade, ...arr].slice(0, 80);
              // evento
              pushEvent(d.actId, {
                id: uid(),
                kind: 'open',
                created_at: new Date().toISOString(),
                payload: { pair: d.trade.pair, side: d.trade.side, amount_usd: d.trade.amount_usd }
              });
            } else if (d.change === 'close') {
              next[d.actId] = arr.map(t => t.id === d.id ? { ...t, status:'closed', pnl:d.pnl, closed_at:Date.now() } : t);
              // evento
              pushEvent(d.actId, {
                id: uid(),
                kind: 'close',
                created_at: new Date().toISOString(),
                payload: { pair: d.pair, pnl: d.pnl }
              });
            }
          }
          return next;
        });
      }

      if (b.payoutDeltas.length) {
        // 2) payouts simulados (profit/net)
        setPayoutsById((prev) => {
          const next = { ...prev };
          for (const d of b.payoutDeltas) {
            const p = next[d.actId] || { profit:0, fees:0, net:0, withdrawn:0 };
            next[d.actId] = {
              ...p,
              profit: p.profit + (d.profitDelta || 0),
              net:    p.net    + (d.netDelta    || 0),
            };
          }
          return next;
        });
      }

      // Vaciar bucket
      bucketRef.current = { priceDelta:{}, tradeDeltas:[], payoutDeltas:[] };

      // Notificar subscriptores
      notifySubs();
    };

    const scheduleFlush = () => {
      if ('requestIdleCallback' in window) {
        // @ts-ignore
        flushTimerRef.current = requestIdleCallback(flush, { timeout: 1800 });
      } else {
        flushTimerRef.current = setTimeout(flush, 1800);
      }
    };

    scheduleFlush();
    const id = setInterval(scheduleFlush, 2000);

    return () => {
      clearInterval(id);
      if (flushTimerRef.current) {
        // @ts-ignore
        window.cancelIdleCallback?.(flushTimerRef.current);
        clearTimeout(flushTimerRef.current);
      }
      try { w.terminate(); } catch {}
      workerRef.current = null;
    };
  }, []);

  /* ---------- Helpers de eventos/subs ---------- */
  const pushEvent = useCallback((activationId, ev) => {
    setEventsById((prev) => {
      const list = prev[activationId] || [];
      const next = [ev, ...list].slice(0, 120);
      return { ...prev, [activationId]: next };
    });
  }, []);

  const notifySubs = useCallback(() => {
    // trades
    try {
      Object.entries(tradeSubsRef.current).forEach(([id, set]) => {
        if (!set?.size) return;
        const rows = (tradesById[id] || []).slice(0, 80);
        set.forEach((cb) => { try { cb(rows); } catch {} });
      });
    } catch {}
    // events
    try {
      Object.entries(eventSubsRef.current).forEach(([id, set]) => {
        if (!set?.size) return;
        const rows = (eventsById[id] || []).slice(0, 80);
        set.forEach((cb) => { try { cb(rows); } catch {} });
      });
    } catch {}
  }, [tradesById, eventsById]);

  /* ---------- Sincronizar activaciones reales -> worker ---------- */
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;

    (botActivations || [])
      .filter((a) => String(a.status || '').toLowerCase() === 'active')
      .forEach((a) => {
        // si el worker no tiene aún cache para esa activación, la seed-eamos
        const haveTrades = !!(tradesById[a.id]);
        const havePayout = !!(payoutsById[a.id]);
        if (!haveTrades && !havePayout) {
          w.postMessage({
            type: 'addActivation',
            payload: { id: a.id, amountUsd: a.amountUsd, botName: a.botName, status: 'active' }
          });
        }
      });
  }, [botActivations, tradesById, payoutsById]);

  /* ---------- API simulada que pide la page ---------- */

  // Trades
  const listBotTrades = useCallback(async (activationId, limit = 80) => {
    const arr = tradesById[activationId] || [];
    return arr.slice(0, limit);
  }, [tradesById]);

  const subscribeBotTrades = useCallback((activationId, cb) => {
    if (!activationId || !cb) return () => {};
    const set = (tradeSubsRef.current[activationId] ||= new Set());
    set.add(cb);
    // entrega inmediata del snapshot
    try { cb((tradesById[activationId] || []).slice(0, 80)); } catch {}
    return () => { set.delete(cb); };
  }, [tradesById]);

  // Eventos
  const listBotEvents = useCallback(async (activationId, limit = 80) => {
    const arr = eventsById[activationId] || [];
    return arr.slice(0, limit);
  }, [eventsById]);

  const subscribeBotEvents = useCallback((activationId, cb) => {
    if (!activationId || !cb) return () => {};
    const set = (eventSubsRef.current[activationId] ||= new Set());
    set.add(cb);
    try { cb((eventsById[activationId] || []).slice(0, 80)); } catch {}
    return () => { set.delete(cb); };
  }, [eventsById]);

  // Tomar ganancias (usa PnL "realizado" simulado y acredita en saldo real)
  const takeProfit = useCallback(async (activationId) => {
    const p = payoutsById[activationId];
    if (!p) return { ok: false, code: 'NO_PNL' };

    const withdrawable = Math.max(0, Number(p.net || 0) - Number(p.withdrawn || 0));
    if (withdrawable <= 0) return { ok: false, code: 'NO_PNL' };

    // Acredita en el saldo real usando tu DataContext
    const r = await creditBotProfit?.(activationId, withdrawable, 'Take Profit (simulado)');
    if (r?.ok === false) return r;

    // Marca como retirado localmente y emite evento
    setPayoutsById((prev) => {
      const cur = prev[activationId] || { profit: 0, fees: 0, net: 0, withdrawn: 0 };
      return {
        ...prev,
        [activationId]: { ...cur, withdrawn: Number(cur.withdrawn || 0) + withdrawable }
      };
    });
    try { workerRef.current?.postMessage({ type:'takeProfitMarked', payload: activationId }); } catch {}
    pushEvent(activationId, {
      id: uid(),
      kind: 'withdraw',
      created_at: new Date().toISOString(),
      payload: { amount_usd: withdrawable }
    });

    await Promise.all([refreshTransactions?.()]);
    return { ok: true };
  }, [payoutsById, creditBotProfit, refreshTransactions, pushEvent]);

  // Controles básicos del worker
  const controls = useMemo(() => ({
    start: () => workerRef.current?.postMessage({ type:'start' }),
    stop:  () => workerRef.current?.postMessage({ type:'stop' }),
    setTick: (ms) => workerRef.current?.postMessage({ type:'setTick', payload: ms }),
    // expone add/cancel directo al worker (normalmente no hace falta llamarlos desde la UI)
    _simAddActivation: (a) => workerRef.current?.postMessage({ type:'addActivation', payload: a }),
    _simCancelActivation: (id) => workerRef.current?.postMessage({ type:'cancelActivation', payload: id }),
  }), []);

  // Re-expone todo lo real + lo simulado que la página necesita
  return {
    ...rest,
    botActivations,
    activateBot,
    cancelBot,
    creditBotProfit,
    refreshBotActivations,
    refreshTransactions,
    getAvailableBalance,
    getPairInfo,

    // Estado sim
    running, prices, tradesById, payoutsById, eventsById,

    // API que usa TradingBotsPage
    listBotTrades,
    subscribeBotTrades,
    listBotEvents,
    subscribeBotEvents,
    takeProfit,

    // Controles sim
    ...controls,
  };
}
