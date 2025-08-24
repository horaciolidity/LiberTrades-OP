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
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Fallback de pares conocidos (si el admin aún no los cargó)
const DEFAULT_BINANCE_MAP = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  BNB: 'BNBUSDT',
  ADA: 'ADAUSDT',
};

// Historial y tick del consolidado
const HISTORY_MAX = 600;     // puntos guardados por símbolo (~10 min a 1s)
const TICK_MS = 1200;        // ~1.2s para fluidez visual

// ---------- Perfiles de dificultad (solo simulated/manual) ----------
const DIFFICULTY_PROFILES = {
  easy:         { volMult: 0.45, meanRevK:  0.18, jumpProb: 0.001, jumpBps:  25 },
  intermediate: { volMult: 1.00, meanRevK:  0.06, jumpProb: 0.003, jumpBps:  80 },
  nervous:      { volMult: 2.20, meanRevK: -0.04, jumpProb: 0.012, jumpBps: 200 },
};
const getProfile = (difficulty) =>
  DIFFICULTY_PROFILES[String(difficulty || 'intermediate').toLowerCase()] ||
  DIFFICULTY_PROFILES.intermediate;

// ---------- Reglas por hora UTC ----------
const inWindowUTC = (hour, start, end) => {
  return (start < end && hour >= start && hour < end) ||
         (start > end && (hour >= start || hour < end)) ||
         (start === end);
};

const applyRulesForSymbol = (symbol, basePrice, rules, now = new Date()) => {
  if (!basePrice) return basePrice;
  const hour = now.getUTCHours();
  let price = basePrice;

  for (const r of ensureArray(rules)) {
    if (!r?.active) continue;
    const sym = r.symbol || r.asset_symbol;
    if (sym !== symbol) continue;

    const sh = Number(r.start_hour ?? 0);
    const eh = Number(r.end_hour ?? 0);
    if (!inWindowUTC(hour, sh, eh)) continue;

    const type = String(r.type || '').toLowerCase(); // 'percent' | 'abs'
    const v = Number(r.value ?? 0);
    if (type === 'percent') price *= (1 + v / 100);
    else price += v;
  }
  return price;
};

