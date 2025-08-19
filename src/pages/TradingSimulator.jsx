// src/pages/TradingSimulator.jsx
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import TradingChart from '@/components/trading/TradingChart';
import TradingPanel from '@/components/trading/TradingPanel';
import TradingStats from '@/components/trading/TradingStats';
import TradesHistory from '@/components/trading/TradesHistory';
import { useTradingLogic } from '@/hooks/useTradingLogic';
import { useAuth } from '@/contexts/AuthContext';
import { useSound } from '@/contexts/SoundContext';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Send, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const countryFlags = {
  US: '🇺🇸',
  AR: '🇦🇷',
  BR: '🇧🇷',
  CO: '🇨🇴',
  MX: '🇲🇽',
  ES: '🇪🇸',
  DE: '🇩🇪',
  GB: '🇬🇧',
  FR: '🇫🇷',
  JP: '🇯🇵',
  CN: '🇨🇳',
  default: '🏳️',
};

const userLevels = {
  newbie: '🌱',
  beginner: '🥉',
  intermediate: '🥈',
  advanced: '🥇',
  pro: '🏆',
  legend: '💎',
};

const safe = (arr) => (Array.isArray(arr) ? arr : []);

export default function TradingSimulator() {
  const { user } = useAuth();
  const { playSound } = useSound();
  const { cryptoPrices: marketPrices = {} } = useData(); // ✅ cotización real desde DataContext
  const tradingLogic = useTradingLogic(); // motor de simulación para modo demo

  const [mode, setMode] = useState('demo'); // 'demo' | 'real'

  // ===== Chat =====
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef(null);

  // ===== Modo real =====
  const [realTrades, setRealTrades] = useState([]);
  const [realBalance, setRealBalance] = useState(0);

  // ------- Helpers user data
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Anónimo';

  const countryCode =
    (user?.user_metadata?.country_code ||
      user?.app_metadata?.country_code ||
      'AR')?.toUpperCase();

  const level =
    (user?.user_metadata?.user_level || 'beginner')
      .toLowerCase()
      .replace(/[^a-z]/g, '');

  // =================== Fetch REAL data ===================
  const fetchRealData = async () => {
    if (!user?.id) return;

    // ⚠️ balances.user_id es la PK en tu schema
    const { data: balanceRow, error: balErr } = await supabase
      .from('balances')
      .select('usdc')
      .eq('user_id', user.id)
      .single();

    if (balErr && balErr.code !== 'PGRST116') {
      console.error('[balances] error:', balErr);
    }
    setRealBalance(Number(balanceRow?.usdc ?? 0));

    const { data: tradesData, error: trErr } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false });

    if (trErr) {
      console.error('[trades] error:', trErr);
      setRealTrades([]);
    } else {
      setRealTrades(safe(tradesData));
    }
  };

  useEffect(() => {
    if (mode === 'real') {
      fetchRealData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user?.id]);

  // =================== Chat: cargar + realtime ===================
  useEffect(() => {
    let channel;
    (async () => {
      // cargar últimos 50 mensajes
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id,user_id,user_name,text,country_code,user_level,created_at')
        .order('created_at', { ascending: true })
        .limit(50);

      if (!error) {
        setChatMessages(
          safe(data).map((m) => ({
            id: m.id,
            user: m.user_name,
            text: m.text,
            country: m.country_code || 'AR',
            level: m.user_level || 'beginner',
            time: new Date(m.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          }))
        );
      }

      // suscribirse a mensajes nuevos
      channel = supabase
        .channel('chat_messages_realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const m = payload.new;
            setChatMessages((prev) => [
              ...prev,
              {
                id: m.id,
                user: m.user_name,
                text: m.text,
                country: m.country_code || 'AR',
                level: m.user_level || 'beginner',
                time: new Date(m.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              },
            ]);
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [chatMessages]);

  const handleSendMessage = async () => {
    const txt = newMessage.trim();
    if (!txt) return;
    playSound?.('click');

    // Inserta también en la tabla chat_messages (según tu schema)
    const { error } = await supabase.from('chat_messages').insert({
      user_id: user?.id || null,
      user_name: displayName,
      text: txt,
      country_code: countryCode,
      user_level: level || 'beginner',
    });

    if (error) {
      // fallback local si falla
      setChatMessages((prev) => [
        ...prev,
        {
          id: prev.length + 1,
          user: displayName,
          text: txt,
          country: countryCode,
          level,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      console.error('[chat insert] error:', error);
    }

    setNewMessage('');
  };

  // =================== Trading actions ===================
  const handleTrade = async (tradeData) => {
    if (mode === 'demo') {
      tradingLogic.openTrade(tradeData);
      return;
    }
    if (!user?.id) return;

    const payload = {
      user_id: user.id,
      pair: tradeData.pair,
      type: tradeData.type, // 'buy' | 'sell'
      amount: Number(tradeData.amount),
      price: Number(tradeData.price),
      status: 'open',
      // timestamp: default now() en DB; lo mando igualmente para claridad
      timestamp: new Date().toISOString(),
    };

    const { error } = await supabase.from('trades').insert(payload);
    if (error) {
      console.error('[trade insert] error:', error);
      return;
    }
    playSound?.('invest');
    fetchRealData();
  };

  const handleCloseTrade = async (tradeId, profit) => {
    if (mode === 'demo') {
      tradingLogic.closeTrade(tradeId, profit);
      return;
    }
    if (!tradeId) return;

    const { error } = await supabase
      .from('trades')
      .update({ status: 'closed', profit: Number(profit || 0), closeat: Date.now() })
      .eq('id', tradeId);

    if (error) {
      console.error('[trade close] error:', error);
      return;
    }
    playSound?.('success');
    fetchRealData();
  };

  // =================== Render ===================
  const virtualBalance = tradingLogic.virtualBalance;
  const stats = {
    virtualBalance: mode === 'demo' ? virtualBalance : realBalance,
    totalProfit:
      mode === 'demo'
        ? tradingLogic.totalProfit
        : safe(realTrades).reduce((sum, t) => sum + Number(t.profit || 0), 0),
    openTradesCount:
      mode === 'demo'
        ? safe(tradingLogic.openTrades).length
        : safe(realTrades).filter((t) => (t.status || '').toLowerCase() === 'open').length,
    totalTradesCount: mode === 'demo' ? safe(tradingLogic.trades).length : safe(realTrades).length,
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Simulador de Trading</h1>
            <p className="text-slate-300">
              Modo {mode === 'demo' ? 'Demo (saldo virtual)' : 'Real (saldo real)'}
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
          virtualBalance={stats.virtualBalance}
          totalProfit={stats.totalProfit}
          openTradesCount={stats.openTradesCount}
          totalTradesCount={stats.totalTradesCount}
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-9">
            <TradingChart
              priceHistory={tradingLogic.priceHistory}
              selectedPair={tradingLogic.selectedPair}
              // ✅ Pasamos precios reales para overlay/indicadores en Chart
              cryptoPrices={marketPrices}
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
                {chatMessages.map((msg) => (
                  <div key={msg.id}>
                    <div className="flex items-center text-xs space-x-1 text-slate-400 mb-1">
                      <span className="text-purple-300 font-semibold">{msg.user}</span>
                      <span>{countryFlags[msg.country] || countryFlags.default}</span>
                      <span>{userLevels[msg.level] || userLevels.beginner}</span>
                      <span className="text-slate-500">{msg.time}</span>
                    </div>
                    <p className="text-sm text-slate-200 bg-slate-700 px-3 py-1.5 rounded-md">
                      {msg.text}
                    </p>
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
          balance={mode === 'demo' ? virtualBalance : realBalance}
          mode={mode}
          // también podrías pasar marketPrices si el panel lo usa
        />

        <TradesHistory
          trades={mode === 'demo' ? tradingLogic.trades : realTrades}
          // ✅ usar cotización real para PnL conversión, etc.
          cryptoPrices={marketPrices}
          closeTrade={handleCloseTrade}
        />
      </div>
    </>
  );
}
