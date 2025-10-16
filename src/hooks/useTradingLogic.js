import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';

/* ---------------- Utilidades ---------------- */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round(v * 100) / 100;
const clampTiny = (v) => {
  if (v > 0 && v < 0.01) return 0.01;
  if (v < 0 && v > -0.01) return -0.01;
  return v;
};

/* ===================================================
   Hook principal de lógica de trading
   =================================================== */
export const useTradingLogic = () => {
  const { cryptoPrices, updateBalanceGlobal } = useData();
  const { user } = useAuth();

  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeType, setTradeType] = useState('buy');
  const [tradeDuration, setTradeDuration] = useState(60);
  const [isTrading, setIsTrading] = useState(false);
  const [trades, setTrades] = useState([]);
  const [virtualBalance, setVirtualBalance] = useState(10000);

  // Cambiar a false si se desea modo demo
  const IS_REAL_MODE = true;

  /* ---------------- Historial de precios ---------------- */
  const base = (selectedPair.split?.('/')?.[0] || 'BTC').toUpperCase();
  const priceHistory = Array.isArray(cryptoPrices?.[base]?.history)
    ? cryptoPrices[base].history
    : [];

  /* ---------------- Carga local ---------------- */
  useEffect(() => {
    if (!user?.id) return;
    try {
      const savedTrades = JSON.parse(localStorage.getItem(`trading_iq_${user.id}`) || '[]');
      const savedBalance = localStorage.getItem(`virtual_balance_iq_${user.id}`);
      if (Array.isArray(savedTrades)) setTrades(savedTrades);
      if (savedBalance != null) setVirtualBalance(num(savedBalance));
    } catch (err) {
      console.warn('[TradingLogic] Error al cargar localStorage', err.message);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(`trading_iq_${user.id}`, JSON.stringify(trades));
    localStorage.setItem(`virtual_balance_iq_${user.id}`, String(virtualBalance));
  }, [trades, virtualBalance, user?.id]);

  /* ===================================================
     Abrir Trade (Buy / Sell)
     =================================================== */
  const executeTrade = useCallback(async () => {
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

    setIsTrading(true);

    try {
      if (IS_REAL_MODE) {
        await updateBalanceGlobal(-amount, 'USDC', true, 'trade_open', { pair: selectedPair });
      } else {
        setVirtualBalance((prev) => Math.max(0, prev - amount));
      }

      const now = Date.now();
      const durSec = Math.max(1, num(tradeDuration) || 60);

      const newTrade = {
        id: String(now),
        pair: selectedPair,
        type: tradeType,
        amount,
        priceAtExecution: currentPrice,
        timestamp: now,
        duration: durSec * 1000,
        closeAt: now + durSec * 1000,
        status: 'open',
        profit: 0,
      };

      setTrades((prev) => [newTrade, ...prev]);
      toast({
        title: 'Trade abierto',
        description: `${tradeType.toUpperCase()} $${amount.toFixed(2)} ${baseSym} a $${currentPrice.toFixed(2)}`,
      });
    } catch (err) {
      console.error('[executeTrade] Error:', err.message);
      toast({ title: 'Error', description: 'No se pudo abrir el trade', variant: 'destructive' });
    } finally {
      setIsTrading(false);
    }
  }, [tradeAmount, selectedPair, cryptoPrices, tradeType, tradeDuration, updateBalanceGlobal]);

  /* ===================================================
     Cerrar Trade (automático o manual)
     =================================================== */
  const closeTrade = useCallback(
    async (tradeId, arg2 = null) => {
      let manual = false;
      let providedClosePrice = null;

      if (typeof arg2 === 'number' && Number.isFinite(arg2)) providedClosePrice = Number(arg2);
      else if (typeof arg2 === 'boolean') manual = arg2;

      setTrades((prevTrades) =>
        prevTrades.map((t) => {
          if (t.id !== tradeId || t.status !== 'open') return t;

          const baseSym = (t.pair.split?.('/')?.[0] || 'BTC').toUpperCase();
          const live = num(cryptoPrices?.[baseSym]?.price);
          const currentPrice = Number.isFinite(providedClosePrice) ? providedClosePrice : live;
          if (!currentPrice) return t;

          // Calcular PnL
          const pnlPct =
            t.type === 'buy'
              ? (currentPrice - t.priceAtExecution) / t.priceAtExecution
              : (t.priceAtExecution - currentPrice) / t.priceAtExecution;

          let profit = clampTiny(round2(pnlPct * t.amount));
          const totalReturn = round2(t.amount + profit);

          // 🔹 Aplicar resultado
          (async () => {
            try {
              if (IS_REAL_MODE) {
                // Actualiza saldo con capital + PnL
                // ✅ Devuelve solo la diferencia (PnL real, no el capital completo)
await updateBalanceGlobal(profit, 'USDC', true, 'trade_pnl', {
  pair: t.pair,
  trade_id: t.id,
  profit,
  reference_id: `trade_pnl:${user.id}:${t.id}`,
});


                const { data, error } = await supabase
                  .from('balances')
                  .select('usdc')
                  .eq('user_id', user.id)
                  .single();
                if (!error && data) console.log('[Balance actualizado]', data.usdc);
              } else {
                setVirtualBalance((prevBal) => round2(prevBal + totalReturn));
              }
            } catch (err) {
              console.warn('[closeTrade] Error al devolver saldo:', err.message);
            }
          })();

          toast({
            title: `Trade cerrado ${manual ? '(Manual)' : ''}`,
            description: `PnL: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USDC`,
            variant: profit >= 0 ? 'default' : 'destructive',
          });

          return {
            ...t,
            status: 'closed',
            profit,
            priceAtClose: currentPrice,
            closeAt: Date.now(),
          };
        })
      );
    },
    [cryptoPrices, updateBalanceGlobal, user?.id]
  );

  /* ---------------- Autocierre por tiempo ---------------- */
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      trades.forEach((t) => {
        if (t.status === 'open' && now >= t.closeAt) closeTrade(t.id);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [trades, closeTrade]);

  /* ---------------- Utilidades ---------------- */
  const resetBalance = () => {
    setVirtualBalance(10000);
    setTrades([]);
    toast({ title: 'Balance reiniciado', description: 'Tu saldo demo volvió a $10,000' });
  };

  const totalProfit = trades
    .filter((t) => t.status === 'closed')
    .reduce((sum, t) => sum + num(t.profit), 0);

  const openTrades = trades.filter((t) => t.status === 'open');

  /* ---------------- Export ---------------- */
  return {
    selectedPair,
    setSelectedPair,
    tradeAmount,
    setTradeAmount,
    tradeType,
    setTradeType,
    tradeDuration,
    setTradeDuration,
    isTrading,
    trades,
    openTrades,
    totalProfit,
    virtualBalance,
    priceHistory,
    cryptoPrices,
    executeTrade,
    closeTrade,
    resetBalance,
  };
};
