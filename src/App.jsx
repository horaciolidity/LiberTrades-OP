import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
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
import ProtectedRoute, { GuestRoute } from '@/routes/ProtectedRoute';

// 🆕 Import del nuevo panel de verificación KYC
import AdminKycPage from '@/pages/admin/AdminKycPage';

export default function App() {
  return (
    <Router>
      <DataProvider>
        <Toaster />

        <Routes>
          {/* RUTAS PÚBLICAS */}
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <RegisterPage />
              </GuestRoute>
            }
          />

          {/* RUTAS PRIVADAS (USUARIOS AUTENTICADOS) */}
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
              {/* Fallback privado */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>

          {/* RUTAS ADMIN */}
          <Route element={<ProtectedRoute adminOnly />}>
            <Route element={<Layout />}>
              <Route path="/admin" element={<AdminDashboard />} />
              {/* 🆕 Nueva ruta: panel de verificación KYC */}
              <Route path="/admin/kyc" element={<AdminKycPage />} />
            </Route>
          </Route>

          {/* Fallback público (no logueado) */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </DataProvider>
    </Router>
  );
}
