import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';

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
    const storedUser = localStorage.getItem('cryptoinvest_user');
    if (storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      // Simular autenticación
      const users = JSON.parse(localStorage.getItem('cryptoinvest_users') || '[]');
      const foundUser = users.find(u => u.email === email && u.password === password);
      
      if (!foundUser) {
        throw new Error('Credenciales inválidas');
      }

      const userData = {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        role: foundUser.role || 'user',
        balance: foundUser.balance || 0,
        referralCode: foundUser.referralCode,
        referredBy: foundUser.referredBy,
        createdAt: foundUser.createdAt
      };

      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem('cryptoinvest_user', JSON.stringify(userData));
      
      toast({
        title: "¡Bienvenido!",
        description: "Has iniciado sesión exitosamente",
      });

      return userData;
    } catch (error) {
      toast({
        title: "Error de autenticación",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const register = async (userData) => {
    try {
      const users = JSON.parse(localStorage.getItem('cryptoinvest_users') || '[]');
      
      // Verificar si el email ya existe
      if (users.find(u => u.email === userData.email)) {
        throw new Error('El email ya está registrado');
      }

      const newUser = {
        id: Date.now().toString(),
        ...userData,
        balance: 0,
        role: 'user',
        referralCode: generateReferralCode(),
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      localStorage.setItem('cryptoinvest_users', JSON.stringify(users));

      // Procesar referido si existe
      if (userData.referredBy) {
        const referrer = users.find(u => u.referralCode === userData.referredBy);
        if (referrer) {
          // Agregar bonus de referido
          referrer.balance += 50; // $50 bonus por referido
          localStorage.setItem('cryptoinvest_users', JSON.stringify(users));
        }
      }

      const userForAuth = {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        balance: newUser.balance,
        referralCode: newUser.referralCode,
        referredBy: newUser.referredBy,
        createdAt: newUser.createdAt
      };

      setUser(userForAuth);
      setIsAuthenticated(true);
      localStorage.setItem('cryptoinvest_user', JSON.stringify(userForAuth));

      toast({
        title: "¡Registro exitoso!",
        description: "Tu cuenta ha sido creada correctamente",
      });

      return userForAuth;
    } catch (error) {
      toast({
        title: "Error de registro",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('cryptoinvest_user');
    toast({
      title: "Sesión cerrada",
      description: "Has cerrado sesión exitosamente",
    });
  };

  const updateUser = (updatedData) => {
    const newUserData = { ...user, ...updatedData };
    setUser(newUserData);
    localStorage.setItem('cryptoinvest_user', JSON.stringify(newUserData));
    
    // Actualizar en la lista de usuarios también
    const users = JSON.parse(localStorage.getItem('cryptoinvest_users') || '[]');
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], ...updatedData };
      localStorage.setItem('cryptoinvest_users', JSON.stringify(users));
    }
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