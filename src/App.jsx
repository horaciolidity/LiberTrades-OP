import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
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


function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAuthenticated } = useAuth();
  
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
    <AuthProvider>
      <DataProvider>
        <SoundProvider>
          <Router>
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route 
                  path="/dashboard" 
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/admin" 
                  element={
                    <ProtectedRoute adminOnly>
                      <AdminDashboard />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/trading" 
                  element={
                    <ProtectedRoute>
                      <TradingSimulator />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/plans" 
                  element={
                    <ProtectedRoute>
                      <InvestmentPlans />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/referrals" 
                  element={
                    <ProtectedRoute>
                      <ReferralSystem />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/history" 
                  element={
                    <ProtectedRoute>
                      <TransactionHistory />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/profile" 
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  } 
                />
                <Route 
                  path="/deposit"
                  element={
                    <ProtectedRoute>
                      <DepositPage />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/tokenized-projects"
                  element={
                    <ProtectedRoute>
                      <TokenizedProjectsPage />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/trading-bots"
                  element={
                    <ProtectedRoute>
                      <TradingBotsPage />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/stats"
                  element={
                    <ProtectedRoute>
                      <UserStatsPage />
                    </ProtectedRoute>
                  }
                />
                <Route 
                  path="/rewards"
                  element={
                    <ProtectedRoute>
                      <RewardsPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
              <Toaster />
            </div>
          </Router>
        </SoundProvider>
      </DataProvider>
    </AuthProvider>
  );
}

export default App;