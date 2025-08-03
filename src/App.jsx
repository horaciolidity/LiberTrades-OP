import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { useAuth } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import { SoundProvider } from '@/contexts/SoundContext';

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

  if (loading) {
    return <div className="text-white p-6">Cargando sesión...</div>; // spinner temporal
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function App() {
 return (
  <DataProvider>
    <SoundProvider>
      <Toaster />
      {(() => {
        try {
          return (
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/simulator" element={<TradingSimulator />} />
              <Route path="/plans" element={<InvestmentPlans />} />
              <Route path="/referrals" element={<ReferralSystem />} />
              <Route path="/history" element={<TransactionHistory />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/deposit" element={<DepositPage />} />
              <Route path="/tokens" element={<TokenizedProjectsPage />} />
              <Route path="/bots" element={<TradingBotsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          );
        } catch (err) {
          console.error("Error renderizando rutas:", err);
          return <div style={{ color: "red", padding: 20 }}>⚠️ Ocurrió un error cargando la app</div>;
        }
      })()}
    </SoundProvider>
  </DataProvider>
);

}

export default App;
