// src/components/trading/TradingChart.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import { useBinanceKlines } from '@/hooks/useBinanceKlines';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/supabaseClient';

const DEFAULT_LAST_BARS = 200;
const TIMEFRAMES = [
  { key: '5s',  sec: 5 },
  { key: '15s', sec: 15 },
  { key: '1m',  sec: 60 },
  { key: '5m',  sec: 300 },
  { key: '15m', sec: 900 },
];

const n = (x, f = NaN) => (Number.isFinite(Number(x)) ? Number(x) : f);
const fmt = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '--');

const toEpochSec = (t) => {
  if (t === 0) return 0;
  if (!t) return undefined;
  const num = Number(t);
  if (Number.isFinite(num)) return num > 2e10 ? Math.floor(num / 1000) : Math.floor(num);
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
};

// --- throttle para no spamear el chart ---
function throttle(fn, wait = 150) {
  let last = 0, timer = null, ctx, args;
  return function (...a) {
    ctx = this; args = a;
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timer); timer = null;
      last = now; fn.apply(ctx, args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now(); timer = null; fn.apply(ctx, args);
      }, remaining);
    }
  };
}

// Construye velas OHLC desde filas RPC (bucket + ohlc)
const mapRpcCandles = (rows) =>
  (rows || [])
    .map((r) => ({
      time: Number(r.bucket),
      open: Number(r.open),
      high: Number(r.high),
      low:  Number(r.low),
      close:Number(r.close),
    }))
    .filter((c) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);

// "BTC/USDT" -> { lhs:"BTC", rhs:"USDT", symbol:"BTCUSDT" }
const parsePair = (pair) => {
  const [lhsRaw, rhsRaw = 'USDT'] = String(pair || 'BTC/USDT').replace(/\s+/g, '').split('/');
  const lhs = (lhsRaw || 'BTC').toUpperCase();
  const rhs = (rhsRaw || 'USDT').toUpperCase();
  return { lhs, rhs, symbol: `${lhs}${rhs}` };
};

