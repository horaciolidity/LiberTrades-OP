// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// logs útiles (en prod podés quitarlos)
console.log('VITE_SUPABASE_URL:', supabaseUrl);
console.log('VITE_SUPABASE_ANON_KEY presente:', !!supabaseAnonKey);

let supabase;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[WARN] Supabase no configurado. Modo demo.');

  // Respuesta de error estándar
  const errRes = (msg = 'Supabase no configurado') => ({ data: null, error: { message: msg } });

  // Builder "thenable" para que `await supabase.from(...).select()...` no rompa
  const builder = () => {
    const b = {
      on() { return b; },
      eq() { return b; },
      single() { return b; },
      maybeSingle() { return b; },
      order() { return b; },
      limit() { return b; },
      // Métodos de consultas/escrituras encadenables
      select() { return b; },
      insert() { return b; },
      update() { return b; },
      upsert() { return b; },
      onConflict() { return b; },
      // Hace que `await` funcione y devuelva un error controlado
      then(resolve) { resolve(errRes()); },
      catch() { return b; },
      finally() { return b; },
    };
    return b;
  };

  supabase = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => errRes(),
      signUp: async () => errRes(),
      signOut: async () => ({ error: null }),
    },
    from() { return builder(); },
    rpc: async () => errRes(),
    channel() {
      // stub de realtime
      return {
        on() { return this; },
        subscribe() { return { unsubscribe() {} }; },
      };
    },
    removeChannel() {},
  };
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

// Helper de debug en navegador
if (typeof window !== 'undefined') window.__sb = supabase;

export { supabase };
