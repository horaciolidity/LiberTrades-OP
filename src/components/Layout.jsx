// src/layout/Layout.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  TrendingUp,
  Wallet as WalletIcon,
  Users,
  History,
  User,
  LogOut,
  Menu,
  X,
  Shield,
  Gift,
  Coins,
  BarChartHorizontalBig,
  Bot,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { ethers } from 'ethers';
import { toast } from '@/components/ui/use-toast';

// Helper numérico seguro
const fmt = (n, dec = 2) => {
  const num = Number(n);
  if (!isFinite(num)) return '0.00';
  return num.toFixed(dec);
};

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { profile, balances, displayName, logout, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const playSound = () => {};

  const [web3Account, setWeb3Account] = useState(null);
  const [ethBalance, setEthBalance] = useState('0.00');
  const [usdtBalance, setUsdtBalance] = useState('0.00');

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Estadísticas', href: '/stats', icon: BarChartHorizontalBig },
    { name: 'Depositar', href: '/deposit', icon: DollarSign },
    { name: 'Wallet', href: '/wallet', icon: WalletIcon, showBalance: true },
    { name: 'Trading', href: '/simulator', icon: TrendingUp },
    { name: 'Bots de Trading', href: '/trading-bots', icon: Bot },
    { name: 'Planes de Inversión', href: '/plans', icon: WalletIcon },
    { name: 'Proyectos Tokenizados', href: '/tokenized-projects', icon: Coins },
    { name: 'Referidos', href: '/referrals', icon: Users },
    { name: 'Historial', href: '/history', icon: History },
    { name: 'Recompensas', href: '/rewards', icon: Gift },
    { name: 'Perfil', href: '/profile', icon: User },
  ];

  if (profile?.role === 'admin') {
    navigation.unshift({ name: 'Admin Panel', href: '/admin', icon: Shield });
  }

  const handleLogout = () => {
    playSound('logout');
    logout();
    navigate('/');
  };

  const handleLinkClick = (path) => {
    playSound('navigation');
    setSidebarOpen(false);
    navigate(path);
  };

  const connectWallet = async () => {
    playSound('click');
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send('eth_requestAccounts', []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setWeb3Account(address);
        updateUser?.({ web3Wallet: address });
        toast({
          title: 'Wallet Conectada',
          description: `Cuenta: ${address.slice(0, 6)}...${address.slice(-4)}`
        });
        fetchBalances(provider, address);
      } catch (error) {
        console.error('Error conectando wallet:', error);
        toast({
          title: 'Error de Wallet',
          description: 'No se pudo conectar la wallet. Intenta de nuevo.',
          variant: 'destructive'
        });
      }
    } else {
      toast({
        title: 'MetaMask no detectado',
        description: 'Instalá MetaMask para usar esta función.',
        variant: 'destructive'
      });
    }
  };

  const fetchBalances = async (provider, account) => {
    try {
      const ethBal = await provider.getBalance(account);
      setEthBalance(ethers.formatEther(ethBal));

      const usdtContractAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
      const usdtAbi = ['function balanceOf(address owner) view returns (uint256)'];
      const usdtContract = new ethers.Contract(usdtContractAddress, usdtAbi, provider);
      const usdtBal = await usdtContract.balanceOf(account);
      setUsdtBalance(ethers.formatUnits(usdtBal, 6));
    } catch (error) {
      console.error('Error obteniendo balances:', error);
      toast({
        title: 'Error de Balance',
        description: 'No se pudieron obtener los balances de la wallet.',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    console.log('Layout montado');
  }, []);

  const shortAddr = web3Account ? `${web3Account.slice(0, 6)}...${web3Account.slice(-4)}` : '';

  return (
    <div className="min-h-screen app-bg-saiyan">
      {/* Sidebar mobile */}
      <motion.div
        initial={false}
        animate={{ x: sidebarOpen ? 0 : '-100%' }}
        className="fixed inset-y-0 left-0 z-50 w-64 bg-slate-800/95 backdrop-blur-xl border-r border-slate-700 lg:hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4">
          <span className="text-xl font-bold brand-title">LiberTrades</span>
          <Button variant="ghost" size="icon" onClick={() => { playSound('click'); setSidebarOpen(false); }}>
            <X className="h-6 w-6" />
          </Button>
        </div>

        {/* navegación */}
        <nav className="mt-8 px-4 flex-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.href);
            return (
              <button
                key={item.name}
                onClick={() => handleLinkClick(item.href)}
                className={`w-full flex items-center px-4 py-3 mb-2 rounded-lg transition-all ${
                  isActive ? 'btn-ss5 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 mr-3" />
                <span>{item.name}</span>
                {item.showBalance && (
                  <span className="ml-auto text-xs rounded px-2 py-0.5 bg-slate-700">
                    ${fmt(balances?.usdc ?? 0, 2)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* botón logout (MOBILE) */}
        <div className="p-4 border-t border-slate-700">
          <Button
            onClick={() => { handleLogout(); setSidebarOpen(false); }}
            variant="outline"
            className="w-full justify-start"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </motion.div>

      {/* Sidebar desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-slate-800/95 backdrop-blur-xl border-r border-slate-700">
          <div className="flex items-center h-16 px-4">
            <span className="text-xl font-bold brand-title">LiberTrades</span>
          </div>

          <nav className="mt-8 flex-1 px-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.href);
              return (
                <button
                  key={item.name}
                  onClick={() => handleLinkClick(item.href)}
                  className={`w-full flex items-center px-4 py-3 mb-2 rounded-lg transition-all ${
                    isActive ? 'btn-ss5 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  <span>{item.name}</span>
                  {item.showBalance && (
                    <span className="ml-auto text-xs rounded px-2 py-0.5 bg-slate-700">
                      ${fmt(balances?.usdc ?? 0, 2)}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-4">
            <Button onClick={handleLogout} variant="outline" className="w-full justify-start">
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>

      {/* Topbar + content */}
      <div className="lg:pl-64">
        <div className="sticky top-0 z-40 flex h-16 items-center gap-x-4 border-b border-slate-700 bg-slate-900/90 backdrop-blur-xl px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          
          {/* Logo y título */}
          <div className="flex items-center gap-3">
            <img src="/logo-libertrades.png" alt="LiberTrades Logo" className="h-8" />
            <span className="text-lg font-bold text-white tracking-wide">LiberTrades OP</span>
          </div>

          {/* resto de elementos */}
          <div className="flex flex-1 gap-x-4 justify-end items-center">
            {web3Account ? (
              <div className="text-sm text-slate-300">
                <p>ETH: <span className="font-semibold text-yellow-400">{fmt(ethBalance, 4)}</span></p>
                <p>USDT: <span className="font-semibold text-green-400">{fmt(usdtBalance, 2)}</span></p>
                <p className="text-xs text-slate-500">Wallet: {shortAddr}</p>
              </div>
            ) : (
              <Button onClick={connectWallet} size="sm" className="bg-blue-500 hover:bg-blue-600">
                Conectar Wallet
              </Button>
            )}
            <div className="text-sm text-slate-300">
              Saldo App: <span className="font-semibold text-green-400">${fmt(balances?.usdc, 2)}</span>
            </div>
          </div>
        </div>

        <main className="py-10">
          <div className="px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => { playSound('click'); setSidebarOpen(false); }}
        />
      )}
    </div>
  );
};

export default Layout;
