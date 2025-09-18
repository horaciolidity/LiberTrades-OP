// src/contexts/DataContext.jsx
import React, {
  createContext, useContext, useMemo, useState, useEffect, useRef, useCallback,
} from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const DataContext = createContext(null);

/* ============== helpers básicos ============== */
const ensureArray = (v) => (Array.isArray(v) ? v : []);
const nowMs = () => Date.now();
const norm = (s) => String(s ?? '').trim().toLowerCase();

/* ============== constantes ============== */
const HISTORY_MAX = 600;
const TICK_MS = 1000;
const DEFAULT_BINANCE_MAP = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', BNB: 'BNBUSDT', ADA: 'ADAUSDT' };
const ACTIVE = new Set(['active', 'paused']);
const CANCELLED = new Set(['canceled', 'cancelled', 'inactive', 'stopped', 'ended', 'closed', 'terminated', 'archived']);

/* ============== util RPC genérico (prueba varias firmas) ============== */
async function tryManyRPC(names = [], payloads = []) {
  let lastError = null;
  for (const fn of names) {
    for (const body of payloads) {
      try {
        const { data, error } = await supabase.rpc(fn, body);
        if (!error) return { data, error: null, fn, body };
        lastError = error;
      } catch (e) { lastError = e; }
    }
  }
  return { data: null, error: lastError };
}

/* ---- wrappers concretos ---- */
async function rpcActivateBotRobust({ user_id, bot_id, bot_name, strategy, amount_usd }) {
  const names = [
    // nombres frecuentes
    'activate_trading_bot', 'rent_trading_bot', 'start_trading_bot',
    // variantes que vi en tus capturas / proyectos
    'activate_trading_bot_private', 'private_trading_bot1', 'activate_bot',
  ];
  const payloads = [
    { bot_id, bot_name, strategy, amount_usd },
    { p_bot_id: bot_id, p_bot_name: bot_name, p_strategy: strategy, p_amount_usd: amount_usd },
    { bot_id, bot_name, strategy, amount_usd, user_id },
    { p_user_id: user_id, p_bot_id: bot_id, p_bot_name: bot_name, p_strategy: strategy, p_amount_usd: amount_usd },
  ];
  return tryManyRPC(names, payloads);
}

async function rpcPauseBotRobust({ activation_id, user_id }) {
  const names = ['pause_trading_bot', 'pause_bot', 'bot_pause', 'inactivate_trading_bot'];
  const payloads = [
    { p_activation_id: activation_id, p_user_id: user_id },
    { activation_id, user_id },
    { p_activation_id: activation_id },
    { id: activation_id },
  ];
  return tryManyRPC(names, payloads);
}
async function rpcResumeBotRobust({ activation_id, user_id }) {
  const names = ['resume_trading_bot', 'resume_bot', 'bot_resume', 'reactivate_trading_bot'];
  const payloads = [
    { p_activation_id: activation_id, p_user_id: user_id },
    { activation_id, user_id },
    { p_activation_id: activation_id },
    { id: activation_id },
  ];
  return tryManyRPC(names, payloads);
}
async function rpcCancelBotRobust({ activation_id, user_id }) {
  const preferFee = ['cancel_trading_bot_with_fee', 'bot_cancel_with_fee', 'stop_trading_bot_with_fee'];
  const plain = ['cancel_trading_bot', 'cancel_bot', 'bot_cancel', 'stop_trading_bot'];
  const payloads = [
    { p_activation_id: activation_id, p_user_id: user_id },
    { activation_id, user_id },
    { p_activation_id: activation_id },
    { id: activation_id },
  ];
  const r1 = await tryManyRPC(preferFee, payloads);
  if (!r1.error) return r1;
  return tryManyRPC(plain, payloads);
}

async function rpcGetBalanceRobust({ user_id, currency }) {
  const names = [
    'get_user_balance', 'wallet_get_balance', 'get_balance', 'get_balance_by_currency',
  ];
  const payloads = [
    { p_user_id: user_id, p_currency: currency },
    { user_id, currency },
    { p_user: user_id, p_currency_code: currency },
    { p_user_id: user_id, currency },
  ];
  return tryManyRPC(names, payloads);
}

