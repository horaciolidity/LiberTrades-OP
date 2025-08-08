import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

console.log('VITE_SUPABASE_URL:', supabaseUrl);
console.log('VITE_SUPABASE_ANON_KEY presente:', !!supabaseAnonKey);

let supabase;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[WARN] Supabase no configurado. Modo demo.');
  supabase = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
      signUp: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
      signOut: async () => ({ error: null }),
    },
    from() {
      return {
        select: async () => ({ data: [], error: { message: 'Supabase no configurado' } }),
        insert: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
        update: async () => ({ data: null, error: { message: 'Supabase no configurado' } }),
        eq() { return this; }, single() { return this; },
      };
    },
  };
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };
