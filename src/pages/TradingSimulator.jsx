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

const countryFlags = {
  US: '🇺🇸', AR: '🇦🇷', BR: '🇧🇷', CO: '🇨🇴', MX: '🇲🇽', ES: '🇪🇸',
  DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳', default: '🏳️'
};

const userLevels = {
  newbie: '🌱', beginner: '🥉', intermediate: '🥈', advanced: '🥇', pro: '🏆', legend: '💎'
};

const TradingSimulator = () => {
  const { user } = useAuth();
  const { playSound } = useSound();
  const tradingLogic = useTradingLogic(); // virtual trading hook
  const chatEndRef = useRef(null);

  const [mode, setMode] = useState('demo'); // 'demo' | 'real'
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [realTrades, setRealTrades] = useState([]);
  const [realBalance, setRealBalance] = useState(0);

  // -------- Helpers --------
  const fetchRealData = async () => {
    if (!user?.id) return;

    // ✅ balances: filtrar por user_id (no 'id')
    const { data: balRow, error: balErr } = await supabase
      .from('balances')
      .select('usdc')
      .eq('user_id', user.id)
      .single();

    if (balErr) {
      console.warn('balances error:', balErr.message);
    }
    setRealBalance(Number(balRow?.usdc ?? 0));

    // ✅ trades reales: usar created_at/closed_at y mapear timestamp para UI legacy
    const { data: tradesData, error: trErr } = await supabase
      .from('trades')
      .select('id, user_id, pair, type, amount, price, status, profit, created_at, closed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (trErr) {
      console.warn('trades error:', trErr.message);
      setRealTrades([]);
      return;
    }

    // Algunos componentes podrían esperar "timestamp"
    const mapped = (tradesData || []).map(t => ({
      ...t,
      timestamp: t.created_at
    }));
    setRealTrades(mapped);
  };

  useEffect(() => {
    if (mode === 'real') fetchRealData();
  }, [mode, user?.id]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [chatMessages]);

  // -------- Chat --------
  const handleSendMessage = () => {
    if (newMessage.trim() === '') return;
    playSound('click');

    const message = {
      id: chatMessages.length + 1,
      user: user?.name || 'Anónimo',
      text: newMessage,
      country: user?.countryCode || 'AR',
      level: user?.tradingLevel || 'beginner',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, message]);
    setNewMessage('');
  };

  // -------- Trading real --------
  const handleTrade = async (tradeData) => {
    if (mode === 'demo') {
      tradingLogic.openTrade(tradeData);
      return;
    }
    if (!user?.id) return;

    const row = {
      user_id: user.id,
      pair: tradeData.pair,
      type: tradeData.type,          // 'buy' | 'sell'
      amount: Number(tradeData.amount),
      price: Number(tradeData.price),
      status: 'open',                // server default también podría setearlo
      // created_at: now() lo pone Postgres
    };

    const { error } = await supabase.from('trades').insert([row]);
    if (error) {
      console.error(error);
      toast({ title: 'Error al abrir trade', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Trade abierto', description: `${row.type.toUpperCase()} ${row.pair} @ ${row.price}` });
    fetchRealData();
  };

  const handleCloseTrade = async (tradeId, profit) => {
    if (mode === 'demo') {
      tradingLogic.closeTrade(tradeId, profit);
      return;
    }
    if (!user?.id) return;

    const { error } = await supabase
      .from('trades')
      .update({ status: 'closed', profit: Number(profit || 0), closed_at: new Date().toISOString() })
      .eq('id', tradeId)
      .eq('user_id', user.id);

    if (error) {
      console.error(error);
      toast({ title: 'Error al cerrar trade', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Trade cerrado', description: `Ganancia: $${Number(profit || 0).toFixed(2)}` });
    fetchRealData();
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Simulador de Trading</h1>
            <p className="text-slate-300">Modo {mode === 'demo' ? 'Demo (saldo virtual)' : 'Real (saldo real)'}</p>
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
              : realTrades.reduce((sum, t) => sum + Number(t.profit || 0), 0)
          }
          openTradesCount={
            mode === 'demo'
              ? tradingLogic.openTrades.length
              : realTrades.filter(t => t.status === 'open').length
          }
          totalTradesCount={mode === 'demo' ? tradingLogic.trades.length : realTrades.length}
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-9">
            <TradingChart
              priceHistory={tradingLogic.priceHistory}
              selectedPair={tradingLogic.selectedPair}
              cryptoPrices={tradingLogic.cryptoPrices}
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
                {chatMessages.map(msg => (
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
        />

        <TradesHistory
          trades={mode === 'demo' ? tradingLogic.trades : realTrades}
          cryptoPrices={tradingLogic.cryptoPrices}
          closeTrade={handleCloseTrade}
        />
      </div>
    </>
  );
};

export default TradingSimulator;
