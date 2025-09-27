// src/workers/botSim.worker.js
// Cargar como: new Worker(new URL('@/workers/botSim.worker.js', import.meta.url), { type: 'module' })

/* ===================== Seeds & Perfil ===================== */
const defaultPairs = {
  'BTC/USDT': 60000,
  'ETH/USDT': 2500,
  'BNB/USDT': 350,
  'ADA/USDT': 0.45,
  'ALTCOINS/USDT': 1.0,
  'MEMES/USDT': 0.01,
};

// Perfil "de fábrica" (se puede ajustar con setProfile)
let PROFILE = {
  winRate: 0.46,        // probabilidad de trade ganador
  avgR: 1.1,            // múltiplo medio de riesgo en ganadoras
  maxConcurrent: 3,     // trades simultáneos por activación
  tradeEveryMs: 15000,  // cada cuánto intentar abrir/cerrar algo
  baseHoldMs: 45000,    // permanencia base
  jitterMs: 25000,      // variación de permanencia
  feeBps: 8,            // 0.08% por lado
};

/* ===================== Estado ===================== */
let state = {
  prices: { ...defaultPairs },
  activations: [],       // [{id, amountUsd, botName, status}]
  trades: {},            // actId -> Trade[]
  payouts: {},           // actId -> { profit, fees, net, withdrawn }
  meta: {},              // actId -> { lastAction: ms }
  running: false,
  tickMs: 1000,
  maxItems: 120,
};

let timer = null;

/* ===================== Utils ===================== */
const now = () => Date.now();
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);

function feeUsd(notionalUsd) {
  return Number((notionalUsd * (PROFILE.feeBps / 10_000)).toFixed(6));
}

function seedPrice(sym) {
  if (!state.prices[sym]) state.prices[sym] = defaultPairs[sym] ?? 1;
}

// random walk suave (vol diferente por par)
function stepPrice(p, sym) {
  const baseVol =
    sym.includes('MEMES') ? 0.008 :
    sym.includes('ALTCOINS') ? 0.004 :
    0.0015;
  const shock = rand(-baseVol, baseVol);
  const next = p * (1 + shock);
  return Math.max(0.00001, next);
}

// MTM PnL (para cierres por cancelación o si lo necesitáramos)
function mtmPnl(t, px) {
  const sideMul = String(t.side || 'long').toLowerCase() === 'short' ? -1 : 1;
  const pct = (px - t.entry) / t.entry;
  return sideMul * pct * (t.leverage || 1) * (t.amount_usd || 0);
}

/* ===================== Emisores ===================== */
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

function postDelta({ priceDelta = {}, tradeDeltas = [], payoutDeltas = [] }) {
  if (Object.keys(priceDelta).length || tradeDeltas.length || payoutDeltas.length) {
    self.postMessage({ type: 'delta', priceDelta, tradeDeltas, payoutDeltas });
  }
}

/* ===================== Lógica de trading ===================== */
function openIfCan(a) {
  const list = state.trades[a.id] || [];
  if (list.filter(t => t.status === 'open').length >= PROFILE.maxConcurrent) return null;

  const pair = pick(Object.keys(defaultPairs));
  const side = Math.random() < 0.5 ? 'LONG' : 'SHORT';
  const leverage = Math.round(rand(1, 3));
  const size = clamp(a.amountUsd * rand(0.12, 0.38), 20, a.amountUsd);
  seedPrice(pair);
  const trade = {
    id: uid(),
    actId: a.id,
    pair,
    side,
    leverage,
    amount_usd: Math.round(size * 100) / 100,
    entry: state.prices[pair],
    opened_at: now(),
    status: 'open',
  };
  state.trades[a.id] = [trade, ...list].slice(0, state.maxItems);
  return { change: 'open', actId: a.id, trade };
}

function maybeCloseOne(a) {
  const list = state.trades[a.id] || [];
  // cierra el más viejo que haya superado permanencia
  const hold = PROFILE.baseHoldMs + rand(-PROFILE.jitterMs, PROFILE.jitterMs);
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (String(t.status || 'open').toLowerCase() !== 'open') continue;
    if (now() - t.opened_at < hold) continue;

    // Resultado aleatorio controlado por winRate y avgR
    const win = Math.random() < PROFILE.winRate;
    const R = rand(0.4, 1.8) * (win ? PROFILE.avgR : 1);
    // % “pequeño” sobre entry (scalp sim); ganadora positiva, perdedora negativa
    const pctMove = R * (win ? rand(0.0012, 0.006) : -rand(0.0006, 0.006));
    const direction = (t.side === 'SHORT' ? -1 : 1);
    const gross = t.amount_usd * t.leverage * pctMove * direction;

    // fees ida y vuelta sobre el notion del tamaño
    const f = feeUsd(t.amount_usd) * 2;
    const pnl = Math.round((gross - f) * 100) / 100;

    list[i] = { ...t, status: 'closed', closed_at: now(), pnl };
    state.trades[a.id] = list.slice(0, state.maxItems);

    // actualizar payouts
    const pay = state.payouts[a.id] || { profit: 0, fees: 0, net: 0, withdrawn: 0 };
    if (pnl > 0) pay.profit += pnl;
    pay.net += pnl;
    state.payouts[a.id] = pay;

    const tradeDeltas = [{ change: 'close', actId: a.id, id: t.id, pair: t.pair, pnl }];
    const payoutDeltas = [{
      actId: a.id,
      profitDelta: pnl > 0 ? pnl : 0, // sólo sumamos a “profit” si fue ganador
      netDelta: pnl,                  // neto puede ser + o -
    }];

    return { tradeDeltas, payoutDeltas };
  }
  return null;
}

