import { useState, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';

export const useTradingLogic = () => {
  const { cryptoPrices } = useData();
  const { user } = useAuth();
  
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeType, setTradeType] = useState('buy');
  const [tradeDuration, setTradeDuration] = useState(60); // en segundos
  const [isTrading, setIsTrading] = useState(false);
  const [trades, setTrades] = useState([]);
  const [virtualBalance, setVirtualBalance] = useState(10000);

  const priceHistory = cryptoPrices[selectedPair.split('/')[0]]?.history || [];

  // Cargar historial virtual desde localStorage
  useEffect(() => {
    if (user) {
      const savedTrades = JSON.parse(localStorage.getItem(`trading_iq_${user.id}`) || '[]');
      const savedBalance = localStorage.getItem(`virtual_balance_iq_${user.id}`);
      setTrades(savedTrades || []);
      if (savedBalance) setVirtualBalance(parseFloat(savedBalance));
    }
  }, [user]);

  // Guardar cambios del modo demo
  useEffect(() => {
    if (user) {
      localStorage.setItem(`trading_iq_${user.id}`, JSON.stringify(trades));
      localStorage.setItem(`virtual_balance_iq_${user.id}`, virtualBalance.toString());
    }
  }, [trades, virtualBalance, user]);

  const executeTrade = useCallback(() => {
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) {
      toast({ title: "Error", description: "Ingresa un monto válido", variant: "destructive" });
      return;
    }

    const crypto = selectedPair.split('/')[0];
    const currentPrice = cryptoPrices[crypto]?.price;

    if (!currentPrice) {
      toast({ title: "Error", description: "No se pudo obtener el precio actual", variant: "destructive" });
      return;
    }

    if (amount > virtualBalance) {
      toast({ title: "Fondos insuficientes", description: "No tienes suficiente saldo virtual", variant: "destructive" });
      return;
    }

    setIsTrading(true);
    setVirtualBalance(prev => prev - amount);

    const newTrade = {
      id: Date.now().toString(),
      pair: selectedPair,
      type: tradeType,
      amount,
      priceAtExecution: currentPrice,
      timestamp: Date.now(),
      duration: tradeDuration * 1000,
      closeAt: Date.now() + tradeDuration * 1000,
      status: 'open',
      profit: 0,
    };

    setTrades(prev => [newTrade, ...prev]);
    setIsTrading(false);

    toast({
      title: "Trade abierto",
      description: `${tradeType.toUpperCase()} ${amount} ${crypto} a $${currentPrice.toFixed(2)}`
    });
  }, [tradeAmount, selectedPair, cryptoPrices, virtualBalance, tradeType, tradeDuration]);

  const closeTrade = useCallback((tradeId, manual = false) => {
    setTrades(prev =>
      prev.map(trade => {
        if (trade.id === tradeId && trade.status === 'open') {
          const crypto = trade.pair.split('/')[0];
          const currentPrice = cryptoPrices[crypto]?.price;

          if (!currentPrice) {
            toast({ title: "Error", description: "No se pudo obtener el precio de cierre", variant: "destructive" });
            return trade;
          }

          let profit = 0;
          if (trade.type === 'buy') {
            profit = (currentPrice - trade.priceAtExecution) / trade.priceAtExecution * trade.amount;
          } else {
            profit = (trade.priceAtExecution - currentPrice) / trade.priceAtExecution * trade.amount;
          }

          setVirtualBalance(prev => prev + trade.amount + profit);

          toast({
            title: `Trade cerrado ${manual ? '(Manual)' : ''}`,
            description: `Ganancia/Pérdida: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`,
            variant: profit >= 0 ? "default" : "destructive"
          });

          return { ...trade, status: 'closed', profit, priceAtClose: currentPrice };
        }
        return trade;
      })
    );
  }, [cryptoPrices]);

  useEffect(() => {
    const interval = setInterval(() => {
      trades.forEach(t => {
        if (t.status === 'open' && Date.now() >= t.closeAt) {
          closeTrade(t.id);
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [trades, closeTrade]);

  const resetBalance = () => {
    setVirtualBalance(10000);
    setTrades([]);
    toast({ title: "Balance reiniciado", description: "Tu saldo demo volvió a $10,000" });
  };

  const totalProfit = trades.filter(t => t.status === 'closed').reduce((sum, t) => sum + t.profit, 0);
  const openTrades = trades.filter(t => t.status === 'open');

  return {
    selectedPair, setSelectedPair,
    tradeAmount, setTradeAmount,
    tradeType, setTradeType,
    tradeDuration, setTradeDuration,
    isTrading,
    trades,
    virtualBalance,
    priceHistory,
    executeTrade,
    closeTrade,
    resetBalance,
    totalProfit,
    openTrades,
    cryptoPrices
  };
};
