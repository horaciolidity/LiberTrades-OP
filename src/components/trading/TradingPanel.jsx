// src/components/trading/TradingPanel.jsx
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, RefreshCw, Clock } from 'lucide-react';
import { useData } from '@/contexts/DataContext';

const fmt = (n, dec = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(dec) : (0).toFixed(dec);
};

export default function TradingPanel({
  selectedPair,
  setSelectedPair,
  onTrade,                 // (tradeData) => Promise<void>
  mode = 'demo',           // 'demo' | 'real'
  balance = 0,             // USDC
  cryptoPrices = {},       // opcional: si no llega, usa DataContext
  resetBalance,            // opcional (solo demo)
}) {
  const {
    pairOptions: pairsFromCtx = [],
    cryptoPrices: pricesFromCtx = {},
  } = useData();

  // fallback a precios del contexto si no vienen por props
  const prices = useMemo(() => {
    const hasProp = cryptoPrices && Object.keys(cryptoPrices).length > 0;
    return hasProp ? cryptoPrices : (pricesFromCtx || {});
  }, [cryptoPrices, pricesFromCtx]);

  // base de pares con fallback, evitando undefined
  const basePairs = pairsFromCtx.length
    ? pairsFromCtx
    : ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT'];

  // lista de pares única, sin falsy
  const allPairs = useMemo(() => {
    const arr = [...(selectedPair ? [selectedPair] : []), ...basePairs];
    return Array.from(new Set(arr.filter(Boolean)));
  }, [basePairs, selectedPair]);

  // par efectivo para no quedar sin valor
  const effectivePair = selectedPair ?? allPairs[0] ?? 'BTC/USDT';

  // estado local
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeType, setTradeType] = useState('buy');
  const [tradeDuration, setTradeDuration] = useState(60); // seg
  const [isTrading, setIsTrading] = useState(false);

  // precio actual
  const currentCrypto = useMemo(() => (effectivePair || 'BTC/USDT').split('/')[0], [effectivePair]);
  const currentPriceData = prices?.[currentCrypto];
  const currentPrice = Number(currentPriceData?.price ?? 0);

  const amountNum = Number(tradeAmount);
  const hasPrice = currentPrice > 0 && Number.isFinite(currentPrice);
  const enoughBalance = mode === 'real' ? amountNum > 0 && amountNum <= Number(balance || 0) : amountNum > 0;

  const canTrade = hasPrice && enoughBalance && !isTrading;

  const execute = async (side) => {
    setTradeType(side);
    if (!canTrade) return;

    if (!onTrade) {
      console.warn('[TradingPanel] onTrade handler is missing');
      return;
    }

    setIsTrading(true);
    try {
      const payload = {
        pair: effectivePair,
        type: side,                 // 'buy' | 'sell'
        amount: amountNum,          // USD notional
        price: currentPrice,        // precio spot actual
        duration: tradeDuration,    // (demo)
        ts: Date.now(),             // útil para trazas
      };
      console.log('[onTrade payload]', payload, { priceLive: prices?.[currentCrypto] });
      await onTrade(payload);
    } catch (err) {
      console.error('Error ejecutando trade:', err);
    } finally {
      setIsTrading(false);
    }
  };

  return (
    <Card className="crypto-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Play className="h-5 w-5 mr-2 text-green-400" />
          Panel de Trading
        </CardTitle>
        <CardDescription className="text-slate-300">
          {mode === 'demo' ? 'Ejecuta trades virtuales' : 'Órdenes con saldo real'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Par */}
        <div className="space-y-2">
          <Label className="text-white">Par de Trading</Label>
          <Select
            value={effectivePair}
            onValueChange={(val) => setSelectedPair?.(val)}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
              <SelectValue placeholder="Selecciona un par" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              {allPairs.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Monto */}
        <div className="space-y-2">
          <Label className="text-white">Monto ($)</Label>
          <Input
            type="number"
            inputMode="decimal"
            value={tradeAmount}
            onChange={(e) => setTradeAmount(e.target.value)}
            placeholder="Ingresa el monto"
            className="bg-slate-800 border-slate-600 text-white"
            min="0.01"
            step="0.01"
          />
          <div className="flex gap-2">
            {[50, 100, 250, 500].map((v) => (
              <Button key={v} variant="secondary" size="xs" onClick={() => setTradeAmount(String(v))}>
                {v}
              </Button>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Saldo {mode === 'demo' ? 'virtual' : 'real'}: ${fmt(balance)}
          </p>
          {mode === 'real' && amountNum > Number(balance || 0) && (
            <p className="text-xs text-red-400">Saldo insuficiente para este monto.</p>
          )}
        </div>

        {/* Duración (demo) */}
        <div className="space-y-2">
          <Label className="text-white">Duración</Label>
          <Select value={String(tradeDuration)} onValueChange={(val) => setTradeDuration(parseInt(val, 10))}>
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="60">1 Minuto</SelectItem>
              <SelectItem value="300">5 Minutos</SelectItem>
              <SelectItem value="900">15 Minutos</SelectItem>
            </SelectContent>
          </Select>
          {mode !== 'demo' && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" /> La duración es sólo para el simulador; en real cerrás manualmente.
            </p>
          )}
        </div>

        {/* Info de precio */}
        {currentPriceData && (
          <div className="bg-slate-800/50 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400">Precio Actual:</span>
              <span className="text-white font-semibold">${fmt(currentPriceData.price)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Cambio 24h:</span>
              <span className={`font-semibold ${Number(currentPriceData.change) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {fmt(currentPriceData.change)}%
              </span>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={() => execute('buy')}
            disabled={!canTrade}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {isTrading && tradeType === 'buy' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2 rotate-90" />
            )}
            COMPRA
          </Button>

          <Button
            onClick={() => execute('sell')}
            disabled={!canTrade}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {isTrading && tradeType === 'sell' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2 -rotate-90" />
            )}
            VENTA
          </Button>
        </div>

        {/* Reset demo */}
        {mode === 'demo' && typeof resetBalance === 'function' && (
          <Button
            onClick={resetBalance}
            variant="outline"
            className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            Reiniciar Saldo Virtual
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
