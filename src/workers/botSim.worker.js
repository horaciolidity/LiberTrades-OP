// src/workers/botSim.worker.js
// Cargar como: new Worker(new URL('@/workers/botSim.worker.js', import.meta.url), { type: 'module' })

/* ==================== Config base ==================== */
const DEFAULT_PAIRS = {
  'BTC/USDT': 60000,
  'ETH/USDT': 2500,
  'BNB/USDT': 350,
  'ADA/USDT': 0.45,
  'ALTCOINS/USDT': 1.0,
  'MEMES/USDT': 0.01,
};

// Perfiles de riesgo (detectado por nombre del bot)
const RISK_PRESETS = {
  conservador: { openOdds: 0.08, closeOdds: 0.14, winOdds: 0.55, maxOpen: 2, vol: 0.0025, allocMaxFrac: 0.20 },
  balanceado:  { openOdds: 0.12, closeOdds: 0.18, winOdds: 0.50, maxOpen: 3, vol: 0.0030, allocMaxFrac: 0.28 },
  agresivo:    { openOdds: 0.18, closeOdds: 0.25, winOdds: 0.45, maxOpen: 4, vol: 0.0038, allocMaxFrac: 0.35 },
};

/* ==================== Estado ==================== */
let state = {
  prices: { ...DEFAULT_PAIRS },           // par -> precio
  activations: [],                        // [{ id, amountUsd, botName, status }]
  trades: {},                             // actId -> Trade[]
  payouts: {},                            // actId -> { profit, fees, net, withdrawn }
  running: false,
  tickMs: 2500,
  maxItems: 60,
  tickN: 0,
};

let timer = null;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ==================== Utilidades ==================== */
function riskFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('agresiv')) return RISK_PRESETS.agresivo;
  if (n.includes('balance')) return RISK_PRESETS.balanceado;
  return RISK_PRESETS.conservador;
}

function stepPrice(p, vol = 0.003) {
  // pequeño shock gaussiano aproximado
  const shock = (Math.random() - 0.5) * 2 * vol;
  const next = p * (1 + shock);
  return Math.max(0.000001, next);
}