// ---------- PRNG determinístico por símbolo/tiempo ----------
const hash32 = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const mulberry32 = (a) => {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
/**
 * Generador de precio sintético determinístico (igual para todos)
 * - Depende de: símbolo, dificultad, vol en bps, y el bucket temporal (tIdx).
 * - Produce movimientos suaves + algo de “ruido normal-like” + saltos ocasionales.
 * - No usa estado previo, por lo que abrir más tarde no desincroniza.
 */
function synthPriceAt(sym, inst, tMs) {
  const profile = getProfile(inst.difficulty);
  const volBpsRaw = Math.max(1, Number(inst.volatility_bps ?? 50));
  const vol = (volBpsRaw * profile.volMult) / 10000; // -> proporción
  const base0 = Number(inst.base_price ?? 1) || 1;
  const decimals = Number.isFinite(Number(inst.decimals)) ? Number(inst.decimals) : 2;

  // Bucket de tiempo (todos los clientes comparten este índice)
  const tIdx = Math.floor(tMs / TICK_MS);

  // PRNG seed estable por símbolo + tiempo + dificultad/vol
  const seed =
    (hash32(sym) ^ (tIdx * 374761393)) ^
    (hash32(String(inst.difficulty || 'intermediate')) << 1) ^
    (volBpsRaw << 2);

  const rnd = mulberry32(seed);
  // ruido aprox normal (suma de 3 uniformes - 1.5 a +1.5 -> centrado en 0)
  const u = (rnd() - 0.5) + (rnd() - 0.5) + (rnd() - 0.5);

  // drift suave senoidal (periodo ~ 70 ticks) para no ser totalmente errático
  const phase = (hash32(sym) % 360) * (Math.PI / 180);
  const drift = Math.sin((tIdx / 70) + phase) * 0.5; // [-0.5, 0.5]
  const driftK = profile.meanRevK; // lo usamos como “peso” de drift

  // saltos ocasionales determinísticos
  const jump = (rnd() < profile.jumpProb)
    ? ((rnd() - 0.5) * (profile.jumpBps / 10000))
    : 0;

  const pct = (vol * u) + (driftK * drift) + jump;

  let next = base0 * (1 + pct);
  // Evitar ir a 0 o negativo si reglas/jumps extremos
  next = Math.max(1e-8, next);
  return Number(next.toFixed(decimals));
}

export function DataProvider({ children }) {
  const { user } = useAuth();

  // ---------- Estado negocio ----------
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [botActivations, setBotActivations] = useState([]);

  // ---------- Mercado (admin) ----------
  /**
   * market_instruments (ejemplo):
   * - symbol (TEXT, PK lógica UX)
   * - enabled (BOOL)
   * - source ('binance' | 'simulated' | 'manual')
   * - binance_symbol (TEXT)   // ej: 'SOLUSDT'
   * - base_price (NUMERIC)    // si manual/simulated
   * - decimals (INT)
   * - quote (TEXT)            // 'USDT' | 'USDC'
   * - volatility_bps (INT)    // simulated/manual
   * - difficulty (TEXT)       // 'easy'|'intermediate'|'nervous'
   */
  const [instruments, setInstruments] = useState([]);

  /**
   * market_rules (activas):
   * - symbol (TEXT)
   * - active (BOOL)
   * - type ('percent'|'abs')
   * - value (NUMERIC)
   * - start_hour (INT 0..23)
   * - end_hour   (INT 0..23)
   */
  const [marketRules, setMarketRules] = useState([]);

  // ---------- Precios ----------
  // Último precio crudo (binance live + seed inicial para otros)
  const [realQuotes, setRealQuotes] = useState({
    USDT: { price: 1, change: 0 },
    USDC: { price: 1, change: 0 },
  });

  // Historial por símbolo
  const [priceHistories, setPriceHistories] = useState({
    USDT: [{ time: nowMs(), value: 1 }],
    USDC: [{ time: nowMs(), value: 1 }],
  });

  // Precios finales para la UI: {SYM: {price, change, history}}
  const [cryptoPrices, setCryptoPrices] = useState({});

  // Refs
  const wsRef = useRef(null);
  const lastTickRef = useRef(0);

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
    return () => {
      try { supabase.removeChannel(ch); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Mapa dinámico a Binance (solo enabled & source=binance) ----------
  const liveBinanceMap = useMemo(() => {
    const map = { ...DEFAULT_BINANCE_MAP }; // fallback
    instruments.forEach((i) => {
      const enabled = (i.enabled ?? true) === true;
      const src = String(i.source || '').toLowerCase();
      if (!enabled || src !== 'binance') return;
      if (i.binance_symbol) map[i.symbol] = i.binance_symbol;
    });
    return map; // { BTC:'BTCUSDT', BNB:'BNBUSDT', ...}
  }, [instruments]);

  // ---------- Inicializa REST/WS para BINANCE ----------
  useEffect(() => {
    let alive = true;

    const teardown = () => {
      try { wsRef.current?.close(); } catch (_) {}
      wsRef.current = null;
    };

    const init = async () => {
      teardown();

      // Seed REST
      const liveEntries = Object.entries(liveBinanceMap);
      if (liveEntries.length) {
        try {
          const results = await Promise.all(
            liveEntries.map(async ([sym, pair]) => {
              const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
              const res = await fetch(url);
              const j = await res.json();
              const price = Number(j.lastPrice ?? j.c ?? 0) || 0;
              const change = Number(j.priceChangePercent ?? j.P ?? 0) || 0;
              return [sym, { price, change }];
            })
          );
          if (!alive) return;

          setRealQuotes((prev) => {
            const next = { ...prev, USDT: { price: 1, change: 0 }, USDC: { price: 1, change: 0 } };
            for (const [sym, val] of results) next[sym] = val;
            return next;
          });

          const t0 = nowMs();
          setPriceHistories((prev) => {
            const next = { ...prev };
            for (const [sym, val] of results) {
              const seed = prev[sym]?.length ? prev[sym] : [{ time: t0, value: val.price || Number(instruments.find(i=>i.symbol===sym)?.base_price ?? 0) || 1 }];
              next[sym] = seed.slice(-HISTORY_MAX);
            }
            next.USDT = next.USDT ?? [{ time: t0, value: 1 }];
            next.USDC = next.USDC ?? [{ time: t0, value: 1 }];
            return next;
          });
        } catch (e) {
          console.warn('[Binance REST seed] error:', e?.message || e);
        }
      }

      // WS live
      if (liveEntries.length) {
        const streams = liveEntries
          .map(([, pair]) => `${String(pair).toLowerCase()}@miniTicker`)
          .join('/');

        const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
        wsRef.current = ws;

        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            const t = payload?.data;
            const pair = t?.s;
            if (!pair) return;

            const sym = Object.keys(liveBinanceMap).find((k) => liveBinanceMap[k] === pair);
            if (!sym) return;

            const price = Number(t?.c) || 0;
            const change = Number(t?.P ?? 0) || 0;
            if (!price) return; // no pisar con 0
            setRealQuotes((prev) => ({ ...prev, [sym]: { price, change } }));
          } catch (e) {
            console.warn('[Binance WS parse] error:', e?.message || e);
          }
        };

        ws.onerror = () => {
          try { ws.close(); } catch (_) {}
        };
      }
    };

    init();
    return () => {
      alive = false;
      teardown();
    };
  }, [instruments, liveBinanceMap]);

  // ---------- Consolidación final + histories cada ~1.2s ----------
  useEffect(() => {
    const tick = () => {
      const t = nowMs();
      if (t - lastTickRef.current < TICK_MS * 0.6) return; // anti-spam
      lastTickRef.current = t;

      // Símbolos visibles: enabled + live + estables
      const enabledSyms = instruments
        .filter((i) => (i.enabled ?? true))
        .map((i) => i.symbol);
      const liveSyms = Object.keys(liveBinanceMap);
      const symbolsSet = new Set([...enabledSyms, ...liveSyms, 'USDT', 'USDC']);

      const nextHist = { ...priceHistories };
      const nextPrices = {};

      for (const sym of symbolsSet) {
        const inst = instruments.find((i) => i.symbol === sym);
        const src = String(inst?.source || '').toLowerCase();
        const decimals = Number.isFinite(Number(inst?.decimals)) ? Number(inst.decimals) : 2;

        // 1) Base: binance -> feed; simulated/manual -> precio sintético determinístico
        let base = 0;

        if (sym === 'USDT' || sym === 'USDC') {
          base = 1;
        } else if (src === 'binance') {
          base = Number(realQuotes?.[sym]?.price ?? 0);
          if (!base) base = Number(inst?.base_price ?? 0) || 0; // fallback a base_price si no hay feed
        } else if (inst) {
          // simulated / manual con animación determinística (igual para todos)
          base = synthPriceAt(sym, inst, t);
        }

        // 2) Aplicar reglas del admin (percent/abs por hora UTC)
        let finalPrice = (sym === 'USDT' || sym === 'USDC')
          ? 1
          : applyRulesForSymbol(sym, base, marketRules, new Date());

        // 3) Normaliza y evita 0/NaN
        if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
          // fallback a último historial o base_price
          const prevH = ensureArray(nextHist[sym]);
          const last = prevH.length ? prevH[prevH.length - 1].value : Number(inst?.base_price ?? 1) || 1;
          finalPrice = last;
        }
        finalPrice = Number(finalPrice.toFixed(decimals));

        // 4) change %
        let changePct = 0;
        if (src === 'binance' && realQuotes?.[sym]?.change != null) {
          // para binance usamos el % del feed (aunque reglas muevan el precio)
          changePct = Number(realQuotes[sym].change || 0);
        } else {
          const h = ensureArray(nextHist[sym]);
          const ref = h?.[0]?.value ?? finalPrice;
          if (ref) changePct = ((finalPrice - ref) / ref) * 100;
        }

        // 5) history
        const prevH = ensureArray(nextHist[sym]);
        const lastPoint = prevH.length ? prevH[prevH.length - 1] : null;
        // Evitar duplicar puntos idénticos en el mismo ms
        if (!lastPoint || lastPoint.value !== finalPrice) {
          const newH = [...prevH, { time: t, value: finalPrice }].slice(-HISTORY_MAX);
          nextHist[sym] = newH;
        } else {
          nextHist[sym] = prevH.slice(-HISTORY_MAX);
        }

        nextPrices[sym] = { price: finalPrice, change: changePct, history: nextHist[sym] };
      }

      setPriceHistories(nextHist);
      setCryptoPrices((prev) => ({ ...prev, ...nextPrices }));
    };

    const id = setInterval(tick, TICK_MS);
    tick(); // primera
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruments, marketRules, realQuotes, liveBinanceMap, priceHistories]);

  // ---------- Planes (státicos) ----------
  const investmentPlans = useMemo(
    () => [
      { id: 1, name: 'Plan Básico',   minAmount: 100,   maxAmount: 999,   dailyReturn: 1.5, duration: 30, description: 'Perfecto para principiantes' },
      { id: 2, name: 'Plan Estándar', minAmount: 1000,  maxAmount: 4999,  dailyReturn: 2.0, duration: 30, description: 'Para inversores intermedios' },
      { id: 3, name: 'Plan Premium',  minAmount: 5000,  maxAmount: 19999, dailyReturn: 2.5, duration: 30, description: 'Para inversores avanzados' },
      { id: 4, name: 'Plan VIP',      minAmount: 20000, maxAmount: 100000,dailyReturn: 3.0, duration: 30, description: 'Para grandes inversores' },
    ],
    []
  );

  // ---------- Fetchers negocio ----------
  async function refreshInvestments() {
    if (!user?.id) {
      setInvestments([]);
      return;
    }
    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshInvestments] error:', error);
      setInvestments([]);
      return;
    }

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
    if (!user?.id) {
      setTransactions([]);
      return;
    }
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshTransactions] error:', error);
      setTransactions([]);
      return;
    }

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
    if (!user?.id) {
      setReferrals([]);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at, username')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshReferrals] error:', error);
      setReferrals([]);
      return;
    }
    setReferrals(ensureArray(data));
  }

  async function refreshBotActivations() {
    if (!user?.id) {
      setBotActivations([]);
      return;
    }
    const { data, error } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refreshBotActivations] error:', error);
      setBotActivations([]);
      return;
    }

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
    setInvestments([]);
    setTransactions([]);
    setReferrals([]);
    setBotActivations([]);

    if (user?.id) {
      refreshInvestments();
      refreshTransactions();
      refreshReferrals();
      refreshBotActivations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ---------- Mutaciones ----------
  async function addInvestment({
    planName, amount, dailyReturn, duration, currency = 'USDC',
  }) {
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

    if (error) {
      console.error('[addInvestment] error:', error);
      return null;
    }

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
    amount,
    type,
    currency = 'USDC',
    description = '',
    referenceType = null,
    referenceId = null,
    status = 'completed',
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

    if (error) {
      console.error('[addTransaction] error:', error);
      return null;
    }

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

  // ---------- RPC de Bots ----------
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
      if (error) {
        console.warn('[activateBot] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[activateBot] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  async function pauseBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('pause_trading_bot', {
        p_activation_id: activationId,
        p_user_id: user.id,
      });
      if (error) {
        console.warn('[pauseBot] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await refreshBotActivations();
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[pauseBot] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  async function resumeBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('resume_trading_bot', {
        p_activation_id: activationId,
        p_user_id: user.id,
      });
      if (error) {
        console.warn('[resumeBot] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await refreshBotActivations();
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[resumeBot] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  async function cancelBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('cancel_trading_bot', {
        p_activation_id: activationId,
        p_user_id: user.id,
      });
      if (error) {
        console.warn('[cancelBot] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await refreshBotActivations();
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[cancelBot] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  async function creditBotProfit(activationId, amountUsd, note = null) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('credit_bot_profit', {
        p_activation_id: activationId,
        p_user_id: user.id,
        p_amount_usd: Number(amountUsd),
        p_note: note,
      });
      if (error) {
        console.warn('[creditBotProfit] RPC error:', error?.message || error);
        return { ok: false, code: 'RPC_ERROR', error };
      }
      await refreshTransactions();
      return data ?? { ok: true };
    } catch (e) {
      console.warn('[creditBotProfit] RPC not available:', e?.message || e);
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  // ---------- Derivados para UI (pares disponibles) ----------
  const pairOptions = useMemo(() => {
    const enabled = instruments.filter((i) => (i.enabled ?? true));
    const list = enabled.map((i) => `${i.symbol}/${i.quote || 'USDT'}`);
    const s = new Set(list);
    if (!s.has('BTC/USDT')) s.add('BTC/USDT');
    if (!s.has('ETH/USDT')) s.add('ETH/USDT');
    return Array.from(s);
  }, [instruments]);

  // ---------- API pública ----------
  const value = useMemo(
    () => ({
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

      // bots (RPC reales)
      refreshBotActivations,
      activateBot,
      pauseBot,
      resumeBot,
      cancelBot,
      creditBotProfit,

      // mercado
      instruments,
      marketRules,
      refreshMarketInstruments,
      refreshMarketRules,
      forceRefreshMarket,

      // precios/pares para Trading
      cryptoPrices,            // {SYM: {price, change, history[]}}
      pairOptions,             // ['BTC/USDT','ETH/USDT','MIKO/USDT', ...]
      assetToSymbol: liveBinanceMap, // mapa símbolo->par Binance

      investmentPlans,
    }),
    [
      investments, transactions, referrals, botActivations,
      instruments, marketRules, cryptoPrices, pairOptions, liveBinanceMap,
      investmentPlans,
    ]
  );

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
    pairOptions: ['BTC/USDT', 'ETH/USDT'],
    assetToSymbol: DEFAULT_BINANCE_MAP,
    investmentPlans: [],
  };
}