async function rpcRecalcBalancesRobust(user_id) {
  const names = [
    'recalc_user_balances', 'recalc_user_balance',
    'wallet_recalc_balances', 'wallet_recalc_balance',
    // tu endpoint truncado en consola (404 a /rpc/recalc_user_b...)
    'recalc_user_b',
  ];
  const payloads = [{ p_user_id: user_id }, { user_id }];
  return tryManyRPC(names, payloads);
}

/* ============== Provider ============== */
export function DataProvider({ children }) {
  const { user, balances, refreshBalances } = useAuth?.() || {};

  /* ---- estado de negocio ---- */
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [botActivations, setBotActivations] = useState([]);

  /* ---- mercado / precios (igual que antes) ---- */
  const [instruments, setInstruments] = useState([]);
  const [marketRules, setMarketRules] = useState([]);
  const [realQuotes, setRealQuotes] = useState({ USDT: { price: 1, change: 0 }, USDC: { price: 1, change: 0 } });
  const [priceHistories, setPriceHistories] = useState({ USDT: [{ time: nowMs(), value: 1 }], USDC: [{ time: nowMs(), value: 1 }] });
  const [cryptoPrices, setCryptoPrices] = useState({});

  /* ---- settings admin (fees, slippage) ---- */
  const [adminSettings, setAdminSettings] = useState({});
  const DEFAULT_SLIPPAGE = 0.2;
  const slippageMaxPct = Number(adminSettings['trading.slippage_pct_max'] ?? DEFAULT_SLIPPAGE);

  const botCancelFeeUsd = Number(
    (adminSettings['trading.bot_cancel_fee_usd']
    ?? adminSettings['trading.bot.cancel_fee_usd']
    ?? adminSettings.botCancelFeeUsd) ?? 0
  );
  const botCancelFeePct = Number(
    (adminSettings['trading.bot_cancel_fee_pct']
    ?? adminSettings['trading.bot.cancel_fee_pct']
    ?? adminSettings.botCancelFeePct) ?? 0
  );

  /* ---- refs para motores de ticks (omitimos detalles) ---- */
  const instrumentsRef = useRef([]);
  const quotesRef = useRef({});
  const histRef = useRef({});
  const liveMapRef = useRef({});
  const lastTickRef = useRef(0);
  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);
  useEffect(() => { quotesRef.current = realQuotes; }, [realQuotes]);
  useEffect(() => { histRef.current = priceHistories; }, [priceHistories]);

  /* ================== FETCH BÁSICOS ================== */
  async function refreshBotActivations() {
    if (!user?.id) { setBotActivations([]); return; }
    const { data, error } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('[refreshBotActivations]', error); setBotActivations([]); return; }
    setBotActivations(ensureArray(data).map((b) => ({
      id: b.id, user_id: b.user_id, userId: b.user_id,
      botId: b.bot_id, botName: b.bot_name, strategy: b.strategy,
      amountUsd: Number(b.amount_usd || 0), status: b.status, hidden: !!b.hidden,
      createdAt: b.created_at,
    })));
  }
  async function refreshTransactions() {
    if (!user?.id) { setTransactions([]); return; }
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('[refreshTransactions]', error); setTransactions([]); return; }
    setTransactions(ensureArray(data).map((tx) => ({
      user_id: tx.user_id, userId: tx.user_id, id: tx.id,
      type: String(tx.type || '').toLowerCase() === 'plan_purchase' ? 'investment' : tx.type,
      rawType: tx.type, status: String(tx.status || '').toLowerCase(),
      amount: Number(tx.amount || 0), currency: tx.currency || 'USDC',
      description: tx.description || '', createdAt: tx.created_at,
      referenceType: tx.reference_type, referenceId: tx.reference_id,
    })));
  }
  useEffect(() => {
    if (!user?.id) return;
    refreshBotActivations(); refreshTransactions();
    const ch = supabase
      .channel('bot_activations_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_activations', filter: `user_id=eq.${user.id}` }, refreshBotActivations)
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [user?.id]);

  /* ================== SALDOS ================== */
  function pickAuthAvailable(currency = 'USDC') {
    const c = String(currency).toUpperCase();
    const b = balances || {};
    const candidates = [
      b?.available?.[c], b?.[c]?.available, b?.[c]?.balance, b?.[c]?.free, b?.[c]?.amount,
      b?.[c], b?.available, b?.balance, b?.free, b?.amount,
    ];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }
  async function getAvailableBalance(currency = 'USDC') {
    const C = String(currency || 'USDC').toUpperCase();
    const aliases = C === 'USDC' ? ['USDC', 'USD', 'USDT']
      : C === 'USDT' ? ['USDT', 'USD', 'USDC']
      : C === 'USD' ? ['USD', 'USDC', 'USDT'] : [C, 'USDC', 'USD', 'USDT'];

    // 0) AuthContext
    let best = -Infinity;
    for (const cur of aliases) {
      const v = pickAuthAvailable(cur);
      if (v != null && Number.isFinite(Number(v))) best = Math.max(best, Number(v));
    }
    if (Number.isFinite(best) && best >= 0) return best;

    if (!user?.id) return 0;

    // 1) RPCs
    for (const cur of aliases) {
      try {
        const { data } = await rpcGetBalanceRobust({ user_id: user.id, currency: cur });
        const v = Number(data?.available ?? data?.balance ?? data?.amount ?? data?.[cur] ?? data);
        if (Number.isFinite(v)) best = Math.max(best, v);
      } catch {}
    }
    if (Number.isFinite(best) && best >= 0) return best;

    // 2) Tablas
    for (const cur of aliases) {
      for (const table of ['wallet_balances', 'balances']) {
        try {
          const { data } = await supabase.from(table).select('*')
            .eq('user_id', user.id).eq('currency', cur).maybeSingle();
          if (data) {
            const v = Number(data.available ?? data.balance ?? data.amount);
            if (Number.isFinite(v)) best = Math.max(best, v);
          }
        } catch {}
      }
    }
    if (Number.isFinite(best) && best >= 0) return best;

    // 3) Fallback por transacciones completadas
    for (const cur of aliases) {
      try {
        const { data } = await supabase
          .from('wallet_transactions')
          .select('amount, status, currency')
          .eq('user_id', user.id)
          .eq('currency', cur)
          .eq('status', 'completed');
        const total = ensureArray(data).reduce((s, r) => s + Number(r.amount || 0), 0);
        if (Number.isFinite(total)) best = Math.max(best, total);
      } catch {}
    }
    return Number.isFinite(best) && best >= 0 ? best : 0;
  }

  async function recalcAndRefreshBalances() {
    if (!user?.id) return;
    try { await rpcRecalcBalancesRobust(user.id); } catch {}
    try { refreshBalances?.(); } catch {}
  }

  async function canActivateBot(amountUsd, currency = 'USDC') {
    const avail = await getAvailableBalance(currency);
    const need = Number(amountUsd || 0);
    return { ok: avail >= need, available: avail, needed: Math.max(0, need - avail) };
  }

  /* ================== MUTACIONES BOTS ================== */
  // ACTIVAR (RPC → fallback con lock de capital)
  async function activateBot({ botId, botName, strategy = 'default', amountUsd }) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };

    // RPCs conocidos
    const r = await rpcActivateBotRobust({
      user_id: user.id, bot_id: botId, bot_name: botName, strategy, amount_usd: Number(amountUsd),
    });
    if (!r.error) {
      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      await recalcAndRefreshBalances();
      return r.data ?? { ok: true };
    }

    // Fallback manual
    try {
      const need = Number(amountUsd || 0);
      const avail = await getAvailableBalance('USDC');
      if (Number.isFinite(avail) && need > avail) {
        return { ok: false, code: 'INSUFFICIENT_FUNDS', needed: need - avail, available: avail };
      }

      // crear activación
      const { data: act, error: e1 } = await supabase
        .from('bot_activations')
        .insert({
          user_id: user.id, bot_id: botId, bot_name: botName, strategy,
          amount_usd: Number(amountUsd), status: 'active',
        })
        .select('*').single();
      if (e1) throw e1;

      // lock de capital (monto negativo)
      await supabase.from('wallet_transactions').insert({
        user_id: user.id,
        amount: -Number(amountUsd),
        type: 'bot_lock', status: 'completed', currency: 'USDC',
        description: `Capital asignado a ${botName}`,
        reference_type: 'bot_activation',
        reference_id: act.id,
      });

      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      await recalcAndRefreshBalances();
      return { ok: true, via: 'fallback', activation_id: act.id };
    } catch (e) {
      console.error('[activateBot:fallback]', e);
      return { ok: false, code: 'RPC_ERROR', error: e };
    }
  }

  // PAUSAR
  async function pauseBot(id) {
    const r = await rpcPauseBotRobust({ activation_id: id, user_id: user?.id });
    if (!r.error) { await refreshBotActivations(); return r.data ?? { ok: true }; }
    const { error } = await supabase.from('bot_activations')
      .update({ status: 'paused' }).eq('id', id).eq('user_id', user?.id);
    if (error) return { ok: false, code: 'RPC_ERROR', error };
    await refreshBotActivations(); return { ok: true, via: 'fallback' };
  }

  // REANUDAR
  async function resumeBot(id) {
    const r = await rpcResumeBotRobust({ activation_id: id, user_id: user?.id });
    if (!r.error) { await refreshBotActivations(); return r.data ?? { ok: true }; }
    const { error } = await supabase.from('bot_activations')
      .update({ status: 'active' }).eq('id', id).eq('user_id', user?.id);
    if (error) return { ok: false, code: 'RPC_ERROR', error };
    await refreshBotActivations(); return { ok: true, via: 'fallback' };
  }

  // CANCELAR (refund + fee → impacta saldo)
  async function cancelBot(id) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };

    const r = await rpcCancelBotRobust({ activation_id: id, user_id: user.id });
    if (!r.error) {
      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      await recalcAndRefreshBalances();
      return r.data ?? { ok: true };
    }

    // Fallback manual
    try {
      const { data: act } = await supabase
        .from('bot_activations').select('*')
        .eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!act) return { ok: false, code: 'NOT_FOUND' };

      const amt = Number(act.amount_usd || 0);
      const feePctPart = Math.max(0, (botCancelFeePct || 0) / 100) * amt;
      const feeFixed = Math.max(0, botCancelFeeUsd || 0);
      let fee = Number((feePctPart + feeFixed).toFixed(2)); if (fee > amt) fee = amt;
      const refund = Number((amt - fee).toFixed(2));

      // estado
      await supabase.from('bot_activations')
        .update({ status: 'canceled' })
        .eq('id', id).eq('user_id', user.id);

      // refund +
      if (refund > 0) {
        await supabase.from('wallet_transactions').insert({
          user_id: user.id, amount: refund, currency: 'USDC',
          type: 'bot_refund', status: 'completed',
          description: `Devolución capital ${act.bot_name}`,
          reference_type: 'bot_refund', reference_id: id,
        });
      }
      // fee -
      if (fee > 0) {
        await supabase.from('wallet_transactions').insert({
          user_id: user.id, amount: -fee, currency: 'USDC',
          type: 'bot_fee', status: 'completed',
          description: `Fee cancelación ${act.bot_name}`,
          reference_type: 'bot_fee', reference_id: id,
        });
      }

      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      await recalcAndRefreshBalances();
      return { ok: true, via: 'fallback', refund, fee };
    } catch (e) {
      console.error('[cancelBot:fallback]', e);
      return { ok: false, code: 'RPC_ERROR', error: e };
    }
  }

  /* ================== PnL de bots desde transacciones ================== */
  const {
    botPnlByActivation, totalBotProfit, totalBotFees, totalBotNet,
  } = useMemo(() => {
    const m = new Map(); let profitSum = 0; let feesSum = 0;
    for (const t of ensureArray(transactions)) {
      if (norm(t.status) !== 'completed') continue;
      const kind = norm(t.type); const aid = t?.referenceId; if (!aid) continue;
      if (!m.has(aid)) m.set(aid, { profit: 0, fees: 0, refunds: 0, net: 0 });
      const amt = Number(t.amount || 0);
      if (kind === 'bot_profit') { m.get(aid).profit += amt; profitSum += amt; }
      else if (kind === 'bot_fee') { const f = Math.abs(amt); m.get(aid).fees += f; feesSum += f; }
      else if (kind === 'bot_refund') { m.get(aid).refunds += amt; }
    }
    const plain = {};
    for (const [k, v] of m.entries()) { v.net = (v.profit || 0) - (v.fees || 0); plain[k] = v; }
    return { botPnlByActivation: plain, totalBotProfit: profitSum, totalBotFees: feesSum, totalBotNet: profitSum - feesSum };
  }, [transactions]);

  const getBotPnl = useCallback((activationId) =>
    botPnlByActivation[String(activationId)] || { profit: 0, fees: 0, refunds: 0, net: 0 }
  , [botPnlByActivation]);

  /* ================== Eventos de bots (para tu página) ================== */
  async function listBotEvents(activationId, limit = 100) {
    // primero intento vista
    const tryView = await supabase.from('v_bot_events')
      .select('*').eq('activation_id', activationId)
      .order('created_at', { ascending: false }).limit(limit);
    if (!tryView.error) return ensureArray(tryView.data);

    // tabla cruda
    const { data, error } = await supabase.from('bot_events')
      .select('*').eq('activation_id', activationId)
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return ensureArray(data);
  }
  function subscribeBotEvents(activationId, cb) {
    return supabase
      .channel(`bot_events_${activationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_events', filter: `activation_id=eq.${activationId}` }, cb)
      .subscribe();
  }

  /* ================== Activos/Cancelados para UI ================== */
  const activeBots = useMemo(
    () => ensureArray(botActivations).filter((b) => ACTIVE.has(norm(b.status)) && !b.hidden),
    [botActivations]
  );
  const canceledBots = useMemo(
    () => ensureArray(botActivations).filter((b) => {
      const s = norm(b.status); return CANCELLED.has(s) && !b.hidden && s !== 'archived';
    }),
    [botActivations]
  );

  /* ================== (el resto de mercado/quotes queda igual, omitido por brevedad) ================== */
  // Para no alargar más, dejamos precios/tickers como estaban en tu versión anterior.
  // Si los necesitás aquí, copia y pega tal cual tu bloque de “Binance WS + fallback” y consolidación.

  /* ================== value del contexto ================== */
  const value = useMemo(() => ({
    // negocio
    investments, transactions, referrals,
    botActivations, activeBots, canceledBots,

    // bots
    refreshBotActivations, refreshTransactions,
    activateBot, pauseBot, resumeBot, cancelBot,

    // PnL
    botPnlByActivation, getBotPnl, totalBotProfit, totalBotFees, totalBotNet,

    // eventos (para TradingBotsPage)
    listBotEvents, subscribeBotEvents,

    // settings
    settings: adminSettings, slippageMaxPct, botCancelFeeUsd, botCancelFeePct,

    // saldos
    getAvailableBalance, canActivateBot, refreshSettings: async () => {},
  }), [
    investments, transactions, referrals,
    botActivations, activeBots, canceledBots,
    adminSettings, slippageMaxPct, botCancelFeeUsd, botCancelFeePct,
    botPnlByActivation, getBotPnl, totalBotProfit, totalBotFees, totalBotNet,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/* ============== Hook ============== */
export function useData() {
  const ctx = useContext(DataContext);
  return ctx ?? {
    investments: [], transactions: [], referrals: [],
    botActivations: [], activeBots: [], canceledBots: [],
    refreshBotActivations: async () => {}, refreshTransactions: async () => {},
    activateBot: async () => ({ ok: false }), pauseBot: async () => ({ ok: false }),
    resumeBot: async () => ({ ok: false }), cancelBot: async () => ({ ok: false }),
    botPnlByActivation: {}, getBotPnl: () => ({ profit: 0, fees: 0, refunds: 0, net: 0 }),
    totalBotProfit: 0, totalBotFees: 0, totalBotNet: 0,
    listBotEvents: async () => [], subscribeBotEvents: () => () => {},
    settings: {}, slippageMaxPct: 0.2, botCancelFeeUsd: 0, botCancelFeePct: 0,
    getAvailableBalance: async () => 0, canActivateBot: async () => ({ ok: false, available: 0, needed: 0 }),
  };
}
