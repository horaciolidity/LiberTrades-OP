import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

const AUTO_SETTLE = true;                 // asentar PnL de cada cierre a la wallet
const TAKEPROFIT_COOLDOWN_MS = 60_000;    // 60s de enfriamiento para "Tomar ganancias"
const WITHDRAW_MIN_STEP_USD = 5;          // no habilita TP si no hay al menos esto

export default function useBotSimWorker(ctx) {
  const {
    // negocio/base
    botActivations = [],
    activateBot,
    cancelBot,
    creditBotProfit,
    addTransaction,                   // ⬅️ necesario para asentar pérdidas
    refreshBotActivations,
    refreshTransactions,
    getAvailableBalance,
    getPairInfo,

    // PnL real (desde transacciones)
    getBotPnl: getBotPnlReal = () => ({ profit:0, fees:0, refunds:0, net:0 }),
    totalBotProfit: totalProfitReal = 0,
    totalBotFees: totalFeesReal = 0,
    totalBotNet: totalNetReal = 0,

    ...rest
  } = ctx || {};

  const workerRef = useRef(null);

  // Estado sim
  const [running, setRunning] = useState(false);
  const [prices, setPrices] = useState({});
  const [tradesById, setTradesById] = useState({});
  const [payoutsById, setPayoutsById] = useState({}); // {actId:{profit,net,withdrawn}}
  const [eventsById, setEventsById] = useState({});

  // subs
  const tradeSubsRef = useRef({});
  const eventSubsRef = useRef({});

  // bucket deltas → flush
  const bucketRef = useRef({ priceDelta:{}, tradeDeltas:[], payoutDeltas:[] });
  const flushTimerRef = useRef(null);

  // idempotencia de cierres asentados
  const persistedTradeIdsRef = useRef(new Set());
  // cooldown de takeProfit por activación
  const tpCooldownRef = useRef(new Map());

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* ---------- Boot worker ---------- */
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
    w.postMessage({ type:'start' });

    // perfil más realista: 46% winrate, R medio 1.1, 1-3 trades vivos, etc.
    w.postMessage({
      type:'setProfile',
      payload:{
        winRate: 0.46,
        avgR: 1.1,
        maxConcurrent: 3,
        baseHoldMs: 45_000,
        jitterMs: 25_000,
        tradeEveryMs: 15_000,
        feeBps: 8,         // 0.08% por lado aprox
      }
    });

    const flush = async () => {
      const b = bucketRef.current;
      const has =
        Object.keys(b.priceDelta).length ||
        b.tradeDeltas.length ||
        b.payoutDeltas.length;
      if (!has) return;

      if (Object.keys(b.priceDelta).length) {
        setPrices((prev) => ({ ...prev, ...b.priceDelta }));
      }

      // guardamos para persistir cierres fuera del setState
      const closedForPersist = [];

      if (b.tradeDeltas.length) {
        setTradesById((prev) => {
          const next = { ...prev };
          for (const d of b.tradeDeltas) {
            const arr = next[d.actId] || [];
            if (d.change === 'open') {
              next[d.actId] = [d.trade, ...arr].slice(0, 120);
              pushEvent(d.actId, { id: uid(), kind:'open', created_at: new Date().toISOString(),
                payload: { pair:d.trade.pair, side:d.trade.side, amount_usd:d.trade.amount_usd } });
            } else if (d.change === 'close') {
              next[d.actId] = arr.map(t => t.id === d.id
                ? { ...t, status:'closed', pnl:d.pnl, closed_at:Date.now() } : t);
              pushEvent(d.actId, { id: uid(), kind:'close', created_at: new Date().toISOString(),
                payload: { pair:d.pair, pnl:d.pnl } });

              // para persistencia (una sola vez por trade)
              closedForPersist.push(d);
            }
          }
          return next;
        });
      }

      if (b.payoutDeltas.length) {
        setPayoutsById((prev) => {
          const next = { ...prev };
          for (const d of b.payoutDeltas) {
            const p = next[d.actId] || { profit:0, net:0, withdrawn:0 };
            next[d.actId] = {
              ...p,
              profit: p.profit + (d.profitDelta || 0),
              net:    p.net    + (d.netDelta    || 0),
            };
          }
          return next;
        });
      }

      bucketRef.current = { priceDelta:{}, tradeDeltas:[], payoutDeltas:[] };
      notifySubs();

      // ======= Persistencia (auto-settle) de cierres =======
      if (AUTO_SETTLE && closedForPersist.length) {
        for (const d of closedForPersist) {
          const key = String(d.id);
          if (persistedTradeIdsRef.current.has(key)) continue; // idempotencia
          persistedTradeIdsRef.current.add(key);

          // d.pnl es neto; si >0 acreditamos profit, si <0 lo asentamos como pérdida
          try {
            if (d.pnl > 0) {
              await creditBotProfit?.(d.actId, d.pnl, `PnL sim ${d.pair}`);
            } else if (d.pnl < 0 && typeof addTransaction === 'function') {
              await addTransaction({
                amount: Number(d.pnl),               // negativo
                type: 'bot_loss',
                currency: 'USDC',
                description: `Loss sim ${d.pair}`,
                referenceType: 'bot_trade',
                referenceId: key,
                status: 'completed',
              });
            }
          } catch {}
        }
        try { await refreshTransactions?.(); } catch {}
      }
    };

    const schedule = () => {
      if ('requestIdleCallback' in window) {
        // @ts-ignore
        flushTimerRef.current = requestIdleCallback(flush, { timeout: 1500 });
      } else {
        flushTimerRef.current = setTimeout(flush, 1500);
      }
    };
    schedule();
    const id = setInterval(schedule, 1800);

    const onVis = () => {
      if (document.hidden) w.postMessage({ type:'stop' });
      else w.postMessage({ type:'start' });
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      if (flushTimerRef.current) {
        // @ts-ignore
        window.cancelIdleCallback?.(flushTimerRef.current);
        clearTimeout(flushTimerRef.current);
      }
      try { w.terminate(); } catch {}
      workerRef.current = null;
    };
  }, [addTransaction, creditBotProfit, refreshTransactions]);

  /* ---------- Helpers events/subs ---------- */
  const pushEvent = useCallback((aid, ev) => {
    setEventsById((prev) => {
      const list = prev[aid] || [];
      return { ...prev, [aid]: [ev, ...list].slice(0, 200) };
    });
  }, []);

  const notifySubs = useCallback(() => {
    // trades
    for (const [id, set] of Object.entries(tradeSubsRef.current)) {
      if (!set?.size) continue;
      const rows = (tradesById[id] || []).slice(0, 120);
      set.forEach((cb) => { try { cb(rows); } catch {} });
    }
    // events
    for (const [id, set] of Object.entries(eventSubsRef.current)) {
      if (!set?.size) continue;
      const rows = (eventsById[id] || []).slice(0, 120);
      set.forEach((cb) => { try { cb(rows); } catch {} });
    }
  }, [tradesById, eventsById]);

  /* ---------- Seed activaciones reales al worker ---------- */
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    let seeded = false;

    (botActivations || [])
      .filter((a) => String(a.status || '').toLowerCase() === 'active')
      .forEach((a) => {
        const have = tradesById[a.id] || payoutsById[a.id];
        if (!have) {
          w.postMessage({ type:'addActivation',
            payload: { id:a.id, amountUsd:a.amountUsd, botName:a.botName, status:'active' } });
          seeded = true;
        }
      });

    if (seeded) { try { w.postMessage({ type:'start' }); } catch {} }
  }, [botActivations, tradesById, payoutsById]);

  /* ---------- API que usa la página ---------- */
  const listBotTrades = useCallback(async (aid, limit = 80) => {
    return (tradesById[aid] || []).slice(0, limit);
  }, [tradesById]);

  const subscribeBotTrades = useCallback((aid, cb) => {
    if (!aid || !cb) return () => {};
    const set = (tradeSubsRef.current[aid] ||= new Set());
    set.add(cb);
    try { cb((tradesById[aid] || []).slice(0, 80)); } catch {}
    return () => set.delete(cb);
  }, [tradesById]);

  const listBotEvents = useCallback(async (aid, limit = 80) => {
    return (eventsById[aid] || []).slice(0, limit);
  }, [eventsById]);

  const subscribeBotEvents = useCallback((aid, cb) => {
    if (!aid || !cb) return () => {};
    const set = (eventSubsRef.current[aid] ||= new Set());
    set.add(cb);
    try { cb((eventsById[aid] || []).slice(0, 80)); } catch {}
    return () => set.delete(cb);
  }, [eventsById]);

  // Tomar ganancias (con cooldown)
  const takeProfit = useCallback(async (aid) => {
    const now = Date.now();
    const last = tpCooldownRef.current.get(aid) || 0;
    if (now - last < TAKEPROFIT_COOLDOWN_MS) {
      const left = Math.ceil((TAKEPROFIT_COOLDOWN_MS - (now - last))/1000);
      return { ok:false, code:'COOLDOWN', left };
    }

    const p = payoutsById[aid];
    const withdrawable = Math.max(0, Number(p?.net || 0) - Number(p?.withdrawn || 0));
    if (withdrawable < WITHDRAW_MIN_STEP_USD) return { ok:false, code:'NO_PNL' };

    const r = await creditBotProfit?.(aid, withdrawable, 'Take Profit (sim)');
    if (r?.ok === false) return r;

    setPayoutsById((prev) => {
      const cur = prev[aid] || { profit:0, net:0, withdrawn:0 };
      return { ...prev, [aid]: { ...cur, withdrawn: Number(cur.withdrawn || 0) + withdrawable } };
    });
    tpCooldownRef.current.set(aid, now);

    try { workerRef.current?.postMessage({ type:'takeProfitMarked', payload: aid }); } catch {}

    pushEvent(aid, { id: uid(), kind:'withdraw', created_at:new Date().toISOString(),
      payload: { amount_usd: withdrawable } });

    await refreshTransactions?.();
    return { ok:true };
  }, [payoutsById, creditBotProfit, refreshTransactions]);

  /* ---------- PnL fusionado (real + sim) ---------- */
  const getBotPnl = useCallback((aid) => {
    const base = getBotPnlReal?.(aid) || { profit:0, fees:0, refunds:0, net:0 };
    const sim  = payoutsById[aid] || { profit:0, net:0, withdrawn:0 };
    return {
      ...base,
      profit: Number(base.profit || 0) + Number(sim.profit || 0),
      net:    Number(base.net    || 0) + Number(sim.net    || 0),
      withdrawn: Number(sim.withdrawn || 0),
    };
  }, [getBotPnlReal, payoutsById]);

  const simTotals = useMemo(() => {
    let profit = 0, net = 0, withdrawn = 0;
    Object.values(payoutsById).forEach((x) => {
      profit += Number(x?.profit || 0);
      net    += Number(x?.net    || 0);
      withdrawn += Number(x?.withdrawn || 0);
    });
    return { profit, net, withdrawn };
  }, [payoutsById]);

  const totalBotProfit = Number(totalProfitReal) + simTotals.profit;
  const totalBotFees   = Number(totalFeesReal);
  const totalBotNet    = Number(totalNetReal) + (simTotals.net - simTotals.withdrawn);

  /* ---------- Controles ---------- */
  const controls = useMemo(() => ({
    start: () => workerRef.current?.postMessage({ type:'start' }),
    stop:  () => workerRef.current?.postMessage({ type:'stop' }),
    setTick: (ms) => workerRef.current?.postMessage({ type:'setTick', payload: ms }),
    setProfile: (p) => workerRef.current?.postMessage({ type:'setProfile', payload: p }),
  }), []);

  return {
    ...rest,
    botActivations,
    activateBot,
    cancelBot,
    creditBotProfit,
    addTransaction,
    refreshBotActivations,
    refreshTransactions,
    getAvailableBalance,
    getPairInfo,

    running, prices, tradesById, payoutsById, eventsById,

    listBotTrades,
    subscribeBotTrades,
    listBotEvents,
    subscribeBotEvents,
    takeProfit,

    getBotPnl,
    totalBotProfit,
    totalBotFees,
    totalBotNet,

    ...controls,
  };
}
