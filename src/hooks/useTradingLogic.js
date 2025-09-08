// src/hooks/useTradingLogic.js
import { useState, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const useTradingLogic = () => {
  const { cryptoPrices } = useData();
  const { user } = useAuth();

  // --------- Estado principal (demo) ----------
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [tradeAmount, setTradeAmount] = useState('100');  // string para no trabar el <Input />
  const [tradeType, setTradeType] = useState('buy');      // 'buy' | 'sell'
  const [tradeDuration, setTradeDuration] = useState(60); // segundos
  const [isTrading, setIsTrading] = useState(false);
  const [trades, setTrades] = useState([]);
  const [virtualBalance, setVirtualBalance] = useState(10000);

  // Historial para el gráfico
  const base = (selectedPair.split?.('/')?.[0] || 'BTC').toUpperCase();
  const priceHistory = Array.isArray(cryptoPrices?.[base]?.history)
    ? cryptoPrices[base].history
    : [];

  // --------- Carga/persistencia local (por usuario) ----------
  useEffect(() => {
    if (!user?.id) return;
    try {
      const savedTrades = JSON.parse(localStorage.getItem(`trading_iq_${user.id}`) || '[]');
      const savedBalance = localStorage.getItem(`virtual_balance_iq_${user.id}`);
      if (Array.isArray(savedTrades)) setTrades(savedTrades);
      if (savedBalance != null) setVirtualBalance(num(savedBalance));
    } catch {
      // ignore
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(`trading_iq_${user.id}`, JSON.stringify(trades));
    localStorage.setItem(`virtual_balance_iq_${user.id}`, String(virtualBalance));
  }, [trades, virtualBalance, user?.id]);

  // --------- Abrir trade desde el panel (usa estado actual) ----------
  const executeTrade = useCallback(() => {
    const amount = num(tradeAmount);
    if (!amount || amount <= 0) {
      toast({ title: 'Error', description: 'Ingresa un monto válido', variant: 'destructive' });
      return;
    }

    const baseSym = (selectedPair.split?.('/')?.[0] || 'BTC').toUpperCase();
    const currentPrice = num(cryptoPrices?.[baseSym]?.price);
    if (!currentPrice) {
      toast({ title: 'Error', description: 'No se pudo obtener el precio actual', variant: 'destructive' });
      return;
    }

    if (amount > virtualBalance) {
      toast({ title: 'Fondos insuficientes', description: 'No tienes suficiente saldo virtual', variant: 'destructive' });
      return;
    }

    const durSec = Math.max(1, num(tradeDuration) || 60);

    setIsTrading(true);
    setVirtualBalance((prev) => Math.max(0, prev - amount));

    const now = Date.now();
    const newTrade = {
      id: String(now),
      pair: selectedPair,
      type: tradeType,
      amount,
      priceAtExecution: currentPrice,
      timestamp: now,
      duration: durSec * 1000,     // ms (legacy)
      durationSeconds: durSec,     // compat nuevo UI
      closeAt: now + durSec * 1000,
      status: 'open',
      profit: 0,
    };

    setTrades((prev) => [newTrade, ...prev]);
    setIsTrading(false);

    toast({
      title: 'Trade abierto',
      description: `${tradeType.toUpperCase()} $${amount.toFixed(2)} ${baseSym} a $${currentPrice.toFixed(2)}`,
    });
  }, [tradeAmount, selectedPair, cryptoPrices, virtualBalance, tradeType, tradeDuration]);

  // --------- Apertura programática (compatibilidad con tu UI) ----------
  //    openTrade({ pair?, type?, amount?, priceAtExecution?, duration? })
  const openTrade = useCallback(
    (opts = {}) => {
      const nextPair = opts.pair || selectedPair;
      const nextType = (opts.type || tradeType);
      const nextAmount = num(opts.amount ?? tradeAmount);

      const baseSym = (nextPair.split?.('/')?.[0] || 'BTC').toUpperCase();
      const currentPrice = num(opts.priceAtExecution ?? cryptoPrices?.[baseSym]?.price);
      if (!currentPrice || !nextAmount) return;

      if (nextAmount > virtualBalance) {
        toast({ title: 'Fondos insuficientes', description: 'No tienes suficiente saldo virtual', variant: 'destructive' });
        return;
      }

      const durSec = Math.max(1, num(opts.duration ?? tradeDuration) || 60);

      setVirtualBalance((prev) => Math.max(0, prev - nextAmount));

      const now = Date.now();
      const newTrade = {
        id: String(now),
        pair: nextPair,
        type: nextType,
        amount: nextAmount,
        priceAtExecution: currentPrice,
        timestamp: now,
        duration: durSec * 1000,   // ms (legacy)
        durationSeconds: durSec,   // compat nuevo UI
        closeAt: now + durSec * 1000,
        status: 'open',
        profit: 0,
      };

      setTrades((prev) => [newTrade, ...prev]);

      toast({
        title: 'Trade abierto',
        description: `${String(nextType).toUpperCase()} $${nextAmount.toFixed(2)} ${baseSym} a $${currentPrice.toFixed(2)}`,
      });
    },
    [cryptoPrices, selectedPair, tradeType, tradeAmount, tradeDuration, virtualBalance]
  );

  // --------- Cerrar trade (firma robusta) ----------
  // Admite:
  //   closeTrade(id, manual:boolean)           <-- legacy
  //   closeTrade(id, closePrice:number, force) <-- nuevo (TradesHistory/Simulator)
  const closeTrade = useCallback(
    (tradeId, arg2 = null /* closePrice | manual */, _force = true) => {
      let manual = false;
      let providedClosePrice = null;

      if (typeof arg2 === 'number' && Number.isFinite(arg2)) {
        providedClosePrice = Number(arg2);
      } else if (typeof arg2 === 'boolean') {
        manual = arg2;
      }

      setTrades((prev) =>
        prev.map((t) => {
          if (t.id !== tradeId || t.status !== 'open') return t;

          const baseSym = (t.pair.split?.('/')?.[0] || 'BTC').toUpperCase();
          const live = num(cryptoPrices?.[baseSym]?.price);
          const currentPrice = Number.isFinite(providedClosePrice) ? providedClosePrice : live;
          if (!currentPrice) return t;

          const pnlPct =
            t.type === 'buy'
              ? (currentPrice - t.priceAtExecution) / t.priceAtExecution
              : (t.priceAtExecution - currentPrice) / t.priceAtExecution;

          const profit = pnlPct * t.amount;
          setVirtualBalance((prevBal) => prevBal + t.amount + profit);

          toast({
            title: `Trade cerrado ${manual ? '(Manual)' : ''}`,
            description: `Ganancia/Pérdida: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`,
            variant: profit >= 0 ? 'default' : 'destructive',
          });

          return {
            ...t,
            status: 'closed',
            profit,
            priceAtClose: currentPrice,
            closeprice: currentPrice, // alias para componentes que lo usen así
            closeAt: Date.now(),
          };
        })
      );
    },
    [cryptoPrices]
  );

  // --------- Autocierre por tiempo ----------
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      trades.forEach((t) => {
        if (t.status === 'open' && now >= t.closeAt) closeTrade(t.id);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [trades, closeTrade]);

  const resetBalance = () => {
    setVirtualBalance(10000);
    setTrades([]);
    toast({ title: 'Balance reiniciado', description: 'Tu saldo demo volvió a $10,000' });
  };

  const totalProfit = trades
    .filter((t) => t.status === 'closed')
    .reduce((s, t) => s + num(t.profit), 0);

  const openTrades = trades.filter((t) => t.status === 'open');

  return {
    // estado/controles
    selectedPair,
    setSelectedPair,
    tradeAmount,
    setTradeAmount,
    tradeType,
    setTradeType,
    tradeDuration,
    setTradeDuration,
    isTrading,

    // datos
    trades,
    openTrades,
    totalProfit,
    virtualBalance,
    priceHistory,
    cryptoPrices,

    // acciones
    executeTrade, // botones del panel
    openTrade,    // llamadas programáticas
    closeTrade,   // firma robusta
    resetBalance,
  };
};
