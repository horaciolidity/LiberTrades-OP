// src/components/trading/TradingPanel.jsx
import React, { useEffect, useMemo, useState } from 'react';
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

/** ---------- Normalización de pares y base ---------- */
const normalizePair = (pair, fallback = 'BTC/USDT') => {
  if (!pair) return fallback;
  const s = String(pair).trim().toUpperCase();
  if (!s.length) return fallback;
  if (s.includes('/')) {
    const [b, q] = s.split('/');
    return `${(b || 'BTC').toUpperCase()}/${(q || 'USDT').toUpperCase()}`;
  }
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}/USDT`;
  if (s.endsWith('USDC')) return `${s.slice(0, -4)}/USDC`;
  return `${s}/USDT`;
};
const baseFromPair = (pair) => (normalizePair(pair).split('/')[0] || 'BTC');
const noSlash = (pair) => String(pair || '').replace('/', '');
/** -------------------------------------------------- */

export default function TradingPanel({
  selectedPair,
  setSelectedPair,
  onTrade,                 // (tradeData) => Promise<void>
  mode = 'demo',           // 'demo' | 'real'
  balance = 0,             // USDC
  cryptoPrices = {},       // opcional (fallback)
  resetBalance,            // opcional (solo demo)
}) {
  const {
    pairOptions: pairsFromCtx = [],
    getPairInfo,
    // 👇 importante para que el componente re-renderice con ticks del contexto
    cryptoPrices: ctxPrices = {},
  } = useData();

  // Heartbeat suave para refrescar vista con los ticks (sin depender de refs externas)
  const [, bump] = useState(0);
  useEffect(() => {
    const id = setInterval(() => bump((x) => (x + 1) % 1e9), 1000);
    return () => clearInterval(id);
  }, []);

  // Normalizamos TODAS las opciones de pares del contexto
  const normalizedCtxPairs = useMemo(() => {
    const arr = Array.isArray(pairsFromCtx) ? pairsFromCtx : [];
    return Array.from(new Set(arr.map((p) => normalizePair(p)).filter(Boolean)));
  }, [pairsFromCtx]);

  // Base de pares con fallback seguro
  const basePairs = normalizedCtxPairs.length
    ? normalizedCtxPairs
    : ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT'];

  // Par controlado/efectivo SIEMPRE normalizado
  const effectivePair = useMemo(() => {
    const norm = normalizePair(selectedPair || basePairs[0] || 'BTC/USDT');
    return norm;
  }, [selectedPair, basePairs]);

  // Estado local del panel
  const [tradeAmount, setTradeAmount] = useState('100');
  const [tradeType, setTradeType] = useState('buy');
  const [tradeDuration, setTradeDuration] = useState(60); // seg (sólo demo)
  const [isTrading, setIsTrading] = useState(false);

  // Feed unificado (mismo que usa el gráfico vía DataContext)
  const fromCtx = getPairInfo?.(effectivePair) || {};
  // Si el contexto no trae, intentamos desde el mapa crudo de ctx o props
  const baseKey = baseFromPair(effectivePair);
  const fromCtxMap =
    ctxPrices?.[effectivePair] ??
    ctxPrices?.[baseKey] ??
    ctxPrices?.[noSlash(effectivePair)] ??
    null;

  const fromProps =
    cryptoPrices?.[effectivePair] ??
    cryptoPrices?.[baseKey] ??
    cryptoPrices?.[noSlash(effectivePair)] ??
    null;

// ✅ Priorizar precio en tiempo real del mapa principal

const liveFromGlobal = cryptoPrices?.[baseKey]?.price;

const priceCandidate =
  Number.isFinite(Number(liveFromGlobal)) ? Number(liveFromGlobal)
  : Number.isFinite(Number(fromProps?.price)) ? Number(fromProps.price)
  : Number.isFinite(Number(fromCtxMap?.price)) ? Number(fromCtxMap.price)
  : Number.isFinite(Number(fromCtx.price)) ? Number(fromCtx.price)
  : NaN;


const ref24hCandidate =
    Number.isFinite(Number(fromProps?.ref_24h)) ? Number(fromProps.ref_24h)
      : Number.isFinite(Number(fromCtxMap?.ref_24h)) ? Number(fromCtxMap.ref_24h)
      : Number.isFinite(Number(fromCtx.ref_24h)) ? Number(fromCtx.ref_24h)
      : Number.isFinite(Number(fromCtx.ref24h)) ? Number(fromCtx.ref24h)
      : NaN;

const changeCandidate =
    Number.isFinite(Number(fromProps?.change)) ? Number(fromProps.change)
      : Number.isFinite(Number(fromCtxMap?.change)) ? Number(fromCtxMap.change)
      : Number.isFinite(Number(fromCtx.change)) ? Number(fromCtx.change)
      : (Number.isFinite(priceCandidate) && Number.isFinite(ref24hCandidate) && ref24hCandidate > 0
          ? ((priceCandidate / ref24hCandidate) - 1) * 100
          : NaN);


  const currentPriceData = {
    price: priceCandidate,
    change: changeCandidate,
  };

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
        pair: effectivePair,       // "BASE/QUOTE" normalizado
        type: side,                // 'buy' | 'sell'
        amount: amountNum,         // USD notional
        price: currentPrice,       // precio spot actual (del feed unificado)
        duration: tradeDuration,   // (demo)
        ts: Date.now(),
      };
      await onTrade(payload);
    } catch (err) {
      console.error('Error ejecutando trade:', err);
    } finally {
      setIsTrading(false);
    }
  };

  // Lista para el selector (incluye el par actual por si vino “externo”)
  const allPairs = useMemo(() => {
    const arr = Array.from(new Set([effectivePair, ...basePairs])).filter(Boolean);
    return arr;
  }, [effectivePair, basePairs]);

  const handlePairChange = (val) => {
    const norm = normalizePair(val);
    setSelectedPair?.(norm);
  };

  const baseSym = baseFromPair(effectivePair);
  const changeNum = Number(currentPriceData.change);

  return (
    <Card className="crypto-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center">
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
          <Select value={effectivePair} onValueChange={handlePairChange}>
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
              <Button key={v} variant="secondary" size="sm" onClick={() => setTradeAmount(String(v))}>
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
        {hasPrice ? (
          <div className="bg-slate-800/50 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-400">Precio Actual ({baseSym}):</span>
              <span className="text-white font-semibold">
                ${fmt(currentPrice)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Cambio 24h:</span>
              <span
                className={`font-semibold ${
                  Number.isFinite(changeNum) && changeNum >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {Number.isFinite(changeNum) ? fmt(changeNum) : '0.00'}%
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/40 p-3 rounded text-xs text-slate-400">
            No hay feed de precio para <b>{effectivePair}</b>.
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