export default function TradingChart({
  selectedPair = 'BTC/USDT',
  cryptoPrices = {},
  openTrades = [],
  showGuides = true,
  lastNBars = DEFAULT_LAST_BARS,
}) {
  const { assetToSymbol, cryptoPrices: ctxPrices = {} } = useData();

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const entryLinesRef = useRef({});
  const channelRef = useRef(null);

  // Mantener velas actuales en un ref para updates incrementales
  const candlesRef = useRef([]);
  const [tf, setTf] = useState(TIMEFRAMES[2]); // 1m por defecto
  const [seedKey, setSeedKey] = useState(0);    // fuerza re-seed al cambiar tf/pair

  const { lhs, rhs, symbol: dbSymbol } = parsePair(selectedPair);

  // info para el precio mostrado (por activo base)
  const info = cryptoPrices?.[lhs] || ctxPrices?.[lhs] || {};
  const change24 = n(info.change, NaN);

  // si hay mapeo binance por activo base (ej: BTC -> BTCUSDT), usar ese feed
  const binanceSymbol = assetToSymbol?.[lhs] || null;

  // ---- Binance (live) ----
  const { candles: liveCandles, price: livePriceHook, status } =
    useBinanceKlines(binanceSymbol, tf.key, lastNBars, { enabled: !!binanceSymbol });

  // ---- Precio a mostrar ----
  const livePrice = binanceSymbol
    ? (Number.isFinite(livePriceHook) ? livePriceHook : n(info.price))
    : n(info.price);

  // ---- Crear Chart una sola vez ----
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#D1D5DB' },
      grid: {
        vertLines: { color: 'rgba(71,85,105,0.35)' },
        horzLines: { color: 'rgba(71,85,105,0.35)' },
      },
      rightPriceScale: { borderColor: '#4B5563', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#4B5563', timeVisible: true, secondsVisible: true },
      crosshair: { mode: 0 },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      priceLineVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      if (!entries.length) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      try { ro.disconnect(); } catch {}
      try {
        const map = entryLinesRef.current || {};
        Object.values(map).forEach((obj) => {
          try { obj?.entry && series.removePriceLine(obj.entry); } catch {}
          try { obj?.sl && series.removePriceLine(obj.sl); } catch {}
          try { obj?.tp && series.removePriceLine(obj.tp); } catch {}
        });
        entryLinesRef.current = {};
      } catch {}
      try { chart.remove(); } catch {}
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // ---- Seed / Resync (RPC) para símbolos simulados ----
  useEffect(() => {
    let cancelled = false;

    async function seedFromRPC() {
      if (binanceSymbol) { candlesRef.current = []; return; }
      const { data, error } = await supabase.rpc('get_candles', {
        p_symbol: dbSymbol,          // <-- usar símbolo completo
        p_seconds: tf.sec,
        p_limit: lastNBars,
      });
      if (cancelled) return;
      if (error) return;

      const arr = mapRpcCandles(data).slice(-Math.max(lastNBars, 20));
      candlesRef.current = arr;

      const series = seriesRef.current; const chart = chartRef.current;
      if (!series || !chart) return;

      series.setData(arr);
      if (arr.length) {
        const from = arr[0].time;
        const to = arr[arr.length - 1].time;
        chart.timeScale().setVisibleRange({ from, to });
        chart.timeScale().scrollToRealTime();
      }
    }

    seedFromRPC();

    // Resync suave cada ~60s para corregir drift
    const resyncId = setInterval(seedFromRPC, 60000);

    return () => { cancelled = true; clearInterval(resyncId); };
  }, [seedKey, dbSymbol, tf.sec, lastNBars, binanceSymbol]);

  // ---- Realtime incremental (INSERT en market_ticks) para simulados ----
  useEffect(() => {
    if (binanceSymbol) {
      if (channelRef.current) { try { supabase.removeChannel(channelRef.current); } catch {} }
      return;
    }

    if (channelRef.current) { try { supabase.removeChannel(channelRef.current); } catch {} }

    const pushTick = throttle((tick) => {
      const series = seriesRef.current;
      if (!series) return;

      const tfSec = Math.max(1, tf.sec);
      const price = n(tick?.price, NaN);
      const tsSec = toEpochSec(tick?.ts);
      if (!Number.isFinite(price) || !Number.isFinite(tsSec)) return;

      const bucket = Math.floor(tsSec / tfSec) * tfSec;

      const buf = candlesRef.current || [];
      const last = buf[buf.length - 1];

      // 1) mismo bucket → actualizar O/H/L/C
      if (last && last.time === bucket) {
        const updated = {
          ...last,
          high: Math.max(last.high, price),
          low:  Math.min(last.low,  price),
          close: price,
        };
        buf[buf.length - 1] = updated;
        candlesRef.current = buf;
        series.update(updated);
        return;
      }

      // 2) bucket nuevo → pushear vela
      if (!last || bucket > last.time) {
        const open = last ? last.close : price;
        const fresh = { time: bucket, open, high: price, low: price, close: price };
        const next = [...buf, fresh].slice(-Math.max(lastNBars, 20));
        candlesRef.current = next;
        series.update(fresh);
        return;
      }

      // 3) atrasados: ignorar
    }, 120);

    const ch = supabase
      .channel(`ticks:${dbSymbol}:${tf.sec}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'market_ticks', filter: `symbol=eq.${dbSymbol}` },
        (payload) => pushTick(payload?.new)
      )
      .subscribe();

    channelRef.current = ch;

    return () => {
      try { supabase.removeChannel(ch); } catch {}
      channelRef.current = null;
    };
  }, [dbSymbol, tf.sec, lastNBars, binanceSymbol]);

  // ---- Si es Binance, pintar lo que venga del hook ----
  useEffect(() => {
    if (!binanceSymbol) return;
    const series = seriesRef.current; const chart = chartRef.current;
    if (!series || !chart) return;
    const safe = (liveCandles || []).filter(c =>
      Number.isFinite(c.time) && Number.isFinite(c.open) &&
      Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close)
    ).slice(-Math.max(lastNBars, 20));
    series.setData(safe);
    if (safe.length) {
      chart.timeScale().setVisibleRange({ from: safe[0].time, to: safe[safe.length - 1].time });
      chart.timeScale().scrollToRealTime();
    }
  }, [binanceSymbol, liveCandles, lastNBars]);

  // ---- Re-seed al cambiar par/timeframe ----
  useEffect(() => {
    setSeedKey((k) => k + 1);
  }, [dbSymbol, tf.sec]);

  // ---- Overlays PnL ----
  useEffect(() => {
    if (!showGuides) return;
    const series = seriesRef.current;
    if (!series) return;
    if (!Number.isFinite(livePrice)) return;

    const prev = entryLinesRef.current || {};
    Object.values(prev).forEach((obj) => {
      try { obj?.entry && series.removePriceLine(obj.entry); } catch {}
      try { obj?.sl && series.removePriceLine(obj.sl); } catch {}
      try { obj?.tp && series.removePriceLine(obj.tp); } catch {}
    });
    entryLinesRef.current = {};

    (Array.isArray(openTrades) ? openTrades : [])
      .filter((t) => String(t?.pair || '').toUpperCase() === selectedPair.toUpperCase())
      .filter((t) => String(t?.status || 'open').toLowerCase() === 'open')
      .forEach((t) => {
        const id = String(t.id ?? `${t.pair}:${t.timestamp ?? Math.random()}`);
        const side = String(t.type || '').toLowerCase();
        const entry = n(t.price ?? t.priceAtExecution, NaN);
        if (!Number.isFinite(entry)) return;

        const qty = n(t.amount, 0) / Math.max(entry, 1e-9);
        const upnl = side === 'sell' ? (entry - livePrice) * qty : (livePrice - entry) * qty;
        const upnlPc = (upnl / Math.max(n(t.amount, 0), 1e-9)) * 100;

        const obj = {};
        obj.entry = series.createPriceLine({
          price: entry,
          color: side === 'sell' ? '#ef4444' : '#22c55e',
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `${side === 'sell' ? 'SELL' : 'BUY'} @ ${fmt(entry)}  |  PnL ${upnl >= 0 ? '+' : ''}${fmt(upnl)} (${upnlPc >= 0 ? '+' : ''}${fmt(upnlPc)}%)`,
        });

        const sl = n(t.stopLoss ?? t.stoploss, NaN);
        if (Number.isFinite(sl)) {
          obj.sl = series.createPriceLine({
            price: sl, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `SL ${fmt(sl)}`,
          });
        }
        const tp = n(t.takeProfit ?? t.takeprofit, NaN);
        if (Number.isFinite(tp)) {
          obj.tp = series.createPriceLine({
            price: tp, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP ${fmt(tp)}`,
          });
        }
        entryLinesRef.current[id] = obj;
      });
  }, [openTrades, selectedPair, showGuides, livePrice]);

  // ---- Marcadores de entrada ----
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const markers = (Array.isArray(openTrades) ? openTrades : [])
      .filter((t) => String(t?.pair || '').toUpperCase() === selectedPair.toUpperCase())
      .filter((t) => String(t?.status || 'open').toLowerCase() === 'open')
      .map((t) => {
        const sec = toEpochSec(t.timestamp);
        const price = n(t.price ?? t.priceAtExecution, NaN);
        if (!sec || !Number.isFinite(price)) return null;
        const isBuy = String(t.type || '').toLowerCase() !== 'sell';
        return {
          time: sec,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#22c55e' : '#ef4444',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: `${isBuy ? 'BUY' : 'SELL'} ${fmt(price)}`,
        };
      })
      .filter(Boolean);

    try { series.setMarkers(markers); } catch {}
  }, [openTrades, selectedPair]);

  return (
    <Card className="crypto-card h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-white flex items-center text-lg sm:text-xl">
              <TrendingUp className="h-5 w-5 mr-2 text-green-400" />
              Gráfico de {selectedPair}
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs sm:text-sm">
              {binanceSymbol
                ? (status === 'live' ? 'Tiempo real (WS)'
                  : status === 'seeding' ? 'Cargando…'
                  : status === 'error' ? 'Error de feed' : '—')
                : 'Simulado (persistente)'} • {tf.key} • {lastNBars} barras
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            {TIMEFRAMES.map((opt) => (
              <Button
                key={opt.key}
                size="sm"
                variant={tf.key === opt.key ? 'default' : 'outline'}
                className={tf.key === opt.key ? 'bg-slate-700 text-white' : 'border-slate-600 text-slate-300'}
                onClick={() => setTf(opt)}
              >
                {opt.key}
              </Button>
            ))}
          </div>

          <div className="text-right">
            <p className="text-xl sm:text-2xl font-bold text-white">
              {Number.isFinite(livePrice) ? `$${fmt(livePrice)}` : '--'}
            </p>
            <p className={`text-xs sm:text-sm ${Number.isFinite(change24) && change24 >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {Number.isFinite(change24) ? fmt(change24) : '--'}% (24h)
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-grow p-2 sm:p-4">
        <div ref={containerRef} className="w-full h-full min-h-[300px] sm:min-h-[400px] rounded-lg" />
      </CardContent>
    </Card>
  );
}
