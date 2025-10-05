// src/workers/botSim.worker.js
// Cargar como: new Worker(new URL('./botSim.worker.js', import.meta.url), { type: 'module' })

const defaultPairs = {
  'BTC/USDT': 60000, 'ETH/USDT': 2500, 'BNB/USDT': 350,
  'ADA/USDT': 0.45, 'ALTCOINS/USDT': 1.0, 'MEMES/USDT': 0.01,
};

let state = {
  prices: { ...defaultPairs },
  activations: [],      // {id, amountUsd, botName, status}
  trades: {},           // id -> Trade[]
  payouts: {},          // id -> { profit, losses, fees, net, withdrawn }
  running: false,
  tickMs: 3000,
  maxItems: 40,
};

let timer = null;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// 📌 Volatilidad mayor para que haya variación de PnL
function stepPrice(p, vol = 0.01) {
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

function tick() {
  const priceDelta = {};
  for (const k of Object.keys(state.prices)) {
    const prev = state.prices[k];
    const next = stepPrice(prev, 0.01);
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

    // 🔴 Cierre de trades (10% de probabilidad por tick)
    if (Math.random() < 0.10) {
      const idx = list.findIndex(t => String(t.status || 'open').toLowerCase() === 'open');
      if (idx >= 0) {
        const t = list[idx];

        // 📌 1/3 ganancia, 2/3 pérdida
        const isWin = Math.random() < 0.33;
        const pct = (Math.random() * 0.05) + 0.01; // 1% - 6%
        const pnl = (isWin ? 1 : -1) * (t.amount_usd || 0) * pct * (t.leverage || 1);

        list[idx] = { ...t, status: 'closed', closed_at: Date.now(), pnl };
        state.trades[a.id] = list.slice(0, state.maxItems);

        const pay = state.payouts[a.id] || { profit: 0, losses: 0, fees: 0, net: 0, withdrawn: 0 };
        if (pnl >= 0) {
          pay.profit += pnl;
        } else {
          pay.losses += Math.abs(pnl);
        }
        pay.net += pnl;
        state.payouts[a.id] = pay;

        tradeDeltas.push({ actId: a.id, change: 'close', pnl, pair: t.pair, id: t.id });
        payoutDeltas.push({ actId: a.id, profitDelta: pnl, netDelta: pnl });

        // Impacto en saldo real
        self.postMessage({ type: 'balanceImpact', actId: a.id, pnl });
      }
    }

    // 🟢 Apertura de nuevos trades (12% de probabilidad)
    if (Math.random() < 0.12) {
      const pool = Object.keys(defaultPairs);
      const pair = pool[Math.floor(Math.random() * pool.length)];
      const side = Math.random() < 0.5 ? 'long' : 'short';
      const leverage = [1, 2, 3, 5][Math.floor(Math.random() * 4)];
      const amount_usd = clamp(Math.min(a.amountUsd * 0.3, 200), 10, a.amountUsd);
      const entry = state.prices[pair] ?? defaultPairs[pair] ?? 1;

      const trade = {
        id: uid(), pair, side, leverage, amount_usd, entry,
        status: 'open', opened_at: Date.now()
      };
      state.trades[a.id] = [trade, ...list].slice(0, state.maxItems);
      tradeDeltas.push({ actId: a.id, change: 'open', trade });
    }
  }

  if (Object.keys(priceDelta).length || tradeDeltas.length || payoutDeltas.length) {
    self.postMessage({ type: 'delta', priceDelta, tradeDeltas, payoutDeltas });
  }
}

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

  if (type === 'addActivation') {
    const a = payload || {};
    if (!a?.id) return;
    state.activations = [a, ...state.activations];
    state.trades[a.id] = [];
    state.payouts[a.id] = { profit: 0, losses: 0, fees: 0, net: 0, withdrawn: 0 };
    self.postMessage({ type: 'activationAdded', id: a.id });
    return;
  }

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
      if (profitDelta >= 0) {
        pay.profit += profitDelta;
      } else {
        pay.losses += Math.abs(profitDelta);
      }
      pay.net += profitDelta;
      state.payouts[id] = pay;
      payoutDeltas.push({ actId: id, profitDelta, netDelta: profitDelta });
    }

    if (tradeDeltas.length || payoutDeltas.length) {
      self.postMessage({ type: 'delta', priceDelta: {}, tradeDeltas, payoutDeltas });
    }
    self.postMessage({ type: 'activationCanceled', id });
    return;
  }

  // 🚫 evitar retiros infinitos
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
