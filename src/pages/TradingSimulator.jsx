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
import { useLivePrice } from '@/hooks/useLivePrice';



const DEFAULT_PAIR = 'BTC/USDT';

const countryFlags = {
  US: '🇺🇸', AR: '🇦🇷', BR: '🇧🇷', CO: '🇨🇴', MX: '🇲🇽', ES: '🇪🇸',
  DE: '🇩🇪', GB: '🇬🇧', FR: '🇫🇷', JP: '🇯🇵', CN: '🇨🇳', default: '🏳️',
};

const userLevels = {
  newbie: '🌱', beginner: '🥉', intermediate: '🥈',
  advanced: '🥇', pro: '🏆', legend: '💎',
};

const safe = (arr) => (Array.isArray(arr) ? arr : []);

// Base del par (BTC/USDT → BTC). Tolerante a formatos.
const parseBaseFromPair = (pair) => {
  const raw = String(pair || DEFAULT_PAIR);
  const p = raw.replace('/', '').toUpperCase();
  if (p.endsWith('USDT')) return p.slice(0, -4);
  if (p.endsWith('USDC')) return p.slice(0, -4);
  return p;
};

export default function TradingSimulator() {
  const { user } = useAuth();
  const { playSound } = useSound();

  // Feed global + RPC de cierre desde DataContext
  const { cryptoPrices: marketPrices = {}, closeTrade: closeTradeRPC, updateBalanceGlobal } = useData();
  const tradingLogic = useTradingLogic(); // DEMO local
 

  const [mode, setMode] = useState('demo'); // 'demo' | 'real'
  // Sincroniza el modo (demo / real) con el hook
useEffect(() => {
  tradingLogic.setIsRealMode(mode === 'real');
}, [mode]);


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

  // ====== Par seleccionado seguro ======
  const selectedPair = useMemo(
    () => tradingLogic?.selectedPair || DEFAULT_PAIR,
    [tradingLogic?.selectedPair]
  );

  useEffect(() => {
    if (!tradingLogic?.selectedPair && typeof tradingLogic?.setSelectedPair === 'function') {
      tradingLogic.setSelectedPair(DEFAULT_PAIR);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // === Precio live (para el base del par) usando useLivePrice ==
  // ============================================================
  const baseForChart = useMemo(
    () => parseBaseFromPair(selectedPair),
    [selectedPair]
  );

  const [instRow, setInstRow] = useState(null);
  const [ruleRows, setRuleRows] = useState([]);

  // Traer instrumento + reglas activas del símbolo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: inst, error: iErr } = await supabase
          .from('market_instruments')
          .select('*')
          .eq('symbol', baseForChart)
          .maybeSingle();
        if (iErr) throw iErr;
        if (!cancelled) setInstRow(inst || null);

        const { data: rules, error: rErr } = await supabase
          .from('market_rules')
          .select('*')
          .eq('symbol', baseForChart)
          .order('start_hour', { ascending: true });
        if (rErr) throw rErr;
        if (!cancelled) setRuleRows(safe(rules));
      } catch (e) {
        console.warn('[live instrument/rules]', e);
        if (!cancelled) { setInstRow(null); setRuleRows([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [baseForChart]);

  // Hook de precio vivo (usa WS de Binance si source='real', si no simula con reglas)
  const livePrice = useLivePrice(instRow, ruleRows);

  // Historial local (para el gráfico si el contexto no trae uno)
  const [localHistory, setLocalHistory] = useState([]);
  const histRef = useRef([]);
  // reset al cambiar de base
  useEffect(() => {
    histRef.current = [];
    setLocalHistory([]);
  }, [baseForChart]);
  // acumular puntos
  useEffect(() => {
    if (livePrice == null || !Number.isFinite(Number(livePrice))) return;
    const pt = { time: Date.now(), price: Number(livePrice) };
    histRef.current = [...histRef.current, pt].slice(-500);
    setLocalHistory(histRef.current);
  }, [livePrice]);

  // Mezclo el precio live en el mapa de precios del contexto
  const mergedPrices = useMemo(() => {
    const m = { ...marketPrices };
    if (livePrice != null && Number.isFinite(Number(livePrice))) {
      m[baseForChart] = {
        ...(m[baseForChart] || {}),
        price: Number(livePrice),
        history: (m[baseForChart]?.history?.length ? m[baseForChart].history : localHistory),
      };
    }
    return m;
  }, [marketPrices, baseForChart, livePrice, localHistory]);

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
    const base = parseBaseFromPair(trade?.pair || selectedPair);
    const current = Number(mergedPrices?.[base]?.price ?? 0);
    const entry = Number(trade?.price ?? trade?.priceAtExecution ?? 0);
    const amountUsd = Number(
      trade?.amountAtOpen ??
      trade?.amount_usd ??
      trade?.amount_usd_open ??
      trade?.notional_usd ??
      trade?.amount ??
      0
    );
    if (!current || !entry || !amountUsd) return { upnl: 0, livePrice: current || null };

    const qty = amountUsd / entry;
    const side = String(trade?.type || '').toLowerCase(); // buy | sell
    const upnl = side === 'sell' ? (entry - current) * qty : (current - entry) * qty;
    return { upnl, livePrice: current };
  };

  // Decorar trades con upnl/livePrice
  const demoTradesWithLive = useMemo(() => {
    return safe(tradingLogic.trades).map((t) => {
      const { upnl, livePrice } = computeLivePnL(t);
      return { ...t, upnl, livePrice };
    });
  }, [tradingLogic.trades, mergedPrices, selectedPair]);

  const realTradesWithLive = useMemo(() => {
    return safe(realTrades).map((t) => {
      const { upnl, livePrice } = computeLivePnL(t);
      return { ...t, upnl, livePrice, priceAtExecution: t.priceAtExecution ?? t.price };
    });
  }, [realTrades, mergedPrices, selectedPair]);

  // =================== Trading actions ===================
  // Abre trade (real)
  const handleTrade = async (tradeData) => {
    if (!user?.id) return;

    // Validación simple de saldo en modo real
    if (mode === 'real' && Number(tradeData.amount) > Number(realBalance)) {
      console.warn('[trade insert] monto supera el saldo disponible');
      return;
    }

    const payload = {
      user_id: user.id,
      pair: tradeData.pair,
      type: tradeData.type,
      amount: Number(tradeData.amount),
      price: Number(tradeData.price),
      status: 'open',
      timestamp: new Date().toISOString(),
    };

    console.log('[onTrade payload]', payload, { priceLive: mergedPrices });

    const { error: tErr } = await supabase.from('trades').insert(payload);
    if (tErr) {
      console.error('[trade insert] error:', tErr);
      return;
    }

   // ✅ Registrar movimiento y actualizar saldo (deducción real)
await updateBalanceGlobal(
  -Number(tradeData.amount),
  'USDC',
  true,
  'trade_open',
  {
    pair: tradeData.pair,
    price: tradeData.price,
    reference_id: `trade_open:${user.id}:${Date.now()}`
  }
);



    playSound?.('invest');
    fetchRealData();
  };

const handleCloseTrade = async (tradeId, maybeClosePrice = null, force = true) => {
 if (mode === 'demo') {
  const tr = tradingLogic.trades.find((x) => x.id === tradeId);
  if (!tr) return true;

  const base = parseBaseFromPair(tr.pair || selectedPair);
  const live = Number(mergedPrices?.[base]?.price ?? 0);
  const entry = Number(tr.priceAtExecution ?? tr.price ?? 0);
  const amountUsd = Number(tr.amountAtOpen ?? tr.amount ?? 0);
  const side = String(tr.type || '').toLowerCase();
  const qty = amountUsd / entry;
  const pnl = side === 'sell' ? (entry - live) * qty : (live - entry) * qty;
  const totalReturn = amountUsd + pnl;

  // 🔹 Actualiza el balance virtual directamente
  tradingLogic.setVirtualBalance((prev) => prev + totalReturn);

  // 🔹 Cierra el trade dentro del hook
  tradingLogic.closeTrade(tradeId, true);

  console.log('[DEMO closeTrade ✅]', { entry, live, pnl, totalReturn });
  playSound?.('success');
  return true;
}

  if (!tradeId) return false;

  try {
    let closePrice = Number(maybeClosePrice);
    if (!Number.isFinite(closePrice)) {
      const tr = realTrades.find((x) => x.id === tradeId);
      const base = parseBaseFromPair(tr?.pair || selectedPair);
      const live = Number(mergedPrices?.[base]?.price);
      closePrice = Number.isFinite(live) ? live : null;
    }

    const res = await closeTradeRPC?.(
      String(tradeId),
      Number.isFinite(closePrice) ? closePrice : null,
      true
    );

    const ok =
      res === true ||
      res?.ok === true ||
      res?.already === true ||
      res?.status === 'closed';

    if (ok) {
      const tr = realTrades.find((x) => x.id === tradeId);
      if (!tr) {
        console.warn('[handleCloseTrade] trade not found');
        return false;
      }

      const base = parseBaseFromPair(tr.pair);
      const live = Number(mergedPrices?.[base]?.price ?? 0);
      const entry = Number(tr.price ?? tr.priceAtExecution ?? 0);
      const amountUsd = Number(tr.amount ?? tr.amount_usd ?? tr.amountAtOpen ?? 0);
      const side = String(tr.type || '').toLowerCase();
      const qty = amountUsd / entry;
      const pnl = side === 'sell' ? (entry - live) * qty : (live - entry) * qty;
      const totalReturn = amountUsd + pnl;

      console.log('[handleCloseTrade ✅]', { entry, live, pnl, totalReturn });

      // 🔹 Devuelve monto + PnL con persistencia segura
      await updateBalanceGlobal(totalReturn, 'USDC', true, 'trade_close', {
        trade_id: tradeId,
        pair: tr.pair,
        entry_price: entry,
        close_price: live,
        profit: pnl,
        reference_id: `trade_close:${user.id}:${tradeId}`,
      });

      playSound?.('success');
      await fetchRealData();
      return true;
    }

    if (String(res?.error || '').includes('TRADE_NOT_FOUND')) {
      await fetchRealData();
      return true;
    }

    return false;
  } catch (e) {
    if (String(e?.message || '').toUpperCase().includes('TRADE NO ENCONTRADO')) {
      await fetchRealData();
      return true;
    }
    console.error('[handleCloseTrade RPC]', e);
    return false;
  }
};



  // Bridge único para el Panel (demo/real)
  const onTradeFromPanel = async (payload) => {
    if (mode === 'demo') {
      tradingLogic.executeTrade({
        pair: payload.pair,
        type: payload.type,
        amount: Number(payload.amount),
        priceAtExecution: Number(payload.price),
        duration: payload.duration,
      });
      return;
    }
    // REAL
    await handleTrade({
      pair: payload.pair,
      type: payload.type,
      amount: Number(payload.amount),
      price: Number(payload.price),
    });
  };

  // =================== Stats (con unrealized) ===================
  const demoRealized = useMemo(
    () => safe(tradingLogic.trades)
      .filter(t => (t.status || '').toLowerCase() === 'closed')
      .reduce((s, t) => s + Number(t.profit || 0), 0),
    [tradingLogic.trades]
  );
  const demoUnrealized = useMemo(
    () => demoTradesWithLive
      .filter(t => (t.status || '').toLowerCase() === 'open')
      .reduce((s, t) => s + Number(t.upnl || 0), 0),
    [demoTradesWithLive]
  );

  const realRealized = useMemo(
    () => realTrades
      .filter(t => (t.status || '').toLowerCase() === 'closed')
      .reduce((s, t) => s + Number(t.profit || 0), 0),
    [realTrades]
  );
  const realUnrealized = useMemo(
    () => realTradesWithLive
      .filter(t => (t.status || '').toLowerCase() === 'open')
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

  // =================== Gráfico: history “cercano” ===================
  const chartHistory = useMemo(() => {
    const liveHist = safe(mergedPrices?.[baseForChart]?.history);
    const src = liveHist.length ? liveHist : tradingLogic.priceHistory;
    return safe(src).slice(-240);
  }, [mergedPrices, baseForChart, tradingLogic.priceHistory]);

  // Operaciones abiertas para overlays del gráfico
  const openTradesForChart = useMemo(() => {
    const list = mode === 'demo' ? demoTradesWithLive : realTradesWithLive;
    return safe(list).filter(t => String(t.status || '').toLowerCase() === 'open');
  }, [mode, demoTradesWithLive, realTradesWithLive]);

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
          mode={mode}
        />

        {/* GRID principal: Chart (izq) + Panel (der) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-9">
            <TradingChart
              priceHistory={chartHistory}
              selectedPair={selectedPair}
              cryptoPrices={mergedPrices}
              openTrades={openTradesForChart}   // líneas guía + marcadores
              showGuides
            />
          </div>

          {/* Panel de Trading en la columna derecha */}
          <div className="xl:col-span-3">
           <TradingPanel
  selectedPair={selectedPair}
  setSelectedPair={tradingLogic.setSelectedPair}
  onTrade={onTradeFromPanel}
  mode={mode}
  balance={mode === 'demo' ? tradingLogic.virtualBalance : realBalance}
  cryptoPrices={{
    ...mergedPrices,
    [baseForChart]: {
      ...(mergedPrices[baseForChart] || {}),
      price: Number(livePrice) || Number(mergedPrices?.[baseForChart]?.price) || 0
    }
  }}
  resetBalance={mode === 'demo' ? tradingLogic.resetBalance : undefined}
/>

          </div>
        </div>

        {/* Chat */}
        <Card className="crypto-card">
          <CardHeader>
            <CardTitle className="text-white flex items-center text-lg">
              <MessageSquare className="h-5 w-5 mr-2 text-blue-400" />
              Chat de Traders
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3 max-h-[380px] overflow-y-auto">
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
            <div className="flex space-x-2 pt-2">
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

        <TradesHistory
          trades={mode === 'demo' ? demoTradesWithLive : realTradesWithLive}
          cryptoPrices={mergedPrices}
          // En real cierra vía RPC (server). En demo, cierra local.
          closeTrade={handleCloseTrade}
        />
      </div>
    </>
  );
}
