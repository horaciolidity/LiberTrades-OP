import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { useAuth } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
// Si querés silencio total, podés quitar SoundProvider o dejarlo comentado.
// import { SoundProvider } from '@/contexts/SoundContext';

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

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) return <div className="text-white p-6">Cargando sesión...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return children;
}

export default function App() {
  return (
    <Router>
      <DataProvider>
        {/* <SoundProvider> */}
        <Layout>
          <Toaster />
          <Routes>
            {/* públicas */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* privadas */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
            <Route path="/simulator" element={<ProtectedRoute><TradingSimulator /></ProtectedRoute>} />
            <Route path="/plans" element={<ProtectedRoute><InvestmentPlans /></ProtectedRoute>} />
            <Route path="/referrals" element={<ProtectedRoute><ReferralSystem /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><TransactionHistory /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/deposit" element={<ProtectedRoute><DepositPage /></ProtectedRoute>} />
            <Route path="/tokenized-projects" element={<ProtectedRoute><TokenizedProjectsPage /></ProtectedRoute>} />
            <Route path="/trading-bots" element={<ProtectedRoute><TradingBotsPage /></ProtectedRoute>} />
            <Route path="/stats" element={<ProtectedRoute><UserStatsPage /></ProtectedRoute>} />
            <Route path="/rewards" element={<ProtectedRoute><RewardsPage /></ProtectedRoute>} />
            <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
        {/* </SoundProvider> */}
      </DataProvider>
    </Router>
  );
}
