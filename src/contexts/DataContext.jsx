// src/contexts/DataContext.jsx
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

const DataContext = createContext(null);

/* ----------------------- Utils ----------------------- */
const ensureArray = (v) => (Array.isArray(v) ? v : []);
const nowMs = () => Date.now();
const normStatus = (s) => String(s ?? '').trim().toLowerCase();

const DEFAULT_BINANCE_MAP = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  BNB: 'BNBUSDT',
  ADA: 'ADAUSDT',
};

const HISTORY_MAX = 600;
const TICK_MS = 1000;

const ACTIVE_STATUSES = new Set(['active', 'paused']);
const CANCELLED_STATUSES = new Set([
  'canceled',
  'cancelled',
  'inactive',
  'stopped',
  'ended',
  'closed',
  'terminated',
  'archived',
]);

// Debug opcional de saldo
const DEBUG_BALANCE = false;
const parseNum = (x) => {
  if (x == null) return null;
  const n = Number(String(x).replace(/[\s,$]/g, '').replace(/^USDT?|USDC?|\$/i, ''));
  return Number.isFinite(n) ? n : null;
};

/* =======================================================
   RPC WRAPPERS (tolerantes a nombres/firmas) + FALLBACKS
   ======================================================= */

async function tryManyRPC(names = [], payloads = []) {
  let lastError = null;
  for (const fn of names) {
    for (const body of payloads) {
      try {
        const { data, error } = await supabase.rpc(fn, body);
        if (!error) return { data, error: null, fn, body };
        lastError = error;
      } catch (e) {
        lastError = e;
      }
    }
  }
  return { data: null, error: lastError };
}

/** Activar bot */
async function rpcActivateBotRobust({ user_id, bot_id, bot_name, strategy, amount_usd }) {
  const names = ['activate_trading_bot', 'rent_trading_bot', 'start_trading_bot'];
  const payloads = [
    { bot_id, bot_name, strategy, amount_usd },
    { p_bot_id: bot_id, p_bot_name: bot_name, p_strategy: strategy, p_amount_usd: amount_usd },
    { bot_id, bot_name, strategy, amount_usd, user_id },
    { p_user_id: user_id, p_bot_id: bot_id, p_bot_name: bot_name, p_strategy: strategy, p_amount_usd: amount_usd },
  ];
  return tryManyRPC(names, payloads);
}

/** Pausar / Reanudar / Cancelar */
async function rpcPauseBotRobust({ activation_id, user_id }) {
  const names = ['pause_trading_bot', 'pause_bot'];
  const payloads = [
    { p_activation_id: activation_id, p_user_id: user_id },
    { activation_id, user_id },
    { p_activation_id: activation_id },
    { id: activation_id },
  ];
  return tryManyRPC(names, payloads);
}
async function rpcResumeBotRobust({ activation_id, user_id }) {
  const names = ['resume_trading_bot', 'resume_bot'];
  const payloads = [
    { p_activation_id: activation_id, p_user_id: user_id },
    { activation_id, user_id },
    { p_activation_id: activation_id },
    { id: activation_id },
  ];
  return tryManyRPC(names, payloads);
}
async function rpcCancelBotRobust({ activation_id, user_id }) {
  const names1 = ['cancel_trading_bot_with_fee', 'bot_cancel_with_fee'];
  const names2 = ['cancel_trading_bot', 'cancel_bot', 'bot_cancel'];
  const payloads = [
    { p_activation_id: activation_id, p_user_id: user_id },
    { activation_id, user_id },
    { p_activation_id: activation_id },
    { id: activation_id },
  ];
  const r1 = await tryManyRPC(names1, payloads);
  if (!r1.error) return r1;
  return tryManyRPC(names2, payloads);
}

/** Balance robusto (RPCs) — prioriza disponible real por RPC */
async function rpcGetBalanceRobust({ user_id, currency }) {
  const C = String(currency || 'USDC').toUpperCase();

  // Firmas más probables (nuestra recomendada primero)
  const names = [
    'get_user_available_balance', // returns numeric disponible (desc. capital en bots)
    'get_balance_by_currency',    // retorna bruto por moneda
    'get_user_balance',
    'wallet_get_balance',
    'get_balance',
  ];

  const payloads = [
    // firma recomendada que creamos: (p_currency text, p_user uuid)
    { p_currency: C, p_user: user_id },

    // variaciones comunes que podrías tener en tu DB
    { p_currency: C, p_user_id: user_id },
    { currency: C, user_id },
    { _currency: C, _user: user_id },
    { p_user: user_id, p_currency_code: C },
  ];

  const { data } = await tryManyRPC(names, payloads);

  // normaliza a número
  const n =
    data == null
      ? null
      : typeof data === 'number'
      ? data
      : Number(
          data?.available ??
          data?.balance ??
          data?.amount ??
          data?.[C] ??
          data
        );

  return { data: Number.isFinite(n) ? n : null, error: null };
}

