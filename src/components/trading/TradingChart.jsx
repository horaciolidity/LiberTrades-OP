// src/components/trading/TradingChart.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';

const DEFAULT_LAST_BARS = 120;

const n = (x, f = NaN) => {
  const v = Number(x);
  return Number.isFinite(v) ? v : f;
};
const fmt = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '--');

// normaliza epoch a **segundos**
const toEpochSec = (t) => {
  if (!t && t !== 0) return undefined;
  if (typeof t === 'string') {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
  }
  const num = Number(t);
  if (!Number.isFinite(num)) return undefined;
  // heurística ms/seg
  return num > 2e10 ? Math.floor(num / 1000) : Math.floor(num);
};

// === agregador: ticks -> velas por timeframe (segundos)
function aggregateToCandles(points, tfSec) {
  const tf = Math.max(1, Math.floor(tfSec || 60));
  const rows = (Array.isArray(points) ? points : [])
    .map((p) => ({ t: toEpochSec(p.time), v: n(p.value) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && Math.abs(p.v) < 1e9)
    .sort((a, b) => a.t - b.t);

  const buckets = new Map();
  for (const { t, v } of rows) {
    const bucket = Math.floor(t / tf) * tf;
    const prev = buckets.get(bucket);
    if (!prev) {
      buckets.set(bucket, { time: bucket, open: v, high: v, low: v, close: v });
    } else {
      prev.high = Math.max(prev.high, v);
      prev.low = Math.min(prev.low, v);
      prev.close = v;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

// si el historial viene muy corto, sembramos velas “constantes” con leve jitter
function seedIfShort(candles, lastPrice, tfSec, need = DEFAULT_LAST_BARS) {
  const out = [...(candles || [])];
  const tf = Math.max(1, tfSec || 60);
  if (out.length >= need && out[out.length - 1]?.close) return out;

  const now = Math.floor(Date.now() / 1000);
  const last = out[out.length - 1];
  let t = last?.time || (now - need * tf);
  let c = Number.isFinite(last?.close) ? last.close : Number(lastPrice || 0) || 1;

  while (out.length < need) {
    t += tf;
    // micro jitter para no dejar líneas completamente planas
    const j = (Math.random() - 0.5) * c * 0.0005; // ±5 bps
    const close = Math.max(0, c + j);
    out.push({ time: t, open: c, high: Math.max(c, close), low: Math.min(c, close), close });
    c = close;
  }
  return out;
}

const TIMEFRAMES = [
  { key: '5s',  sec: 5 },
  { key: '15s', sec: 15 },
  { key: '1m',  sec: 60 },
  { key: '5m',  sec: 300 },
  { key: '15m', sec: 900 },
];

export default function TradingChart({
  priceHistory = [],            // [{time, value}] (ms/seg/ISO)
  selectedPair,
  cryptoPrices = {},            // {SYM: {price, change, history}}
  openTrades = [],              // [{id,pair,type,amount,price|priceAtExecution,timestamp,stopLoss,takeProfit,status}]
  showGuides = true,
  lastNBars = DEFAULT_LAST_BARS,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const entryLinesRef = useRef({});

  const [tf, setTf] = useState(TIMEFRAMES[2]); // 1m por defecto

  const pair = typeof selectedPair === 'string' && selectedPair ? selectedPair : 'BTC/USDT';
  const base = (pair.split?.('/')?.[0] || 'BTC').toUpperCase();
  const info = cryptoPrices?.[base] || {};
  const livePrice = n(info.price);
  const priceStr = Number.isFinite(livePrice) ? livePrice.toFixed(2) : '--';
  const chg = n(info.change, NaN);
  const chgStr = Number.isFinite(chg) ? chg.toFixed(2) : '--';
  const chgPos = Number.isFinite(chg) ? chg >= 0 : true;

  const openForPair = useMemo(
    () =>
      (Array.isArray(openTrades) ? openTrades : [])
        .filter((t) => String(t?.pair || '').toUpperCase() === pair.toUpperCase())
        .filter((t) => String(t?.status || 'open').toLowerCase() === 'open'),
    [openTrades, pair]
  );

  // crea chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#D1D5DB',
      },
      grid: {
        vertLines: { color: 'rgba(71,85,105,0.35)' },
        horzLines: { color: 'rgba(71,85,105,0.35)' },
      },
      rightPriceScale: {
        borderColor: '#4B5563',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#4B5563',
        timeVisible: true,
        secondsVisible: true,
      },
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

  // set/actualiza velas cada vez que cambian el historial o timeframe
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const candlesRaw = aggregateToCandles(priceHistory, tf.sec);
    const seeded = seedIfShort(candlesRaw, info.price, tf.sec, lastNBars);
    const data = seeded.slice(-Math.max(lastNBars, 20)); // recorta a ventana visible

    // si hay velas inválidas, filtramos
    const safeData = data.filter(
      (c) =>
        Number.isFinite(c.time) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    );

    series.setData(safeData);
    if (safeData.length) {
      const first = safeData[0].time;
      const last = safeData[safeData.length - 1].time;
      chart.timeScale().setVisibleRange({ from: first, to: last });
    }
  }, [priceHistory, tf.sec, lastNBars, info.price]);

  // ====== Overlays (líneas de precio para trades abiertos) ======
  useEffect(() => {
    if (!showGuides) return;
    const series = seriesRef.current;
    if (!series) return;

    // limpia anteriores
    const prev = entryLinesRef.current || {};
    Object.values(prev).forEach((obj) => {
      try { obj?.entry && series.removePriceLine(obj.entry); } catch {}
      try { obj?.sl && series.removePriceLine(obj.sl); } catch {}
      try { obj?.tp && series.removePriceLine(obj.tp); } catch {}
    });
    entryLinesRef.current = {};

    // crea nuevas
    openForPair.forEach((t) => {
      const id = String(t.id ?? `${t.pair}:${t.timestamp ?? Math.random()}`);
      const side = String(t.type || '').toLowerCase();
      const entry = n(t.price ?? t.priceAtExecution, NaN);
      if (!Number.isFinite(entry)) return;

      const color = side === 'sell' ? '#ef4444' : '#22c55e';
      const obj = {};

      obj.entry = series.createPriceLine({
        price: entry,
        color,
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `${side === 'sell' ? 'SELL' : 'BUY'} @ ${fmt(entry)}`,
      });

      const sl = n(t.stopLoss ?? t.stoploss, NaN);
      if (Number.isFinite(sl)) {
        obj.sl = series.createPriceLine({
          price: sl,
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `SL ${fmt(sl)}`,
        });
      }
      const tp = n(t.takeProfit ?? t.takeprofit, NaN);
      if (Number.isFinite(tp)) {
        obj.tp = series.createPriceLine({
          price: tp,
          color: '#22c55e',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `TP ${fmt(tp)}`,
        });
      }

      entryLinesRef.current[id] = obj;
    });
  }, [openForPair, showGuides]);

  // actualiza títulos con PnL vivo
  useEffect(() => {
    if (!showGuides) return;
    const series = seriesRef.current;
    if (!series) return;
    if (!Number.isFinite(livePrice)) return;

    const map = entryLinesRef.current || {};
    openForPair.forEach((t) => {
      const id = String(t.id ?? `${t.pair}:${t.timestamp ?? ''}`);
      const obj = map[id];
      if (!obj?.entry) return;

      const side = String(t.type || '').toLowerCase();
      const entry = n(t.price ?? t.priceAtExecution, NaN);
      const amt = n(t.amount, NaN);
      if (!Number.isFinite(entry) || !Number.isFinite(amt)) return;

      const qty = amt / Math.max(entry, 1e-9);
      const upnl = side === 'sell' ? (entry - livePrice) * qty : (livePrice - entry) * qty;
      const upnlPct = (upnl / Math.max(amt, 1e-9)) * 100;

      try {
        obj.entry.applyOptions({
          title: `${side === 'sell' ? 'SELL' : 'BUY'} @ ${fmt(entry)}  |  PnL ${upnl >= 0 ? '+' : ''}${fmt(upnl)} (${upnlPct >= 0 ? '+' : ''}${fmt(upnlPct)}%)`,
        });
      } catch {}
    });
  }, [livePrice, openForPair, showGuides]);

  // marcadores de entrada
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const markers = openForPair
      .map((t) => {
        const sec = toEpochSec(t.timestamp);
        const price = n(t.price ?? t.priceAtExecution, NaN);
        if (!sec || !Number.isFinite(price)) return null;

        const side = String(t.type || '').toLowerCase();
        const isBuy = side !== 'sell';
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
  }, [openForPair]);

  return (
    <Card className="crypto-card h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-white flex items-center text-lg sm:text-xl">
              <TrendingUp className="h-5 w-5 mr-2 text-green-400" />
              Gráfico de {pair}
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs sm:text-sm">
              Precio en tiempo real — {tf.key} • {lastNBars} barras
            </CardDescription>
          </div>

          {/* Toolbar de timeframe */}
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
            <p className="text-xl sm:text-2xl font-bold text-white">${priceStr}</p>
            <p className={`text-xs sm:text-sm ${chgPos ? 'text-green-400' : 'text-red-400'}`}>
              {chgStr}% (24h)
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
