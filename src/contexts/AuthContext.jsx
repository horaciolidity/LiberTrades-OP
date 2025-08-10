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

  const SAFE_TIMEOUT = 2500; // ms: evita loaders eternos

  // ------- helpers -------
  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, referred_by, referral_code, role')
      .eq('id', userId)
      .maybeSingle();
    if (error) console.warn('Perfil:', error.message);
    setProfile(data || null);
    return data || null;
  }

  // Crea si no existe y devuelve la fila (idempotente)
  async function fetchOrCreateBalances(userId) {
    const { data, error } = await supabase
      .from('balances')
      .upsert({ user_id: userId, usdc: 0, eth: 0 }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) console.warn('Balance:', error.message);
    setBalances(data || null);
    return data || null;
  }

  // Refresca solo balances (útil post-ajuste admin)
  const refreshBalances = async () => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('balances')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (!error) setBalances(data || null);
    return data || null;
  };

  // carga en segundo plano — NO bloquea el loader
  function loadAllBG(userId) {
    Promise.allSettled([fetchProfile(userId), fetchOrCreateBalances(userId)]).catch(() => {});
    setIsAuthenticated(true);
  }

  // ------- bootstrap + listener de auth -------
  useEffect(() => {
    let mounted = true;
    const killer = setTimeout(() => mounted && setLoading(false), SAFE_TIMEOUT);

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn('getSession error:', error.message);

        const session = data?.session ?? null;
        if (!mounted) return;

        setUser(session?.user ?? null);
        setIsAuthenticated(!!session?.user);

        if (session?.user) {
          loadAllBG(session.user.id); // en BG
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
        if (mounted) setLoading(false); // soltar loader ya
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setIsAuthenticated(!!u);
      if (u) {
        loadAllBG(u.id); // en BG
      } else {
        setProfile(null);
        setBalances(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(killer);
      subscription.unsubscribe();
    };
  }, []);

  // ------- listeners Realtime (balances + profiles) -------
  useEffect(() => {
    if (!user?.id) return;

    // balances del usuario logueado
    const chBalances = supabase
      .channel('rt-balances')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'balances', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload?.new) setBalances(payload.new);
        }
      )
      .subscribe();

    // opcional: cambios de perfil (nombre/role)
    const chProfile = supabase
      .channel('rt-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          if (payload?.new) setProfile(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chBalances);
      supabase.removeChannel(chProfile);
    };
  }, [user?.id]);

  // ------- actions -------
  const generateReferralCode = () =>
    Math.random().toString(36).substring(2, 8).toUpperCase();

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
        const { error: pErr } = await supabase.from('profiles').insert({
          id: userId,
          username: name || email.split('@')[0],
          referred_by: referredBy || null,
          referral_code: referralCode,
        });
        if (pErr) throw pErr;

        loadAllBG(userId); // en BG
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
      toast({ title: 'Sin sesión', description: 'No hay usuario para actualizar', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('profiles').update(updatedData).eq('id', user.id);
    if (error) {
      toast({ title: 'Error al actualizar usuario', description: error.message, variant: 'destructive' });
      return;
    }
    fetchProfile(user.id); // refresh en BG
    toast({ title: 'Datos actualizados', description: 'Tu perfil ha sido actualizado exitosamente' });
  };

  const displayName =
    profile?.username ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split('@')[0] : 'Usuario');

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        balances,
        displayName,
        isAuthenticated,
        loading,
        login,
        register,
        logout,
        updateUser,
        refreshBalances, // <- expuesto
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
