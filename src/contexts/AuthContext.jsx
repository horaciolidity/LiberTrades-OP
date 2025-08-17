// src/contexts/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [balances, setBalances] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const SAFE_TIMEOUT = 2500;

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, referred_by, referral_code, role, full_name, email')
      .eq('id', userId)
      .maybeSingle();
    if (error) console.warn('Perfil:', error.message);
    setProfile(data || null);
    return data || null;
  }

  async function fetchOrCreateBalances(userId) {
    const { data: existing, error: selErr } = await supabase
      .from('balances')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (selErr) console.warn('Balance (select):', selErr.message);

    if (existing) {
      setBalances(existing);
      return existing;
    }

    const { data: inserted, error: insErr } = await supabase
      .from('balances')
      .upsert({ user_id: userId, usdc: 0, eth: 0 }, { onConflict: 'user_id' })
      .select()
      .single();

    if (insErr) {
      console.warn('Balance (insert):', insErr.message);
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
      console.warn('refreshBalances:', error.message);
      return null;
    }
    setBalances(data || null);
    return data || null;
  };

  function loadAllBG(userId) {
    Promise.allSettled([
      fetchProfile(userId),
      fetchOrCreateBalances(userId),
    ]).catch(() => {});
    setIsAuthenticated(true);
  }

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
          loadAllBG(session.user.id);
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
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
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

  useEffect(() => {
    if (!user?.id) return;

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

  const register = async ({ email, password, name, referralCode }) => {
    setLoading(true);
    try {
      let referredBy = null;
      const code = (referralCode || '').toUpperCase().trim();

      if (code) {
        const { data: refId, error: refErr } = await supabase.rpc('resolve_referral_code', { p_code: code });
        if (refErr) throw refErr;
        referredBy = refId || null;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name || null } },
      });
      if (error) throw error;

      const userId = data?.user?.id;
      const myReferralCode = generateReferralCode();

      if (userId) {
        const { error: pErr } = await supabase
          .from('profiles')
          .upsert(
            {
              id: userId,
              username: name || email.split('@')[0],
              referred_by: referredBy,
              referral_code: myReferralCode,
              email,
              full_name: name || null,
            },
            { onConflict: 'id' }
          )
          .select()
          .single();
        if (pErr) throw pErr;

        const { error: bErr } = await supabase
          .from('balances')
          .upsert({ user_id: userId, usdc: 0, eth: 0 }, { onConflict: 'user_id' });
        if (bErr) console.warn('Init balances (register):', bErr.message);

        loadAllBG(userId);
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
    fetchProfile(user.id);
    toast({ title: 'Datos actualizados', description: 'Tu perfil ha sido actualizado exitosamente' });
  };

  const balanceUSD = typeof balances?.usdc === 'number'
    ? balances.usdc
    : typeof balances?.balance === 'number'
    ? balances.balance
    : 0;

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
        balanceUSD,
        displayName,
        isAuthenticated,
        loading,
        login,
        register,
        logout,
        updateUser,
        refreshBalances,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
