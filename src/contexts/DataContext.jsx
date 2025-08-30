// src/contexts/DataContext.jsx
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
} from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const DataContext = createContext(null);

// ---------- Utils ----------
const ensureArray = (v) => (Array.isArray(v) ? v : []);
const nowMs = () => Date.now();

// Pares Binance por defecto (por si Admin aún no carga instrumentos)
const DEFAULT_BINANCE_MAP = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  BNB: 'BNBUSDT',
  ADA: 'ADAUSDT',
};

const HISTORY_MAX = 600; // ~10 min a 1s por punto
const TICK_MS = 1000;    // ritmo visual (1 segundo)

// ---------- Reglas por hora UTC ----------
const inWindowUTC = (hour, start, end) =>
  (start < end && hour >= start && hour < end) ||
  (start > end && (hour >= start || hour < end)) ||
  (start === end); // 24h

const applyRulesForSymbol = (symbol, basePrice, rules, now = new Date()) => {
  if (!Number.isFinite(basePrice)) return basePrice;
  const hour = now.getUTCHours();
  let price = basePrice;

  for (const r of ensureArray(rules)) {
    if (!r?.active) continue;
    const sym = r.symbol || r.asset_symbol;
    if (sym !== symbol) continue;

    const sh = Number(r.start_hour ?? 0);
    const eh = Number(r.end_hour ?? 0);
    if (!inWindowUTC(hour, sh, eh)) continue;

    const type = String(r.type || '').toLowerCase(); // 'percent' | 'abs' | 'absolute'
    const v = Number(r.value ?? 0);
    if (type === 'percent') price *= (1 + v / 100);
    else price += v; // abs/absolute => suma directa
  }
  return price;
};

