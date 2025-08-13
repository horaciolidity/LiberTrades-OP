// src/pages/TradingSimulator.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const { user, balances, executeTradeReal, executeTradeDemo } = useAuth();
  const { playSound } = useSound();
  const tradingLogic = useTradingLogic(); // demo virtual
  const chatEndRef = useRef(null);

  const [mode, setMode] = useState('demo'); // 'demo' | 'real'
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  const [realTrades, setRealTrades] = useState([]);
  const [realBalance, setRealBalance] = useState(0);

  // Mantener balance real en sync desde AuthContext
  useEffect(() => {
    setRealBalance(Number(balances?.usdc ?? 0));
  }, [balances?.usdc]);

  const mapDbTradeToUI = (t) => ({
    // Adaptamos columnas nuevas (symbol/side/size/pnl/opened_at) a las que espera tu UI
    id: t.id,
    user_id: t.user_id,
    pair: t.symbol || t.pair || t.asset || '',
    type: t.side || t.type || '', // 'buy' | 'sell'
    amount: Number(t.size ?? t.amount ?? 0),
    price: Number(t.price ?? 0),
    status: t.status || 'open',
    profit: Number(t.pnl ?? t.profit ?? 0),
    created_at: t.opened_at || t.created_at || t.timestamp || null,
    closed_at: t.closed_at || null,
    timestamp: t.opened_at || t.created_at || t.timestamp || null,
    mode: t.mode || 'real',
  });

  const fetchRealData = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('opened_at', { ascending: false });

    if (error) {
      console.warn('trades fetch error:', error.message);
      setRealTrades([]);
      return;
    }

    const mapped = (data || [])
      .filter((t) => (t.mode ? t.mode === 'real' : true))
      .map(mapDbTradeToUI);

    setRealTrades(mapped);
  }, [user?.id]);

  useEffect(() => {
    if (mode === 'real') fetchRealData();
  }, [mode, user?.id, fetchRealData]);

  // Realtime: refresca lista de trades reales
  useEffect(() => {
    if (!user?.id || mode !== 'real') return;
    const ch = supabase
      .channel('rt-trades-sim')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` }, fetchRealData)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, mode, fetchRealData]);

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
      user: user?.name || user?.email?.split('@')[0] || 'Anónimo',
      text: newMessage,
      country: user?.countryCode || 'AR',
      level: user?.tradingLevel || 'beginner',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, message]);
    setNewMessage('');
  };

  // -------- Trading --------
  const handleTrade = async (tradeData) => {
    // tradeData esperado: { pair|symbol, type|side, amount|size, price }
    const symbol = tradeData.symbol || tradeData.pair;
    const side = tradeData.side || tradeData.type; // 'buy' | 'sell'
    const size = Number(tradeData.size ?? tradeData.amount);
    const price = Number(tradeData.price);

    if (!symbol || !side || !Number.isFinite(size) || !Number.isFinite(price)) {
      toast({ title: 'Datos inválidos', description: 'Revisa símbolo, lado, cantidad y precio.', variant: 'destructive' });
      return;
    }

    if (mode === 'demo') {
      // Persistimos demo en BD (no afecta saldo) + UI local
      try {
        await executeTradeDemo({ symbol, side, size, price });
      } catch (e) {
        console.warn('executeTradeDemo error:', e?.message);
      }
      tradingLogic.openTrade({ pair: symbol, type: side, amount: size, price });
      playSound('buy');
      toast({ title: 'Orden (Demo)', description: `${side.toUpperCase()} ${symbol} @ ${price}` });
      return;
    }

    if (!user?.id) {
      toast({ title: 'Sin sesión', description: 'Inicia sesión para operar en real.', variant: 'destructive' });
      setMode('demo');
      return;
    }

    try {
      // 🚀 Real: afecta saldo vía RPC atómica (process_trade_execute)
      await executeTradeReal({ symbol, side, size, price });
      playSound('buy');
      toast({ title: 'Orden (Real)', description: `${side.toUpperCase()} ${symbol} @ ${price}` });
      await fetchRealData();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error al operar', description: error.message, variant: 'destructive' });
    }
  };

  const handleCloseTrade = async (tradeId, profit) => {
    if (mode === 'demo') {
      tradingLogic.closeTrade(tradeId, profit);
      playSound('sell');
      return;
    }
    if (!user?.id) return;

    // Cierre real simple (no liquida PnL al balance).
    // Si querés, después creamos una RPC que acredite/debite el PnL al cerrar.
    const { error } = await supabase
      .from('trades')
      .update({
        status: 'closed',
        pnl: Number(profit || 0),
        profit: Number(profit || 0),
        closed_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
      .eq('user_id', user.id);

    if (error) {
      console.error(error);
      toast({ title: 'Error al cerrar trade', description: error.message, variant: 'destructive' });
      return;
    }

    playSound('sell');
    toast({ title: 'Trade cerrado', description: `PnL: $${Number(profit || 0).toFixed(2)}` });
    await fetchRealData();
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
              : realTrades.reduce((sum, t) => sum + Number(t.profit ?? t.pnl ?? 0), 0)
          }
          openTradesCount={
            mode === 'demo'
              ? tradingLogic.openTrades.length
              : realTrades.filter((t) => t.status === 'open').length
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
                {chatMessages.map((msg) => (
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
