// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';

const AuthContext = createContext(null);
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export function AuthProvider({ children }) {
  // ---- state base ----
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [balances, setBalances] = useState({ usdc: 0, demo_balance: 0, balance: 0 });
  const [investments, setInvestments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const SAFE_TIMEOUT = 2500; // evita loaders eternos si algo falla

  // ---------- fetch helpers ----------
  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, referred_by, referral_code, role')
      .eq('id', userId)
      .maybeSingle();
    if (error) console.warn('Perfil:', error.message);
    setProfile(data || null);
    return data || null;
  };

  const fetchOrCreateBalances = async (userId) => {
    // intentar leer
    const { data, error } = await supabase
      .from('balances')
      .select('user_id, usdc, demo_balance, balance, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (!error && data) {
      setBalances(data);
      return data;
    }

    // crear fila si no existe (RLS debe permitir insert del propio user)
    const { data: ins, error: insErr } = await supabase
      .from('balances')
      .insert({ user_id: userId, usdc: 0, demo_balance: 0, balance: 0 })
      .select('user_id, usdc, demo_balance, balance, updated_at')
      .single();

    if (insErr) {
      console.warn('Balance (insert):', insErr.message);
      return null;
    }
    setBalances(ins);
    return ins;
  };

  const refreshBalances = async () => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('balances')
      .select('user_id, usdc, demo_balance, balance, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('refreshBalances:', error.message);
      return null;
    }
    if (data) setBalances(data);
    return data;
  };

  const loadInvestments = async () => {
    const { data, error } = await supabase.from('user_investments').select('*');
    if (error) {
      console.warn('loadInvestments:', error.message);
      return [];
    }
    setInvestments(data || []);
    return data || [];
  };

  const loadTransactions = async () => {
    const { data, error } = await supabase.from('user_transactions').select('*');
    if (error) {
      console.warn('loadTransactions:', error.message);
      return [];
    }
    setTransactions(data || []);
    return data || [];
  };

  const loadAll = async (userId) => {
    await Promise.allSettled([
      fetchProfile(userId),
      fetchOrCreateBalances(userId),
      loadInvestments(),
      loadTransactions(),
    ]);
    setIsAuthenticated(true);
  };

  // ---------- bootstrap de sesión ----------
  useEffect(() => {
    let mounted = true;
    const killer = setTimeout(() => mounted && setLoading(false), SAFE_TIMEOUT);

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn('getSession:', error.message);
        const session = data?.session ?? null;

        if (!mounted) return;
        setUser(session?.user ?? null);
        setIsAuthenticated(!!session?.user);

        if (session?.user) {
          loadAll(session.user.id);
        } else {
          setProfile(null);
          setBalances({ usdc: 0, demo_balance: 0, balance: 0 });
          setInvestments([]);
          setTransactions([]);
        }
      } finally {
        mounted && setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setIsAuthenticated(!!u);
      if (u) {
        loadAll(u.id);
      } else {
        setProfile(null);
        setBalances({ usdc: 0, demo_balance: 0, balance: 0 });
        setInvestments([]);
        setTransactions([]);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(killer);
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // ---------- Realtime ----------
  useEffect(() => {
    if (!user?.id) return;

    // balances -> actualiza en vivo
    const chBalances = supabase
      .channel('rt-balances')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'balances', filter: `user_id=eq.${user.id}` },
        (payload) => payload?.new && setBalances(payload.new)
      )
      .subscribe();

    // profile -> cambios visibles
    const chProfile = supabase
      .channel('rt-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => payload?.new && setProfile(payload.new)
      )
      .subscribe();

    // wallet/investments -> refrescar listas
    const chWallet = supabase
      .channel('rt-wallet-investments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        loadTransactions
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${user.id}` },
        loadInvestments
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chBalances);
      supabase.removeChannel(chProfile);
      supabase.removeChannel(chWallet);
    };
  }, [user?.id]);

  // ---------- acciones de auth ----------
  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data?.user?.id) await loadAll(data.user.id);
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

      // crear fila de perfil + balance
      if (userId) {
        const referralCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        const { error: pErr } = await supabase.from('profiles').insert({
          id: userId,
          username: name || email.split('@')[0],
          referred_by: referredBy || null,
          referral_code: referralCode,
        });
        if (pErr) throw pErr;
        await fetchOrCreateBalances(userId);
      }

      toast({ title: '¡Registro exitoso!', description: 'Te enviamos un correo para verificar tu cuenta.' });
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
    setBalances({ usdc: 0, demo_balance: 0, balance: 0 });
    setInvestments([]);
    setTransactions([]);
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
      toast({ title: 'Error al actualizar', description: error.message, variant: 'destructive' });
      return;
    }
    fetchProfile(user.id);
    toast({ title: 'Datos actualizados', description: 'Tu perfil ha sido actualizado.' });
  };

  // ---------- operaciones atómicas ----------
  // Compra de plan: usa la RPC process_plan_purchase (SQL que te pasé)
  const buyPlan = async ({ planName, amount, dailyReturnPercent, durationDays }) => {
    if (!user?.id) throw new Error('Usuario no autenticado');

    const { data, error } = await supabase.rpc('process_plan_purchase', {
      p_plan_name: planName,
      p_amount: Number(amount),
      p_daily_return_percent: Number(dailyReturnPercent || 0),
      p_duration_days: Number(durationDays || 0),
      p_currency: 'USDT',
    });

    if (error || !data?.ok) {
      throw new Error(data?.message || error?.message || 'No se pudo procesar la inversión');
    }

    // refrescar datasets que usa la UI
    await Promise.allSettled([refreshBalances(), loadInvestments(), loadTransactions()]);
    toast({
      title: '¡Inversión exitosa!',
      description: `Plan ${planName} por $${Number(amount).toFixed(2)} creado.`,
    });
    return data;
  };

  // (opcional) trade demo: no toca saldo
  const executeTradeDemo = async ({ symbol, side, size, price }) => {
    if (!user?.id) throw new Error('Usuario no autenticado');
    const { data, error } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        mode: 'demo',
        symbol,
        side, // 'buy' | 'sell'
        size: Number(size),
        price: Number(price),
        cost: (side === 'buy' ? 1 : -1) * Number(size) * Number(price),
        pnl: 0,
        status: 'open',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  // ---------- derivados ----------
  const displayName =
    profile?.username ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split('@')[0] : 'Usuario');

  return (
    <AuthContext.Provider
      value={{
        // estado
        user,
        profile,
        balances,
        investments,
        transactions,
        isAuthenticated,
        loading,
        displayName,
        // auth
        login,
        register,
        logout,
        updateUser,
        // lecturas
        refreshBalances,
        loadInvestments,
        loadTransactions,
        // mutaciones
        buyPlan,
        executeTradeDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
