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
  const [user, setUser] = useState(null);         // objeto auth de Supabase
  const [profile, setProfile] = useState(null);   // fila en public.profiles
  const [balances, setBalances] = useState(null); // fila en public.balances
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // -------- helpers --------
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

  // Crea si no existe y devuelve una sola fila (evita races/duplicados)
  async function fetchOrCreateBalances(userId) {
    const { data: bal, error } = await supabase
      .from('balances')
      .upsert({ user_id: userId, usdc: 0, eth: 0 }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) console.warn('Balance:', error.message);
    setBalances(bal);
    return bal;
  }

  async function loadAll(userId) {
    await Promise.all([fetchProfile(userId), fetchOrCreateBalances(userId)]);
    setIsAuthenticated(true);
  }

  // -------- bootstrap + listener --------
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        setIsAuthenticated(!!u);
        if (u) {
          await loadAll(u.id);
        } else {
          setProfile(null);
          setBalances(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // -------- actions --------
  const generateReferralCode = () =>
    Math.random().toString(36).substring(2, 8).toUpperCase();

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data?.user?.id) await loadAll(data.user.id);

      toast({ title: '¡Bienvenido!', description: 'Has iniciado sesión exitosamente' });
      return data.user ?? null;
    } catch (error) {
      toast({
        title: 'Error de autenticación',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Opción B (Confirm email OFF): sesión inmediata + inserts en client
  const register = async ({ email, password, name, referredBy }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name || null } },
      });
      if (error) throw error;

      const userId = data?.user?.id;
      const referralCode = generateReferralCode();

      if (userId) {
        // Perfil
        const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          username: name || email.split('@')[0],
          referred_by: referredBy || null,
          referral_code: referralCode,
        });
        if (profileError) throw profileError;

        // Balance (idempotente)
        await fetchOrCreateBalances(userId);

        // Cargar datos para UI
        await fetchProfile(userId);
        setIsAuthenticated(true);
      }

      toast({ title: '¡Registro exitoso!', description: 'Tu cuenta ha sido creada correctamente.' });
      return data.user ?? null;
    } catch (err) {
      toast({ title: 'Error de registro', description: err.message, variant: 'destructive' });
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
    await fetchProfile(user.id); // refresca en contexto
    toast({ title: 'Datos actualizados', description: 'Tu perfil ha sido actualizado exitosamente' });
  };

  // Nombre para UI
  const displayName =
    profile?.username ??
    user?.user_metadata?.full_name ??
    (user?.email ? user.email.split('@')[0] : 'Usuario');

  const value = {
    user,
    profile,
    balances,
    displayName,     // “Bienvenido, {displayName}”
    isAuthenticated,
    loading,
    login,
    register,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
