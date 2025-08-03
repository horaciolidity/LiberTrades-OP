import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const loadSession = async () => {
    try {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("Error al obtener sesión:", error.message);
        return;
      }

      const session = sessionData?.session;
      if (!session?.user) {
        console.log("No hay sesión activa.");
        setIsAuthenticated(false);
        setUser(null);
      } else {
        setUser(session.user);
        setIsAuthenticated(true);
        console.log("Sesión activa:", session.user.email);
      }
    } catch (err) {
      console.error("Error inesperado al cargar la sesión:", err);
    } finally {
      setLoading(false);
    }
  };

  loadSession();

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
    setIsAuthenticated(!!session?.user);
  });

  return () => {
    listener?.subscription?.unsubscribe?.();
  };
}, []);


  const login = async (email, password) => {
    try {
      const { error, data } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      await loadUserSession(data.user.id);

      toast({
        title: "¡Bienvenido!",
        description: "Has iniciado sesión exitosamente",
      });

      return data.user;
    } catch (error) {
      toast({
        title: "Error de autenticación",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const register = async ({ email, password, name, referredBy }) => {
    try {
      const { error, data } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      const userId = data.user.id;
      const referralCode = generateReferralCode();

      const { error: profileError } = await supabase.from('profiles').insert({
        id: userId,
        username: name,
        referred_by: referredBy || null,
        referral_code: referralCode,
      });

      if (profileError) throw profileError;

      toast({
        title: "¡Registro exitoso!",
        description: "Tu cuenta ha sido creada correctamente",
      });

      await loadUserSession(userId);
      return data.user;
    } catch (error) {
      toast({
        title: "Error de registro",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const loadUserSession = async (userId) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const { data: balance } = await supabase
        .from('balances')
        .select('*')
        .eq('user_id', userId)
        .single();

      setUser((prev) => ({
        ...prev,
        ...profile,
        balance: balance?.amount ?? 0,
        demo_balance: balance?.demo_amount ?? 0
      }));

      setIsAuthenticated(true);
    } catch (error) {
      console.error("Error al cargar datos del usuario:", error.message);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión exitosamente",
    });
  };

  const updateUser = async (updatedData) => {
    const { error } = await supabase
      .from('profiles')
      .update(updatedData)
      .eq('id', user.id);

    if (error) {
      toast({
        title: 'Error al actualizar usuario',
        description: error.message,
        variant: 'destructive'
      });
      return;
    }

    setUser((prev) => ({ ...prev, ...updatedData }));
    toast({
      title: 'Datos actualizados',
      description: 'Tu perfil ha sido actualizado exitosamente'
    });
  };

  const generateReferralCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    register,
    logout,
    updateUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
