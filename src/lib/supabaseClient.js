import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// Logs útiles en dev (podés quitarlos en prod)
console.log('VITE_SUPABASE_URL:', supabaseUrl);
console.log('VITE_SUPABASE_ANON_KEY presente:', !!supabaseAnonKey);

let supabase;

// Modo “demo” si faltan envs (evita que la app crashee en build)
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[WARN] Supabase no configurado. Modo demo.');
  supabase = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
      signUp: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
      signOut: async () => ({ error: null } ),
    },
    from() {
      const stub = {
        select: async () => ({ data: [], error: { message: 'Supabase no configurado' } }),
        insert: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
        update: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
        upsert: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
        onConflict() { return this; },
        eq() { return this; },
        single() { return this; },
        maybeSingle() { return this; },
        select() { return this; },
      };
      return stub;
    },
  };
} else {
  // ✅ Opciones clave para navegador
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,       // guarda sesión en localStorage
      autoRefreshToken: true,     // refresca el token automáticamente
      detectSessionInUrl: true,   // maneja callbacks con tokens en la URL
    },
  });
}

export { supabase };
