// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/* Logs solo en dev (para chequear envs) */
if (import.meta.env.DEV) {
  console.log('[Supabase] URL:', SUPABASE_URL);
  console.log('[Supabase] ANON presente:', !!SUPABASE_ANON_KEY);
}

let supabase;

/* ===================== MODO DEMO (faltan envs) ===================== */
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[WARN] Supabase no configurado. Corriendo en modo demo.');

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

/* ========================= HELPERS ========================= */

function normalizePath(path = '') {
  const p = String(path).replace(/^\/+/, ''); // sin leading slashes
  // si ya viene con rest/v1 o functions/v1, lo dejamos tal cual
  if (/^(rest|functions)\/v1\//.test(p)) return p;
  return `rest/v1/${p}`;
}

/** Headers listos por si los necesitás en algún fetch manual */
export function supabaseAuthHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

/** Llamar Edge Functions sin equivocarte con el endpoint */
export async function callEdgeFunction(name, init = {}) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const headers = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error(`Edge "${name}" ${res.status}: ${isJson ? JSON.stringify(body) : body}`);
  return body;
}

/**
 * PostgREST directo.
 * - path: tabla o vista (ej: "wallet_transactions?select=*&user_id=eq.123")
 *         o rpc (ej: "rpc/get_admin_settings")
 * - Podés pasar `query: "select=*&..."`
 */
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
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  return isJson ? res.json() : res.text();
}

export { supabase };
