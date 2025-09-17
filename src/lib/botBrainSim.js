// src/lib/botBrainSim.js
import { supabase } from './supabaseClient';

// --- Configs por bot (pares, riesgo, TP/SL, % capital por trade) ---
const BOT_CONFIG = {
  'Bot Conservador Alfa': {
    pairs: ['BTC/USDT', 'ETH/USDT'],
    leverage: 3,
    tpPct: 0.8,   // take-profit %
    slPct: 0.6,   // stop-loss %
    tradePct: 0.12, // porcentaje del capital asignado que arriesga por trade (margen)
    maxOpen: 2,
  },
  'Bot Balanceado Gamma': {
    pairs: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT'],
    leverage: 4,
    tpPct: 1.1,
    slPct: 0.9,
    tradePct: 0.18,
    maxOpen: 3,
  },
  'Bot Agresivo Beta': {
    pairs: ['BTC/USDT'], // usaría alts, pero asumimos símbolo base accesible en market_state
    leverage: 6,
    tpPct: 1.6,
    slPct: 1.2,
    tradePct: 0.25,
    maxOpen: 4,
  },
};

// --- Helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const baseFromPair = (pair) => String(pair || '').toUpperCase().split('/')[0] || 'BTC';

// precio actual + ref_24h (para % cambio)
async function getSpotNow(symbolU) {
  const { data, error } = await supabase
    .from('market_state')
    .select('price, ref_24h')
    .eq('symbol', symbolU)
    .maybeSingle();
  if (error || !data) return { price: NaN, change24: 0 };
  const price = Number(data.price);
  const ref24 = Number(data.ref_24h ?? price);
  const change24 = ref24 > 0 ? ((price - ref24) / ref24) * 100 : 0;
  return { price, change24 };
}

// momentum simple con últimos N ticks
async function getMomentum(symbolU, n = 20) {
  const { data, error } = await supabase
    .from('market_ticks')
    .select('price, ts')
    .eq('symbol', symbolU)
    .order('ts', { ascending: false })
    .limit(n);
  if (error || !data?.length) return { slope: 0, last: NaN };

  const pts = data
    .map((r) => Number(r.price))
    .filter((v) => Number.isFinite(v))
    .reverse();

  if (pts.length < 2) return { slope: 0, last: pts[pts.length - 1] ?? NaN };

  // regresión lineal mínima: slope aprox
  const x = pts.map((_, i) => i + 1);
  const npts = pts.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = pts.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, xi, i) => a + xi * pts[i], 0);
  const sumXX = x.reduce((a, xi) => a + xi * xi, 0);
  const denom = npts * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (npts * sumXY - sumX * sumY) / denom : 0;

  return { slope, last: pts[pts.length - 1] };
}

// trades abiertos para esa activación
async function listOpenTrades(activationId) {
  const { data, error } = await supabase
    .from('bot_trades')
    .select('id, pair, side, amount_usd, leverage, entry, opened_at, status')
    .eq('activation_id', activationId)
    .eq('status', 'open')
    .order('opened_at', { ascending: true });
  if (error) return [];
  return data || [];
}

// open via RPC
async function openTrade({ activationId, pair, side, amountUsd, leverage, tpPct, slPct }) {
  const { data, error } = await supabase.rpc('bot_trade_open', {
    p_activation_id: activationId,
    p_pair: pair,
    p_side: side,                // 'long' | 'short'
    p_amount_usd: Number(amountUsd),
    p_leverage: Number(leverage),
    p_tp_pct: tpPct,
    p_sl_pct: slPct,
    p_entry: null,               // usa precio de mercado
  });
  if (error) throw error;
  // opcional: log de evento si tenés tabla bot_events
  try {
    await supabase.from('bot_events').insert({
      activation_id: activationId,
      kind: 'open',
      payload: { pair, side, amountUsd, leverage, tpPct, slPct },
    });
  } catch {}
  return data;
}

