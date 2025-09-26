// src/hooks/useBotSimWorker.js
import { useEffect, useMemo, useRef, useState } from 'react';

export default function useBotSimWorker() {
  const workerRef = useRef(null);
  const runningRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [prices, setPrices] = useState({});
  const [tradesById, setTradesById] = useState({});
  const [payoutsById, setPayoutsById] = useState({});

  // bucket para deltas (throttling de renders)
  const bucketRef = useRef({ priceDelta: {}, tradeDeltas: [], payoutDeltas: [] });
  const flushTimerRef = useRef(null);
  const intervalRef = useRef(null);
  const idleHandleRef = useRef(null);

  const flushNow = () => {
    const b = bucketRef.current;
    const hasPrices = Object.keys(b.priceDelta).length > 0;
    const hasTrades = b.tradeDeltas.length > 0;
    const hasPayouts = b.payoutDeltas.length > 0;
    if (!(hasPrices || hasTrades || hasPayouts)) return;

    if (hasPrices) {
      setPrices((prev) => ({ ...prev, ...b.priceDelta }));
    }

    if (hasTrades) {
      setTradesById((prev) => {
        const next = { ...prev };
        for (const d of b.tradeDeltas) {
          const list = next[d.actId] || [];
          if (d.change === 'open' && d.trade) {
            next[d.actId] = [d.trade, ...list].slice(0, 40);
          } else if (d.change === 'close') {
            // intentamos cerrar por id; si no estaba en memoria, no lo agregamos para evitar ruido
            const found = list.some((t) => t.id === d.id);
            next[d.actId] = found
              ? list.map((t) =>
                  t.id === d.id ? { ...t, status: 'closed', pnl: d.pnl, closed_at: Date.now() } : t
                )
              : list;
          }
        }
        return next;
      });
    }

    if (hasPayouts) {
      setPayoutsById((prev) => {
        const next = { ...prev };
        for (const d of b.payoutDeltas) {
          const p = next[d.actId] || { profit: 0, fees: 0, net: 0, withdrawn: 0 };
          next[d.actId] = {
            ...p,
            profit: p.profit + (d.profitDelta || 0),
            net: p.net + (d.netDelta || 0),
          };
        }
        return next;
      });
    }

    // vaciar bucket
    bucketRef.current = { priceDelta: {}, tradeDeltas: [], payoutDeltas: [] };
  };

  const scheduleFlush = () => {
    // un flush inmediato en idle para UX fluida + un backup cada 2s
    if ('requestIdleCallback' in window) {
      idleHandleRef.current = window.requestIdleCallback(flushNow, { timeout: 1800 });
    } else {
      flushTimerRef.current = setTimeout(flushNow, 1800);
    }
  };

  const clearSchedulers = () => {
    if (idleHandleRef.current) {
      window.cancelIdleCallback?.(idleHandleRef.current);
      idleHandleRef.current = null;
    }
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    const w = new Worker(new URL('@/workers/botSim.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = w;

    const applySnapshot = (snap) => {
      if (snap?.prices) setPrices(snap.prices);
      if (snap?.trades) setTradesById(snap.trades);
      if (snap?.payouts) setPayoutsById(snap.payouts);
    };

    w.onmessage = (e) => {
      const { type, ...rest } = e.data || {};
      switch (type) {
        case 'ready':
          setRunning(!!rest.running);
          runningRef.current = !!rest.running;
          // pedimos snapshot inicial por si el worker ya tenía estado
          w.postMessage({ type: 'getState' });
          break;

        case 'snapshot':
        case 'started':
          if (typeof rest.running === 'boolean') {
            setRunning(rest.running);
            runningRef.current = rest.running;
          }
          applySnapshot(rest);
          break;

        case 'stopped':
          setRunning(false);
          runningRef.current = false;
          break;

        case 'delta': {
          const b = bucketRef.current;
          Object.assign(b.priceDelta, rest.priceDelta || {});
          if (rest.tradeDeltas?.length) b.tradeDeltas.push(...rest.tradeDeltas);
          if (rest.payoutDeltas?.length) b.payoutDeltas.push(...rest.payoutDeltas);
          break;
        }

        case 'tock':
          // opcional: podrías exponer el nuevo tickMs si querés mostrarlo
          break;

        case 'activationAdded':
        case 'activationCanceled':
        case 'takeProfitAck':
        default:
          // no-op para estos mensajes en el hook
          break;
      }
    };

    // iniciar
    w.postMessage({ type: 'init', payload: { tickMs: 3000, maxItems: 40 } });
    w.postMessage({ type: 'start' });

    // bucle de flush barato cada 2s
    intervalRef.current = setInterval(() => {
      scheduleFlush();
      // por si el idle/backoff no corre, garantizamos flush cada iteración
      setTimeout(flushNow, 1900);
    }, 2000);

    const onVis = () => {
      if (document.hidden) {
        w.postMessage({ type: 'stop' });
      } else if (runningRef.current) {
        w.postMessage({ type: 'start' });
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearSchedulers();
      try { w.terminate(); } catch {}
      workerRef.current = null;
    };
  }, []); // se crea una sola vez

  const controls = useMemo(() => ({
    start: () => workerRef.current?.postMessage({ type: 'start' }),
    stop: () => workerRef.current?.postMessage({ type: 'stop' }),
    setTick: (ms) => workerRef.current?.postMessage({ type: 'setTick', payload: ms }),
    addActivation: (a) => workerRef.current?.postMessage({ type: 'addActivation', payload: a }),
    cancelActivation: (id) => workerRef.current?.postMessage({ type: 'cancelActivation', payload: id }),
    markTakeProfit: (id) => workerRef.current?.postMessage({ type: 'takeProfitMarked', payload: id }),
    getState: () => workerRef.current?.postMessage({ type: 'getState' }),
    reset: () => workerRef.current?.postMessage({ type: 'reset' }),
  }), []);

  return { running, prices, tradesById, payoutsById, ...controls };
}
