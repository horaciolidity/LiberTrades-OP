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
  // API mínima que sí viene del TradingSimulator actualizado
  selectedPair,
  setSelectedPair,
  onTrade,                 // (tradeData) => void  (abre trade en demo o real según modo)
  mode = 'demo',
  balance = 0,
  cryptoPrices = {},

  // opcional (solo se muestra si está y modo demo)
  resetBalance,
}) {
  const { pairOptions: pairsFromCtx = [] } = useData();

  // estado local (ya no dependemos de props antiguas)
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeType, setTradeType] = useState('buy');
  const [tradeDuration, setTradeDuration] = useState(60); // seg
  const [isTrading, setIsTrading] = useState(false);

  // lista de pares dinámica con fallback
  const allPairs = useMemo(() => {
    const base = pairsFromCtx.length ? pairsFromCtx : ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT'];
    // asegura que el par seleccionado actual esté siempre
    return Array.from(new Set([selectedPair, ...base]));
  }, [pairsFromCtx, selectedPair]);

  const currentCrypto = useMemo(() => (selectedPair || 'BTC/USDT').split('/')[0], [selectedPair]);
  const currentPriceData = cryptoPrices[currentCrypto];
  const currentPrice = Number(currentPriceData?.price ?? 0);

  const canTrade = Number(tradeAmount) > 0 && currentPrice > 0 && !isTrading;

  const execute = async (side) => {
    setTradeType(side);
    if (!canTrade) return;
    setIsTrading(true);
    try {
      await onTrade?.({
        pair: selectedPair,
        type: side,                      // 'buy' | 'sell'
        amount: Number(tradeAmount),     // USD notional
        price: currentPrice,             // precio spot actual (si el caller lo usa)
        duration: tradeDuration,         // seg (demo)
      });
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
          {mode === 'demo' ? 'Ejecuta trades virtuales' : 'Órdenes en saldo real'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Par */}
        <div className="space-y-2">
          <Label className="text-white">Par de Trading</Label>
          <Select value={selectedPair} onValueChange={setSelectedPair}>
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
              <SelectValue />
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
            min="0"
            step="0.01"
          />
          <div className="flex gap-2">
            {[50, 100, 250, 500].map((v) => (
              <Button key={v} variant="secondary" size="xs" onClick={() => setTradeAmount(String(v))}>
                {v}
              </Button>
            ))}
          </div>
          <p className="text-xs text-slate-400">Saldo {mode === 'demo' ? 'virtual' : 'real'}: ${fmt(balance)}</p>
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
              <Clock className="h-3 w-3" /> En modo real esta duración sólo aplica al simulador; tus órdenes reales se cierran cuando decidas.
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

        {/* Reset demo (sólo visible si nos pasas el callback y estás en demo) */}
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
