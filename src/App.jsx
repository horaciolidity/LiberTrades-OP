import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { useAuth } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import Layout from '@/components/Layout';

import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import Dashboard from '@/pages/Dashboard';
import AdminDashboard from '@/pages/AdminDashboard';
import TradingSimulator from '@/pages/TradingSimulator';
import InvestmentPlans from '@/pages/InvestmentPlans';
import ReferralSystem from '@/pages/ReferralSystem';
import TransactionHistory from '@/pages/TransactionHistory';
import Profile from '@/pages/Profile';
import DepositPage from '@/pages/DepositPage';
import TokenizedProjectsPage from '@/pages/TokenizedProjectsPage';
import TradingBotsPage from '@/pages/TradingBotsPage';
import UserStatsPage from '@/pages/UserStatsPage';
import RewardsPage from '@/pages/RewardsPage';
import WalletPage from '@/pages/WalletPage';

function FullScreenLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-900">
      <div className="text-slate-200">Cargando…</div>
    </div>
  );
}

function ProtectedRoute({ adminOnly = false }) {
  const { user, profile, isAuthenticated, loading } = useAuth();

  // Mostrar loader sólo en rutas PRIVADAS
  if (loading) return <FullScreenLoader />;

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (adminOnly) {
    const isAdmin =
      profile?.role === 'admin' ||
      user?.user_metadata?.role === 'admin' ||
      user?.email === 'admin@test.com';
    if (!isAdmin) return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

/** IMPORTANTE:
 * En /login y /register NO bloqueamos por "loading".
 * Si ya estás autenticado, redirigimos.
 * Si no, mostramos el formulario aunque loading sea true.
 */
function RedirectIfAuth({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <Router>
      <DataProvider>
        <Toaster />

        <Routes>
          {/* públicas */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
          <Route path="/register" element={<RedirectIfAuth><RegisterPage /></RedirectIfAuth>} />

          {/* privadas */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/simulator" element={<TradingSimulator />} />
              <Route path="/plans" element={<InvestmentPlans />} />
              <Route path="/referrals" element={<ReferralSystem />} />
              <Route path="/history" element={<TransactionHistory />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/deposit" element={<DepositPage />} />
              <Route path="/tokenized-projects" element={<TokenizedProjectsPage />} />
              <Route path="/trading-bots" element={<TradingBotsPage />} />
              <Route path="/stats" element={<UserStatsPage />} />
              <Route path="/rewards" element={<RewardsPage />} />
              <Route path="/wallet" element={<WalletPage />} />
            </Route>
          </Route>

          {/* admin */}
          <Route element={<ProtectedRoute adminOnly />}>
            <Route element={<Layout />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Route>

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DataProvider>
    </Router>
  );
}
