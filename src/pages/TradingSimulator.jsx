import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Layout from '@/components/Layout';
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

const countryFlags = {
  US: '🇺🇸', AR: '🇦🇷', BR: '🇧🇷', CO: '🇨🇴', MX: '🇲🇽', ES: '🇪🇸', DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳', default: '🏳️'
};

const userLevels = {
  newbie: '🌱', beginner: '🥉', intermediate: '🥈', advanced: '🥇', pro: '🏆', legend: '💎'
};

const TradingSimulator = () => {
  const { user } = useAuth();
  const { playSound } = useSound();
  const tradingLogic = useTradingLogic(); // virtual trading hook
  const chatEndRef = useRef(null);

  const [mode, setMode] = useState('demo'); // 'demo' o 'real'
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [realTrades, setRealTrades] = useState([]);
  const [realBalance, setRealBalance] = useState(0);

  const fetchRealData = async () => {
    if (!user?.id) return;
    const { data: balanceData } = await supabase.from('balances').select('*').eq('user_id', user.id).single();
    const { data: tradesData } = await supabase.from('trades').select('*').eq('user_id', user.id).order('timestamp', { ascending: false });

    setRealBalance(balanceData?.balance || 0);
    setRealTrades(tradesData || []);
  };

  useEffect(() => {
    if (mode === 'real') {
      fetchRealData();
    }
  }, [mode]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chatMessages]);

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

    setChatMessages([...chatMessages, message]);
    setNewMessage('');
  };

  const handleTrade = async (tradeData) => {
    if (mode === 'demo') {
      tradingLogic.openTrade(tradeData);
    } else {
      const { error } = await supabase.from('trades').insert([
        {
          user_id: user.id,
          pair: tradeData.pair,
          type: tradeData.type,
          amount: tradeData.amount,
          price: tradeData.price,
          status: 'open',
          timestamp: new Date()
        }
      ]);
      if (!error) fetchRealData();
    }
  };

  const handleCloseTrade = async (tradeId, profit) => {
    if (mode === 'demo') {
      tradingLogic.closeTrade(tradeId, profit);
    } else {
      await supabase.from('trades')
        .update({ status: 'closed', profit, closeat: Date.now() })
        .eq('id', tradeId);
      await fetchRealData();
    }
  };

  return (
    <Layout>
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
          totalProfit={mode === 'demo' ? tradingLogic.totalProfit : realTrades.reduce((sum, t) => sum + (t.profit || 0), 0)}
          openTradesCount={mode === 'demo' ? tradingLogic.openTrades.length : realTrades.filter(t => t.status === 'open').length}
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
                      <span>{countryFlags[msg.country]}</span>
                      <span>{userLevels[msg.level]}</span>
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
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
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
    </Layout>
  );
};

export default TradingSimulator;
