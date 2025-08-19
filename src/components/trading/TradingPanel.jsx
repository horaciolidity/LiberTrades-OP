import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, RefreshCw } from 'lucide-react';

const FALLBACK_PAIR = 'BTC/USDT';

const TradingPanel = ({
  // control de par
  selectedPair,
  setSelectedPair = () => {},
  // dinero / tipo / ejecución
  tradeAmount,
  setTradeAmount = () => {},
  tradeType,
  setTradeType = () => {},
  isTrading = false,
  executeTrade = () => {},
  resetBalance = () => {},
  // datos de mercado
  cryptoPrices = {},
  // duración
  tradeDuration,
  setTradeDuration = () => {},
  // opcional: pares dinámicos desde DataContext
  pairOptions = [],
}) => {
  // ---- fallbacks seguros para evitar value undefined en Select ----
  const safePair =
    typeof selectedPair === 'string' && selectedPair
      ? selectedPair
      : (pairOptions[0] || FALLBACK_PAIR);

  const safeDuration = Number.isFinite(Number(tradeDuration)) ? Number(tradeDuration) : 60;
  const safeDurationStr = String(safeDuration);

  const options = (Array.isArray(pairOptions) && pairOptions.length
    ? pairOptions
    : ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT']
  ).filter(Boolean);

  const currentCrypto = (safePair?.split?.('/')?.[0] || 'BTC').toUpperCase();
  const currentPriceData = cryptoPrices?.[currentCrypto];

  return (
    <Card className="crypto-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Play className="h-5 w-5 mr-2 text-green-400" />
          Panel de Trading
        </CardTitle>
        <CardDescription className="text-slate-300">
          Ejecuta trades { /* demo o real, según tu página */ } virtuales
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Par */}
        <div className="space-y-2">
          <Label className="text-white">Par de Trading</Label>
          <Select
            value={safePair}
            onValueChange={(v) => setSelectedPair(String(v || FALLBACK_PAIR))}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
              <SelectValue placeholder="Selecciona par" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              {options.map((p) => {
                const val = String(p || '');
                if (!val) return null;
                return (
                  <SelectItem key={val} value={val}>
                    {val}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Monto */}
        <div className="space-y-2">
          <Label className="text-white">Monto ($)</Label>
          <Input
            type="number"
            value={tradeAmount ?? ''}
            onChange={(e) => setTradeAmount(e.target.value)}
            placeholder="Ingresa el monto"
            className="bg-slate-800 border-slate-600 text-white"
            min="0"
            step="0.01"
          />
        </div>

        {/* Duración */}
        <div className="space-y-2">
          <Label className="text-white">Duración</Label>
          <Select
            value={safeDurationStr}
            onValueChange={(val) => setTradeDuration(parseInt(val || '60', 10))}
          >
            <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
              <SelectValue placeholder="Selecciona duración" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="60">1 Minuto</SelectItem>
              <SelectItem value="300">5 Minutos</SelectItem>
              <SelectItem value="900">15 Minutos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Info precio */}
        {currentPriceData && (
          <div className="bg-slate-800/50 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400">Precio Actual:</span>
              <span className="text-white font-semibold">
                ${Number(currentPriceData.price ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Cambio 24h:</span>
              <span
                className={`font-semibold ${
                  Number(currentPriceData.change ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {Number(currentPriceData.change ?? 0).toFixed(2)}%
              </span>
            </div>
          </div>
        )}

        {/* Botones Buy/Sell */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={() => { setTradeType('buy'); executeTrade(); }}
            disabled={isTrading}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {isTrading && tradeType === 'buy'
              ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              : <Play className="h-4 w-4 mr-2 rotate-90" />
            }
            COMPRA
          </Button>

          <Button
            onClick={() => { setTradeType('sell'); executeTrade(); }}
            disabled={isTrading}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {isTrading && tradeType === 'sell'
              ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              : <Play className="h-4 w-4 mr-2 -rotate-90" />
            }
            VENTA
          </Button>
        </div>

        <Button
          onClick={resetBalance}
          variant="outline"
          className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          Reiniciar Saldo Virtual
        </Button>
      </CardContent>
    </Card>
  );
};

export default TradingPanel;
