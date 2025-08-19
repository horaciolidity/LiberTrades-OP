// src/pages/TradingSimulator.jsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  US: '🇺🇸', AR: '🇦🇷', BR: '🇧🇷', CO: '🇨🇴', MX: '🇲🇽', ES: '🇪🇸',
  DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳', default: '🏳️',
};

const userLevels = {
  newbie: '🌱', beginner: '🥉', intermediate: '🥈',
  advanced: '🥇', pro: '🏆', legend: '💎',
};

const safe = (arr) => (Array.isArray(arr) ? arr : []);

const parseBaseFromPair = (pair) => {
  if (!pair) return 'BTC';
  const p = pair.replace('/', '').toUpperCase(); // 'BTC/USDT' -> 'BTCUSDT'
  if (p.endsWith('USDT')) return p.slice(0, -4);
  if (p.endsWith('USDC')) return p.slice(0, -4);
  return p;
};

export default function TradingSimulator() {
  const { user } = useAuth();
  const { playSound } = useSound();

  // ✅ cotizaciones e instrumentos desde DataContext
  const { cryptoPrices: marketPrices = {}, pairOptions = [] } = useData();

  // Motor para modo DEMO únicamente
  const tradingLogic = useTradingLogic();

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
    if (mode === 'real') fetchRealData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user?.id]);

  // ===== Realtime para REAL: trades y balance del usuario =====
  useEffect(() => {
    if (!user?.id || mode !== 'real') return;
    const ch = supabase
      .channel('trades_balances_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` }, () => fetchRealData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'balances', filter: `user_id=eq.${user.id}` }, () => fetchRealData())
      .subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, mode]);

  // =================== Chat: cargar + realtime ===================
  useEffect(() => {
    let channel;
    (async () => {
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

  // ============== PnL en tiempo real (demo y real) ==============
  const computeLivePnL = (trade) => {
    const base = parseBaseFromPair(trade.pair || tradingLogic.selectedPair);
    const current = Number(marketPrices?.[base]?.price ?? 0);
    const entry = Number(trade.price || 0);
    const amountUsd = Number(trade.amount || 0);
    if (!current || !entry || !amountUsd) return { upnl: 0, livePrice: current || null };

    // tamaño en unidades del activo (notional USD / entry)
    const qty = amountUsd / entry;
    const side = (trade.type || '').toLowerCase(); // buy | sell
    const upnl = side === 'sell' ? (entry - current) * qty : (current - entry) * qty;
    return { upnl, livePrice: current };
  };

  // Decorar trades con upnl/livePrice para mostrar y sumar en stats
  const demoTradesWithLive = useMemo(() => {
    return safe(tradingLogic.trades).map((t) => {
      const { upnl, livePrice } = computeLivePnL(t);
      return { ...t, upnl, livePrice };
    });
  }, [tradingLogic.trades, marketPrices, tradingLogic.selectedPair]);

  const realTradesWithLive = useMemo(() => {
    return safe(realTrades).map((t) => {
      const { upnl, livePrice } = computeLivePnL(t);
      return { ...t, upnl, livePrice };
    });
  }, [realTrades, marketPrices, tradingLogic.selectedPair]);

  // =================== Trading actions ===================
  const handleTrade = async (tradeData) => {
    if (mode === 'demo') {
      // DEMO: no tocar DB/Saldo real
      tradingLogic.openTrade(tradeData);
      return;
    }
    if (!user?.id) return;

    const payload = {
      user_id: user.id,
      pair: tradeData.pair,
      type: tradeData.type, // 'buy' | 'sell'
      amount: Number(tradeData.amount), // notional en USD
      price: Number(tradeData.price),
      status: 'open',
      timestamp: new Date().toISOString(),
    };

    // 1) Insert trade
    const { error: tErr } = await supabase.from('trades').insert(payload);
    if (tErr) {
      console.error('[trade insert] error:', tErr);
      return;
    }

    // 2) Descontar saldo real (bloqueo simple del notional)
    const { data: balRow, error: bErr } = await supabase
      .from('balances')
      .select('usdc')
      .eq('user_id', user.id)
      .single();

    if (!bErr) {
      const current = Number(balRow?.usdc || 0);
      const next = Math.max(0, current - Number(tradeData.amount || 0));
      await supabase
        .from('balances')
        .update({ usdc: next, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    playSound?.('invest');
    fetchRealData();
  };

  const handleCloseTrade = async (tradeId, profitOverride) => {
    if (mode === 'demo') {
      tradingLogic.closeTrade(tradeId, profitOverride);
      return;
    }
    if (!tradeId) return;

    // 0) Obtener trade para conocer notional al cerrar
    const { data: tr, error: gErr } = await supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (gErr || !tr) {
      console.error('[trade get] error:', gErr);
      return;
    }

    // 1) Calcular profit si no lo recibimos
    let realized = Number(profitOverride || 0);
    if (profitOverride == null) {
      const { upnl } = computeLivePnL(tr);
      realized = Number(upnl || 0);
    }

    // 2) Cerrar trade con profit final
    const { error: uErr } = await supabase
      .from('trades')
      .update({ status: 'closed', profit: realized, closeat: new Date().toISOString() })
      .eq('id', tradeId);

    if (uErr) {
      console.error('[trade close] error:', uErr);
      return;
    }

    // 3) Devolver notional + profit al saldo real
    const { data: balRow, error: bErr } = await supabase
      .from('balances')
      .select('usdc')
      .eq('user_id', user.id)
      .single();

    if (!bErr) {
      const current = Number(balRow?.usdc || 0);
      const creditBack = Number(tr.amount || 0) + Number(realized || 0);
      const next = current + creditBack;
      await supabase
        .from('balances')
        .update({ usdc: next, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }

    playSound?.('success');
    fetchRealData();
  };

  // =================== Stats (con unrealized) ===================
  const demoRealized = useMemo(
    () => safe(tradingLogic.trades).filter(t => (t.status || '').toLowerCase() === 'closed')
      .reduce((s, t) => s + Number(t.profit || 0), 0),
    [tradingLogic.trades]
  );
  const demoUnrealized = useMemo(
    () => demoTradesWithLive.filter(t => (t.status || '').toLowerCase() === 'open')
      .reduce((s, t) => s + Number(t.upnl || 0), 0),
    [demoTradesWithLive]
  );

  const realRealized = useMemo(
    () => realTrades.filter(t => (t.status || '').toLowerCase() === 'closed')
      .reduce((s, t) => s + Number(t.profit || 0), 0),
    [realTrades]
  );
  const realUnrealized = useMemo(
    () => realTradesWithLive.filter(t => (t.status || '').toLowerCase() === 'open')
      .reduce((s, t) => s + Number(t.upnl || 0), 0),
    [realTradesWithLive]
  );

  const stats = {
    virtualBalance: mode === 'demo' ? tradingLogic.virtualBalance : realBalance,
    totalProfit:
      mode === 'demo'
        ? demoRealized + demoUnrealized
        : realRealized + realUnrealized,
    openTradesCount:
      mode === 'demo'
        ? safe(tradingLogic.trades).filter(t => (t.status || '').toLowerCase() === 'open').length
        : safe(realTrades).filter((t) => (t.status || '').toLowerCase() === 'open').length,
    totalTradesCount:
      mode === 'demo' ? safe(tradingLogic.trades).length : safe(realTrades).length,
  };

  // =================== Gráfico: usar history “cercano” ===================
  const baseForChart = parseBaseFromPair(tradingLogic.selectedPair);
  const chartHistory = useMemo(() => {
    // si hay history en DataContext, úsalo; si no, fallback al del motor
    const liveHist = safe(marketPrices?.[baseForChart]?.history);
    const src = liveHist.length ? liveHist : tradingLogic.priceHistory;
    // acercar zoom a últimos ~240 puntos para ver fluctuaciones
    return safe(src).slice(-240);
  }, [marketPrices, baseForChart, tradingLogic.priceHistory]);

  // ============ Sincronizar par con pairOptions del admin ============
  useEffect(() => {
    if (!pairOptions?.length) return;
    // si el par actual no está disponible, forzar al primero
    const current = tradingLogic.selectedPair;
    if (!current || !pairOptions.includes(current)) {
      tradingLogic.setSelectedPair(pairOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairOptions?.join('|')]); // string join para evitar deps profundas

  // =================== Render ===================
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
              priceHistory={chartHistory}            // histórico “cercano”
              selectedPair={tradingLogic.selectedPair}
              cryptoPrices={marketPrices}            // feed real con reglas/admin
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
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center text-xs space-x-1 text-slate-400 mb-1">
                      <span className="text-purple-300 font-semibold">{msg.user}</span>
                      <span>{countryFlags[msg.country] || countryFlags.default}</span>
                      <span>{userLevels[msg.level] || userLevels.beginner}</span>
                      <span className="text-slate-500">{msg.time}</span>
                    </div>
                    <p className="text-sm text-slate-200 bg-slate-700 px-3 py-1.5 rounded-md">
                      {msg.text}
                    </p>
                  </motion.div>
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

        {/* 👇 No pasar todo el tradingLogic en modo real (para evitar filtraciones Demo->Real) */}
        <TradingPanel
          // control del par desde el hook (sirve para demo y real)
          selectedPair={tradingLogic.selectedPair}
          setSelectedPair={tradingLogic.setSelectedPair}

          // lista de pares generada por el admin (incluye custom)
          pairOptions={pairOptions}

          // abrir/cerrar operación (en ambos modos usa nuestros handlers)
          onTrade={handleTrade}
          openTrade={handleTrade}
          closeTrade={handleCloseTrade}

          // balance que se muestra en el panel según modo
          balance={mode === 'demo' ? tradingLogic.virtualBalance : realBalance}
          mode={mode}

          // abiertas correctas según modo (con uPnL)
          openTrades={mode === 'demo'
            ? demoTradesWithLive.filter(t => (t.status || '').toLowerCase() === 'open')
            : realTradesWithLive.filter(t => (t.status || '').toLowerCase() === 'open')}

          // Precios para cálculo instantáneo en inputs del panel
          cryptoPrices={marketPrices}
        />

        <TradesHistory
          trades={mode === 'demo' ? demoTradesWithLive : realTradesWithLive}
          cryptoPrices={marketPrices}
          closeTrade={handleCloseTrade}
        />
      </div>
    </>
  );
}
