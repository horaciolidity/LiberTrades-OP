import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Wallet, 
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
import { useSound } from '@/contexts/SoundContext';
import { ethers } from 'ethers';
import { toast } from '@/components/ui/use-toast';


const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, updateUser } = useAuth();
  const { playSound } = useSound();
  const location = useLocation();
  const navigate = useNavigate();
  const [web3Account, setWeb3Account] = useState(null);
  const [ethBalance, setEthBalance] = useState('0.00');
  const [usdtBalance, setUsdtBalance] = useState('0.00');

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Estadísticas', href: '/stats', icon: BarChartHorizontalBig },
    { name: 'Depositar', href: '/deposit', icon: DollarSign },
    { name: 'Trading', href: '/trading', icon: TrendingUp },
    { name: 'Bots de Trading', href: '/trading-bots', icon: Bot },
    { name: 'Planes de Inversión', href: '/plans', icon: Wallet },
    { name: 'Proyectos Tokenizados', href: '/tokenized-projects', icon: Coins },
    { name: 'Referidos', href: '/referrals', icon: Users },
    { name: 'Historial', href: '/history', icon: History },
    { name: 'Recompensas', href: '/rewards', icon: Gift },
    { name: 'Perfil', href: '/profile', icon: User },
  ];

  if (user?.role === 'admin') {
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
    if (typeof window.ethereum !== 'undefined') {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setWeb3Account(address);
        updateUser({ web3Wallet: address });
        toast({ title: "Wallet Conectada", description: `Cuenta: ${address.substring(0,6)}...${address.substring(address.length - 4)}` });
        fetchBalances(provider, address);
      } catch (error) {
        console.error("Error conectando wallet:", error);
        toast({ title: "Error de Wallet", description: "No se pudo conectar la wallet. Intenta de nuevo.", variant: "destructive" });
      }
    } else {
      toast({ title: "MetaMask no detectado", description: "Por favor instala MetaMask para usar esta función.", variant: "destructive" });
    }
  };

  const fetchBalances = async (provider, account) => {
    try {
      const ethBal = await provider.getBalance(account);
      setEthBalance(ethers.formatEther(ethBal));

      const usdtContractAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // Mainnet USDT
      const usdtAbi = [ "function balanceOf(address owner) view returns (uint256)" ];
      const usdtContract = new ethers.Contract(usdtContractAddress, usdtAbi, provider);
      const usdtBal = await usdtContract.balanceOf(account);
      setUsdtBalance(ethers.formatUnits(usdtBal, 6)); // USDT has 6 decimals

    } catch (error) {
      console.error("Error obteniendo balances:", error);
      toast({ title: "Error de Balance", description: "No se pudieron obtener los balances de la wallet.", variant: "destructive" });
    }
  };

  useEffect(() => {
    if(user?.web3Wallet) {
      setWeb3Account(user.web3Wallet);
      if (typeof window.ethereum !== 'undefined') {
        const provider = new ethers.BrowserProvider(window.ethereum);
        fetchBalances(provider, user.web3Wallet);
      }
    }
  }, [user]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <motion.div
        initial={false}
        animate={{ x: sidebarOpen ? 0 : '-100%' }}
        className="fixed inset-y-0 left-0 z-50 w-64 bg-slate-800/95 backdrop-blur-xl border-r border-slate-700 lg:hidden"
      >
        <div className="flex items-center justify-between p-4">
          <span className="text-xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            CryptoInvest Pro
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { playSound('click'); setSidebarOpen(false); }}
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
        <nav className="mt-8 px-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <button
                key={item.name}
                onClick={() => handleLinkClick(item.href)}
                className={`w-full flex items-center px-4 py-3 mb-2 rounded-lg transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-green-500 to-blue-500 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 mr-3" />
                {item.name}
              </button>
            );
          })}
        </nav>
      </motion.div>

      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-slate-800/95 backdrop-blur-xl border-r border-slate-700">
          <div className="flex items-center h-16 px-4">
            <span className="text-xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              CryptoInvest Pro
            </span>
          </div>
          <nav className="mt-8 flex-1 px-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <button
                  key={item.name}
                  onClick={() => handleLinkClick(item.href)}
                  className={`w-full flex items-center px-4 py-3 mb-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-green-500 to-blue-500 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  {item.name}
                </button>
              );
            })}
          </nav>
          <div className="p-4">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full justify-start"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>

      <div className="lg:pl-64">
        <div className="sticky top-0 z-40 flex h-20 shrink-0 items-center gap-x-4 border-b border-slate-700 bg-slate-800/95 backdrop-blur-xl px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { playSound('click'); setSidebarOpen(true);}}
            className="lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </Button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1 items-center">
              <div className="text-sm text-slate-300">
                Bienvenido, <span className="font-semibold text-white">{user?.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {web3Account ? (
                <div className="text-sm text-slate-300">
                  <p>ETH: <span className="font-semibold text-yellow-400">{parseFloat(ethBalance).toFixed(4)}</span></p>
                  <p>USDT: <span className="font-semibold text-green-400">{parseFloat(usdtBalance).toFixed(2)}</span></p>
                  <p className="text-xs text-slate-500">Wallet: {web3Account.substring(0,6)}...{web3Account.substring(web3Account.length - 4)}</p>
                </div>
              ) : (
                <Button onClick={connectWallet} size="sm" className="bg-blue-500 hover:bg-blue-600">
                  Conectar Wallet
                </Button>
              )}
              <div className="text-sm text-slate-300">
                Saldo App: <span className="font-semibold text-green-400">${user?.balance?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </div>
        </div>

        <main className="py-10">
          <div className="px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => { playSound('click'); setSidebarOpen(false);}}
        />
      )}
    </div>
  );
};

export default Layout;