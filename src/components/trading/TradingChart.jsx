// src/components/trading/TradingChart.jsx
import React, { useEffect, useRef } from 'react';
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

const TradingChart = ({ priceHistory = [], selectedPair, cryptoPrices = {} }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const lastBarTimeRef = useRef(undefined); // epoch seconds del último bar pintado

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

    // Normaliza, filtra NaN/0 y ordena por tiempo
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
        // Zoom cercano si hay más de una vela
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
      // Nueva vela
      series.update(candle);
      lastBarTimeRef.current = lastSec;

      // Mantener el foco en los últimos N
      const to = lastSec;
      const from = to - LAST_N_BARS * 2; // ventana razonable
      chart.timeScale().setVisibleRange({ from, to });
    } else if (lastSec === lastBarTimeRef.current) {
      // Mismo segundo: refresca la vela actual
      series.update(candle);
    }
  }, [priceHistory]);

  // Cabecera
  const pair = typeof selectedPair === 'string' && selectedPair ? selectedPair : 'BTC/USDT';
  const base = (pair.split?.('/')?.[0] || 'BTC').toUpperCase();
  const info = cryptoPrices?.[base] || {};
  const priceStr = Number.isFinite(Number(info.price)) ? Number(info.price).toFixed(2) : '--';
  const chg = Number(info.change);
  const chgStr = Number.isFinite(chg) ? chg.toFixed(2) : '--';
  const chgPos = Number.isFinite(chg) ? chg >= 0 : true;

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
