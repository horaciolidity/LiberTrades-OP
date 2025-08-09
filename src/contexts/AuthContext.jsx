import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);           // objeto de auth de Supabase (tokens, email, etc.)
  const [profile, setProfile] = useState(null);     // fila de public.profiles (username, referred_by, referral_code)
  const [balances, setBalances] = useState(null);   // fila de public.balances
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // ------- helpers -------
  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, referred_by, referral_code')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Perfil:', error.message);
      return null;
    }
    setProfile(data);
    return data;
  }

  async function fetchOrCreateBalances(userId) {
    // leer
    let { data: bal, error } = await supabase
      .from('balances')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // crear si no existe
    if (!bal) {
      const { data: ins, error: insErr } = await supabase
        .from('balances')
        .insert({ user_id: userId, usdc: 0, eth: 0 })
        .select()
        .single();

      if (!insErr) bal = ins;
      else console.warn('Crear balance:', insErr.message);
    } else if (error) {
      console.warn('Balance:', error.message);
    }

    setBalances(bal);
    return bal;
  }

  async function loadAll(userId) {
    await Promise.all([fetchProfile(userId), fetchOrCreateBalances(userId)]);
    setIsAuthenticated(true);
  }

  // ------- bootstrap + listener -------
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn('getSession error:', error.message);

        const session = data?.session ?? null;
        if (!mounted) return;
        setUser(session?.user ?? null);
        setIsAuthenticated(!!session?.user);

        if (session?.user) {
          await loadAll(session.user.id);
        } else {
          setProfile(null);
          setBalances(null);
        }
      } catch (e) {
        console.error('Error inesperado al cargar la sesión:', e);
        if (mounted) {
          setUser(null);
          setProfile(null);
          setBalances(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setIsAuthenticated(!!u);
      if (u) {
        await loadAll(u.id);
      } else {
        setProfile(null);
        setBalances(null);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // ------- actions -------
  const generateReferralCode = () =>
    Math.random().toString(36).substring(2, 8).toUpperCase();

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const userId = data?.user?.id;
      if (userId) await loadAll(userId);

      toast({ title: '¡Bienvenido!', description: 'Has iniciado sesión exitosamente' });
      return data.user ?? null;
    } catch (error) {
      toast({
        title: 'Error de autenticación',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const register = async ({ email, password, name, referredBy }) => {
    try {
      // 1) crear cuenta
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name || null } }, // guarda también en metadata (opcional)
      });
      if (error) throw error;

      const userId = data?.user?.id;
      const referralCode = generateReferralCode();

      // 2) perfil + balance
      if (userId) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          username: name || email.split('@')[0],
          referred_by: referredBy || null,
          referral_code: referralCode,
        });
        if (profileError) throw profileError;

        await fetchOrCreateBalances(userId);
        await fetchProfile(userId); // para que “Bienvenido, {username}” salga al toque
      }

      toast({
        title: '¡Registro exitoso!',
        description: userId
          ? 'Tu cuenta ha sido creada correctamente.'
          : 'Revisa tu correo para confirmar la cuenta.',
      });

      return data.user ?? null;
    } catch (error) {
      toast({
        title: 'Error de registro',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
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

  const updateUser = async (updatedData) => {
    if (!user?.id) {
      toast({
        title: 'Sin sesión',
        description: 'No hay usuario para actualizar',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('profiles').update(updatedData).eq('id', user.id);
    if (error) {
      toast({
        title: 'Error al actualizar usuario',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    // refrescar perfil en contexto
    await fetchProfile(user.id);
    toast({ title: 'Datos actualizados', description: 'Tu perfil ha sido actualizado exitosamente' });
  };

  // nombre listo para UI
  const displayName =
    profile?.username ??
    user?.user_metadata?.full_name ??
    (user?.email ? user.email.split('@')[0] : 'Usuario');

  const value = {
    user,               // auth user
    profile,            // fila de profiles
    balances,           // fila de balances
    displayName,        // “Bienvenido, {displayName}”
    isAuthenticated,
    loading,
    login,
    register,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
