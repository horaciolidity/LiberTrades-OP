// src/pages/TradingSimulator.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// Feed híbrido (API + ticks locales) para MODO REAL
import useHybridLivePrices from '@/hooks/useHybridLivePrices';

// ====== Utils ======
const countryFlags = {
  US: '🇺🇸', AR: '🇦🇷', BR: '🇧🇷', CO: '🇨🇴', MX: '🇲🇽', ES: '🇪🇸',
  DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳', default: '🏳️'
};
const userLevels = {
  newbie: '🌱', beginner: '🥉', intermediate: '🥈', advanced: '🥇', pro: '🏆', legend: '💎'
};
const fmt = (n, dec = 2) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(dec) : (0).toFixed(dec);
};

// Normaliza cualquier historial a una grilla uniforme (1s) => [{time(epoch s), value}]
const normalizeHistory = (raw, { max = 300, stepMs = 1000 } = {}) => {
  const arr = (Array.isArray(raw) ? raw : [])
    .map((p) => {
      const ts =
        typeof p.ts === 'number'
          ? p.ts
          : typeof p.time === 'number'
          ? (p.time > 2e10 ? p.time : p.time * 1000)
          : new Date(p.timestamp ?? p.date ?? p.t ?? p[0] ?? Date.now()).getTime();

      const price = Number(p.price ?? p.value ?? p.close ?? p.c ?? p[1] ?? 0);
      return { ts, price };
    })
    .filter((r) => r.ts && r.price > 0)
    .sort((a, b) => a.ts - b.ts);

  if (!arr.length) return [];

  const out = [];
  let i = 0;
  let last = arr[0].price;
  let t = arr[0].ts - (arr[0].ts % stepMs);
  const end = arr[arr.length - 1].ts;

  while (t <= end) {
    while (i < arr.length && arr[i].ts <= t) {
      last = arr[i].price;
      i++;
    }
    out.push({ time: Math.floor(t / 1000), value: last });
    t += stepMs;
  }
  return out.slice(-max);
};

