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
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn('getSession error:', error.message);

        const session = data?.session ?? null;
        if (!mounted) return;
        setUser(session?.user ?? null);
        setIsAuthenticated(!!session?.user);
      } catch (e) {
        console.error('Error inesperado al cargar la sesión:', e);
        if (mounted) {
          setUser(null);
          setIsAuthenticated(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsAuthenticated(!!session?.user);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const loadUserSession = async (userId) => {
    try {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (profileErr) console.warn('Perfil:', profileErr.message);

      const { data: balance, error: balanceErr } = await supabase
        .from('balances')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (balanceErr) console.warn('Balance:', balanceErr.message);

      setUser((prev) => ({
        ...(prev || {}),
        ...(profile || {}),
        balance: balance?.amount ?? 0,
        demo_balance: balance?.demo_amount ?? 0,
        id: userId,
      }));
      setIsAuthenticated(true);
    } catch (e) {
      console.error('Error al cargar datos del usuario:', e);
    }
  };

  const generateReferralCode = () =>
    Math.random().toString(36).substring(2, 8).toUpperCase();

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const userId = data?.user?.id;
      if (userId) await loadUserSession(userId);
      toast({ title: '¡Bienvenido!', description: 'Has iniciado sesión exitosamente' });
      return data.user ?? null;
    } catch (error) {
      toast({ title: 'Error de autenticación', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const register = async ({ email, password, name, referredBy }) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      const userId = data?.user?.id; // puede venir null si requiere verificación por email
      const referralCode = generateReferralCode();

      if (userId) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: userId,
          username: name,
          referred_by: referredBy || null,
          referral_code: referralCode,
        });
        if (profileError) throw profileError;
        await loadUserSession(userId);
      }

      toast({
        title: '¡Registro exitoso!',
        description: userId ? 'Tu cuenta ha sido creada correctamente.' : 'Revisa tu correo para confirmar la cuenta.',
      });

      return data.user ?? null;
    } catch (error) {
      toast({ title: 'Error de registro', description: error.message, variant: 'destructive' });
      throw error;
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
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
    setUser((prev) => ({ ...prev, ...updatedData }));
    toast({ title: 'Datos actualizados', description: 'Tu perfil ha sido actualizado exitosamente' });
  };

  const value = { user, isAuthenticated, loading, login, register, logout, updateUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
