// src/components/trading/TradingPanel.jsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, RefreshCw, Clock } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const pairs = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT'];

const TradingPanel = ({
  // estado/control externo
  mode = 'demo',                  // 'demo' | 'real'
  selectedPair,
  setSelectedPair,
  tradeAmount,
  setTradeAmount,
  tradeType,
  setTradeType,
  tradeDuration = 60,
  setTradeDuration,

  // info y actions
  balance = 0,                    // saldo que muestra (virtual en demo, USDC en real)
  isTrading = false,
  onTrade,                        // (recomendado) function({ pair, type, amount, price })
  executeTrade,                   // (legacy) si no pasas onTrade, se usa esto (demo viejo)
  resetBalance,                   // sólo útil en demo
  cryptoPrices = {},
}) => {
  const base = (selectedPair || 'BTC/USDT').split('/')[0];
  const current = cryptoPrices?.[base] || null;
  const price = Number(current?.price ?? 0);
  const change = Number(current?.change ?? 0);

  const submit = async (type) => {
    try {
      setTradeType?.(type);
      const amountNum = Number(tradeAmount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        toast({ title: 'Monto inválido', description: 'Ingresa un monto mayor a 0.', variant: 'destructive' });
        return;
      }
      if (mode === 'real') {
        // Validar saldo real
        if (amountNum > Number(balance || 0)) {
          toast({
            title: 'Saldo insuficiente',
            description: 'El monto excede tu saldo disponible en USDC.',
            variant: 'destructive',
          });
          return;
        }
        // Validar precio disponible
        if (!price || !Number.isFinite(price)) {
          toast({
            title: 'Precio no disponible',
            description: 'No se pudo obtener el precio actual para este par.',
            variant: 'destructive',
          });
          return;
        }
      }

      // Construimos payload estándar
      const payload = {
        pair: selectedPair,
        type,
        amount: amountNum,
        price: price || 0, // en demo lo puede ignorar el motor interno
        duration: tradeDuration,
      };

      if (typeof onTrade === 'function') {
        await onTrade(payload);         // nuevo flujo (demo/real resuelto desde el contenedor)
      } else if (typeof executeTrade === 'function') {
        await executeTrade();           // compat: motor demo antiguo lee estados internos
      } else {
        console.warn('No hay handler de trade (onTrade ni executeTrade).');
      }
    } catch (e) {
      toast({
        title: 'No se pudo ejecutar la operación',
        description: e?.message || 'Intenta nuevamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="crypto-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Play className="h-5 w-5 mr-2 text-green-400" />
          Panel de Trading {mode === 'real' ? '(Real)' : '(Demo)'}
        </CardTitle>
        <CardDescription className="text-slate-300">
          {mode === 'real'
            ? 'Opera con saldo real (USDC).'
            : 'Ejecuta trades virtuales con saldo demo.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Saldo visible */}
        <div className="bg-slate-800/50 p-3 rounded-lg flex items-center justify-between">
          <span className="text-slate-400">Saldo {mode === 'real' ? 'USDC' : 'virtual'}:</span>
          <span className="text-white font-semibold">${Number(balance || 0).toFixed(2)}</span>
        </div>

        {/* Par */}
        <div className="space-y-2">
          <Label className="text-white">Par de Trading</Label>
          <Select value={selectedPair} onValueChange={setSelectedPair}>
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              {pairs.map((p) => (
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
            min="0"
            step="any"
            value={tradeAmount}
            onChange={(e) => setTradeAmount?.(e.target.value)}
            placeholder="Ingresa el monto"
            className="bg-slate-800 border-slate-600 text-white"
          />
        </div>

        {/* Duración (sólo demo; si tu lógica real la usa, quita la condición) */}
        {mode === 'demo' && (
          <div className="space-y-2">
            <Label className="text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-300" />
              Duración (opcional)
            </Label>
            <Select
              value={String(tradeDuration)}
              onValueChange={(val) => setTradeDuration?.(parseInt(val))}
            >
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="60">1 Minuto</SelectItem>
                <SelectItem value="300">5 Minutos</SelectItem>
                <SelectItem value="900">15 Minutos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Info de precio */}
        {current && (
          <div className="bg-slate-800/50 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400">Precio Actual:</span>
              <span className="text-white font-semibold">
                ${Number(price).toFixed(price < 1 ? 4 : 2)}
              </span>
            </div>
            {'change' in current && (
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Cambio 24h:</span>
                <span
                  className={`font-semibold ${
                    change >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {change.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}

        {/* Botones */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={() => submit('buy')}
            disabled={isTrading}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {isTrading && tradeType === 'buy' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2 transform rotate-90" />
            )}
            COMPRA
          </Button>

          <Button
            onClick={() => submit('sell')}
            disabled={isTrading}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {isTrading && tradeType === 'sell' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2 transform -rotate-90" />
            )}
            VENTA
          </Button>
        </div>

        {/* Reinicio saldo demo */}
        {mode === 'demo' && (
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
};

export default TradingPanel;
