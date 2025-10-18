import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

/* ===================== Helper: generar trades iniciales ===================== */
// Cada secuencia es [ + , - , - ] para simular más pérdidas que ganancias
function generateTradeSequence(amount) {
  return [
    +(Math.random() * amount * 0.05).toFixed(2),    // positivo hasta +5%
    -(Math.random() * amount * 0.03).toFixed(2),    // negativo hasta -3%
    -(Math.random() * amount * 0.03).toFixed(2),    // negativo hasta -3%
  ];
}

export default function useBotSimWorker(ctx) {
  const {
    botActivations = [],
    activateBot,
    cancelBot,
    refreshBotActivations,
    refreshTransactions,
    getAvailableBalance,
    getPairInfo,
    getBotPnl: getBotPnlReal = () => ({ profit: 0, fees: 0, refunds: 0, net: 0 }),
    totalBotProfit: totalProfitReal = 0,
    totalBotFees: totalFeesReal = 0,
    totalBotNet: totalNetReal = 0,
    ...rest
  } = ctx || {};

  const workerRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [prices, setPrices] = useState({});
  const [tradesById, setTradesById] = useState({});
  const [payoutsById, setPayoutsById] = useState({});
  const [eventsById, setEventsById] = useState({});

  const tradeSubsRef = useRef({});
  const eventSubsRef = useRef({});
  const bucketRef = useRef({ priceDelta: {}, tradeDeltas: [], payoutDeltas: [] });
  const flushTimerRef = useRef(null);
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* ---------- Boot worker ---------- */
  useEffect(() => {
    const w = new Worker(new URL('@/workers/botSim.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = w;

    w.onmessage = async (e) => {
      const { type, ...rest } = e.data || {};

      if (type === 'ready') {
        setRunning(!!rest.running);
        return;
      }

      if (type === 'delta') {
        const b = bucketRef.current;
        Object.assign(b.priceDelta, rest.priceDelta || {});
        b.tradeDeltas.push(...(rest.tradeDeltas || []));
        b.payoutDeltas.push(...(rest.payoutDeltas || []));
      }

      // 📌 Flush acumulado de PnL desde el worker
      if (type === 'flushPnl') {
        const { actId, total, userId } = rest;
        if (!Number.isFinite(total) || total === 0) return;
        try {
          await supabase.rpc('credit_bot_profit', {
            p_user_id: userId,
            p_activation_id: actId,
            p_amount_usd: total,
            p_currency: 'USDC',
            p_note: total >= 0 ? 'PnL positivo (flush)' : 'PnL negativo (flush)',
          });
          await refreshTransactions?.();
          console.log(`[FLUSH → BD] Bot ${actId}: ${total.toFixed(2)} USDC`);
        } catch (err) {
          console.error('Error en credit_bot_profit:', err);
        }
      }
    };

    w.postMessage({ type: 'init' });
    w.postMessage({ type: 'start' });

    // flush loop (visual/UI)
    const flush = () => {
      const b = bucketRef.current;
      const has =
        Object.keys(b.priceDelta).length ||
        b.tradeDeltas.length ||
        b.payoutDeltas.length;
      if (!has) return;

      if (Object.keys(b.priceDelta).length) {
        setPrices((prev) => ({ ...prev, ...b.priceDelta }));
      }

      if (b.tradeDeltas.length) {
        setTradesById((prev) => {
          const next = { ...prev };
          for (const d of b.tradeDeltas) {
            const arr = next[d.actId] || [];
            if (d.change === 'open') {
              next[d.actId] = [d.trade, ...arr].slice(0, 120);
              pushEvent(d.actId, {
                id: uid(),
                kind: 'open',
                created_at: new Date().toISOString(),
                payload: { pair: d.trade.pair, side: d.trade.side, amount_usd: d.trade.amount_usd },
              });
            } else if (d.change === 'close') {
              next[d.actId] = arr.map((t) =>
                t.id === d.id ? { ...t, status: 'closed', pnl: d.pnl, closed_at: Date.now() } : t
              );
              pushEvent(d.actId, {
                id: uid(),
                kind: 'close',
                created_at: new Date().toISOString(),
                payload: { pair: d.pair, pnl: d.pnl },
              });
            }
          }
          return next;
        });
      }

      if (b.payoutDeltas.length) {
        setPayoutsById((prev) => {
          const next = { ...prev };
          for (const d of b.payoutDeltas) {
            const p = next[d.actId] || { profit: 0, losses: 0, net: 0, withdrawn: 0 };
            next[d.actId] = {
              ...p,
              profit: p.profit + (d.profitDelta || 0),
              net: p.net + (d.netDelta || 0),
            };
          }
          return next;
        });
      }

      bucketRef.current = { priceDelta: {}, tradeDeltas: [], payoutDeltas: [] };
      notifySubs();
    };

    const schedule = () => {
      if ('requestIdleCallback' in window) {
        // @ts-ignore
        flushTimerRef.current = requestIdleCallback(flush, { timeout: 1800 });
      } else {
        flushTimerRef.current = setTimeout(flush, 1800);
      }
    };
    schedule();
    const id = setInterval(schedule, 2000);

    const onVis = () => {
      if (document.hidden) w.postMessage({ type: 'stop' });
      else w.postMessage({ type: 'start' });
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      if (flushTimerRef.current) {
        window.cancelIdleCallback?.(flushTimerRef.current);
        clearTimeout(flushTimerRef.current);
      }
      try {
        w.terminate();
      } catch {}
      workerRef.current = null;
    };
  }, [refreshTransactions]);

  /* ---------- Helpers events/subs ---------- */
  const pushEvent = useCallback((aid, ev) => {
    setEventsById((prev) => {
      const list = prev[aid] || [];
      return { ...prev, [aid]: [ev, ...list].slice(0, 200) };
    });
  }, []);

  const notifySubs = useCallback(() => {
    for (const [id, set] of Object.entries(tradeSubsRef.current)) {
      if (!set?.size) continue;
      const rows = (tradesById[id] || []).slice(0, 120);
      set.forEach((cb) => { try { cb(rows); } catch {} });
    }
    for (const [id, set] of Object.entries(eventSubsRef.current)) {
      if (!set?.size) continue;
      const rows = (eventsById[id] || []).slice(0, 120);
      set.forEach((cb) => { try { cb(rows); } catch {} });
    }
  }, [tradesById, eventsById]);

  /* ---------- Seed activaciones ---------- */
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;

    (botActivations || [])
      .filter((a) => String(a.status || '').toLowerCase() === 'active')
      .forEach((a) => {
        const have = tradesById[a.id] || payoutsById[a.id];
        if (!have) {
          const seq = generateTradeSequence(a.amountUsd);
          const profit = seq.reduce((acc, v) => acc + v, 0);

          setPayoutsById((prev) => ({
            ...prev,
            [a.id]: { profit, net: profit, withdrawn: 0 },
          }));

          w.postMessage({
            type: 'addActivation',
            payload: { id: a.id, amountUsd: a.amountUsd, botName: a.botName, status: 'active' },
          });
        }
      });
  }, [botActivations, tradesById, payoutsById]);

  /* ---------- API ---------- */
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

  /* ---------- Take Profit manual ---------- */
  const takeProfit = useCallback(async (aid) => {
    const p = payoutsById[aid];
    const withdrawable = Math.max(0, Number(p?.net || 0) - Number(p?.withdrawn || 0));
    if (withdrawable <= 0) return { ok: false, code: 'NO_PNL' };

    try {
      await supabase.rpc('credit_bot_profit', {
        p_user_id: ctx?.user?.id,
        p_activation_id: aid,
        p_amount_usd: withdrawable,
        p_currency: 'USDC',
        p_note: 'Take Profit (sim)',
      });
      setPayoutsById((prev) => {
        const cur = prev[aid] || { profit: 0, net: 0, withdrawn: 0 };
        return { ...prev, [aid]: { ...cur, withdrawn: cur.withdrawn + withdrawable } };
      });
      pushEvent(aid, {
        id: uid(),
        kind: 'withdraw',
        created_at: new Date().toISOString(),
        payload: { amount_usd: withdrawable },
      });
      await refreshTransactions?.();
      return { ok: true };
    } catch (err) {
      console.error('Error Take Profit:', err);
      return { ok: false };
    }
  }, [payoutsById, refreshTransactions, ctx?.user?.id]);

  /* ---------- PnL fusionado ---------- */
  const getBotPnl = useCallback((aid) => {
    const base = getBotPnlReal?.(aid) || { profit: 0, fees: 0, refunds: 0, net: 0 };
    const sim = payoutsById[aid] || { profit: 0, net: 0, withdrawn: 0 };
    return {
      ...base,
      profit: Number(base.profit || 0) + Number(sim.profit || 0),
      net: Number(base.net || 0) + Number(sim.net || 0),
      withdrawn: Number(sim.withdrawn || 0),
    };
  }, [getBotPnlReal, payoutsById]);

  const simTotals = useMemo(() => {
    let profit = 0, net = 0, withdrawn = 0;
    Object.values(payoutsById).forEach((x) => {
      profit += Number(x?.profit || 0);
      net += Number(x?.net || 0);
      withdrawn += Number(x?.withdrawn || 0);
    });
    return { profit, net, withdrawn };
  }, [payoutsById]);

  const totalBotProfit = Number(totalProfitReal) + simTotals.profit;
  const totalBotFees = Number(totalFeesReal);
  const totalBotNet = Number(totalNetReal) + (simTotals.net - simTotals.withdrawn);

  /* ---------- Controles ---------- */
  const controls = useMemo(() => ({
    start: () => workerRef.current?.postMessage({ type: 'start' }),
    stop: () => workerRef.current?.postMessage({ type: 'stop' }),
    setTick: (ms) => workerRef.current?.postMessage({ type: 'setTick', payload: ms }),
  }), []);

  return {
    ...rest,
    botActivations,
    activateBot,
    cancelBot,
    refreshBotActivations,
    refreshTransactions,
    getAvailableBalance,
    getPairInfo,
    running,
    prices,
    tradesById,
    payoutsById,
    eventsById,
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
