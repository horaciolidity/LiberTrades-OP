import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

const TradingChart = ({ priceHistory, selectedPair, cryptoPrices }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (!chartRef.current) {
      chartRef.current = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight, // Make chart responsive
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#D1D5DB',
        },
        grid: {
          vertLines: { color: 'rgba(71, 85, 105, 0.5)' },
          horzLines: { color: 'rgba(71, 85, 105, 0.5)' },
        },
        timeScale: {
          borderColor: '#4B5563',
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: 0, 
        },
      });
      seriesRef.current = chartRef.current.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderDownColor: '#ef4444',
        borderUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        wickUpColor: '#22c55e',
      });
    }

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.resize(chartContainerRef.current.clientWidth, chartContainerRef.current.clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); 
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && priceHistory && priceHistory.length > 0) {
      const sortedPriceHistory = [...priceHistory].sort((a, b) => a.time - b.time);
      
      const candlestickData = sortedPriceHistory.map((data, index) => {
        const prevData = sortedPriceHistory[index - 1] || data;
        return {
          time: data.time / 1000, 
          open: prevData.value,
          high: Math.max(prevData.value, data.value),
          low: Math.min(prevData.value, data.value),
          close: data.value,
        };
      });

      if (candlestickData.length > 0) {
        seriesRef.current.setData(candlestickData);
        chartRef.current.timeScale().fitContent();
      }
    } else if (seriesRef.current) {
      seriesRef.current.setData([]); 
    }
  }, [priceHistory]);

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
              <p className="text-xl sm:text-2xl font-bold text-white">${currentPriceData.price.toFixed(2)}</p>
              <p className={`text-xs sm:text-sm ${currentPriceData.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {currentPriceData.change.toFixed(2)}% (24h)
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow p-2 sm:p-4">
        <div ref={chartContainerRef} className="w-full h-full min-h-[300px] sm:min-h-[400px] trading-chart rounded-lg" />
      </CardContent>
    </Card>
  );
};

export default TradingChart;