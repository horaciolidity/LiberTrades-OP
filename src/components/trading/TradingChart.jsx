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
  { key: '5s', sec: 5 },
  { key: '15s', sec: 15 },
  { key: '1m', sec: 60 },
  { key: '5m', sec: 300 },
  { key: '15m', sec: 900 },
];

const n   = (x, f = NaN) => (Number.isFinite(Number(x)) ? Number(x) : f);
const fmt = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '--');

const toEpochSec = (t) => {
  if (!t && t !== 0) return undefined;
  const num = Number(t);
  if (Number.isFinite(num)) return num > 2e10 ? Math.floor(num / 1000) : Math.floor(num);
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
};

// Construye velas OHLC a partir de ticks {time, value}
function aggregate(points = [], tfSec = 60, limit = 200) {
  const tf = Math.max(1, tfSec);
  const rows = (Array.isArray(points) ? points : [])
    .map((p) => ({ t: toEpochSec(p.time), v: n(p.value) }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.v))
    .sort((a, b) => a.t - b.t);

  const buckets = new Map();
  for (const { t, v } of rows) {
    const b = Math.floor(t / tf) * tf;
    const prev = buckets.get(b);
    if (!prev) buckets.set(b, { time: b, open: v, high: v, low: v, close: v });
    else {
      prev.high = Math.max(prev.high, v);
      prev.low  = Math.min(prev.low,  v);
      prev.close = v;
    }
  }
  const arr = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  return arr.length > limit ? arr.slice(arr.length - limit) : arr;
}

