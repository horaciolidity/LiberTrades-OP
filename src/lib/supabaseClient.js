// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

/* ================== ENVS (Vercel -> Vite) ================== */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}
/** Flag para mostrar el botón “Actualizar bots” en el cliente */
export const BOT_BRAIN_CLIENT = parseBool(import.meta.env.VITE_BOT_BRAIN_CLIENT);

/* Logs solo en dev */
if (import.meta.env.DEV) {
  console.log('[Supabase] URL:', SUPABASE_URL);
  console.log('[Supabase] ANON presente:', !!SUPABASE_ANON_KEY);
  console.log('[BotBrain] flag cliente:', BOT_BRAIN_CLIENT);
}

let supabase;

/* ===================== MODO DEMO (faltan ENVs) ===================== */
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[WARN] Supabase no configurado. Corriendo en MODO DEMO.');

  const notConfigured = async () => ({
    data: null,
    error: { message: 'Supabase no configurado' },
  });

  const tableStub = {
    select: notConfigured,
    insert: notConfigured,
    update: notConfigured,
    upsert: notConfigured,
    delete: notConfigured,
    single() { return this; },
    maybeSingle() { return this; },
    eq() { return this; },
    in() { return this; },
    order() { return this; },
    limit() { return this; },
    gte() { return this; },
    lte() { return this; },
  };

  const channelStub = {
    on() { return this; },
    subscribe() { return { data: { subscription: { unsubscribe() {} } } }; },
    unsubscribe() {},
  };

  supabase = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: notConfigured,
      signUp: notConfigured,
      signOut: async () => ({ error: null }),
    },
    from() { return tableStub; },
    rpc: notConfigured,
    channel() { return channelStub; },
    removeChannel() {},
    functions: { invoke: notConfigured },
  };
} else {
  /* ===================== CLIENTE REAL ===================== */
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/* ========================= HELPERS GENÉRICOS ========================= */

function normalizePath(path = '') {
  const p = String(path).replace(/^\/+/, '');
  if (/^(rest|functions)\/v1\//.test(p)) return p;
  return `rest/v1/${p}`;
}

/** Headers para fetch manual anónimo (PostgREST / Storage, etc.) */
export function supabaseAuthHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

/** Llamar Edge Functions (usa access_token de usuario si hay sesión)
 *  (No se usa para el bot-brain en producción para evitar CORS)
 */
export async function callEdgeFunction(name, init = {}) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;

  // Token del usuario si hay sesión; si no, ANON
  let bearer = SUPABASE_ANON_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) bearer = token;
  } catch {}

  const headers = {
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };

  const res = await fetch(url, { ...init, headers });
  const ctype = res.headers.get('content-type') || '';
  const isJson = ctype.includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = isJson ? JSON.stringify(body) : String(body);
    throw new Error(`Edge "${name}" ${res.status}: ${detail}`);
  }
  return body;
}

/** PostgREST directo por path (tablas/vistas o rpc) */
export async function rest(path, { method = 'GET', headers = {}, body, query } = {}) {
  const norm = normalizePath(path);
  const url = `${SUPABASE_URL}/${norm}${query ? (norm.includes('?') ? '' : '?') + query : ''}`;

  const res = await fetch(url, {
    method,
    headers: {
      ...supabaseAuthHeaders(),
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`REST ${method} ${url} -> ${res.status} ${text}`);
  }

  if (res.status === 204) return null;
  const ctype = res.headers.get('content-type') || '';
  const isJson = ctype.includes('application/json');
  return isJson ? res.json() : res.text();
}

/* ================= RPC UTILITIES (tolerantes a nombres) ================= */

/** rpcTry prueba varias funciones y devuelve la primera válida. */
async function rpcTry(names, params) {
  let lastError = null;
  for (const name of names) {
    const { data, error } = await supabase.rpc(name, params);
    if (!error) return { data, error: null, fn: name };
    // “no existe”
    const code = error?.code || '';
    const msg = String(error?.message || '').toLowerCase();
    const notExists =
      code === 'PGRST302' ||
      code === '42883' ||
      (msg.includes('function') && msg.includes('does not exist'));
    if (!notExists) return { data: null, error, fn: name }; // error real
    lastError = error;
  }
  return { data: null, error: lastError, fn: names[names.length - 1] };
}

/* =================== BOT BRAIN (RPC-ONLY) =================== */
/** Ejecuta un ciclo del “cerebro” (simulador/real) via RPC.
 *  Importante: SIN fallback a Edge Function para evitar CORS.
 */
export async function runBotBrainOnce(payload = {}) {
  const { data, error } = await supabase.rpc('run_bot_brain_once', payload);
  if (error) {
    console.error('[run_bot_brain_once] RPC error:', error);
    throw error;
  }
  return data;
}

/* ============== PRECIOS SIMULADOS PERSISTENTES (sim_pairs) ============== */
export async function getSimPairPrice(pair) {
  // RPC estable creada en la DB: sim_get_pair(p_pair text)
  const { data, error } = await supabase.rpc('sim_get_pair', { p_pair: pair });
  if (error) return {};
  if (Array.isArray(data) && data.length) {
    return { price: data[0]?.price, updated_at: data[0]?.updated_at };
  }
  return {};
}

/* ================== RPCs de bots (robustos a nombres) ================== */
export async function rpcActivateBot({ bot_id, bot_name, strategy, amount_usd }) {
  const { data, error } = await rpcTry(['activate_trading_bot'], {
    bot_id,
    bot_name,
    strategy,
    amount_usd,
  });
  return { data, error };
}

export async function rpcPauseBot(activation_id) {
  const { data, error } = await rpcTry(['pause_trading_bot'], { activation_id });
  return { data, error };
}

export async function rpcResumeBot(activation_id) {
  const { data, error } = await rpcTry(['resume_trading_bot'], { activation_id });
  return { data, error };
}

export async function rpcCancelBot(activation_id) {
  // probamos with_fee -> simulada -> genérica
  const { data, error } = await rpcTry(
    ['cancel_trading_bot_with_fee', 'sim_cancel_bot', 'cancel_trading_bot'],
    { activation_id }
  );
  return { data, error };
}

/* ============== Suscripción a trades por activación (opcional) ============== */
export function subscribeTradesByActivation(activation_id, onChange) {
  const channel = supabase
    .channel(`trades_${activation_id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bot_trades', filter: `activation_id=eq.${activation_id}` },
      () => {
        try { onChange?.(); } catch {}
      }
    )
    .subscribe();
  return channel;
}

export { supabase };
