// src/pages/TradingSimulator.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import TradingChart from '@/components/trading/TradingChart';
import TradingPanel from '@/components/trading/TradingPanel';
import TradingStats from '@/components/trading/TradingStats';
import TradesHistory from '@/components/trading/TradesHistory';
import { useTradingLogic } from '@/hooks/useTradingLogic';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Send, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from '@/components/ui/use-toast';

// 👉 NUEVO: feed híbrido real + ticks
import useHybridLivePrices from '@/hooks/useHybridLivePrices';

const countryFlags = {
  US: '🇺🇸', AR: '🇦🇷', BR: '🇧🇷', CO: '🇨🇴', MX: '🇲🇽', ES: '🇪🇸',
  DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳', default: '🏳️'
};
const userLevels = {
  newbie: '🌱', beginner: '🥉', intermediate: '🥈', advanced: '🥇', pro: '🏆', legend: '💎'
};
const fmt = (n, dec = 2) => { const num = Number(n); return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec); };

const TradingSimulator = () => {
  const { user, displayName, profile } = useAuth();
  const { playSound } = useSound();
  const tradingLogic = useTradingLogic(); // motor demo actual
  const chatEndRef = useRef(null);

  const [mode, setMode] = useState('demo'); // 'demo' | 'real'
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  // ========= Feed de precios híbrido (solo lo usaremos en MODO REAL) =========
  const liveFeed = useHybridLivePrices({
    symbols: ['BTC', 'ETH', 'BNB', 'ADA', 'USDT'],
    vs: 'USDT',
    pollMs: 12000,      // cada 12s ancla real
    tickMs: 1000,       // cada 1s un “tick” local
    maxHist: 300,
    selectedPair: tradingLogic.selectedPair, // ej: "BTC/USDT"
  });

  // ===== Datos modo real =====
  const [realTrades, setRealTrades] = useState([]);
  const [realBalance, setRealBalance] = useState(0);

  // ------- fetchers (modo real) -------
  const fetchRealData = async () => {
    if (!user?.id) return;
    try {
      const [{ data: balRow, error: balErr }, { data: tradesData, error: trErr }] = await Promise.all([
        supabase.from('balances').select('usdc').eq('user_id', user.id).single(),
        supabase
          .from('trades')
          .select('id, user_id, pair, type, amount, price, status, profit, closeat, timestamp')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false })
      ]);

      if (balErr) throw balErr;
      if (trErr) throw trErr;

      setRealBalance(Number(balRow?.usdc ?? 0));
      setRealTrades(Array.isArray(tradesData) ? tradesData : []);
    } catch (e) {
      console.error('[TradingSimulator] fetchRealData error:', e);
      toast({ title: 'Error cargando trading real', description: e?.message ?? 'Intenta más tarde.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (mode === 'real') fetchRealData();
  }, [mode, user?.id]);

  // Realtime para trades del usuario (solo en modo real)
  useEffect(() => {
    if (mode !== 'real' || !user?.id) return;
    const channel = supabase
      .channel('realtime-trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` }, () => {
        fetchRealData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user?.id]);

  // ------- chat -------
  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [chatMessages]);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    playSound?.('click');

    const msgUser = displayName || profile?.username || user?.email || 'Anónimo';
    const message = {
      id: chatMessages.length + 1,
      user: msgUser,
      text: newMessage,
      country: profile?.countryCode || 'AR',
      level: profile?.tradingLevel || 'beginner',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, message]);
    setNewMessage('');
  };

  // ------- acciones de trading -------
  const handleTrade = async (tradeData) => {
    // tradeData: { pair, type: 'buy'|'sell', amount, price }
    if (mode === 'demo') {
      tradingLogic.openTrade(tradeData);
      return;
    }
    if (!user?.id) return;

    try {
      const { error } = await supabase.from('trades').insert([{
        user_id: user.id,
        pair: tradeData.pair,
        type: tradeData.type,
        amount: Number(tradeData.amount),
        price: Number(tradeData.price),
        status: 'open',
        timestamp: new Date().toISOString()
      }]);
      if (error) throw error;
      playSound?.('success');
      await fetchRealData();
    } catch (e) {
      console.error('[TradingSimulator] handleTrade error:', e);
      playSound?.('error');
      toast({ title: 'No se pudo abrir la operación', description: e?.message ?? 'Intenta de nuevo.', variant: 'destructive' });
    }
  };

  const handleCloseTrade = async (tradeId, profit) => {
    if (mode === 'demo') {
      tradingLogic.closeTrade(tradeId, profit);
      return;
    }
    try {
      const { error } = await supabase
        .from('trades')
        .update({ status: 'closed', profit: Number(profit ?? 0), closeat: Date.now() })
        .eq('id', tradeId);
      if (error) throw error;
      playSound?.('success');
      await fetchRealData();
    } catch (e) {
      console.error('[TradingSimulator] handleCloseTrade error:', e);
      playSound?.('error');
      toast({ title: 'No se pudo cerrar la operación', description: e?.message ?? 'Intenta de nuevo.', variant: 'destructive' });
    }
  };

  // ======= Selección de feed para la UI =======
  const pricesForUI  = mode === 'real' ? liveFeed.prices               : tradingLogic.cryptoPrices;
  const historyForUI = mode === 'real' ? liveFeed.selectedPriceHistory : tradingLogic.priceHistory;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Simulador de Trading</h1>
            <p className="text-slate-300">
              Modo {mode === 'demo' ? 'Demo (saldo virtual)' : `Real (saldo USDC ${fmt(realBalance)})`}
            </p>
          </div>
          <Select value={mode} onValueChange={(val) => setMode(val)}>
            <SelectTrigger className="w-[130px] bg-slate-800 text-white border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 text-white border-slate-700">
              <SelectItem value="demo">Modo Demo</SelectItem>
              <SelectItem value="real">Modo Real</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TradingStats
          virtualBalance={mode === 'demo' ? tradingLogic.virtualBalance : realBalance}
          totalProfit={
            mode === 'demo'
              ? tradingLogic.totalProfit
              : (Array.isArray(realTrades) ? realTrades : []).reduce((sum, t) => sum + Number(t.profit || 0), 0)
          }
          openTradesCount={
            mode === 'demo'
              ? tradingLogic.openTrades.length
              : (Array.isArray(realTrades) ? realTrades : []).filter(t => t.status === 'open').length
          }
          totalTradesCount={
            mode === 'demo' ? tradingLogic.trades.length : (Array.isArray(realTrades) ? realTrades.length : 0)
          }
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-9">
            <TradingChart
              priceHistory={historyForUI}
              selectedPair={tradingLogic.selectedPair}
              cryptoPrices={pricesForUI}
            />
          </div>

          <div className="xl:col-span-3">
            <Card className="crypto-card h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-white flex items-center text-lg">
                  <MessageSquare className="h-5 w-5 mr-2 text-blue-400" />
                  Chat de Traders
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-grow overflow-y-auto space-y-3 h-[350px]">
                {(Array.isArray(chatMessages) ? chatMessages : []).map(msg => (
                  <div key={msg.id}>
                    <div className="flex items-center text-xs space-x-1 text-slate-400 mb-1">
                      <span className="text-purple-300 font-semibold">{msg.user}</span>
                      <span>{countryFlags[msg.country] || countryFlags.default}</span>
                      <span>{userLevels[msg.level] || userLevels.beginner}</span>
                      <span className="text-slate-500">{msg.time}</span>
                    </div>
                    <p className="text-sm text-slate-200 bg-slate-700 px-3 py-1.5 rounded-md">{msg.text}</p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </CardContent>
              <CardContent className="pt-2 pb-4">
                <div className="flex space-x-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Mensaje..."
                    className="bg-slate-800 text-white border-slate-600"
                  />
                  <Button onClick={handleSendMessage} size="icon" className="bg-blue-500 hover:bg-blue-600">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <TradingPanel
          {...tradingLogic}
          onTrade={handleTrade}
          balance={mode === 'demo' ? tradingLogic.virtualBalance : realBalance}
          mode={mode}
          // 👉 pasamos el feed elegido para que el panel calcule precios/PnL con el mismo origen
          cryptoPrices={pricesForUI}
          priceHistory={historyForUI}
        />

        <TradesHistory
          trades={mode === 'demo' ? tradingLogic.trades : (Array.isArray(realTrades) ? realTrades : [])}
          cryptoPrices={pricesForUI}
          closeTrade={handleCloseTrade}
        />
      </div>
    </>
  );
};

export default TradingSimulator;