function mtmPnl(trade, px) {
  const sideMul = String(trade.side || 'long').toLowerCase() === 'short' ? -1 : 1;
  const pct = (px - trade.entry) / trade.entry;
  return sideMul * pct * Number(trade.leverage || 1) * Number(trade.amount_usd || 0);
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

/* ==================== Motor ==================== */
function tick() {
  state.tickN++;

  // 1) Precios → deltas mínimos para no spamear
  const priceDelta = {};
  for (const k of Object.keys(state.prices)) {
    const base = state.prices[k];
    // Volatilidad promedio según riesgo mixto
    // (ligeramente subida cada tantos ticks para dar vida)
    const volAdj = 0.0025 + 0.0005 * Math.sin(state.tickN / 17);
    const next = stepPrice(base, volAdj);
    if (Math.abs(next - base) / base > 0.0003) {
      state.prices[k] = next;
      priceDelta[k] = next;
    }
  }

  const tradeDeltas = [];   // { actId, change:'open'|'close', trade?, pnl?, pair?, id? }
  const payoutDeltas = [];  // { actId, profitDelta, netDelta }

  // 2) Por activación, abrir/cerrar trades según perfil
  for (const a of state.activations) {
    if (String(a.status || '').toLowerCase() !== 'active') continue;

    const risk = riskFromName(a.botName);
    const list = state.trades[a.id] || [];
    const openList = list.filter(t => String(t.status || 'open').toLowerCase() === 'open');

    // Si está “muerto” (sin abiertos por un rato), forzamos apertura
    const stale = openList.length === 0;

    // Cerrar alguno
    if (openList.length && (Math.random() < risk.closeOdds)) {
      const idxOpen = openList[Math.floor(Math.random() * openList.length)];
      const idx = list.findIndex(t => t.id === idxOpen.id);
      if (idx >= 0) {
        const t = list[idx];
        const px = state.prices[t.pair] ?? t.entry;
        const raw = mtmPnl(t, px);

        // Randorización del resultado con sesgo por perfil
        const realized = (Math.random() < risk.winOdds ? Math.abs(raw) : -Math.abs(raw));

        list[idx] = { ...t, status: 'closed', closed_at: Date.now(), pnl: realized };
        state.trades[a.id] = list.slice(0, state.maxItems);

        const pay = state.payouts[a.id] || { profit: 0, fees: 0, net: 0, withdrawn: 0 };
        pay.profit += realized;
        pay.net += realized;
        state.payouts[a.id] = pay;

        tradeDeltas.push({ actId: a.id, change: 'close', pnl: realized, pair: t.pair, id: t.id });
        payoutDeltas.push({ actId: a.id, profitDelta: realized, netDelta: realized });
      }
    }

    // Abrir (si hay cupo)
    const mayOpen = stale || (openList.length < risk.maxOpen && Math.random() < risk.openOdds);
    if (mayOpen) {
      const pool = Object.keys(DEFAULT_PAIRS);
      const pair = pool[Math.floor(Math.random() * pool.length)];
      const side = Math.random() < 0.5 ? 'long' : 'short';
      const leverage = [1, 2, 3, 5][Math.floor(Math.random() * 4)];

      // Montos moderados en función del capital y el perfil
      const cap = Number(a.amountUsd || 0);
      const maxAlloc = Math.max(10, cap * risk.allocMaxFrac);
      const amount_usd = clamp(
        Math.round((maxAlloc * (0.60 + Math.random() * 0.65)) * 100) / 100,
        10,
        Math.max(10, cap)
      );

      const entry = state.prices[pair] ?? DEFAULT_PAIRS[pair] ?? 1;
      const trade = {
        id: uid(),
        pair, side, leverage, amount_usd, entry,
        status: 'open',
        opened_at: Date.now(),
      };

      state.trades[a.id] = [trade, ...list].slice(0, state.maxItems);
      tradeDeltas.push({ actId: a.id, change: 'open', trade });
    }
  }

  // 3) Emitir sólo deltas si hay algo
  if (Object.keys(priceDelta).length || tradeDeltas.length || payoutDeltas.length) {
    self.postMessage({ type: 'delta', priceDelta, tradeDeltas, payoutDeltas });
  }
}

function start() {
  if (timer) clearInterval(timer);
  state.running = true;
  // tick inmediato para que la UI vea algo al toque
  try { tick(); } catch {}
  timer = setInterval(tick, clamp(Number(state.tickMs) || 2500, 400, 60_000));
  self.postMessage({ type: 'started', running: true, tickMs: state.tickMs });
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  state.running = false;
  self.postMessage({ type: 'stopped' });
}

/* ==================== Mensajería ==================== */
self.onmessage = (e) => {
  const { type, payload } = e.data || {};

  if (type === 'init') {
    const p = (payload && typeof payload === 'object') ? payload : {};
    state.tickMs = clamp(Number(p.tickMs ?? state.tickMs) || 2500, 400, 60_000);
    state.maxItems = clamp(Number(p.maxItems ?? state.maxItems) || 60, 20, 200);
    self.postMessage({ type: 'ready', running: state.running, tickMs: state.tickMs });
    emitSnapshot('snapshot');
    return;
  }

  if (type === 'start') { start(); return; }
  if (type === 'stop')  { stop();  return; }

  if (type === 'setTick') {
    state.tickMs = clamp(Number(payload || state.tickMs), 400, 60_000);
    if (state.running) start(); // reinicia el intervalo con el nuevo tick
    self.postMessage({ type: 'tock', tickMs: state.tickMs });
    return;
  }

  if (type === 'addActivation') {
    const a = payload || {};
    if (!a?.id) return;

    // evitar duplicados
    const has = state.activations.some(x => x.id === a.id);
    if (!has) state.activations = [a, ...state.activations];

    state.trades[a.id] ||= [];
    state.payouts[a.id] ||= { profit: 0, fees: 0, net: 0, withdrawn: 0 };

    self.postMessage({ type: 'activationAdded', id: a.id });
    // si está corriendo, empujamos una apertura rápido
    if (state.running) {
      try { tick(); } catch {}
    }
    return;
  }

  if (type === 'cancelActivation') {
    const id = payload;
    if (!id) return;

    state.activations = state.activations.map(x =>
      x.id === id ? ({ ...x, status: 'canceled' }) : x
    );

    const list = state.trades[id] || [];
    const tradeDeltas = [];
    let profitDelta = 0;

    const now = Date.now();
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (String(t.status || 'open').toLowerCase() === 'open') {
        const px = state.prices[t.pair] ?? t.entry;
        const raw = mtmPnl(t, px);
        // Al cancelar, cerramos al raw (sin sesgo adicional)
        list[i] = { ...t, status: 'closed', closed_at: now, pnl: raw };
        profitDelta += raw;
        tradeDeltas.push({ actId: id, change: 'close', pnl: raw, pair: t.pair, id: t.id });
      }
    }
    state.trades[id] = list.slice(0, state.maxItems);

    if (profitDelta) {
      const pay = state.payouts[id] || { profit: 0, fees: 0, net: 0, withdrawn: 0 };
      pay.profit += profitDelta;
      pay.net += profitDelta;
      state.payouts[id] = pay;
      self.postMessage({ type: 'delta', priceDelta: {}, tradeDeltas, payoutDeltas: [{ actId: id, profitDelta, netDelta: profitDelta }] });
    } else if (tradeDeltas.length) {
      self.postMessage({ type: 'delta', priceDelta: {}, tradeDeltas, payoutDeltas: [] });
    }

    self.postMessage({ type: 'activationCanceled', id });
    return;
  }

  if (type === 'takeProfitMarked') {
    // El hook marca withdrawn localmente; acá sólo confirmamos
    self.postMessage({ type: 'takeProfitAck', id: payload });
    return;
  }

  if (type === 'getState') { emitSnapshot('snapshot'); return; }

  if (type === 'reset') {
    stop();
    state = {
      prices: { ...DEFAULT_PAIRS },
      activations: [],
      trades: {},
      payouts: {},
      running: false,
      tickMs: 2500,
      maxItems: 60,
      tickN: 0,
    };
    emitSnapshot('reset');
    return;
  }
};
