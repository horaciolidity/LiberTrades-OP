import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

function FullScreenLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-900 text-slate-200">
      Cargando…
    </div>
  );
}

/** Protege rutas privadas. */
export default function ProtectedRoute({ adminOnly = false }) {
  const { user, profile, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // Loader SOLO para privadas
  if (loading) return <FullScreenLoader />;

  // Si no hay sesión → login (recordamos de dónde venía)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Admin
  if (adminOnly) {
    const isAdmin =
      profile?.role === 'admin' ||
      user?.user_metadata?.role === 'admin' ||
      user?.email === 'admin@test.com';
    if (!isAdmin) return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

/** Permite ver login/register incluso si loading=true; redirige si ya hay sesión. */
export function GuestRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}