/* ===================== PROVIDER ===================== */
export function DataProvider({ children }) {
  const { user, balances, refreshBalances } = useAuth?.() || {};

  /* ---------------- Estado negocio ---------------- */
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [botActivations, setBotActivations] = useState([]);
// 🔹 Saldo local en tiempo real (sin depender del backend)
const [liveBalances, setLiveBalances] = useState({ USDC: 0, USD: 0 });

// 🔹 Inicializa con lo que venga de Auth o Supabase al cargar
useEffect(() => {
  const guess = balances?.USDC || balances?.USD || 0;
  setLiveBalances({ USDC: guess, USD: guess });
}, [balances]);
// 🔹 Función global para modificar saldo en tiempo real
const updateBalanceGlobal = useCallback(async (delta, currency = 'USDC', persist = false) => {
  const c = String(currency).toUpperCase();

  setLiveBalances((prev) => ({
    ...prev,
    [c]: Math.max(0, (prev?.[c] || 0) + delta),
  }));

  // Opcional: si querés sincronizar con la tabla balances en Supabase
  if (persist && user?.id) {
    try {
      await supabase
        .from('balances')
        .update({ amount: supabase.sql`amount + ${delta}` })
        .eq('user_id', user.id)
        .eq('currency', c);
    } catch (e) {
      console.warn('[updateBalanceGlobal persist error]', e.message);
    }
  }
}, [user?.id]);

  /* ---------------- Trades (legacy manual) ----------- */
  const [trades, setTrades] = useState([]);

  /* ---------------- Mercado (admin) ---------------- */
  const [instruments, setInstruments] = useState([]);
  const [marketRules, setMarketRules] = useState([]);

  /* --------------- Precios / Historias -------------- */
  const [realQuotes, setRealQuotes] = useState({
    USDT: { price: 1, change: 0 },
    USDC: { price: 1, change: 0 },
  });

  const [priceHistories, setPriceHistories] = useState({
    USDT: [{ time: nowMs(), value: 1 }],
    USDC: [{ time: nowMs(), value: 1 }],
  });

  const [cryptoPrices, setCryptoPrices] = useState({});

  /* --------------- Admin settings ------------------- */
  const [adminSettings, setAdminSettings] = useState({});
  const DEFAULT_SLIPPAGE = 0.2; // %
  const slippageMaxPct = Number(adminSettings['trading.slippage_pct_max'] ?? DEFAULT_SLIPPAGE);

  const botCancelFeeUsd = Number(
    (adminSettings['trading.bot_cancel_fee_usd'] ??
      adminSettings['trading.bot.cancel_fee_usd'] ??
      adminSettings.botCancelFeeUsd) ?? 0
  );
  const botCancelFeePct = Number(
    (adminSettings['trading.bot_cancel_fee_pct'] ??
      adminSettings['trading.bot.cancel_fee_pct'] ??
      adminSettings.botCancelFeePct) ?? 0
  );

  /* --------------- Modal (genérico + confirm) --------------- */
  const [modal, setModal] = useState({
    open: false,
    name: null,
    payload: null,
  });

  function openModal(name, payload = null) {
    setModal({ open: true, name, payload });
  }
  function closeModal() {
    setModal({ open: false, name: null, payload: null });
  }
  function setModalPayload(next) {
    setModal((m) => ({ ...m, payload: typeof next === 'function' ? next(m.payload) : next }));
  }

  const confirmResolveRef = useRef(null);
  const confirmRejectRef = useRef(null);

  function confirmModal({
    title = '¿Confirmar?',
    message = '',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    ...payloadExtra
  } = {}) {
    return new Promise((resolve, reject) => {
      confirmResolveRef.current = resolve;
      confirmRejectRef.current = reject;
      openModal('confirm', { title, message, confirmText, cancelText, ...payloadExtra });
    });
  }

  function confirmModalAccept(result = true) {
    if (typeof confirmResolveRef.current === 'function') {
      confirmResolveRef.current(result);
    }
    confirmResolveRef.current = null;
    confirmRejectRef.current = null;
    closeModal();
  }

  function confirmModalCancel(reason = 'cancel') {
    if (typeof confirmRejectRef.current === 'function') {
      confirmRejectRef.current(reason);
    }
    confirmResolveRef.current = null;
    confirmRejectRef.current = null;
    closeModal();
  }

  /* --------------- Refs / conexiones ---------------- */
  const wsRef = useRef(null);
  const restPollRef = useRef(null);
  const statePollRef = useRef(null);

  const instrumentsRef = useRef([]);
  const quotesRef = useRef({});
  const histRef = useRef({});
  const liveMapRef = useRef({});
  const ref24Ref = useRef({});

  const supportsBulkRef = useRef(null);
  const hasNextV2Ref = useRef(null);
  const badSymsRef = useRef(new Set());
  const lastTickRef = useRef(0);

  useEffect(() => { instrumentsRef.current = instruments; }, [instruments]);
  useEffect(() => { quotesRef.current = realQuotes; }, [realQuotes]);
  useEffect(() => { histRef.current = priceHistories; }, [priceHistories]);

  /* ------- Fetch + realtime instrumentos/reglas ------ */
  const refreshMarketInstruments = async () => {
    const { data } = await supabase
      .from('market_instruments')
      .select('*')
      .order('symbol', { ascending: true });
    setInstruments(ensureArray(data));
  };

  const refreshMarketRules = async () => {
    const { data } = await supabase
      .from('market_rules')
      .select('*')
      .eq('active', true)
      .order('start_hour', { ascending: true });
    setMarketRules(ensureArray(data));
  };

  const forceRefreshMarket = async () => {
    await Promise.all([refreshMarketInstruments(), refreshMarketRules()]);
  };

  useEffect(() => {
    forceRefreshMarket();
    const ch = supabase
      .channel('market_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_instruments' },
        () => refreshMarketInstruments()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'market_rules' },
        () => refreshMarketRules()
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  /* ---------------- Admin settings fetch -------------- */
  const fetchAdminSettings = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_settings', { p_prefix: 'trading.' });
      if (error) throw error;

      const map = {};
      (data || []).forEach((row) => {
        const k = String(row.setting_key);
        const n = Number(row.setting_value);
        if (Number.isFinite(n)) map[k] = n;
      });

      if (map['trading.bot_cancel_fee_pct'] != null)
        map['trading.bot.cancel_fee_pct'] = map['trading.bot_cancel_fee_pct'];
      if (map['trading.bot_cancel_fee_usd'] != null)
        map['trading.bot.cancel_fee_usd'] = map['trading.bot_cancel_fee_usd'];

      map.botCancelFeePct = map['trading.bot.cancel_fee_pct'] ?? 0;
      map.botCancelFeeUsd = map['trading.bot.cancel_fee_usd'] ?? 0;

      setAdminSettings(map);
    } catch (e) {
      try {
        const { data } = await supabase
          .from('admin_settings')
          .select('setting_key, setting_value')
          .like('setting_key', 'trading.%');
        const map = {};
        (data || []).forEach((r) => {
          const raw = r.value_numeric ?? r.setting_value;
          const num = Number(raw);
          if (Number.isFinite(num)) map[r.setting_key] = num;
        });

        if (map['trading.bot_cancel_fee_pct'] != null)
          map['trading.bot.cancel_fee_pct'] = map['trading.bot_cancel_fee_pct'];
        if (map['trading.bot_cancel_fee_usd'] != null)
          map['trading.bot.cancel_fee_usd'] = map['trading.bot_cancel_fee_usd'];

        map.botCancelFeePct = map['trading.bot_cancel_fee_pct'] ?? 0;
        map.botCancelFeeUsd = map['trading.bot_cancel_fee_usd'] ?? 0;

        setAdminSettings(map);
      } catch (e2) {
        console.warn('[fetchAdminSettings] error:', e?.message || e2?.message || e);
      }
    }
  };
  useEffect(() => { fetchAdminSettings(); }, []);

  function applyMarketRules(symbol, basePrice, difficulty = "intermediate") {
  const hour = new Date().getUTCHours();
  let price = basePrice;

  // Buscar reglas activas
  const hits = marketRules.filter((r) => {
    if (String(r.symbol || "").toUpperCase() !== symbol.toUpperCase()) return false;
    if (!r.active) return false;

    const inRange =
      (r.start_hour < r.end_hour && hour >= r.start_hour && hour < r.end_hour) ||
      (r.start_hour > r.end_hour && (hour >= r.start_hour || hour < r.end_hour)) ||
      (r.start_hour === r.end_hour);

    return inRange;
  });

  // Aplicar reglas como tendencia progresiva
  hits.forEach((r) => {
    const duration = (r.end_hour - r.start_hour + 24) % 24 || 24;
    const progress = ((hour - r.start_hour + 24) % 24) / duration;

    if (r.type === "percent") {
      const factor = 1 + (r.value / 100) * progress;
      price *= factor;
    } else if (r.type === "absolute") {
      const add = (Number(r.value || 0)) * progress;
      price += add;
    }
  });

  // --- Ajustar según "dificultad"
  let noiseFactor = 0;
  switch (difficulty) {
    case "easy":
      noiseFactor = 0.002; // ±0.2%
      break;
    case "intermediate":
      noiseFactor = 0.01; // ±1%
      break;
    case "nervous":
      noiseFactor = 0.05; // ±5%
      break;
    default:
      noiseFactor = 0.01;
  }

  // Agregar ruido aleatorio
  const noise = (Math.random() - 0.5) * 2 * noiseFactor; 
  price *= 1 + noise;

  return Number(price.toFixed(6));
}

  /* ---------- Mapa dinámico a Binance ---------- */
  const liveBinanceMap = useMemo(() => {
    const map = { ...DEFAULT_BINANCE_MAP };
    Object.keys(map).forEach((k) => {
      map[k.toUpperCase()] = String(map[k]).toUpperCase();
      if (k !== k.toUpperCase()) delete map[k];
    });
    instruments.forEach((i) => {
      const enabled = (i.enabled ?? true) === true;
      const src = String(i.source || '').toLowerCase();
      if (!enabled || src !== 'binance') return;
      const k = String(i.symbol || '').toUpperCase();
      const v = String(i.binance_symbol || '').toUpperCase();
      if (k && v) map[k] = v;
    });
    liveMapRef.current = map;
    return map;
  }, [instruments]);

  /* --------------- Polling REST fallback -------------- */
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
            const price = Number(j.lastPrice ?? j.c ?? 0);
            const change = Number(j.priceChangePercent ?? j.P ?? 0);
            return [String(sym).toUpperCase(), { price, change }];
          })
        );
        setRealQuotes((prev) => {
          const next = { ...prev };
          for (const [symU, val] of results) {
            if (Number.isFinite(val.price) && val.price > 0) next[symU] = val;
          }
          return next;
        });
      } catch {}
    };
    poll();
    restPollRef.current = setInterval(poll, 5000);
  };

  /* ---------------- Binance WS + fallback --------------- */
  useEffect(() => {
    let alive = true;

    const teardown = () => {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      clearInterval(restPollRef.current);
      restPollRef.current = null;
    };

    const init = async () => {
      teardown();
      const liveEntries = Object.entries(liveBinanceMap);

      // seed por REST
      if (liveEntries.length) {
        try {
          const results = await Promise.all(
            liveEntries.map(async ([sym, pair]) => {
              const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
              const res = await fetch(url);
              const j = await res.json();
              const price = Number(j.lastPrice ?? j.c ?? 0);
              const change = Number(j.priceChangePercent ?? j.P ?? 0);
              return [String(sym).toUpperCase(), { price, change }];
            })
          );

          if (!alive) return;

          setRealQuotes((prev) => {
            const next = { ...prev };
            for (const [symU, val] of results) {
              if (Number.isFinite(val.price) && val.price > 0) next[symU] = val;
            }
            return next;
          });

          const t0 = nowMs();
          setPriceHistories((prev) => {
            const next = { ...prev };
            for (const [symU, val] of results) {
              const seed = prev[symU]?.length ? prev[symU] : [{ time: t0, value: val.price }];
              next[symU] = seed.slice(-HISTORY_MAX);
            }
            next.USDT ??= [{ time: t0, value: 1 }];
            next.USDC ??= [{ time: t0, value: 1 }];
            return next;
          });
        } catch {}
      }

      // WS en vivo
      if (liveEntries.length) {
        try {
          const streams = liveEntries
            .map(([, pair]) => `${String(pair).toLowerCase()}@miniTicker`)
            .join('/');
          const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
          wsRef.current = ws;

          ws.onopen = () => {
            clearInterval(restPollRef.current);
            restPollRef.current = null;
          };

          ws.onmessage = (evt) => {
            try {
              const payload = JSON.parse(evt.data);
              const t = payload?.data;
              const pair = t?.s;
              if (!pair) return;

              const symU = Object.keys(liveMapRef.current).find((k) => liveMapRef.current[k] === pair);
              if (!symU) return;

              const price = Number(t?.c);
              const change = Number(t?.P ?? 0);
              if (!Number.isFinite(price) || price <= 0) return;

              setRealQuotes((prev) => ({ ...prev, [symU]: { price, change } }));
            } catch {}
          };

          ws.onerror = () => { try { ws.close(); } catch {} };
          ws.onclose = () => startRestPolling(liveEntries);
        } catch {
          startRestPolling(liveEntries);
        }
      }
    };

    init();
    return () => { alive = false; teardown(); };
  }, [liveBinanceMap]);

  /* --------- Realtime market_state --------- */
  useEffect(() => {
    const onStateChange = ({ new: row }) => {
      if (!row) return;
      const symU = String(row.symbol || '').toUpperCase();
      const price = Number(row.price);
      if (!Number.isFinite(price)) return;

      const ref24 = Number(row.ref_24h ?? price);
      ref24Ref.current[symU] = ref24;

      const change = ref24 > 0 ? ((price - ref24) / ref24) * 100 : 0;
      setRealQuotes((prev) => ({ ...prev, [symU]: { price, change } }));
    };

    const ch = supabase
      .channel('market_state_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'market_state' }, onStateChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'market_state' }, onStateChange)
      .subscribe();

    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  /* --------- Realtime market_ticks --------- */
  useEffect(() => {
    const onTickInsert = ({ new: row }) => {
      const symU = String(row.symbol || '').toUpperCase();
      const price = Number(row.price);
      const ts = row.ts ? new Date(row.ts).getTime() : nowMs();
      if (!Number.isFinite(price) || price <= 0) return;

      setPriceHistories((prev) => {
        const cur = ensureArray(prev[symU]);
        const nextH = [...cur, { time: ts, value: price }].slice(-HISTORY_MAX);

        const ref24 = Number(ref24Ref.current[symU]) || Number(nextH[0]?.value) || price;
        const change = ref24 > 0 ? ((price - ref24) / ref24) * 100 : 0;

        const inst = instrumentsRef.current.find((i) => String(i.symbol || '').toUpperCase() === symU);
        const quoteU = String(inst?.quote || 'USDT').toUpperCase();
        const payload = { price, change, history: nextH };

        setCryptoPrices((prevCP) => ({
          ...prevCP,
          [symU]: payload,
          [`${symU}/${quoteU}`]: payload,
          [`${symU}${quoteU}`]: payload,
        }));

        setRealQuotes((prevRQ) => ({ ...prevRQ, [symU]: { price, change } }));

        return { ...prev, [symU]: nextH };
      });
    };

    const ch = supabase
      .channel('market_ticks_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'market_ticks' }, onTickInsert)
      .subscribe();

    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, []);

  /* ---------- Fallback: polling a market_state ---------- */
  useEffect(() => {
    const startStatePolling = () => {
      clearInterval(statePollRef.current);
      const syms = instrumentsRef.current
        .filter(
          (i) =>
            (i.enabled ?? true) &&
            ['simulated', 'manual', 'real'].includes(String(i.source || '').toLowerCase())
        )
        .map((i) => String(i.symbol || '').toUpperCase());
      if (!syms.length) return;

      const poll = async () => {
        try {
          const { data } = await supabase
            .from('market_state')
            .select('symbol, price, ref_24h')
            .in('symbol', syms);
          const next = {};
          for (const r of ensureArray(data)) {
            const symU = String(r.symbol || '').toUpperCase();
            const price = Number(r.price);
            if (!Number.isFinite(price) || price <= 0) continue;
            const ref24 = Number(r.ref_24h ?? price);
            ref24Ref.current[symU] = ref24;
            const change = ref24 > 0 ? ((price - ref24) / ref24) * 100 : 0;
            next[symU] = { price, change };
          }
          if (Object.keys(next).length) {
            setRealQuotes((prev) => ({ ...prev, ...next }));
          }
        } catch {}
      };
      poll();
      statePollRef.current = setInterval(poll, 1000);
    };

    startStatePolling();
    return () => clearInterval(statePollRef.current);
  }, [instruments]);

  /* ---------- Simuladas driver (RPC) ---------- */
  useEffect(() => {
    const simSyms = instruments
      .filter(
        (i) =>
          (i.enabled ?? true) &&
          ['simulated', 'manual', 'real'].includes(String(i.source || '').toLowerCase())
      )
      .map((i) => String(i.symbol || '').toUpperCase());

    let idx = 0;
    let timer;

    const probeFns = async () => {
      try {
        if (supportsBulkRef.current === null) {
          const { error } = await supabase.rpc('tick_all_simulated_v2');
          supportsBulkRef.current = !error;
        }
      } catch {
        supportsBulkRef.current = false;
      }

      try {
        if (hasNextV2Ref.current === null) {
          if (simSyms.length > 0) {
            const { error } = await supabase.rpc('next_simulated_tick_v2', { p_symbol: simSyms[0] });
            hasNextV2Ref.current = !error;
          } else {
            hasNextV2Ref.current = false;
          }
        }
      } catch {
        hasNextV2Ref.current = false;
      }
    };

    const callNextOnce = async (symU) => {
      if (hasNextV2Ref.current === true) {
        const { error } = await supabase.rpc('next_simulated_tick_v2', { p_symbol: symU });
        if (!error) return true;
        hasNextV2Ref.current = false;
      }
      const { error } = await supabase.rpc('next_simulated_tick', { p_symbol: symU });
      if (error) {
        const msg = String(error?.message || '').toLowerCase();
        if (msg.includes('out of range') || msg.includes('bad request') || msg.includes('numeric')) {
          if (!badSymsRef.current.has(symU)) {
            console.warn(`[next_simulated_tick] deshabilitado para ${symU}: ${error.message}`);
            badSymsRef.current.add(symU);
          }
        }
        return false;
      }
      return true;
    };

    const seedOnce = async () => {
      for (const symU of simSyms) {
        await callNextOnce(symU);
      }
    };

    const drive = async () => {
      if (simSyms.length === 0) return;

      if (supportsBulkRef.current === true) {
        const { error } = await supabase.rpc('tick_all_simulated_v2');
        if (!error) return;
        supportsBulkRef.current = false;
      }

      const healthy = simSyms.filter((s) => !badSymsRef.current.has(s));
      if (!healthy.length) return;
      const symU = healthy[idx % healthy.length];
      idx++;
      await callNextOnce(symU);
    };

    (async () => {
      await probeFns();
      await seedOnce();
      timer = setInterval(drive, TICK_MS);
    })();

    return () => {
      clearInterval(timer);
    };
  }, [instruments]);

  /* --------- Consolidación → cryptoPrices + histories --------- */
  useEffect(() => {
    const tick = () => {
      const t = nowMs();
      if (t - lastTickRef.current < TICK_MS * 0.6) return;
      lastTickRef.current = t;

      const instrumentsCur = instrumentsRef.current;
      const quotesCur = quotesRef.current;
      const histCur = histRef.current;
      const liveMapCur = liveMapRef.current;

      const enabledSyms = instrumentsCur
        .filter((i) => (i.enabled ?? true))
        .map((i) => String(i.symbol || '').toUpperCase());

      const liveSyms = Object.keys(liveMapCur);
      const symbolsSet = new Set([...enabledSyms, ...liveSyms, 'USDT', 'USDC']);

      const nextHist = { ...histCur };
      const nextPrices = {};

      for (const symU of symbolsSet) {
        const inst = instrumentsCur.find((i) => String(i.symbol || '').toUpperCase() === symU);
        const decimals = Number(inst?.decimals ?? 2);
        const quoteU = String(inst?.quote || 'USDT').toUpperCase();

        const prevH = ensureArray(nextHist[symU] || nextHist[symU.toLowerCase()]);
        const lastKnown = prevH.length ? prevH[prevH.length - 1].value : undefined;

        let base = Number(quotesCur?.[symU]?.price);
        if (!Number.isFinite(base) || base <= 0) {
          base = Number.isFinite(lastKnown) ? lastKnown : Number(inst?.base_price ?? 0);
        }

        let finalPrice = symU === 'USDT' || symU === 'USDC' ? 1 : base;

        if ((!Number.isFinite(finalPrice) || finalPrice <= 0) && Number.isFinite(lastKnown)) {
          finalPrice = lastKnown;
        }
        finalPrice = applyMarketRules(symU, finalPrice);
        finalPrice = Number(
          (Number.isFinite(finalPrice) ? finalPrice : 0).toFixed(Number.isFinite(decimals) ? decimals : 2)
        );

        let changePct = 0;
        if (quotesCur?.[symU]?.change !== undefined && quotesCur?.[symU]?.change !== null) {
          changePct = Number(quotesCur[symU].change || 0);
        } else {
          const ref = prevH?.[0]?.value ?? finalPrice;
          if (ref) changePct = ((finalPrice - ref) / ref) * 100;
        }

        const newH = [...prevH, { time: t, value: finalPrice }].slice(-HISTORY_MAX);
        nextHist[symU] = newH;

        const payload = { price: finalPrice, change: changePct, history: newH };
        nextPrices[symU] = payload;
        nextPrices[`${symU}/${quoteU}`] = payload;
        nextPrices[`${symU}${quoteU}`] = payload;
      }

      setPriceHistories(nextHist);
      setCryptoPrices((prev) => ({ ...prev, ...nextPrices }));
    };

    const id = setInterval(tick, TICK_MS);
    tick();
    return () => clearInterval(id);
  }, []);

  /* ---------------- Planes estáticos ---------------- */
  const investmentPlans = useMemo(
    () => [
      {
        id: 1,
        name: 'Plan Básico',
        minAmount: 100,
        maxAmount: 999,
        dailyReturn: 1.5,
        duration: 30,
        description: 'Perfecto para principiantes',
      },
      {
        id: 2,
        name: 'Plan Estándar',
        minAmount: 1000,
        maxAmount: 4999,
        dailyReturn: 2.0,
        duration: 30,
        description: 'Para inversores intermedios',
      },
      {
        id: 3,
        name: 'Plan Premium',
        minAmount: 5000,
        maxAmount: 19999,
        dailyReturn: 2.5,
        duration: 30,
        description: 'Para grandes inversores',
      },
      {
        id: 4,
        name: 'Plan VIP',
        minAmount: 20000,
        maxAmount: 100000,
        dailyReturn: 3.0,
        duration: 30,
        description: 'Para grandes inversores',
      },
    ],
    []
  );

  /* ---------------- Fetchers negocio ---------------- */
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
      .limit(200)
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
      status: b.status,
      hidden: !!b.hidden,
      createdAt: b.created_at,
    }));
    setBotActivations(mapped);
  }

  /* ---- Realtime bot_activations (refresca ante cambios) ---- */
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('bot_activations_rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bot_activations', filter: `user_id=eq.${user.id}` },
        () => refreshBotActivations()
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [user?.id]);

  /* ---------------- Trades (legacy) ---------------- */
  async function refreshTrades() {
    if (!user?.id) {
      setTrades([]);
      return;
    }
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error) setTrades(ensureArray(data));
  }

  // ✅ closeTrade (legacy)
  async function closeTrade(tradeId, closePrice = null) {
    try {
      const id = typeof tradeId === 'number' ? tradeId : String(tradeId);
      const { data: res, error } = await supabase.rpc('close_trade', {
        p_trade_id: id,
        p_close_price: closePrice, // null -> usa último precio
        p_force: true,
      });
      if (error) throw error;
      await refreshTrades();
      return res;
    } catch (e) {
      console.error('[closeTrade]', e);
      throw e;
    }
  }

  useEffect(() => {
    setInvestments([]);
    setTransactions([]);
    setReferrals([]);
    setBotActivations([]);
    setTrades([]);

    if (user?.id) {
      refreshInvestments();
      refreshTransactions();
      refreshReferrals();
      refreshBotActivations();
      refreshTrades();

      const ch = supabase
        .channel('trades_rt')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` },
          () => refreshTrades()
        )
        .subscribe();
      return () => { try { supabase.removeChannel(ch); } catch {} };
    }
  }, [user?.id]);

 

// ---------------- Helpers de saldo ----------------

// Lee balances expuestos por AuthContext con múltiples formatos
function pickAuthAvailable(currency = 'USDC') {
  const c = String(currency).toUpperCase();
  const b = balances || {};

  const byCurrency = [
    b?.available?.[c],
    b?.[c]?.available,
    b?.[c]?.balance,
    b?.[c]?.free,
    b?.[c]?.amount,
    b?.[c],
  ]
    .map(parseNum)
    .find((v) => v != null);
  if (byCurrency != null) return byCurrency;

  const totals = [b?.net, b?.netUsd, b?.net_usd, b?.total, b?.totalUsd, b?.total_usd, b?.usd, b?.USDC, b?.USDT]
    .map(parseNum)
    .find((v) => v != null);
  if (totals != null) return totals;

  let best = null;
  try {
    Object.values(b).forEach((v) => {
      const n = parseNum(v);
      if (n != null) best = best == null ? n : Math.max(best, n);
    });
  } catch {}
  return best;
}

// ✅ Reemplaza TODO tu getAvailableBalance por este (robusto)
async function getAvailableBalance(currency = 'USDC') {
  if (!user?.id) return 0;
  const CUR = String(currency || 'USDC').toUpperCase();
  const ALIAS = new Set(['USDC', 'USD', 'USDT']);

  // 1) RPCs conocidas (devuelven disponible real si existen)
  try {
    const { data } = await rpcGetBalanceRobust({ user_id: user.id, currency: CUR });
    if (data != null && Number.isFinite(Number(data))) return Number(data);
  } catch {}

  // 2) Tabla wallet_balances (si existe en tu esquema)
  try {
    const { data } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      let v =
        parseNum(data.available) ??
        parseNum(data.balance) ??
        parseNum(data.amount) ??
        parseNum(data[CUR]);
      if (v == null && ALIAS.has(CUR)) {
        v = parseNum(data.USDC) ?? parseNum(data.USD) ?? parseNum(data.USDT);
      }
      if (v != null) return Number(v);
    }
  } catch {}

  // 3) Suma de transacciones confirmadas
  try {
    const { data } = await supabase
      .from('wallet_transactions')
      .select('amount, currency, status')
      .eq('user_id', user.id)
      .eq('status', 'completed');

    let sum = 0;
    for (const t of ensureArray(data)) {
      const cur = String(t.currency || 'USDC').toUpperCase();
      if (cur === CUR || (ALIAS.has(CUR) && ALIAS.has(cur))) {
        const n = Number(t.amount || 0);
        if (Number.isFinite(n)) sum += n;
      }
    }
    return Number(sum.toFixed(2));
  } catch {}

  // 4) Fallback: AuthContext (si ya está cargado)
  const v = pickAuthAvailable(CUR);
  return Number(v || 0);
}



 async function recalcAndRefreshBalances() {
  if (!user?.id) return;
  try {
    // intenta con param y sin param
    const r1 = await supabase.rpc('recalc_user_balances', { p_user_id: user.id });
    if (r1.error) await supabase.rpc('recalc_user_balances');
  } catch {}
  try { refreshBalances?.(); } catch {}
}


  async function canActivateBot(amountUsd, currency = 'USDC') {
    const avail = await getAvailableBalance(currency);
    const need = Number(amountUsd || 0);
    return { ok: avail >= need, available: avail, needed: Math.max(0, need - avail) };
  }

  /* ---------------- Mutaciones negocio --------------- */
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
    const { data, error } = await supabase.from('investments').insert(payload).select('*').single();
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

  // DataContext.jsx
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

  // ——————————— 1) PRIMERO INTENTAMOS RPC (recomendado) ———————————
  try {
    const { error: rpcErr } = await supabase.rpc('add_wallet_tx', {
      // firma flexible (ajustá los nombres si tu RPC usa otros):
      p_user: user.id,
      p_currency: currency,
      p_amount: Number(amount),
      p_kind: type,
      // opcional/JSON con metadatos que quieras guardar:
      p_meta: {
        description,
        reference_type: referenceType,
        reference_id: referenceId,
        status,
      },
    });

    if (!rpcErr) {
      // la RPC puede no devolver la fila; armamos un objeto coherente
      await refreshTransactions();
      try {
        // recálculo tolerante a ambas firmas
        const r1 = await supabase.rpc('recalc_user_balances', { p_user_id: user.id });
        if (r1.error) await supabase.rpc('recalc_user_balances');
      } catch {}
      try { refreshBalances?.(); } catch {}

      const mappedType = type === 'plan_purchase' ? 'investment' : type;

      return {
        user_id: user.id,
        userId: user.id,
        id: crypto?.randomUUID?.() || `${Date.now()}`, // placeholder (la UI no depende de este id)
        type: mappedType,
        status,
        amount: Number(amount || 0),
        currency,
        description: description || '',
        createdAt: new Date().toISOString(),
        referenceType,
        referenceId,
      };
    }
  } catch (e) {
    // seguimos al fallback
    console.warn('[addTransaction] RPC add_wallet_tx no disponible, usando fallback:', e?.message || e);
  }

  // ——————————— 2) FALLBACK: INSERT DIRECTO (si tus RLS lo permiten) ———————————
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
    console.error('[addTransaction] insert error:', error);
    return null;
  }

  await refreshTransactions();

  try {
    const r1 = await supabase.rpc('recalc_user_balances', { p_user_id: user.id });
    if (r1.error) await supabase.rpc('recalc_user_balances');
  } catch {}
  try { refreshBalances?.(); } catch {}

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


  /* ---------------- RPC Bots (activar/estado) --------------- */

  // Activar bot (robusto + fallback manual con lock de capital)
  async function activateBot({ botId, botName, strategy = 'default', amountUsd }) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };

    // 1) intentar RPCs conocidas
    const { data, error } = await rpcActivateBotRobust({
      user_id: user.id,
      bot_id: botId,
      bot_name: botName,
      strategy,
      amount_usd: Number(amountUsd),
    });

    if (!error) {
      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      await recalcAndRefreshBalances();
      return data ?? { ok: true };
    }

    // 2) FALLBACK manual con validación de saldo real
    try {
      const need = Number(amountUsd || 0);
      const avail = await getAvailableBalance('USDC');

      if (Number.isFinite(avail) && need > avail) {
        return { ok: false, code: 'INSUFFICIENT_FUNDS', needed: need - avail, available: avail };
      }

      const { data: act, error: e1 } = await supabase
        .from('bot_activations')
        .insert({
          user_id: user.id,
          bot_id: botId,
          bot_name: botName,
          strategy,
          amount_usd: Number(amountUsd),
          status: 'active',
        })
        .select('*')
        .single();
      if (e1) throw e1;

      // lock de capital (monto negativo reduce saldo)
      await addTransaction({
        amount: -Number(amountUsd),
        type: 'bot_lock',
        description: `Capital asignado a ${botName}`,
        referenceType: 'bot_activation',
        referenceId: act.id,
      });

      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      await recalcAndRefreshBalances();
      return { ok: true, via: 'fallback', activation_id: act.id };
    } catch (e) {
      return { ok: false, code: 'RPC_ERROR', error: e };
    }
  }

  // Pausar
  async function pauseBot(id) {
    const r = await rpcPauseBotRobust({ activation_id: id, user_id: user?.id });
    if (!r.error) {
      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      return r.data ?? { ok: true };
    }
    const { error } = await supabase.from('bot_activations').update({ status: 'paused' }).eq('id', id).eq('user_id', user?.id);
    if (error) return { ok: false, code: 'RPC_ERROR', error };
    await refreshBotActivations();
    return { ok: true, via: 'fallback' };
  }

  // Reanudar
  async function resumeBot(id) {
    const r = await rpcResumeBotRobust({ activation_id: id, user_id: user?.id });
    if (!r.error) {
      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      return r.data ?? { ok: true };
    }
    const { error } = await supabase.from('bot_activations').update({ status: 'active' }).eq('id', id).eq('user_id', user?.id);
    if (error) return { ok: false, code: 'RPC_ERROR', error };
    await refreshBotActivations();
    return { ok: true, via: 'fallback' };
  }

  // Cancelar (con fee y refund → afecta saldo)
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
      const { data: act, error: e1 } = await supabase
        .from('bot_activations')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (e1 || !act) throw e1 || new Error('activation not found');

      const amt = Number(act.amount_usd || 0);
      const feePctPart = Math.max(0, (botCancelFeePct || 0) / 100) * amt;
      const feeFixed = Math.max(0, botCancelFeeUsd || 0);
      let fee = Number((feePctPart + feeFixed).toFixed(2));
      if (fee > amt) fee = amt;

      const refund = Number((amt - fee).toFixed(2));

      // 1) actualizar estado
      const { error: e2 } = await supabase
        .from('bot_activations')
        .update({ status: 'canceled' })
        .eq('id', id)
        .eq('user_id', user.id);
      if (e2) throw e2;

      // 2) refund positivo
      if (refund > 0) {
        await addTransaction({
          amount: refund,
          type: 'bot_refund',
          description: `Devolución capital ${act.bot_name}`,
          referenceType: 'bot_refund',
          referenceId: id,
          status: 'completed',
        });
      }

      // 3) fee negativo
      if (fee > 0) {
        await addTransaction({
          amount: -fee,
          type: 'bot_fee',
          description: `Fee cancelación ${act.bot_name}`,
          referenceType: 'bot_fee',
          referenceId: id,
          status: 'completed',
        });
      }

      await Promise.all([refreshBotActivations(), refreshTransactions()]);
      await recalcAndRefreshBalances();
      return { ok: true, via: 'fallback', refund, fee };
    } catch (e) {
      return { ok: false, code: 'RPC_ERROR', error: e };
    }
  }

  // Reactivar un bot cancelado (nueva activación con mismo capital)
  async function reactivateCanceledBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    const { data: act, error } = await supabase
      .from('bot_activations')
      .select('*')
      .eq('id', activationId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !act) return { ok: false, code: 'NOT_FOUND' };
    return activateBot({
      botId: act.bot_id,
      botName: act.bot_name,
      strategy: act.strategy || 'default',
      amountUsd: Number(act.amount_usd || 0),
    });
  }

  // Archivar / ocultar un cancelado
  async function archiveCanceledBot(activationId) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    let ok = false;
    try {
      const { error } = await supabase
        .from('bot_activations')
        .update({ hidden: true })
        .eq('id', activationId)
        .eq('user_id', user.id);
      if (!error) ok = true;
    } catch {}
    if (!ok) {
      try {
        const { error } = await supabase
          .from('bot_activations')
          .update({ status: 'archived' })
          .eq('id', activationId)
          .eq('user_id', user.id);
        if (!error) ok = true;
      } catch {}
    }
    await refreshBotActivations();
    return { ok };
  }

  // Acredita PnL realizado (impacta saldo y txns)
  async function creditBotProfit(activationId, amountUsd, note = null) {
    if (!user?.id) return { ok: false, code: 'NO_AUTH' };
    try {
      const { data, error } = await supabase.rpc('credit_bot_profit', {
        p_activation_id: activationId,
        p_user_id: user.id,
        p_amount_usd: Number(amountUsd),
        p_note: note,
        activation_id: activationId,
        user_id: user.id,
        amount_usd: Number(amountUsd),
        note,
      });
      if (error) {
  const txn = await addTransaction({
    amount: Number(amountUsd),
    type: 'bot_profit',
    description: note || 'Realized PnL',
    referenceType: 'bot_profit',
    referenceId: activationId,
    status: 'completed',
  });

  // 👇 extra: registrar un retiro (take profit real)
  await addTransaction({
    amount: Number(amountUsd),
    type: 'bot_withdraw',
    description: 'Take Profit',
    referenceType: 'bot_withdraw',
    referenceId: activationId,
    status: 'completed',
  });

  // 👇 extra: actualizar saldo local (solo sim)
  try {
    if (refreshBalances) {
      await refreshBalances();
    } else {
      // fallback: aumentar balance en AuthContext
      setBalances?.((prev) => ({
        ...prev,
        USDC: (prev?.USDC || 0) + Number(amountUsd),
      }));
    }
  } catch {}

  return { ok: !!txn, via: 'fallback' };
}

      await refreshTransactions();
      await recalcAndRefreshBalances();
      return data ?? { ok: true };
    } catch {
      return { ok: false, code: 'RPC_NOT_FOUND' };
    }
  }

  /* ---------------- BOT TRADES (nuevo) ---------------- */
  async function openBotTrade({
    activationId,
    pair,
    side,
    amountUsd,
    leverage = 3,
    tpPct = null,
    slPct = null,
    entry = null,
  }) {
    const { data, error } = await supabase.rpc('bot_trade_open', {
      p_activation_id: activationId,
      p_pair: pair,
      p_side: side,
      p_amount_usd: Number(amountUsd),
      p_leverage: Number(leverage),
      p_tp_pct: tpPct,
      p_sl_pct: slPct,
      p_entry: entry,
    });
    if (error) throw error;
    return data;
  }
  async function mtmBotTrade(tradeId) {
    const { data, error } = await supabase.rpc('bot_trade_mtm', { p_trade_id: tradeId });
    if (error) throw error;
    return data;
  }
  async function closeBotTrade(tradeId, reason = 'manual', closePrice = null) {
    const { data, error } = await supabase.rpc('bot_trade_close', {
      p_trade_id: tradeId,
      p_reason: reason,
      p_close_price: closePrice,
    });
    if (error) throw error;
    await refreshTransactions();
    await recalcAndRefreshBalances();
    return data;
  }

  // ✅ Lista trades (vista o tabla)
  async function listBotTrades(activationId, limit = 50) {
    const tryView = await supabase
      .from('v_bot_trades')
      .select('*')
      .eq('activation_id', activationId)
      .order('opened_at', { ascending: false })
      .limit(limit);

    if (!tryView.error) return ensureArray(tryView.data);

    const { data, error } = await supabase
      .from('bot_trades')
      .select('*')
      .eq('activation_id', activationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return ensureArray(data).map((t) => ({
      id: t.id,
      activation_id: t.activation_id,
      pair: t.pair,
      side: t.side,
      status: t.status,
      amount_usd: Number(t.amount_usd || 0),
      leverage: Number(t.leverage || 1),
      entry: Number(t.entry || t.entry_price || 0),
      exit: Number(t.exit || t.exit_price || 0),
      pnl: Number(t.pnl || 0),
      opened_at: t.opened_at || t.created_at || null,
      closed_at: t.closed_at || null,
    }));
  }

  function subscribeBotTrades(activationId, cb) {
    const ch = supabase
      .channel(`bot_trades_${activationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bot_trades', filter: `activation_id=eq.${activationId}` },
        cb
      )
      .subscribe();
    return ch;
  }

  /* --------- PnL de Bots (desde transacciones) --------- */
  const { botPnlByActivation, totalBotProfit, totalBotFees, totalBotNet } = useMemo(() => {
    const m = new Map();
    let profitSum = 0;
    let feesSum = 0;

    for (const t of ensureArray(transactions)) {
      if (String(t?.status || '').toLowerCase() !== 'completed') continue;

      const kind = String(t?.type || '').toLowerCase();
      const aid = t?.referenceId;
      if (!aid) continue;

      if (!m.has(aid)) m.set(aid, { profit: 0, fees: 0, refunds: 0, withdrawn: 0, net: 0 });


      const amt = Number(t.amount || 0);

      if (kind === 'bot_profit') {
        m.get(aid).profit += amt;
        profitSum += amt;
      } else if (kind === 'bot_fee') {
        const feeAbs = Math.abs(amt);
        m.get(aid).fees += feeAbs;
        feesSum += feeAbs;
      } else if (kind === 'bot_refund') {
        m.get(aid).refunds += amt;
      }
        else if (kind === 'bot_withdraw') {
        m.get(aid).withdrawn += amt;
      }
    }
    

    for (const [k, v] of m.entries()) {
      v.net = (Number(v.profit) || 0) - (Number(v.fees) || 0) - (Number(v.withdrawn) || 0);

      m.set(k, v);
    }

    const plain = {};
    for (const [k, v] of m.entries()) plain[k] = v;

    return {
      botPnlByActivation: plain,
      totalBotProfit: profitSum,
      totalBotFees: feesSum,
      totalBotNet: profitSum - feesSum,
    };
  }, [transactions]);

  const getBotPnl = useCallback(
    (activationId) => {
      return botPnlByActivation[String(activationId)] || { profit: 0, fees: 0, refunds: 0, withdrawn: 0, net: 0 };
    },
    [botPnlByActivation]
  );

  /* ---------------- Helpers UI ---------------- */
  const pairOptions = useMemo(() => {
    const enabled = instruments.filter((i) => i.enabled ?? true);
    const list = enabled.map(
      (i) => `${String(i.symbol || '').toUpperCase()}/${String(i.quote || 'USDT').toUpperCase()}`
    );
    const s = new Set(list);
    if (!s.has('BTC/USDT')) s.add('BTC/USDT');
    if (!s.has('ETH/USDT')) s.add('ETH/USDT');
    return Array.from(s);
  }, [instruments]);

  const getPairInfo = (pair) => {
    const k = String(pair || '').toUpperCase().replace(/\s+/g, '');
    const keys = [
      k,
      k.includes('/') ? k.replace('/', '') : k, // BTCUSDT
      k.split('/')[0], // BTC
      k.includes('/') ? k : `${k}/USDT`, // "BTC" -> "BTC/USDT"
    ];
    for (const key of keys) {
      const val = cryptoPrices[key];
      if (val && Number.isFinite(Number(val.price))) return val;
    }
    return { price: undefined, change: undefined, history: [] };
  };

  // Derivados UI (oculta hidden/archived en cancelados)
  const activeBots = useMemo(
    () => ensureArray(botActivations).filter((b) => ACTIVE_STATUSES.has(normStatus(b.status)) && !b.hidden),
    [botActivations]
  );
  const canceledBots = useMemo(
    () =>
      ensureArray(botActivations).filter((b) => {
        const s = normStatus(b.status);
        return CANCELLED_STATUSES.has(s) && !b.hidden && s !== 'archived';
      }),
    [botActivations]
  );

  const value = useMemo(
    () => ({
      // negocio
      investments,
      transactions,
      referrals,
      botActivations,
      activeBots,
      canceledBots,
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
      reactivateCanceledBot,
      archiveCanceledBot,

      // PnL bots (para UI)
      botPnlByActivation,
      getBotPnl,
      totalBotProfit,
      totalBotFees,
      totalBotNet,

      // mercado/admin
      instruments,
      marketRules,
      refreshMarketInstruments,
      refreshMarketRules,
      forceRefreshMarket,

      // precios
      cryptoPrices,
      getPairInfo,
      pairOptions,
      assetToSymbol: liveBinanceMap,

      // trades (legacy)
      trades,
      refreshTrades,
      closeTrade,

      // BOT trades (nuevo)
      openBotTrade,
      mtmBotTrade,
      closeBotTrade,
      listBotTrades,
      subscribeBotTrades,

      // settings de admin
      settings: adminSettings,
      slippageMaxPct,
      botCancelFeeUsd,
      botCancelFeePct,
      refreshSettings: fetchAdminSettings,

      // saldos
      getAvailableBalance,
      canActivateBot,

      // modal
      modal,
      openModal,
      closeModal,
      setModalPayload,
      confirmModal,
      confirmModalAccept,
      confirmModalCancel,

      investmentPlans,
    }),
    [
      investments,
      transactions,
      referrals,
      botActivations,
      activeBots,
      canceledBots,
      instruments,
      marketRules,
      cryptoPrices,
      pairOptions,
      liveBinanceMap,
      adminSettings,
      slippageMaxPct,
      investmentPlans,
      trades,
      botPnlByActivation,
      getBotPnl,
      totalBotProfit,
      totalBotFees,
      totalBotNet,
      botCancelFeeUsd,
      botCancelFeePct,
      modal,
    ]
  );

  return (
  <DataContext.Provider value={value}>
    {children}
  </DataContext.Provider>
);

}

/* ---------------- Hook ---------------- */
export function useData() {
  const ctx = useContext(DataContext);
  return (
    ctx || {
      investments: [],
      transactions: [],
      referrals: [],
      botActivations: [],
      activeBots: [],
      canceledBots: [],
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
      reactivateCanceledBot: async () => ({ ok: false }),
      archiveCanceledBot: async () => ({ ok: false }),

      // PnL bots
      botPnlByActivation: {},
      getBotPnl: () => ({ profit: 0, fees: 0, refunds: 0, net: 0 }),
      totalBotProfit: 0,
      totalBotFees: 0,
      totalBotNet: 0,

      instruments: [],
      marketRules: [],
      refreshMarketInstruments: async () => {},
      refreshMarketRules: async () => {},
      forceRefreshMarket: async () => {},

      cryptoPrices: {},
      getPairInfo: () => ({ price: undefined, change: undefined, history: [] }),
      pairOptions: ['BTC/USDT', 'ETH/USDT'],
      assetToSymbol: DEFAULT_BINANCE_MAP,

      // trades (legacy)
      trades: [],
      refreshTrades: async () => {},
      closeTrade: async () => null,

      // BOT trades
      openBotTrade: async () => null,
      mtmBotTrade: async () => null,
      closeBotTrade: async () => null,
      listBotTrades: async () => [],
      subscribeBotTrades: () => () => {},

      // settings
      settings: {},
      slippageMaxPct: 0.2,
      botCancelFeeUsd: 0,
      botCancelFeePct: 0,
      refreshSettings: async () => {},

      // saldos
      getAvailableBalance: async () => 0,
      canActivateBot: async () => ({ ok: false, available: 0, needed: 0 }),

      // modal (fallback no-op)
      modal: { open: false, name: null, payload: null },
      openModal: () => {},
      closeModal: () => {},
      setModalPayload: () => {},
      confirmModal: async () => false,
      confirmModalAccept: () => {},
      confirmModalCancel: () => {},

      investmentPlans: [],
    }
  );
}