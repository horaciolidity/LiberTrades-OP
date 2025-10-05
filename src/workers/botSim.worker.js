// src/workers/botSim.worker.js
// Cargar como: new Worker(new URL('./botSim.worker.js', import.meta.url), { type: 'module' })

/* ============================================================
   CONFIGURACIÓN DE PARES Y ESTADO BASE
============================================================ */
const defaultPairs = {
  'BTC/USDT': 60000, 'ETH/USDT': 2500, 'BNB/USDT': 350,
  'ADA/USDT': 0.45, 'ALTCOINS/USDT': 1.0, 'MEMES/USDT': 0.01,
};

let state = {
  prices: { ...defaultPairs },
  activations: [], // { id, amountUsd, botName, status }
  trades: {}, // id -> Trade[]
  payouts: {}, // id -> { profit, losses, fees, net, withdrawn }
  running: false,
  tickMs: 3000,
  maxItems: 40,
};

let timer = null;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ============================================================
   FUNCIONES DE UTILIDAD
============================================================ */
function stepPrice(p, vol = 0.012) {
  const shock = (Math.random() - 0.5) * 2 * vol;
  const next = p * (1 + shock);
  return Math.max(0.00001, next);
}

function mtmPnl(t, px) {
  const side = String(t.side || 'long').toLowerCase();
  const sideMul = side === 'short' ? -1 : 1;
  const pct = (px - t.entry) / t.entry;
  return sideMul * pct * (t.leverage || 1) * (t.amount_usd || 0);
}

function emitSnapshot(reason = 'snapshot') {
  self.postMessage({
    type: reason,
    running: state.running,
    tickMs: state.tickMs,
    prices: state.prices,
    activations: state.activations,
    trades: Object.fromEntries(
      Object.entries(state.trades).map(([k, v]) => [k, (v || []).slice(0, state.maxItems)])
    ),
    payouts: state.payouts,
  });
}

/* ============================================================
   CICLO PRINCIPAL DE SIMULACIÓN
============================================================ */
function tick() {
  const priceDelta = {};
  for (const k of Object.keys(state.prices)) {
    const prev = state.prices[k];
    const next = stepPrice(prev, 0.012);
    if (Math.abs(next - prev) / prev > 0.0005) {
      state.prices[k] = next;
      priceDelta[k] = next;
    }
  }

  const tradeDeltas = [];
  const payoutDeltas = [];

  for (const a of state.activations) {
    if (String(a.status || '').toLowerCase() !== 'active') continue;
    const list = state.trades[a.id] || [];

    /* 🔴 Cierre de trades (12% de probabilidad por tick) */
    if (Math.random() < 0.12 && list.length > 0) {
      const openIdx = list.findIndex(t => String(t.status || 'open').toLowerCase() === 'open');
      if (openIdx >= 0) {
        const t = list[openIdx];
        const isWin = Math.random() < 0.4; // 40% ganancia
        const pct = (Math.random() * 0.04) + 0.01; // 1%-5%
        const pnl = (isWin ? 1 : -1) * (t.amount_usd || 0) * pct * (t.leverage || 1);

        list[openIdx] = { ...t, status: 'closed', closed_at: Date.now(), pnl };
        state.trades[a.id] = list.slice(0, state.maxItems);

        // Actualizar payout global
        const pay = state.payouts[a.id] || { profit: 0, losses: 0, fees: 0, net: 0, withdrawn: 0 };
        if (pnl >= 0) pay.profit += pnl;
        else pay.losses += Math.abs(pnl);
        pay.net += pnl;
        state.payouts[a.id] = pay;

        tradeDeltas.push({ actId: a.id, change: 'close', pnl, pair: t.pair, id: t.id });
        payoutDeltas.push({ actId: a.id, profitDelta: pnl, netDelta: pnl });

        // 🔥 Impacto real de saldo (positivo o negativo)
        self.postMessage({ type: 'balanceImpact', actId: a.id, pnl });
      }
    }

    /* 🟢 Apertura de nuevos trades (15% de probabilidad) */
    if (Math.random() < 0.15) {
      const pool = Object.keys(defaultPairs);
      const pair = pool[Math.floor(Math.random() * pool.length)];
      const side = Math.random() < 0.5 ? 'long' : 'short';
      const leverage = [1, 2, 3, 5][Math.floor(Math.random() * 4)];
      const amount_usd = clamp(Math.min(a.amountUsd * 0.3, 200), 10, a.amountUsd);
      const entry = state.prices[pair] ?? defaultPairs[pair] ?? 1;

      const trade = {
        id: uid(), pair, side, leverage, amount_usd, entry,
        status: 'open', opened_at: Date.now(),
      };
      state.trades[a.id] = [trade, ...list].slice(0, state.maxItems);
      tradeDeltas.push({ actId: a.id, change: 'open', trade });
    }
  }

  if (Object.keys(priceDelta).length || tradeDeltas.length || payoutDeltas.length) {
    self.postMessage({ type: 'delta', priceDelta, tradeDeltas, payoutDeltas });
  }
}