const TradingSimulator = () => {
  const { user, displayName, profile } = useAuth();
  const { playSound } = useSound();
  const tradingLogic = useTradingLogic(); // motor DEMO
  const chatEndRef = useRef(null);

  // 'demo' | 'real' (persistido)
  const [mode, setMode] = useState(() => localStorage.getItem('trade_mode') || 'demo');
  useEffect(() => localStorage.setItem('trade_mode', mode), [mode]);

  // ===== Feed de precios (solo lo usamos en REAL) =====
  const liveFeed = useHybridLivePrices({
    symbols: ['BTC', 'ETH', 'BNB', 'ADA', 'USDT'],
    vs: 'USDT',
    pollMs: 12000,
    tickMs: 1000,
    maxHist: 300,
    selectedPair: tradingLogic.selectedPair, // ej: "BTC/USDT"
  });

  // ====== Estado REAL ======
  const [realTrades, setRealTrades] = useState([]);
  const [realBalance, setRealBalance] = useState(0);

  // ====== Chat global ======
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  // ---------- Fetch REAL ----------
  const fetchRealData = async () => {
    if (!user?.id) return;
    try {
      const [{ data: balRow, error: balErr }, { data: tradesData, error: trErr }] = await Promise.all([
        supabase.from('balances').select('usdc').eq('user_id', user.id).single(),
        supabase
          .from('trades')
          .select('id, user_id, pair, type, amount, price, status, profit, closeat, timestamp')
          .eq('user_id', user.id)
          .order('timestamp', { ascending: false }),
      ]);

      if (balErr) throw balErr;
      if (trErr) throw trErr;

      setRealBalance(Number(balRow?.usdc ?? 0));
      setRealTrades(Array.isArray(tradesData) ? tradesData : []);
    } catch (e) {
      console.error('[TradingSimulator] fetchRealData error:', e);
      toast({
        title: 'Error cargando trading real',
        description: e?.message ?? 'Intenta más tarde.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (mode === 'real') fetchRealData();
  }, [mode, user?.id]);

  // Realtime: trades del usuario en REAL
  useEffect(() => {
    if (mode !== 'real' || !user?.id) return;
    const ch = supabase
      .channel('realtime-trades')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` },
        () => {
          fetchRealData();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user?.id]);

  // ---------- Chat: carga inicial ----------
  const loadChat = async () => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id,user_id,user_name,text,country_code,user_level,created_at')
      .order('created_at', { ascending: true })
      .limit(200);
    if (!error) setChatMessages(data ?? []);
  };
  useEffect(() => {
    loadChat();
  }, []);

  // Chat: realtime
  useEffect(() => {
    const ch = supabase
      .channel('chat-room')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          setChatMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // autoscroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = async () => {
    const txt = newMessage.trim();
    if (!txt || !user?.id) return;
    try {
      const msgUser = displayName || profile?.username || user?.email || 'Anónimo';
      const { error } = await supabase.from('chat_messages').insert({
        user_id: user.id,
        user_name: msgUser,
        text: txt,
        country_code: profile?.countryCode || 'AR',
        user_level: profile?.tradingLevel || 'beginner',
      });
      if (error) throw error;
      setNewMessage('');
      playSound?.('click');
    } catch (e) {
      console.error('[chat] send error', e);
      toast({ title: 'No se pudo enviar el mensaje', description: e.message, variant: 'destructive' });
    }
  };

  // ---------- Trading actions ----------
  const handleTrade = async (tradeData) => {
    // tradeData: { pair, type: 'buy'|'sell', amount, price }
    if (mode === 'demo') {
      tradingLogic.openTrade(tradeData); // sólo estado en memoria (demo)
      return;
    }
    if (!user?.id) return;

    try {
      const { error } = await supabase.from('trades').insert([
        {
          user_id: user.id,
          pair: tradeData.pair,
          type: tradeData.type,
          amount: Number(tradeData.amount),
          price: Number(tradeData.price),
          status: 'open',
          timestamp: new Date().toISOString(),
        },
      ]);
      if (error) throw error;
      playSound?.('success');
      await fetchRealData();
    } catch (e) {
      console.error('[TradingSimulator] handleTrade error:', e);
      playSound?.('error');
      toast({
        title: 'No se pudo abrir la operación',
        description: e?.message ?? 'Intenta de nuevo.',
        variant: 'destructive',
      });
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
      toast({
        title: 'No se pudo cerrar la operación',
        description: e?.message ?? 'Intenta de nuevo.',
        variant: 'destructive',
      });
    }
  };

  // ---------- Datos para UI (precios/historial) ----------
  const pricesForUI = mode === 'real' ? liveFeed.prices : tradingLogic.cryptoPrices;
  const rawHistory = mode === 'real' ? liveFeed.selectedPriceHistory : tradingLogic.priceHistory;

  const chartHistory = useMemo(
    () => normalizeHistory(rawHistory, { max: 600, stepMs: 1000 }),
    [rawHistory]
  );

  // Dominio Y (arregla problema de escala en modo real)
  const yDomain = useMemo(() => {
    if (!chartHistory.length) return undefined;
    const values = chartHistory.map((p) => p.value).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (!values.length) return undefined;
    const q = (k) => values[Math.max(0, Math.min(values.length - 1, Math.floor(values.length * k)))];
    const low = q(0.05);
    const high = q(0.95);
    const range = Math.max(1e-6, high - low);
    const pad = range * 0.02;
    return [low - pad, high + pad];
  }, [chartHistory]);

  const realTotals = useMemo(
    () => ({
      profit: (Array.isArray(realTrades) ? realTrades : []).reduce((s, t) => s + Number(t.profit || 0), 0),
      openCount: (Array.isArray(realTrades) ? realTrades : []).filter((t) => (t.status || '').toLowerCase() === 'open')
        .length,
      totalCount: Array.isArray(realTrades) ? realTrades.length : 0,
    }),
    [realTrades]
  );

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
          totalProfit={mode === 'demo' ? tradingLogic.totalProfit : realTotals.profit}
          openTradesCount={mode === 'demo' ? tradingLogic.openTrades.length : realTotals.openCount}
          totalTradesCount={mode === 'demo' ? tradingLogic.trades.length : realTotals.totalCount}
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-9">
            <TradingChart
              priceHistory={chartHistory}      // ← uniforme (1s)
              selectedPair={tradingLogic.selectedPair}
              cryptoPrices={pricesForUI}
              yDomain={yDomain}                // ← clave para que no quede “aplastado” en real
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
                {(chatMessages ?? []).map((msg) => (
                  <div key={msg.id}>
                    <div className="flex items-center text-xs space-x-1 text-slate-400 mb-1">
                      <span className="text-purple-300 font-semibold">{msg.user_name}</span>
                      <span>{countryFlags[msg.country_code] || countryFlags.default}</span>
                      <span>{userLevels[msg.user_level] || userLevels.beginner}</span>
                      <span className="text-slate-500">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
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
          // ⚠️ Sobrescribimos para que en modo REAL no toque el estado DEMO interno
          openTrade={handleTrade}
          closeTrade={handleCloseTrade}
          onTrade={handleTrade} // compat
          balance={mode === 'demo' ? tradingLogic.virtualBalance : realBalance}
          mode={mode}
          cryptoPrices={pricesForUI}
          priceHistory={chartHistory}
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