export default function TradingChart({
  selectedPair = 'BTC/USDT',
  cryptoPrices = {},
  openTrades = [],
  showGuides = true,
  lastNBars = DEFAULT_LAST_BARS,
}) {
  const { assetToSymbol, cryptoPrices: ctxPrices = {} } = useData();

  const containerRef   = useRef(null);
  const chartRef       = useRef(null);
  const seriesRef      = useRef(null);
  const entryLinesRef  = useRef({});
  const [tf, setTf]    = useState(TIMEFRAMES[2]); // 1m por defecto

  const base         = (selectedPair.split?.('/')?.[0] || 'BTC').toUpperCase();
  const info         = cryptoPrices?.[base] || ctxPrices?.[base] || {};
  const change24     = n(info.change, NaN);
  const binanceSymbol = assetToSymbol?.[base] || null;

  // --- Binance (si existe símbolo real) ---
  const { candles: liveCandles, price: livePriceHook, status } =
    useBinanceKlines(binanceSymbol, tf.key, lastNBars, { enabled: !!binanceSymbol });

  // --- Velas desde DB (para simuladas/manuales) ---
  const [dbCandles, setDbCandles] = useState([]);
  const [dbUpdatedAt, setDbUpdatedAt] = useState(0);

  // fetch inicial + cuando cambia TF/símbolo
  useEffect(() => {
    let cancelled = false;
    async function fetchDB() {
      if (binanceSymbol) { setDbCandles([]); setDbUpdatedAt(0); return; }
      const { data, error } = await supabase.rpc('get_candles', {
        p_symbol: base,
        p_seconds: tf.sec,
        p_limit: lastNBars,
      });
      if (!cancelled && !error && Array.isArray(data)) {
        setDbCandles(
          data
            .map(r => ({
              time: Number(r.time),     // <- devuelve 'time'
              open: Number(r.open),
              high: Number(r.high),
              low:  Number(r.low),
              close:Number(r.close),
            }))
            .filter(c => [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite))
            .sort((a,b) => a.time - b.time)
        );
        setDbUpdatedAt(Date.now());
      }
    }
    fetchDB();
    return () => { cancelled = true; };
  }, [base, tf.sec, lastNBars, binanceSymbol]);

  // Realtime: escuchamos INSERTs en market_ticks (tu simulador escribe ahí)
  useEffect(() => {
    if (binanceSymbol) return;
    const channel = supabase
      .channel(`ticks:${base}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'market_ticks', filter: `symbol=eq.${base}` },
        () => {
          supabase.rpc('get_candles', { p_symbol: base, p_seconds: tf.sec, p_limit: lastNBars })
            .then(({ data, error }) => {
              if (!error && Array.isArray(data)) {
                setDbCandles(
                  data
                    .map(r => ({ time:+r.time, open:+r.open, high:+r.high, low:+r.low, close:+r.close }))
                    .filter(c => [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite))
                    .sort((a,b)=>a.time-b.time)
                );
                setDbUpdatedAt(Date.now());
              }
            });
        }
      )
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch {} };
  }, [base, tf.sec, lastNBars, binanceSymbol]);

  // Poll de respaldo cada 5s (por si Realtime está apagado)
  useEffect(() => {
    if (binanceSymbol) return;
    const id = setInterval(() => {
      // si hace >10s que no actualizamos desde DB, refetch
      if (Date.now() - dbUpdatedAt > 10000) {
        supabase.rpc('get_candles', { p_symbol: base, p_seconds: tf.sec, p_limit: lastNBars })
          .then(({ data, error }) => {
            if (!error && Array.isArray(data)) {
              setDbCandles(
                data
                  .map(r => ({ time:+r.time, open:+r.open, high:+r.high, low:+r.low, close:+r.close }))
                  .filter(c => [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite))
                  .sort((a,b)=>a.time-b.time)
              );
              setDbUpdatedAt(Date.now());
            }
          });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [base, tf.sec, lastNBars, binanceSymbol, dbUpdatedAt]);

  // --- Fallback manual (si no hay DB ni Binance) ---
  const [localTicks, setLocalTicks] = useState([]);
  useEffect(() => {
    if (binanceSymbol) return; // sólo para manuales/simuladas
    const v = n(info.price);
    if (!Number.isFinite(v)) return;
    const t = Math.floor(Date.now() / 1000);
    setLocalTicks((prev) => {
      const next = [...prev, { time: t, value: v }];
      const from = t - tf.sec * (lastNBars + 2);
      return next.filter((p) => toEpochSec(p.time) >= from);
    });
  }, [binanceSymbol, info.price, tf.sec, lastNBars]);

  const manualCandles = useMemo(() => {
    const pts = Array.isArray(info.history) && info.history.length ? info.history : localTicks;
    return aggregate(pts, tf.sec, lastNBars);
  }, [info.history, localTicks, tf.sec, lastNBars]);

  // Fuente final
  const useLive   = !!binanceSymbol;
  const candles   = useLive ? liveCandles : (dbCandles.length ? dbCandles : manualCandles);
  const livePrice = useLive
    ? (Number.isFinite(livePriceHook) ? livePriceHook : n(info.price))
    : n(info.price);

  // --- montar chart ---
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

  // --- pintar velas ---
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const safe = (candles || [])
      .filter((c) =>
        Number.isFinite(c.time) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
      )
      .slice(-Math.max(lastNBars, 20));

    if (!safe.length) { series.setData([]); return; }

    series.setData(safe);
    const from = safe[0].time;
    const to   = safe[safe.length - 1].time;
    chart.timeScale().setVisibleRange({ from, to });
    chart.timeScale().scrollToRealTime();
  }, [candles, lastNBars]);

  // --- overlays PnL ---
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
        const side  = String(t.type || '').toLowerCase();
        const entry = n(t.price ?? t.priceAtExecution, NaN);
        if (!Number.isFinite(entry)) return;

        const qty    = n(t.amount, 0) / Math.max(entry, 1e-9);
        const upnl   = side === 'sell' ? (entry - livePrice) * qty : (livePrice - entry) * qty;
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
            price: sl, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `SL ${fmt(sl)}`
          });
        }
        const tp = n(t.takeProfit ?? t.takeprofit, NaN);
        if (Number.isFinite(tp)) {
          obj.tp = series.createPriceLine({
            price: tp, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP ${fmt(tp)}`
          });
        }

        entryLinesRef.current[id] = obj;
      });
  }, [openTrades, selectedPair, showGuides, livePrice]);

  // --- marcadores de entrada ---
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