// close via RPC (+ refresco de saldo si tu RPC NO acredita solo)
// Si tu RPC `bot_trade_close` ya inserta la transacción con el PnL (recomendado),
// NO hace falta fallback de "credit_bot_profit".
async function closeTrade(tradeId, reason = 'tp_or_sl') {
  const { data, error } = await supabase.rpc('bot_trade_close', {
    p_trade_id: tradeId,
    p_reason: reason,
    p_close_price: null,         // precio de mercado
  });
  if (error) throw error;

  try {
    await supabase.from('bot_events').insert({
      activation_id: data?.activation_id ?? null,
      kind: 'close',
      payload: { tradeId, reason, pnl: data?.pnl ?? null },
    });
  } catch {}

  // --- Fallback opcional (si tu RPC NO acredita el PnL en wallet_transactions):
  // if (Number.isFinite(Number(data?.pnl)) && Number(data.pnl) !== 0) {
  //   await supabase.rpc('credit_bot_profit', {
  //     p_activation_id: data.activation_id,
  //     p_user_id: data.user_id,
  //     p_amount_usd: Number(data.pnl),
  //     p_note: `PnL trade #${tradeId} (${reason})`,
  //   });
  // }

  return data;
}

// calcula PnL no realizado y decide cierre por TP/SL
function shouldCloseTrade({ entry, last, side, tpPct, slPct }) {
  if (!Number.isFinite(entry) || !Number.isFinite(last) || entry <= 0) return false;
  const dir = String(side).toLowerCase() === 'short' ? -1 : 1;
  const pct = dir * ((last - entry) / entry) * 100;
  if (pct >= tpPct) return { close: true, reason: 'tp' };
  if (pct <= -slPct) return { close: true, reason: 'sl' };
  return { close: false };
}

// --- Estrategia de una sola pasada ---
export async function runBotBrainOnce() {
  // 1) buscar activaciones activas
  const { data: acts, error: actsErr } = await supabase
    .from('bot_activations')
    .select('id, user_id, bot_name, amount_usd, status')
    .eq('status', 'active');
  if (actsErr) throw actsErr;

  for (const a of acts || []) {
    const botName = a.bot_name || 'Bot Balanceado Gamma';
    const cfg = BOT_CONFIG[botName] || BOT_CONFIG['Bot Balanceado Gamma'];
    const pairs = cfg.pairs?.length ? cfg.pairs : ['BTC/USDT'];

    // --- 2) cerrar trades por TP/SL ---
    const open = await listOpenTrades(a.id);
    for (const t of open) {
      const symbol = baseFromPair(t.pair);
      const { price: last } = await getSpotNow(symbol);
      const decision = shouldCloseTrade({
        entry: Number(t.entry),
        last,
        side: t.side,
        tpPct: cfg.tpPct,
        slPct: cfg.slPct,
      });
      if (decision.close) {
        try {
          await closeTrade(t.id, decision.reason);
          // leve respiro para no saturar triggers
          await sleep(80);
        } catch (e) {
          console.warn('[bot-brain] fail close', t.id, e?.message || e);
        }
      }
    }

    // --- 3) abrir trades si falta exposición ---
    const stillOpen = await listOpenTrades(a.id);
    if (stillOpen.length < cfg.maxOpen) {
      // Elegimos un par y definimos lado por momentum
      const pair = pairs[Math.floor(Math.random() * pairs.length)];
      const symbol = baseFromPair(pair);
      const { slope } = await getMomentum(symbol, 20);

      // si la pendiente > 0 → long, si < 0 → short (con algo de aleatoriedad)
      let side = slope > 0 ? 'long' : 'short';
      if (Math.random() < 0.15) side = side === 'long' ? 'short' : 'long';

      // monto (margen) por trade
      const margin = Math.max(25, Number((a.amount_usd * cfg.tradePct).toFixed(2)));

      try {
        await openTrade({
          activationId: a.id,
          pair,
          side,
          amountUsd: margin,     // margen (exposición = margen * leverage)
          leverage: cfg.leverage,
          tpPct: cfg.tpPct,
          slPct: cfg.slPct,
        });
        await sleep(60);
      } catch (e) {
        console.warn('[bot-brain] fail open', a.id, pair, e?.message || e);
      }
    }
  }

  return { ok: true, processed: (acts || []).length };
}

// flag para la UI (botón "Actualizar bots")
export const BOT_BRAIN_CLIENT = true;