/* ============================================================
   CONTROL DEL WORKER
============================================================ */
function start() {
  if (timer) clearInterval(timer);
  timer = setInterval(tick, clamp(Number(state.tickMs) || 3000, 500, 60_000));
  state.running = true;
  emitSnapshot('started');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  state.running = false;
  self.postMessage({ type: 'stopped' });
}

/* ============================================================
   HANDLER PRINCIPAL DE MENSAJES
============================================================ */
self.onmessage = (e) => {
  const { type, payload } = e.data || {};

  if (type === 'init') {
    state = {
      ...state,
      ...((payload && typeof payload === 'object') ? payload : {}),
      tickMs: clamp(Number(payload?.tickMs ?? state.tickMs) || 3000, 500, 60_000),
      maxItems: clamp(Number(payload?.maxItems ?? state.maxItems) || 40, 10, 200),
    };
    self.postMessage({ type: 'ready', running: state.running, tickMs: state.tickMs });
    emitSnapshot();
    return;
  }

  if (type === 'start') return start();
  if (type === 'stop')  return stop();

  if (type === 'setTick') {
    state.tickMs = clamp(Number(payload || 3000), 500, 60_000);
    if (state.running) start();
    self.postMessage({ type: 'tock', tickMs: state.tickMs });
    return;
  }

  /* Activar nuevo bot */
  if (type === 'addActivation') {
    const a = payload || {};
    if (!a?.id) return;
    state.activations = [a, ...state.activations];
    state.trades[a.id] = [];
    state.payouts[a.id] = { profit: 0, losses: 0, fees: 0, net: 0, withdrawn: 0 };
    self.postMessage({ type: 'activationAdded', id: a.id });
    return;
  }

  /* Cancelar activación */
  if (type === 'cancelActivation') {
    const id = payload;
    if (!id) return;
    state.activations = state.activations.map(x => x.id === id ? { ...x, status: 'canceled' } : x);

    const list = state.trades[id] || [];
    const tradeDeltas = [];
    const payoutDeltas = [];
    let profitDelta = 0;

    const now = Date.now();
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (String(t.status || 'open').toLowerCase() === 'open') {
        const px = state.prices[t.pair] ?? t.entry;
        const pnl = mtmPnl(t, px);
        list[i] = { ...t, status: 'closed', closed_at: now, pnl };
        profitDelta += pnl;
        tradeDeltas.push({ actId: id, change: 'close', pnl, pair: t.pair, id: t.id });
      }
    }
    state.trades[id] = list.slice(0, state.maxItems);

    if (profitDelta !== 0) {
      const pay = state.payouts[id] || { profit: 0, losses: 0, fees: 0, net: 0, withdrawn: 0 };
      if (profitDelta >= 0) pay.profit += profitDelta;
      else pay.losses += Math.abs(profitDelta);
      pay.net += profitDelta;
      state.payouts[id] = pay;
      payoutDeltas.push({ actId: id, profitDelta, netDelta: profitDelta });

      // Impactar saldo al cancelar
      self.postMessage({ type: 'balanceImpact', actId: id, pnl: profitDelta });
    }

    if (tradeDeltas.length || payoutDeltas.length) {
      self.postMessage({ type: 'delta', priceDelta: {}, tradeDeltas, payoutDeltas });
    }
    self.postMessage({ type: 'activationCanceled', id });
    return;
  }

  /* Retiros (take profit) */
  if (type === 'takeProfitMarked') {
    const id = payload;
    if (id && state.payouts[id]) {
      const pay = state.payouts[id];
      const withdrawable = pay.net - (pay.withdrawn || 0);
      if (withdrawable > 0) {
        pay.withdrawn += withdrawable;
        pay.net -= withdrawable;
        state.payouts[id] = pay;
        self.postMessage({
          type: 'delta',
          priceDelta: {},
          tradeDeltas: [],
          payoutDeltas: [{ actId: id, profitDelta: 0, netDelta: -withdrawable, withdrawn: withdrawable }]
        });
        // Impactar saldo al tomar ganancias
        self.postMessage({ type: 'balanceImpact', actId: id, pnl: withdrawable });
      }
    }
    self.postMessage({ type: 'takeProfitAck', id });
    return;
  }

  if (type === 'getState') {
    emitSnapshot('snapshot');
    return;
  }

  if (type === 'reset') {
    stop();
    state = {
      prices: { ...defaultPairs },
      activations: [],
      trades: {},
      payouts: {},
      running: false,
      tickMs: 3000,
      maxItems: 40,
    };
    emitSnapshot('reset');
    return;
  }
};
