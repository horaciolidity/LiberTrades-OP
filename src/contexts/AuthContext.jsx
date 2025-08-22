// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);         // auth user
  const [profile, setProfile] = useState(null);   // public.profiles
  const [balances, setBalances] = useState(null); // public.balances
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const SAFE_TIMEOUT = 2500; // evita loaders eternos

  // ---------- helpers (db) ----------
  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id, username, referred_by, referral_code, role,
        full_name, email, phone, country, city, updated_at
      `)
      .eq('id', userId)
      .maybeSingle();

    if (error) console.warn('[profiles.select]', error.message);
    setProfile(data || null);
    return data || null;
  }

  async function fetchOrCreateBalances(userId) {
    const { data: existing, error: selErr } = await supabase
      .from('balances')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (selErr) console.warn('[balances.select]', selErr.message);

    if (existing) {
      setBalances(existing);
      return existing;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('balances')
      .insert({ user_id: userId, balance: 0, usdc: 0, eth: 0 })
      .select()
      .single();

    if (insErr) {
      console.warn('[balances.insert]', insErr.message);
      setBalances(null);
      return null;
    }

    setBalances(inserted || null);
    return inserted || null;
  }

  const refreshBalances = async () => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('balances')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('[refreshBalances]', error.message);
      return null;
    }
    setBalances(data || null);
    return data || null;
  };

  const refreshProfile = async () => {
    if (!user?.id) return null;
    return fetchProfile(user.id);
  };

  function loadAllBG(userId) {
    Promise.allSettled([fetchProfile(userId), fetchOrCreateBalances(userId)]).catch(() => {});
    setIsAuthenticated(true);
  }

  // ---------- bootstrap + auth listener ----------
  useEffect(() => {
    let mounted = true;
    const killer = setTimeout(() => mounted && setLoading(false), SAFE_TIMEOUT);

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn('[getSession]', error.message);

        const session = data?.session ?? null;
        if (!mounted) return;

        setUser(session?.user ?? null);
        setIsAuthenticated(!!session?.user);

        if (session?.user) {
          loadAllBG(session.user.id);
        } else {
          setProfile(null);
          setBalances(null);
        }
      } catch (e) {
        console.error('[bootstrap]', e);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setBalances(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setIsAuthenticated(!!u);
      if (u) {
        loadAllBG(u.id);
      } else {
        setProfile(null);
        setBalances(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(killer);
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // ---------- realtime (balances + profiles) ----------
  useEffect(() => {
    if (!user?.id) return;

    const chBalances = supabase
      .channel('rt-balances')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'balances', filter: `user_id=eq.${user.id}` },
        (payload) => payload?.new && setBalances(payload.new)
      )
      .subscribe();

    const chProfile = supabase
      .channel('rt-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => payload?.new && setProfile(payload.new)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chBalances);
      supabase.removeChannel(chProfile);
    };
  }, [user?.id]);

  // ---------- utils ----------
  const generateReferralCode = () =>
    Math.random().toString(36).substring(2, 8).toUpperCase();

  // ---------- actions ----------
  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data?.user?.id) loadAllBG(data.user.id);
      toast({ title: '¡Bienvenido!', description: 'Has iniciado sesión exitosamente' });
      return data.user ?? null;
    } catch (error) {
      toast({ title: 'Error de autenticación', description: error.message, variant: 'destructive' });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  /**
   * register recibe:
   * - referredBy: UUID del referidor (vos lo calculás en RegisterPage buscando por referral_code)
   */
  const register = async ({ email, password, name, referredBy }) => {
    setLoading(true);
    try {
      // 1) alta en Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name || null } },
      });
      if (error) throw error;

      const userId = data?.user?.id;
      if (!userId) throw new Error('No se pudo obtener el ID de usuario.');

      // 2) generar referral_code único con reintentos
      let myCode = generateReferralCode();
      for (let i = 0; i < 4; i++) {
        const { data: exists } = await supabase
          .from('profiles')
          .select('id')
          .eq('referral_code', myCode)
          .maybeSingle();
        if (!exists) break;
        myCode = generateReferralCode();
      }

      // 3) upsert del perfil (idempotente por si tenés triggers)
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            username: name || email.split('@')[0],
            full_name: name || null,
            email,
            referred_by: referredBy || null, // UUID del referidor (o null)
            referral_code: myCode,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select()
        .single();
      if (pErr) throw pErr;

      // 4) balance inicial (noop si falla por RLS)
      const { error: bErr } = await supabase
        .from('balances')
        .insert({ user_id: userId, balance: 0, usdc: 0, eth: 0 });
      if (bErr) console.warn('[register/init balances]', bErr.message);

      // 5) hidratar estado
      setUser(data.user);
      setProfile(prof || null);
      await fetchOrCreateBalances(userId);

      toast({ title: '¡Registro exitoso!', description: 'Tu cuenta ha sido creada.' });
      return data.user ?? null;
    } catch (err) {
      console.error('[register]', err);
      const msg =
        err?.message?.includes('User already registered')
          ? 'Este email ya está registrado.'
          : err?.message || 'No se pudo crear la cuenta.';
      toast({ title: 'Error de registro', description: msg, variant: 'destructive' });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setBalances(null);
    setIsAuthenticated(false);
    toast({ title: 'Sesión cerrada', description: 'Has cerrado sesión exitosamente' });
  };

  // Acepta solo columnas válidas de profiles
  const pickProfileCols = (obj = {}) => {
    const allow = new Set([
      'username',
      'full_name',
      'email',      // (columna en profiles; NO cambia email de login)
      'phone',
      'country',
      'city',
      'referred_by',
      'referral_code',
      'role',
      'updated_at',
    ]);
    const out = {};
    Object.keys(obj || {}).forEach((k) => {
      if (allow.has(k)) out[k] = obj[k];
    });
    return out;
  };

  const updateUser = async (updatedData) => {
    if (!user?.id) {
      toast({ title: 'Sin sesión', description: 'No hay usuario para actualizar', variant: 'destructive' });
      return;
    }
    const payload = { ...pickProfileCols(updatedData), updated_at: new Date().toISOString() };
    if (Object.keys(payload).length === 0) {
      toast({ title: 'Nada para actualizar', description: 'No se detectaron cambios.' });
      return;
    }

    const { data, error } = await supabase.from('profiles').update(payload).eq('id', user.id).select().single();
    if (error) {
      console.error('[profiles.update]', error);
      toast({ title: 'Error al actualizar usuario', description: error.message, variant: 'destructive' });
      return;
    }

    setProfile(data || null); // reflejar al toque
    toast({ title: 'Datos actualizados', description: 'Tu perfil ha sido actualizado.' });
  };

  // Helper comodín de saldo USD
  const balanceUSD =
    typeof balances?.usdc === 'number'
      ? balances.usdc
      : typeof balances?.balance === 'number'
      ? balances.balance
      : 0;

  const displayName =
    profile?.username ||
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split('@')[0] : 'Usuario');

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        balances,
        balanceUSD,
        displayName,
        isAuthenticated,
        loading,
        login,
        register,
        logout,
        updateUser,
        refreshBalances,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
