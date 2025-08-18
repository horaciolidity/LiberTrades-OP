import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

const toUtcSeconds = (t) => {
  if (!t) return Math.floor(Date.now() / 1000);
  // Si viene en milisegundos:
  if (t > 1e12) return Math.floor(t / 1000);
  // Si ya está en segundos:
  if (t > 1e9) return Math.floor(t);
  // Fallback (trata como segundos)
  return Math.floor(t);
};

const TradingChart = ({ priceHistory = [], selectedPair = 'BTC/USDT', cryptoPrices = {} }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  // Crear chart una sola vez
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#D1D5DB',
      },
      grid: {
        vertLines: { color: 'rgba(71, 85, 105, 0.45)' },
        horzLines: { color: 'rgba(71, 85, 105, 0.45)' },
      },
      rightPriceScale: {
        borderColor: '#4B5563',
        scaleMargins: { top: 0.12, bottom: 0.12 }, // deja aire como en demo
        autoScale: true,
      },
      timeScale: {
        borderColor: '#4B5563',
        timeVisible: true,
        secondsVisible: true,              // 1s resolution
        rightOffset: 4,
        barSpacing: 8,                     // densidad de velas similar a demo
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      crosshair: { mode: 0 },
    });

    seriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    const handleResize = () => {
      if (!chartRef.current || !chartContainerRef.current) return;
      chartRef.current.resize(
        chartContainerRef.current.clientWidth,
        chartContainerRef.current.clientHeight
      );
    };

    window.addEventListener('resize', handleResize);
    // primer ajuste
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, []);

  // Actualiza datos
  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    // Ordenamos por tiempo ascendente
    const sorted = [...priceHistory]
      .filter(p => p && p.value != null && p.time != null)
      .sort((a, b) => a.time - b.time);

    // Ajuste de precisión según precio actual
    const baseSymbol = (selectedPair || 'BTC/USDT').split('/')[0];
    const px = Number(cryptoPrices?.[baseSymbol]?.price ?? sorted.at(-1)?.value ?? 0);
    const precision = px > 0 && px < 1 ? 4 : 2;
    seriesRef.current.applyOptions({
      priceFormat: { type: 'price', precision, minMove: precision === 4 ? 0.0001 : 0.01 },
    });

    if (sorted.length) {
      // Convertimos serie {time,value} a OHLC "suave" a partir del paso anterior
      const candlestickData = sorted.map((d, i) => {
        const prev = sorted[i - 1] || d;
        const o = Number(prev.value);
        const c = Number(d.value);
        const h = Math.max(o, c);
        const l = Math.min(o, c);
        return {
          time: toUtcSeconds(d.time), // ← NO dividir por 1000 si ya está en segundos
          open: o,
          high: h,
          low: l,
          close: c,
        };
      });

      seriesRef.current.setData(candlestickData);
      chartRef.current.timeScale().fitContent();
    } else {
      seriesRef.current.setData([]);
    }
  }, [priceHistory, selectedPair, cryptoPrices]);

  const currentCrypto = selectedPair.split('/')[0];
  const currentPriceData = cryptoPrices[currentCrypto];

  return (
    <Card className="crypto-card h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-white flex items-center text-lg sm:text-xl">
              <TrendingUp className="h-5 w-5 mr-2 text-green-400" />
              Gráfico de {selectedPair}
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs sm:text-sm">
              Visualiza el precio en tiempo real
            </CardDescription>
          </div>
          {currentPriceData && (
            <div className="text-right">
              <p className="text-xl sm:text-2xl font-bold text-white">
                ${Number(currentPriceData.price).toFixed(currentPriceData.price < 1 ? 4 : 2)}
              </p>
              <p
                className={`text-xs sm:text-sm ${
                  Number(currentPriceData.change) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {Number(currentPriceData.change).toFixed(2)}% (24h)
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow p-2 sm:p-4">
        <div
          ref={chartContainerRef}
          className="w-full h-full min-h-[300px] sm:min-h-[400px] trading-chart rounded-lg"
        />
      </CardContent>
    </Card>
  );
};

export default TradingChart;
