// src/hooks/useHybridLivePrices.js
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Hook híbrido: ancla con precios reales (Binance) y genera ticks intermedios
 * para un historial uniforme y fluido.
 *
 * Opciones:
 *  - symbols: ['BTC','ETH',...]
 *  - vs: 'USDT' | 'USD'
 *  - pollMs: ms entre polls reales
 *  - tickMs: ms entre ticks locales
 *  - maxHist: cantidad máxima de puntos en historial
 *  - selectedPair: ej. "BTC/USDT"
 */
export default function useHybridLivePrices({
  symbols = ['BTC', 'ETH', 'BNB', 'ADA'],
  vs = 'USDT',
  pollMs = 12000,
  tickMs = 1000,
  maxHist = 300,
  selectedPair = 'BTC/USDT',
} = {}) {
  const [prices, setPrices] = useState({}); // { BTC: { price, change }, ... }
  const [selectedPriceHistory, setSelectedPriceHistory] = useState([]); // [{ time(ms), value }]
  const lastPollRef = useRef({});   // { BTC: lastRealPrice, ... }
  const lastTickRef = useRef({});   // { BTC: lastTickPrice, ... }
  const timers = useRef({ poll: null, tick: null });

  const selectedSymbol = useMemo(() => {
    const [base] = String(selectedPair).split('/');
    return (base || 'BTC').toUpperCase();
  }, [selectedPair]);

  // Helpers
  const clampHist = (arr, limit = maxHist) => (arr.length > limit ? arr.slice(arr.length - limit) : arr);

  // Poll real a Binance (fallback robusto si falla)
  const fetchBinanceSymbol = async (sym) => {
    // Evita pares tipo USDT/USDT
    if (sym.toUpperCase() === vs.toUpperCase()) {
      return { price: 1, change: 0 };
    }
    const pair = `${sym.toUpperCase()}${vs.toUpperCase()}`; // p.ej. BTCUSDT
    // 24hr para tener % change
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Binance ${pair} ${res.status}`);
    const data = await res.json();
    const price = Number(data.lastPrice);
    const change = Number(data.priceChangePercent);
    if (!Number.isFinite(price)) throw new Error('Precio inválido');
    return { price, change };
  };

  const fetchFallback = async (sym) => {
    // CoinGecko simple/price (fallback)
    const map = { BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', ADA: 'cardano', USDT: 'tether' };
    const id = map[sym.toUpperCase()] || 'bitcoin';
    const vsKey = vs.toLowerCase() === 'usdt' ? 'usd' : vs.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${vsKey}&include_24hr_change=true`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`CG ${id} ${res.status}`);
    const json = await res.json();
    const price = Number(json?.[id]?.[vsKey] ?? 0);
    const change = Number(json?.[id]?.[`${vsKey}_24h_change`] ?? 0);
    if (!Number.isFinite(price) || price <= 0) throw new Error('CG precio inválido');
    return { price, change };
  };

  const pollAll = async () => {
    try {
      const results = await Promise.all(
        symbols.map(async (sym) => {
          try {
            return [sym, await fetchBinanceSymbol(sym)];
          } catch {
            return [sym, await fetchFallback(sym)];
          }
        })
      );

      const nextPrices = {};
      results.forEach(([sym, { price, change }]) => {
        nextPrices[sym] = { price, change };
        lastPollRef.current[sym] = price;
        if (!Number.isFinite(lastTickRef.current[sym])) {
          lastTickRef.current[sym] = price;
        }
      });

      setPrices((prev) => ({ ...prev, ...nextPrices }));

      // Si el símbolo seleccionado está en results, pusheamos un punto “real”
      const sel = selectedSymbol;
      if (nextPrices[sel]?.price) {
        setSelectedPriceHistory((prev) =>
          clampHist([...prev, { time: Date.now(), value: nextPrices[sel].price }])
        );
      }
    } catch (e) {
      // Silencioso: si todo falla, no rompemos la UI, mantenemos los últimos valores
      // console.warn('[useHybridLivePrices] poll error', e);
    }
  };

  // Genera ticks suaves alrededor del último real/tick
  const makeTick = () => {
    const sel = selectedSymbol;
    const base =
      Number.isFinite(lastTickRef.current[sel])
        ? lastTickRef.current[sel]
        : Number.isFinite(lastPollRef.current[sel])
        ? lastPollRef.current[sel]
        : 0;

    if (!Number.isFinite(base) || base <= 0) return;

    // Pequeña variación aleatoria ±0.08%
    const drift = 1 + (Math.random() - 0.5) * 0.0016;
    const next = base * drift;

    lastTickRef.current[sel] = next;

    // refrezcamos “prices” solo del seleccionado para que la UI muestre algo vivo
    setPrices((prev) => ({
      ...prev,
      [sel]: {
        price: next,
        change: Number(prev?.[sel]?.change ?? 0),
      },
    }));

    setSelectedPriceHistory((prev) =>
      clampHist([...prev, { time: Date.now(), value: next }])
    );
  };

  // Setup / cleanup
  useEffect(() => {
    // arranca con un poll
    pollAll();

    // timers
    timers.current.poll = setInterval(pollAll, pollMs);
    timers.current.tick = setInterval(makeTick, tickMs);

    return () => {
      if (timers.current.poll) clearInterval(timers.current.poll);
      if (timers.current.tick) clearInterval(timers.current.tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, tickMs, selectedSymbol]);

  // Cuando cambia el par seleccionado, reseteamos el mini historial para que encaje visualmente
  useEffect(() => {
    setSelectedPriceHistory([]);
    // pre-cargamos un punto si ya tenemos precio para ese símbolo
    const p = prices[selectedSymbol]?.price ?? lastPollRef.current[selectedSymbol];
    if (Number.isFinite(p) && p > 0) {
      setSelectedPriceHistory([{ time: Date.now(), value: p }]);
      lastTickRef.current[selectedSymbol] = p;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]);

  return {
    prices,                 // { BTC: { price, change }, ... }
    selectedPriceHistory,   // [{ time: msEpoch, value: number }]
  };
}