export function DataProvider({ children }) {
  const { user, refreshBalances: refreshAuthBalances } = useAuth();

  // ---------- Estado negocio ----------
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [botActivations, setBotActivations] = useState([]);

  // ---------- Mercado (admin) ----------
  /**
   * market_instruments:
   * - symbol, enabled, source('binance'|'simulated'|'manual'|'real'), binance_symbol,
   *   base_price, decimals, quote, volatility_bps, difficulty
   */
  const [instruments, setInstruments] = useState([]);
  /**
   * market_rules (activas):
   * - symbol, active, type('percent'|'abs'|'absolute'), value, start_hour, end_hour
   */
  const [marketRules, setMarketRules] = useState([]);

  // ---------- Precios / Historias ----------
  const [realQuotes, setRealQuotes] = useState({
    USDT: { price: 1, change: 0 },
    USDC: { price: 1, change: 0 },
  });

  const [priceHistories, setPriceHistories] = useState({
    USDT: [{ time: nowMs(), value: 1 }],
    USDC: [{ time: nowMs(), value: 1 }],
  });

  const [cryptoPrices, setCryptoPrices] = useState({});

  // ---------- Refs / conexiones ----------
  const wsRef = useRef(null);
  const wsAliveRef = useRef(false);
  const restPollRef = useRef(null);
  const lastTickRef = useRef(0);

  // refs para evitar rehacer intervalos
  const instrumentsRef = useRef([]);
  const rulesRef = useRef([]);
  const quotesRef = useRef({});
  const histRef = useRef({});
  const liveMapRef = useRef({});

  // Detección de funciones RPC (memorizada en refs para no re-renderizar)
  const supportsBulkRef = useRef(null); // true | false | null
  const hasNextV2Ref    = useRef(null); // true | false | null

  // Símbolos con RPC v1 roto ⇒ no insistir (evita flood 400)
  const badSymsRef = useRef(new Set());

  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);
  useEffect(() => { rulesRef.current = marketRules; }, [marketRules]);
  useEffect(() => { quotesRef.current = realQuotes; }, [realQuotes]);
  useEffect(() => { histRef.current = priceHistories; }, [priceHistories]);

  // ---------- Fetch + realtime instrumentos/reglas ----------
  const refreshMarketInstruments = async () => {
    const { data, error } = await supabase
      .from('market_instruments')
      .select('*')
      .order('symbol', { ascending: true });
    if (!error) setInstruments(ensureArray(data));
  };

  const refreshMarketRules = async () => {
    const { data, error } = await supabase
      .from('market_rules')
      .select('*')
      .eq('active', true)
      .order('start_hour', { ascending: true });
    if (!error) setMarketRules(ensureArray(data));
  };

  const forceRefreshMarket = async () => {
    await Promise.all([refreshMarketInstruments(), refreshMarketRules()]);
  };

  useEffect(() => {
    forceRefreshMarket();
    const ch = supabase
      .channel('market_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_instruments' }, () => refreshMarketInstruments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_rules' }, () => refreshMarketRules())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch (_) {} };
  }, []);

  // ---------- Mapa dinámico a Binance (solo enabled & source=binance) ----------
  const liveBinanceMap = useMemo(() => {
    const map = { ...DEFAULT_BINANCE_MAP };
    instruments.forEach((i) => {
      const enabled = (i.enabled ?? true) === true;
      const src = String(i.source || '').toLowerCase();
      if (!enabled || src !== 'binance') return;
      if (i.binance_symbol) map[i.symbol] = i.binance_symbol;
    });
    liveMapRef.current = map;
    return map; // { BTC:'BTCUSDT', ... }
  }, [instruments]);

  // ---------- Polling REST (fallback a WS) ----------
  const startRestPolling = (entries) => {
    clearInterval(restPollRef.current);
    if (!entries.length) return;

    const poll = async () => {
      try {
        const results = await Promise.all(
          entries.map(async ([sym, pair]) => {
            const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
            const res = await fetch(url);
            const j = await res.json();
            const price  = Number(j.lastPrice ?? j.c ?? 0);
            const change = Number(j.priceChangePercent ?? j.P ?? 0);
            return [sym, { price, change }];
          })
        );
        setRealQuotes((prev) => {
          const next = { ...prev };
          for (const [sym, val] of results) {
            if (Number.isFinite(val.price) && val.price > 0) next[sym] = val;
          }
          return next;
        });
      } catch {
        // silencioso
      }
    };

    poll(); // seed inmediato
    restPollRef.current = setInterval(poll, 5000);
  };

  // ---------- Binance WS + fallback REST ----------
  useEffect(() => {
    let alive = true;

    const teardown = () => {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      wsAliveRef.current = false;
      clearInterval(restPollRef.current);
      restPollRef.current = null;
    };

    const init = async () => {
      teardown();

      const liveEntries = Object.entries(liveBinanceMap);

      // Seed inicial por REST
      if (liveEntries.length) {
        try {
          const results = await Promise.all(
            liveEntries.map(async ([sym, pair]) => {
              const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
              const res = await fetch(url);
              const j = await res.json();
              const price  = Number(j.lastPrice ?? j.c ?? 0);
              const change = Number(j.priceChangePercent ?? j.P ?? 0);
              return [sym, { price, change }];
            })
          );

          if (!alive) return;

          setRealQuotes((prev) => {
            const next = { ...prev };
            for (const [sym, val] of results) {
              if (Number.isFinite(val.price) && val.price > 0) next[sym] = val;
            }
            return next;
          });

          const t0 = nowMs();
          setPriceHistories((prev) => {
            const next = { ...prev };
            for (const [sym, val] of results) {
              const seed = prev[sym]?.length ? prev[sym] : [{ time: t0, value: val.price }];
              next[sym] = seed.slice(-HISTORY_MAX);
            }
            next.USDT ??= [{ time: t0, value: 1 }];
            next.USDC ??= [{ time: t0, value: 1 }];
            return next;
          });
        } catch {
          // polling de abajo lo corrige
        }
      }

      // WS live (si cae, fallback a REST polling)
      if (liveEntries.length) {
        try {
          const streams = liveEntries
            .map(([, pair]) => `${String(pair).toLowerCase()}@miniTicker`)
            .join('/');
          const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
          wsRef.current = ws;

          ws.onopen = () => {
            wsAliveRef.current = true;
            clearInterval(restPollRef.current);
            restPollRef.current = null;
          };

          ws.onmessage = (evt) => {
            try {
              const payload = JSON.parse(evt.data);
              const t = payload?.data;
              const pair = t?.s;
              if (!pair) return;

              const sym = Object.keys(liveMapRef.current).find((k) => liveMapRef.current[k] === pair);
              if (!sym) return;

              const price = Number(t?.c);
              const change = Number(t?.P ?? 0);
              if (!Number.isFinite(price) || price <= 0) return;

              setRealQuotes((prev) => ({ ...prev, [sym]: { price, change } }));
            } catch {}
          };

          ws.onerror = () => { try { ws.close(); } catch {} };
          ws.onclose = () => {
            wsAliveRef.current = false;
            startRestPolling(liveEntries);
          };
        } catch {
          startRestPolling(liveEntries);
        }
      }
    };

    init();
    return () => { alive = false; teardown(); };
  }, [liveBinanceMap]);

  // ---------- PRO: Simuladas/Manual/Real desde servidor (Realtime + RPC) ----------
  useEffect(() => {
    // 1) Suscripción a market_state (cotizaciones para la UI)
    const onStateChange = (payload) => {
      const row = payload.new;
      if (!row) return;
      const sym   = String(row.symbol).toUpperCase();
      const price = Number(row.price);
      const ref24 = Number(row.ref_24h ?? price);
      if (!Number.isFinite(price)) return;

      const change = ref24 > 0 ? ((price - ref24) / ref24) * 100 : 0;
      setRealQuotes((prev) => ({ ...prev, [sym]: { price, change } }));
    };

    const ch = supabase
      .channel('market_state_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'market_state' }, onStateChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'market_state' }, onStateChange)
      .subscribe();

    // 2) Símbolos simulados/manuales/real habilitados
    const simSyms = instruments
      .filter((i) => (i.enabled ?? true) && ['simulated', 'manual', 'real'].includes(String(i.source || '').toLowerCase()))
      .map((i) => i.symbol);

    let alive = true;
    let idx = 0;
    let timer;

    // ---- detectar funciones disponibles (sólo 1 vez por montaje) ----
    const probeFns = async () => {
      try {
        if (supportsBulkRef.current === null) {
          const { error } = await supabase.rpc('tick_all_simulated_v2');
          supportsBulkRef.current = !error; // true si existe
        }
      } catch { supportsBulkRef.current = false; }

      try {
        if (hasNextV2Ref.current === null) {
          if (simSyms.length > 0) {
            const { error } = await supabase.rpc('next_simulated_tick_v2', { p_symbol: simSyms[0] });
            hasNextV2Ref.current = !error;
          } else {
            hasNextV2Ref.current = false;
          }
        }
      } catch { hasNextV2Ref.current = false; }
    };

    // Seed suave: asegura 1 fila en market_state por símbolo
    const callNextOnce = async (sym) => {
      // intenta v2 y cae a v1
      if (hasNextV2Ref.current === true) {
        const { error } = await supabase.rpc('next_simulated_tick_v2', { p_symbol: sym });
        if (!error) return true;
        hasNextV2Ref.current = false; // deja de intentar v2
      }
      const { error } = await supabase.rpc('next_simulated_tick', { p_symbol: sym });
      if (error) {
        // si la función v1 está rota (400 / out of range), dejar de insistir con este símbolo
        const msg = String(error?.message || '').toLowerCase();
        if (msg.includes('out of range') || msg.includes('bad request') || msg.includes('numeric')) {
          if (!badSymsRef.current.has(sym)) {
            console.warn(`[next_simulated_tick] deshabilitado para ${sym}: ${error.message}`);
            badSymsRef.current.add(sym);
          }
        }
        return false;
      }
      return true;
    };

    const seedOnce = async () => {
      for (const sym of simSyms) {
        await callNextOnce(sym);
      }
    };

    const drive = async () => {
      if (!alive || simSyms.length === 0) return;

      // 1) bulk si está disponible
      if (supportsBulkRef.current === true) {
        const { error } = await supabase.rpc('tick_all_simulated_v2');
        if (!error) return; // avanzó todo
        supportsBulkRef.current = false; // si falló, dejar de intentar
      }

      // 2) fallback round-robin por símbolo (omitiendo “malos”)
      const healthy = simSyms.filter((s) => !badSymsRef.current.has(s));
      if (!healthy.length) return;
      const sym = healthy[idx % healthy.length];
      idx++;
      await callNextOnce(sym);
    };

    (async () => {
      await probeFns();   // detecta RPCs una vez
      await seedOnce();   // deja estado inicial
      timer = setInterval(drive, TICK_MS);
    })();

    return () => {
      alive = false;
      clearInterval(timer);
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [instruments]);

  // ---------- Consolidación final + histories cada ~1s ----------
  useEffect(() => {
    const tick = () => {
      const t = nowMs();
      if (t - lastTickRef.current < TICK_MS * 0.6) return;
      lastTickRef.current = t;

      const instrumentsCur = instrumentsRef.current;
      const rulesCur = rulesRef.current;
      const quotesCur = quotesRef.current;
      const histCur = histRef.current;
      const liveMapCur = liveMapRef.current;

      const enabledSyms = instrumentsCur.filter((i) => (i.enabled ?? true)).map((i) => i.symbol);
      const liveSyms = Object.keys(liveMapCur);
      const symbolsSet = new Set([...enabledSyms, ...liveSyms, 'USDT', 'USDC']);

      const nextHist = { ...histCur };
      const nextPrices = {};

      for (const sym of symbolsSet) {
        const inst = instrumentsCur.find((i) => i.symbol === sym);
        const src = String(inst?.source || '').toLowerCase();
        const decimals = Number(inst?.decimals ?? 2);
        const quote = (inst?.quote || 'USDT').toUpperCase();

        const prevH = ensureArray(nextHist[sym]);
        const lastKnown = prevH.length ? prevH[prevH.length - 1].value : undefined;

        let base = 0;
        if (src === 'binance') {
          base = Number(quotesCur?.[sym]?.price ?? NaN);
          if (!Number.isFinite(base) || base <= 0) base = Number.isFinite(lastKnown) ? lastKnown : 0;
        } else if (src === 'manual' || src === 'simulated' || src === 'real') {
          base = Number(quotesCur?.[sym]?.price ?? inst?.base_price ?? 0);
        } else {
          base = Number(quotesCur?.[sym]?.price ?? 0);
          if (!base && inst) base = Number(inst.base_price ?? 0);
        }

        let finalPrice =
          (sym === 'USDT' || sym === 'USDC')
            ? 1
            : (src === 'manual' || src === 'simulated' || src === 'real')
              ? base // ya viene con reglas aplicadas desde el servidor
              : applyRulesForSymbol(sym, base, rulesCur, new Date());

        if ((!Number.isFinite(finalPrice) || finalPrice <= 0) && Number.isFinite(lastKnown)) {
          finalPrice = lastKnown;
        }

        finalPrice = Number(
          (Number.isFinite(finalPrice) ? finalPrice : 0).toFixed(Number.isFinite(decimals) ? decimals : 2)
        );

        // Cambio 24h: si viene de realtime (quotesCur) úsalo SIEMPRE; de lo contrario, fallback al primer punto del history en memoria.
        let changePct = 0;
        if (quotesCur?.[sym]?.change != null) {
          changePct = Number(quotesCur[sym].change || 0);
        } else {
          const ref = prevH?.[0]?.value ?? finalPrice;
          if (ref) changePct = ((finalPrice - ref) / ref) * 100;
        }

        const newH = [...prevH, { time: t, value: finalPrice }].slice(-HISTORY_MAX);
        nextHist[sym] = newH;

        const payload = { price: finalPrice, change: changePct, history: newH };

        // Guardamos con dos claves para evitar descuadres entre panel y gráfico
        nextPrices[sym] = payload;
        const pairKey = `${sym}/${quote}`;
        nextPrices[pairKey] = payload;
      }

      setPriceHistories(nextHist);
      setCryptoPrices((prev) => ({ ...prev, ...nextPrices }));
    };

    const id = setInterval(tick, TICK_MS);
    tick();
    return () => clearInterval(id);
  }, []); // usamos refs, así no recreamos el intervalo

  // ---------- Planes (estáticos) ----------
  const investmentPlans = useMemo(
    () => [
      { id: 1, name: 'Plan Básico',   minAmount: 100,   maxAmount: 999,   dailyReturn: 1.5, duration: 30, description: 'Perfecto para principiantes' },
      { id: 2, name: 'Plan Estándar', minAmount: 1000,  maxAmount: 4999,  dailyReturn: 2.0, duration: 30, description: 'Para inversores intermedios' },
      { id: 3, name: 'Plan Premium',  minAmount: 5000,  maxAmount: 19999, dailyReturn: 2.5, duration: 30, description: 'Para grandes inversores' },
      { id: 4, name: 'Plan VIP',      minAmount: 20000, maxAmount: 100000,duration: 30, dailyReturn: 3.0, description: 'Para grandes inversores' },
    ],
    []
  );

  // ---------- Fetchers negocio ----------
  async function refreshInvestments() {
    if (!user?.id) { setInvestments([]); return; }
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('[refreshInvestments] error:', error); setInvestments([]); return; }

    const now = dayjs();
    const mapped = ensureArray(data).map((inv) => {
      const start = dayjs(inv.created_at);
      const duration = Number(inv.duration || 0);
      const daysElapsed = Math.min(now.diff(start, 'day'), duration);
      const dailyReturn = Number(inv.daily_return || 0);
      const earnings = dailyReturn * daysElapsed;

      return {
        user_id: inv.user_id,
        userId: inv.user_id,
        id: inv.id,
        planName: inv.plan_name,
        amount: Number(inv.amount || 0),
        dailyReturn,
        duration,
        createdAt: inv.created_at,
        status: inv.status,
        currency: inv.currency_input,
        daysElapsed,
        earnings,
      };
    });

    setInvestments(mapped);
  }

  async function refreshTransactions() {
    if (!user?.id) { setTransactions([]); return; }
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('[refreshTransactions] error:', error); setTransactions([]); return; }

    const mapped = ensureArray(data).map((tx) => {
      let base = String(tx.type || '').toLowerCase();
      if (base === 'plan_purchase') base = 'investment';

      const ref = String(tx.reference_type || '').toLowerCase();
      let displayType = base;

      if (ref === 'bot_activation') displayType = 'bot_activation';
      if (ref === 'bot_profit')     displayType = 'bot_profit';
      if (ref === 'bot_refund')     displayType = 'bot_refund';
      if (ref === 'bot_fee')        displayType = 'bot_fee';

      if (
        ref === 'plan_payout' ||
        ref === 'plan_profit' ||
        ref === 'investment_profit' ||
        ref === 'roi_payout' ||
        base === 'plan_payout' ||
        base === 'investment_profit' ||
        base === 'plan_profit' ||
        base === 'roi_payout'
      ) {
        displayType = 'plan_payout';
      }

      return {
        user_id: tx.user_id,
        userId: tx.user_id,
        id: tx.id,
        type: displayType,
        rawType: tx.type,
        status: String(tx.status || '').toLowerCase(),
        amount: Number(tx.amount || 0),
        currency: tx.currency || 'USDC',
        description: tx.description || '',
        createdAt: tx.created_at,
        referenceType: tx.reference_type,
        referenceId: tx.reference_id,
      };
    });

    setTransactions(mapped);
  }

  async function refreshReferrals() {
    if (!user?.id) { setReferrals([]); return; }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at, username')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('[refreshReferrals] error:', error); setReferrals([]); return; }
    setReferrals(ensureArray(data));
  }

  async function refreshBotActivations() {
    if (!user?.id) { setBotActivations([]); return; }
    const { data, error } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) { console.error('[refreshBotActivations] error:', error); setBotActivations([]); return; }

    const mapped = ensureArray(data).map((b) => ({
      id: b.id,
      user_id: b.user_id,
      userId: b.user_id,
      botId: b.bot_id,
      botName: b.bot_name,
      strategy: b.strategy,
      amountUsd: Number(b.amount_usd || 0),
      status: b.status, // active | paused | cancelled
      createdAt: b.created_at,
    }));
    setBotActivations(mapped);
  }

  useEffect(() => {
    setInvestments([]); setTransactions([]); setReferrals([]); setBotActivations([]);
    if (user?.id) {
      refreshInvestments();
      refreshTransactions();
      refreshReferrals();
      refreshBotActivations();
    }
  }, [user?.id]);

  // ---------- Mutaciones ----------
  async function addInvestment({ planName, amount, dailyReturn, duration, currency = 'USDC' }) {
    if (!user?.id) return null;
    const payload = {
      user_id: user.id,
      plan_name: planName,
      amount: Number(amount),
      daily_return: Number(dailyReturn),
      duration: Number(duration),
      status: 'active',
      currency_input: currency,
    };
    const { data, error } = await supabase
      .from('investments')
      .insert(payload)
      .select('*')
      .single();
    if (error) { console.error('[addInvestment] error:', error); return null; }

    await refreshInvestments();
    return {
      user_id: data.user_id,
      userId: data.user_id,
      id: data.id,
      planName: data.plan_name,
      amount: Number(data.amount || 0),
      dailyReturn: Number(data.daily_return || 0),
      duration: Number(data.duration || 0),
      createdAt: data.created_at,
      status: data.status,
      currency: data.currency_input,
      daysElapsed: 0,
      earnings: 0,
    };
  }

  async function addTransaction({
    amount, type, currency = 'USDC', description = '',
    referenceType = null, referenceId = null, status = 'completed',
  }) {
    if (!user?.id) return null;
    const payload = {
      user_id: user.id,
      amount: Number(amount),
      type,
      status,
      currency,
      description,
      reference_type: referenceType,
      reference_id: referenceId,
    };
    const { data, error } = await supabase
      .from('wallet_transactions')
      .insert(payload)
      .select('*')
      .single();
    if (error) { console.error('[addTransaction] error:', error); return null; }

    await refreshTransactions();
    let mappedType = data.type;
    if (mappedType === 'plan_purchase') mappedType = 'investment';
    return {
      user_id: data.user_id,
      userId: data.user_id,
      id: data.id,
      type: mappedType,
      status: data.status,
      amount: Number(data.amount || 0),
      currency: data.currency || 'USDC',
      description: data.description || '',
      createdAt: data.created_at,
      referenceType: data.reference_type,
      referenceId: data.reference_id,
    };
  }

  // ---------- RPC Bots ----------
  async function activateBot({ botId, botName, strategy = 'default', amountUsd }) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('rent_trading_bot', {
        p_user_id: user.id,
        p_bot_id: botId,
        p_bot_name: botName,
        p_strategy: strategy,
        p_amount_usd: Number(amountUsd),
      });
      if (error) return { ok: false, code: 'RPC_ERROR', error };
      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      return data ?? { ok: true };
    } catch {
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }
  async function resumeLike(fn, activationId) {
    try {
      const { data, error } = await supabase.rpc(fn, {
        p_activation_id: activationId,
        p_user_id: user?.id,
      });
      if (error) return { ok: false, code: 'RPC_ERROR', error };
      await refreshBotActivations();
      return data ?? { ok: true };
    } catch {
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }
  async function pauseBot(id)  { return resumeLike('pause_trading_bot',  id); }
  async function resumeBot(id) { return resumeLike('resume_trading_bot', id); }
  async function cancelBot(id) { return resumeLike('cancel_trading_bot', id); }
  async function creditBotProfit(activationId, amountUsd, note = null) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('credit_bot_profit', {
        p_activation_id: activationId,
        p_user_id: user.id,
        p_amount_usd: Number(amountUsd),
        p_note: note,
      });
      if (error) return { ok: false, code: 'RPC_ERROR', error };
      await refreshTransactions();
      return data ?? { ok: true };
    } catch {
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  // ---------- Helpers UI ----------
  const pairOptions = useMemo(() => {
    const enabled = instruments.filter((i) => (i.enabled ?? true));
    const list = enabled.map((i) => `${i.symbol}/${i.quote || 'USDT'}`);
    const s = new Set(list);
    if (!s.has('BTC/USDT')) s.add('BTC/USDT');
    if (!s.has('ETH/USDT')) s.add('ETH/USDT');
    return Array.from(s);
  }, [instruments]);

  const getPairInfo = (pair) => {
    const key = String(pair || '').toUpperCase().replace(/\s+/g, '');
    // cryptoPrices ahora tiene tanto "SYM" como "SYM/QUOTE"
    return cryptoPrices[key] || (() => {
      // último intento: extraer lado izquierdo
      const [lhs] = key.split('/');
      return cryptoPrices[lhs] || { price: undefined, change: undefined, history: [] };
    })();
  };

  /* ------------------ CLOSE TRADE (REAL) ------------------ */
  // helpers internos para trades
  const _num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
  const _normalizePair = (pair, fb = 'BTC/USDT') => {
    if (!pair) return fb;
    const s = String(pair).trim().toUpperCase();
    if (s.includes('/')) {
      const [b = 'BTC', q = 'USDT'] = s.split('/');
      return `${b}/${q}`;
    }
    if (s.endsWith('USDT')) return `${s.slice(0, -4)}/USDT`;
    if (s.endsWith('USDC')) return `${s.slice(0, -4)}/USDC`;
    return `${s}/USDT`;
  };
  const _quoteFromPair = (pair) => _normalizePair(pair).split('/')[1] || 'USDT';
  const _qtyFromTrade = (t) => {
    const q = _num(t?.qty ?? t?.quantity ?? t?.units ?? t?.size, NaN);
    if (Number.isFinite(q) && q > 0) return q;
    const entry = _num(t?.price ?? t?.priceAtExecution, 0);
    const amountOpen = _num(t?.amountAtOpen ?? t?.amount_usd ?? t?.amount, 0);
    if (entry > 0 && amountOpen > 0) return amountOpen / entry;
    return 0;
  };
  const _entryFromTrade = (t) => _num(t?.price ?? t?.priceAtExecution, 0);

  async function _fetchBinanceLastPrice(pairOrSymbol) {
    try {
      const norm = _normalizePair(pairOrSymbol);
      const symbol = norm.replace('/', '');
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      const j = await res.json();
      const p = Number(j?.price);
      return Number.isFinite(p) ? p : null;
    } catch {
      return null;
    }
  }

  async function _rpcIncWallet(uid, currency, delta) {
    try {
      const { error } = await supabase.rpc('inc_wallet', {
        uid,
        currency,
        delta,
      });
      return !error;
    } catch {
      return false;
    }
  }
  async function _fallbackIncWallet(uid, currency, delta) {
    const col = String(currency || 'USDT').toLowerCase(); // usdt | usdc | btc | eth
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', uid)
      .single();
    if (error) return false;
    const current = Number(data?.[col] ?? 0);
    const next = current + Number(delta || 0);
    const { error: upErr } = await supabase
      .from('wallets')
      .update({ [col]: next })
      .eq('user_id', uid);
    return !upErr;
  }

  /**
   * Cierra un trade. En REAL:
   * - calcula profit (permite pasar closePriceHint, si no usa Binance o entry)
   * - actualiza el trade (closePrice, profit, status)
   * - inserta wallet_transaction 'trade_profit'
   * - acredita PnL al wallet (quote)
   * - refresca transacciones y balances
   *
   * @param {string} tradeId
   * @param {boolean} byUser
   * @param {number} [closePriceHint]
   */
  async function closeTrade(tradeId, byUser = false, closePriceHint) {
    try {
      // 1) Traer trade
      const { data: t, error: selErr } = await supabase
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();
      if (selErr || !t) throw new Error(selErr?.message || 'Trade no encontrado');

      if (String(t.status || '').toLowerCase() === 'closed') return true;

      const isDemo = String(t.mode || t.simulated || '').toLowerCase() === 'demo';
      const side = String(t.type || '').toLowerCase(); // buy|sell
      const entry = _entryFromTrade(t);
      const qty   = _qtyFromTrade(t);

      // 2) Precio de cierre
      let closePrice =
        Number.isFinite(Number(closePriceHint)) ? Number(closePriceHint)
        : _num(t?.closeprice ?? t?.closePrice ?? t?.close_price, NaN);

      if (!Number.isFinite(closePrice)) {
        const live = await _fetchBinanceLastPrice(t.pair || t.binance_symbol || '');
        if (Number.isFinite(live)) closePrice = live;
      }
      if (!Number.isFinite(closePrice)) closePrice = entry; // evita NaN

      // 3) Profit
      const profit = qty && entry
        ? (side === 'sell' ? (entry - closePrice) * qty : (closePrice - entry) * qty)
        : 0;

      // 4) Actualizar trade
      const patch = {
        status: 'closed',
        closePrice,
        profit,
        closeAt: new Date().toISOString(),
        closed_by: byUser ? 'user' : 'system',
      };
      const { error: updErr } = await supabase
        .from('trades')
        .update(patch)
        .eq('id', tradeId);
      if (updErr) throw new Error(updErr.message);

      // 5) En REAL: transacción + wallet
      if (!isDemo) {
        const uid = t.user_id ?? t.userId ?? user?.id;
        const quote = _quoteFromPair(t.pair || 'BTC/USDT');
        const pnl = Number(profit || 0);

        // wallet transaction
        await supabase.from('wallet_transactions').insert({
          user_id: uid,
          type: 'trade_profit',
          amount: pnl,
          currency: quote,
          status: 'completed',
          description: `PnL ${t.pair} ${side.toUpperCase()}`,
          reference_type: 'trade',
          reference_id: t.id,
        });

        // acreditar wallet (RPC atómico si existe; si falla, fallback)
        const okRpc = await _rpcIncWallet(uid, quote, pnl);
        if (!okRpc) await _fallbackIncWallet(uid, quote, pnl);
      }

      // 6) Refrescar vista
      await refreshTransactions();
      await refreshInvestments(); // por si tienes KPIs cruzados
      try { await refreshAuthBalances?.(); } catch {}

      return true;
    } catch (err) {
      console.error('[closeTrade] error:', err);
      return false;
    }
  }
  /* ------------------ FIN CLOSE TRADE ------------------ */

  const value = useMemo(() => ({
    // negocio
    investments,
    transactions,
    referrals,
    botActivations,
    getInvestments: () => investments,
    getTransactions: () => transactions,
    getReferrals: () => referrals,
    refreshInvestments,
    refreshTransactions,
    refreshReferrals,
    addInvestment,
    addTransaction,

    // bots
    refreshBotActivations,
    activateBot,
    pauseBot,
    resumeBot,
    cancelBot,
    creditBotProfit,

    // mercado/admin
    instruments,
    marketRules,
    refreshMarketInstruments,
    refreshMarketRules,
    forceRefreshMarket,

    // precios
    cryptoPrices,            // {SYM: {price, change, history[]}, 'SYM/QUOTE': {...}}
    getPairInfo,             // helper recomendado para paneles
    pairOptions,             // ['BTC/USDT', ...]
    assetToSymbol: liveBinanceMap,

    // trades
    closeTrade,

    investmentPlans,
  }), [
    investments, transactions, referrals, botActivations,
    instruments, marketRules, cryptoPrices, pairOptions, liveBinanceMap,
    investmentPlans,
  ]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

// ---------- Hook con fallback ----------
export function useData() {
  const ctx = useContext(DataContext);
  return ctx || {
    investments: [],
    transactions: [],
    referrals: [],
    botActivations: [],
    getInvestments: () => [],
    getTransactions: () => [],
    getReferrals: () => [],
    refreshInvestments: async () => {},
    refreshTransactions: async () => {},
    refreshReferrals: async () => {},
    addInvestment: async () => null,
    addTransaction: async () => null,

    refreshBotActivations: async () => {},
    activateBot: async () => ({ ok: false }),
    pauseBot: async () => ({ ok: false }),
    resumeBot: async () => ({ ok: false }),
    cancelBot: async () => ({ ok: false }),
    creditBotProfit: async () => ({ ok: false }),

    instruments: [],
    marketRules: [],
    refreshMarketInstruments: async () => {},
    refreshMarketRules: async () => {},
    forceRefreshMarket: async () => {},

    cryptoPrices: {},
    getPairInfo: () => ({ price: undefined, change: undefined, history: [] }),
    pairOptions: ['BTC/USDT', 'ETH/USDT'],
    assetToSymbol: DEFAULT_BINANCE_MAP,

    closeTrade: async () => true,

    investmentPlans: [],
  };
}
