import { useEffect, useMemo, useRef, useState, useCallback } from 'react'

/* ===================== Helper: generar trades iniciales ===================== */
// Secuencia [ + , - , - ] → simula más pérdidas que ganancias
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
    creditBotProfit,        // RPC: refleja en wallet real
    refreshBotActivations,
    refreshTransactions,
    getAvailableBalance,
    getPairInfo,

    // PnL real desde DB
    getBotPnl: getBotPnlReal = () => ({ profit: 0, fees: 0, refunds: 0, net: 0 }),
    totalBotProfit: totalProfitReal = 0,
    totalBotFees: totalFeesReal = 0,
    totalBotNet: totalNetReal = 0,

    ...rest
  } = ctx || {};

  const workerRef = useRef(null);

  // Estado local de simulación
  const [running, setRunning] = useState(false);
  const [prices, setPrices] = useState({});
  const [tradesById, setTradesById] = useState({});
  const [payoutsById, setPayoutsById] = useState({});
  const [eventsById, setEventsById] = useState({});

  // Subscripciones
  const tradeSubsRef = useRef({});
  const eventSubsRef = useRef({});

  // Bucket de deltas
  const bucketRef = useRef({ priceDelta: {}, tradeDeltas: [], payoutDeltas: [] });
  const flushTimerRef = useRef(null);

  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  /* ===================== Boot del Worker ===================== */
  useEffect(() => {
    const w = new Worker(new URL('@/workers/botSim.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = w;

    w.onmessage = async (e) => {
      const { type, ...rest } = e.data || {};

      switch (type) {
        case 'ready':
          setRunning(!!rest.running);
          break;

        case 'delta': {
          const b = bucketRef.current;
          Object.assign(b.priceDelta, rest.priceDelta || {});
          b.tradeDeltas.push(...(rest.tradeDeltas || []));
          b.payoutDeltas.push(...(rest.payoutDeltas || []));
          break;
        }

        // 📊 Impacto directo de ganancia/pérdida en balance real
        case 'balanceImpact': {
          const { pnl, actId, botName } = rest;
          if (!pnl || !actId) break;
          try {
            await creditBotProfit?.(
              actId,
              pnl,
              `${botName || 'Bot'} ${pnl >= 0 ? 'ganó' : 'perdió'} ${Math.abs(pnl).toFixed(2)} USDC`
            );
            await refreshTransactions?.();
            await refreshBotActivations?.();
          } catch (err) {
            console.error('[balanceImpact]', err);
          }
          break;
        }

        // 🟥 Cancelación (Retirarse)
        case 'activationCanceled': {
          const { id } = rest;
          if (!id) break;
          try {
            await cancelBot?.(id);
            await refreshBotActivations?.();
            await refreshTransactions?.();
          } catch (err) {
            console.error('[activationCanceled]', err);
          }
          break;
        }

        // 🟩 Toma de ganancias manual
        case 'takeProfitAck': {
          const { id } = rest;
          if (!id) break;
          try {
            const p = payoutsById[id];
            const withdrawable = Math.max(0, Number(p?.net || 0) - Number(p?.withdrawn || 0));
            if (withdrawable > 0) {
              await creditBotProfit?.(id, withdrawable, 'Toma de ganancias (sim)');
              await refreshTransactions?.();
              await refreshBotActivations?.();
              setPayoutsById((prev) => {
                const cur = prev[id] || { profit: 0, net: 0, withdrawn: 0 };
                return { ...prev, [id]: { ...cur, withdrawn: cur.withdrawn + withdrawable } };
              });
            }
          } catch (err) {
            console.error('[takeProfitAck]', err);
          }
          break;
        }

        default:
          break;
      }
    };

   // Evitar reset prematuro al inicializar
setTimeout(() => {
  w.postMessage({ type:'init' });
  w.postMessage({ type:'start' });
}, 1000);


    /* ---------- Loop de flush ---------- */
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
                t.id === d.id
                  ? { ...t, status: 'closed', pnl: d.pnl, closed_at: Date.now() }
                  : t
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
      try { w.terminate(); } catch {}
      workerRef.current = null;
    };
  }, []);

  /* ===================== Eventos / Subs ===================== */
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

 /* ===================== Inicialización de activaciones ===================== */
useEffect(() => {
  const w = workerRef.current;
  if (!w) return;

  // 🧩 1. No tocar nada si las activaciones aún no llegaron
  if (!Array.isArray(botActivations) || botActivations.length === 0) return;

  // 🧩 2. Añadir solo las nuevas activaciones, sin resetear las previas
  (botActivations)
    .filter((a) => String(a.status || '').toLowerCase() === 'active')
    .forEach((a) => {
      // Si ya tenemos trades o payouts para este bot, no lo recrees
      const have = tradesById[a.id] || payoutsById[a.id];
      if (!have) {
        const seq = generateTradeSequence(a.amountUsd);
        const profit = seq.reduce((acc, v) => acc + v, 0);

        setPayoutsById((prev) => ({
          ...prev,
          [a.id]: { profit, net: profit, withdrawn: 0 },
        }));

        // 🚀 Enviamos al worker sin limpiar estado previo
        w.postMessage({
          type: 'addActivation',
          payload: {
            id: a.id,
            amountUsd: a.amountUsd,
            botName: a.botName,
            status: 'active',
          },
        });
      }
    });

  // 🧩 3. Evitar matar el worker en remounts rápidos
  return () => {
    if (document.hidden) {
      try { w.terminate(); } catch {}
      workerRef.current = null;
    }
  };
}, [botActivations, tradesById, payoutsById]);

  /* ===================== API ===================== */
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

  /* ===================== Tomar ganancias manual ===================== */
  const takeProfit = useCallback(async (aid) => {
    const p = payoutsById[aid];
    const withdrawable = Math.max(0, Number(p?.net || 0) - Number(p?.withdrawn || 0));
    if (withdrawable <= 0) return { ok: false, code: 'NO_PNL' };

    const r = await creditBotProfit?.(aid, withdrawable, 'Toma de ganancias (sim)');
    if (r?.ok === false) return r;

    setPayoutsById((prev) => {
      const cur = prev[aid] || { profit: 0, net: 0, withdrawn: 0 };
      return { ...prev, [aid]: { ...cur, withdrawn: Number(cur.withdrawn || 0) + withdrawable } };
    });

    pushEvent(aid, {
      id: uid(),
      kind: 'withdraw',
      created_at: new Date().toISOString(),
      payload: { amount_usd: withdrawable },
    });

    await refreshTransactions?.();
    return { ok: true };
  }, [payoutsById, creditBotProfit, refreshTransactions]);

  /* ===================== PnL fusionado ===================== */
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

  /* ===================== Controles ===================== */
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
    creditBotProfit,
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
