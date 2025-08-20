// src/components/trading/TradingChart.jsx
import React, { useEffect, useRef, useMemo } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

const LAST_N_BARS = 120; // zoom cercano (últimos N ticks)
const n = (x, fallback = 0) => (Number.isFinite(Number(x)) ? Number(x) : fallback);
const fmt = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '--');

// normaliza epoch a segundos (admite ms, s y ISO)
const toEpochSec = (t) => {
  if (!t) return undefined;
  if (typeof t === 'string') {
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
  }
  const num = Number(t);
  if (!Number.isFinite(num)) return undefined;
  if (num > 1e12) return Math.floor(num / 1000); // ms grandes
  if (num > 1e9) return Math.floor(num);         // segundos
  return Math.floor(num / 1000);                 // ms chicos
};

const TradingChart = ({
  priceHistory = [],
  selectedPair,
  cryptoPrices = {},
  openTrades = [],       // [{id, pair, type, amount, price|priceAtExecution, timestamp, stopLoss/stoploss?, takeProfit/takeprofit?}]
  showGuides = true,
}) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const lastBarTimeRef = useRef(undefined); // epoch seconds del último bar pintado

  // refs para overlays
  const entryLinesRef = useRef({}); // { tradeId: {entry, sl?, tp?} }

  const pair = typeof selectedPair === 'string' && selectedPair ? selectedPair : 'BTC/USDT';
  const base = (pair.split?.('/')?.[0] || 'BTC').toUpperCase();
  const info = cryptoPrices?.[base] || {};
  const livePrice = n(info.price, 0);
  const priceStr = Number.isFinite(Number(info.price)) ? Number(info.price).toFixed(2) : '--';
  const chg = Number(info.change);
  const chgStr = Number.isFinite(chg) ? chg.toFixed(2) : '--';
  const chgPos = Number.isFinite(chg) ? chg >= 0 : true;

  const openForPair = useMemo(
    () =>
      (Array.isArray(openTrades) ? openTrades : [])
        .filter((t) => String(t?.pair || '').toUpperCase() === pair.toUpperCase())
        .filter((t) => (String(t?.status || 'open').toLowerCase() === 'open')),
    [openTrades, pair]
  );

  // Crear / destruir el chart
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

    // Responsivo
    const ro = new ResizeObserver((entries) => {
      if (!entries.length) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      try { ro.disconnect(); } catch {}
      // limpiar price lines
      try {
        const map = entryLinesRef.current || {};
        Object.values(map).forEach((obj) => {
          obj?.entry && series.removePriceLine(obj.entry);
          obj?.sl && series.removePriceLine(obj.sl);
          obj?.tp && series.removePriceLine(obj.tp);
        });
        entryLinesRef.current = {};
      } catch {}
      try { chart.remove(); } catch {}
      chartRef.current = null;
      seriesRef.current = null;
      lastBarTimeRef.current = undefined;
    };
  }, []);

  // Set/actualizar velas con datos
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const hist = Array.isArray(priceHistory) ? priceHistory : [];
    const sorted = hist
      .filter((p) => n(p.time) > 0 && n(p.value) > 0)
      .sort((a, b) => a.time - b.time);

    if (!sorted.length) {
      series.setData([]);
      lastBarTimeRef.current = undefined;
      return;
    }

    // Seed inicial (últimos N puntos)
    if (!lastBarTimeRef.current) {
      const seed = sorted.slice(-LAST_N_BARS);
      const seedCandles = seed.map((p, idx) => {
        const prev = seed[idx - 1] || p;
        return {
          time: Math.floor(n(p.time) / 1000),
          open: n(prev.value, n(p.value)),
          high: Math.max(n(prev.value), n(p.value)),
          low: Math.min(n(prev.value), n(p.value)),
          close: n(p.value),
        };
      });

      series.setData(seedCandles);

      if (seedCandles.length) {
        lastBarTimeRef.current = seedCandles[seedCandles.length - 1].time;
        if (seedCandles.length > 1) {
          const first = seedCandles[Math.max(0, seedCandles.length - LAST_N_BARS)].time;
          const last = seedCandles[seedCandles.length - 1].time;
          chart.timeScale().setVisibleRange({ from: first, to: last });
        }
      }
      return;
    }

    // Actualización incremental
    const lastPoint = sorted[sorted.length - 1];
    thePrevPoint = sorted[sorted.length - 2] || lastPoint;
    const prevPoint = sorted[sorted.length - 2] || lastPoint;
    const lastSec = Math.floor(n(lastPoint.time) / 1000);

    const candle = {
      time: lastSec,
      open: n(prevPoint.value, n(lastPoint.value)),
      high: Math.max(n(prevPoint.value), n(lastPoint.value)),
      low: Math.min(n(prevPoint.value), n(lastPoint.value)),
      close: n(lastPoint.value),
    };

    if (lastSec > lastBarTimeRef.current) {
      series.update(candle);
      lastBarTimeRef.current = lastSec;

      const to = lastSec;
      const from = to - LAST_N_BARS * 2;
      chart.timeScale().setVisibleRange({ from, to });
    } else if (lastSec === lastBarTimeRef.current) {
      series.update(candle);
    }
  }, [priceHistory]);

  // ====== Overlays: price lines por operación abierta ======
  useEffect(() => {
    if (!showGuides) return;
    const series = seriesRef.current;
    if (!series) return;

    // Limpia anteriores
    const prev = entryLinesRef.current || {};
    Object.values(prev).forEach((obj) => {
      try { obj?.entry && series.removePriceLine(obj.entry); } catch {}
      try { obj?.sl && series.removePriceLine(obj.sl); } catch {}
      try { obj?.tp && series.removePriceLine(obj.tp); } catch {}
    });
    entryLinesRef.current = {};

    // Crea nuevas para las operaciones del par
    openForPair.forEach((t) => {
      const id = String(t.id ?? `${t.pair}:${t.timestamp ?? Math.random()}`);
      const side = String(t.type || '').toLowerCase(); // buy | sell
      const entry = n(t.price ?? t.priceAtExecution, NaN);
      if (!Number.isFinite(entry)) return;

      const color = side === 'sell' ? '#ef4444' : '#22c55e';
      const obj = {};

      obj.entry = series.createPriceLine({
        price: entry,
        color,
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: `${side === 'sell' ? 'SELL' : 'BUY'} @ ${fmt(entry)}`,
      });

      // stop / take (admite camel y snake)
      const sl = n(t.stopLoss ?? t.stoploss, NaN);
      if (Number.isFinite(sl)) {
        obj.sl = series.createPriceLine({
          price: sl,
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: 2, // Dashed
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
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: `TP ${fmt(tp)}`,
        });
      }

      entryLinesRef.current[id] = obj;
    });
  }, [openForPair, showGuides]);

  // Actualiza el título de las líneas con PnL vivo
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

      const qty = amt / entry;
      const upnl = side === 'sell' ? (entry - livePrice) * qty : (livePrice - entry) * qty;
      const upnlPct = (upnl / Math.max(1e-9, amt)) * 100;

      try {
        obj.entry.applyOptions({
          title: `${side === 'sell' ? 'SELL' : 'BUY'} @ ${fmt(entry)}  |  PnL ${upnl >= 0 ? '+' : ''}${fmt(upnl)} (${upnlPct >= 0 ? '+' : ''}${fmt(upnlPct)}%)`,
        });
      } catch {}
    });
  }, [livePrice, openForPair, showGuides]);

  // Marcadores de entrada en la serie
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
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-white flex items-center text-lg sm:text-xl">
              <TrendingUp className="h-5 w-5 mr-2 text-green-400" />
              Gráfico de {pair}
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs sm:text-sm">
              Precio en tiempo real (zoom a {LAST_N_BARS} ticks)
            </CardDescription>
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
        <div
          ref={containerRef}
          className="w-full h-full min-h-[300px] sm:min-h-[400px] rounded-lg"
        />
      </CardContent>
    </Card>
  );
};

export default TradingChart;
