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

function ProtectedRoute({ adminOnly = false }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return <div className="text-white p-6">Cargando sesión...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}

export default function App() {
  return (
    <Router>
      <DataProvider>
        <Toaster />

        <Routes>
          {/* Rutas públicas */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Rutas protegidas con Layout */}
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

          {/* Ruta admin con Layout */}
          <Route element={<ProtectedRoute adminOnly />}>
            <Route element={<Layout />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </DataProvider>
    </Router>
  );
}