/* ===================== Tick ===================== */
function tick() {
  // 1) precios → delta
  const priceDelta = {};
  for (const k of Object.keys(state.prices)) {
    const prev = state.prices[k];
    const next = stepPrice(prev, k);
    // reduce spam: solo si movió > 0.05% (ajustable)
    if (Math.abs(next - prev) / prev > 0.0005) {
      state.prices[k] = next;
      priceDelta[k] = next;
    }
  }

  const tradeDeltas = [];
  const payoutDeltas = [];

  // 2) por activación
  const nowMs = now();
  for (const a of state.activations) {
    if (String(a.status || '').toLowerCase() !== 'active') continue;
    state.meta[a.id] ??= { lastAction: 0 };

    // cada tradeEveryMs decidimos abrir o cerrar algo
    if (nowMs - state.meta[a.id].lastAction > PROFILE.tradeEveryMs) {
      state.meta[a.id].lastAction = nowMs;

      // 60% abrir, 40% intentar cerrar
      if (Math.random() < 0.60) {
        const d = openIfCan(a);
        if (d) tradeDeltas.push(d);
      } else {
        const res = maybeCloseOne(a);
        if (res) {
          tradeDeltas.push(...(res.tradeDeltas || []));
          payoutDeltas.push(...(res.payoutDeltas || []));
        }
      }
    }
  }

  // 3) enviar deltas
  postDelta({ priceDelta, tradeDeltas, payoutDeltas });
}

/* ===================== Control del ciclo ===================== */
function start() {
  if (timer) clearInterval(timer);
  const ms = clamp(Number(state.tickMs) || 1000, 250, 60_000);
  timer = setInterval(tick, ms);
  state.running = true;
  self.postMessage({ type: 'ready', running: true, tickMs: ms });
  emitSnapshot('started');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  state.running = false;
  self.postMessage({ type: 'stopped', running: false });
}

/* ===================== Mensajería ===================== */
self.onmessage = (e) => {
  const { type, payload } = e.data || {};

  if (type === 'init') {
    // permitir override inicial
    if (payload && typeof payload === 'object') {
      state = {
        ...state,
        ...payload,
        tickMs: clamp(Number(payload.tickMs ?? state.tickMs) || 1000, 250, 60_000),
        maxItems: clamp(Number(payload.maxItems ?? state.maxItems) || 120, 20, 500),
      };
    }
    self.postMessage({ type: 'ready', running: state.running, tickMs: state.tickMs });
    emitSnapshot('snapshot');
    return;
  }

  if (type === 'start') { start(); return; }
  if (type === 'stop')  { stop();  return; }

  if (type === 'setTick') {
    state.tickMs = clamp(Number(payload || 1000), 250, 60_000);
    if (state.running) start(); // reinicia con el nuevo intervalo
    self.postMessage({ type: 'tock', tickMs: state.tickMs });
    return;
  }

  if (type === 'setProfile') {
    PROFILE = { ...PROFILE, ...(payload || {}) };
    self.postMessage({ type: 'profile', profile: PROFILE });
    return;
  }

  if (type === 'addActivation') {
    const a = payload || {};
    if (!a?.id) return;
    // evita duplicados
    if (!state.activations.find(x => x.id === a.id)) {
      state.activations = [a, ...state.activations];
      state.trades[a.id] = [];
      state.payouts[a.id] = { profit: 0, fees: 0, net: 0, withdrawn: 0 };
      state.meta[a.id] = { lastAction: 0 };
      self.postMessage({ type: 'activationAdded', id: a.id });
    }
    return;
  }

  if (type === 'cancelActivation') {
    const id = payload;
    if (!id) return;
    // marcar cancelado
    state.activations = state.activations.map(x => x.id === id ? { ...x, status: 'canceled' } : x);

    // cerrar abiertos MTM y emitir deltas
    const list = state.trades[id] || [];
    const tradeDeltas = [];
    const payoutDeltas = [];
    let netDelta = 0;

    const ts = now();
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (String(t.status || 'open').toLowerCase() === 'open') {
        seedPrice(t.pair);
        const px = state.prices[t.pair] ?? t.entry;
        const pnl = Math.round(mtmPnl(t, px) * 100) / 100;
        list[i] = { ...t, status: 'closed', closed_at: ts, pnl };
        netDelta += pnl;
        tradeDeltas.push({ actId: id, change: 'close', pnl, pair: t.pair, id: t.id });
      }
    }
    state.trades[id] = list.slice(0, state.maxItems);

    if (netDelta !== 0) {
      const pay = state.payouts[id] || { profit: 0, fees: 0, net: 0, withdrawn: 0 };
      if (netDelta > 0) pay.profit += netDelta;
      pay.net += netDelta;
      state.payouts[id] = pay;
      payoutDeltas.push({ actId: id, profitDelta: netDelta > 0 ? netDelta : 0, netDelta });
    }

    postDelta({ tradeDeltas, payoutDeltas });
    self.postMessage({ type: 'activationCanceled', id });
    return;
  }

  if (type === 'takeProfitMarked') {
    // El UI ya ajusta withdrawn; podemos registrar un heartbeat si queremos
    self.postMessage({ type: 'takeProfitAck', id: payload });
    return;
  }

  if (type === 'getState') { emitSnapshot('snapshot'); return; }

  if (type === 'reset') {
    stop();
    state = {
      prices: { ...defaultPairs },
      activations: [],
      trades: {},
      payouts: {},
      meta: {},
      running: false,
      tickMs: 1000,
      maxItems: 120,
    };
    emitSnapshot('reset');
    return;
  }
};
