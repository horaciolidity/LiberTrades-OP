import { useEffect, useMemo, useRef, useState } from 'react';

export default function useHybridLivePrices({
  symbols = ['BTC', 'ETH', 'BNB', 'ADA', 'USDT'],
  vs = 'USDT',
  maxHist = 300,
  selectedPair = 'BTC/USDT',
} = {}) {
  const [prices, setPrices] = useState({});        // { BTC: { price, change } }
  const [histories, setHistories] = useState({});  // { BTC: [{ time, value }, ...] }

  const wsRef = useRef(null);
  const retryRef = useRef({ tries: 0, timer: null });

  const uVS = String(vs || 'USDT').toUpperCase();

  const selectedBase = useMemo(() => {
    const [base] = String(selectedPair || 'BTC/USDT').split('/');
    return (base || 'BTC').toUpperCase();
  }, [selectedPair]);

  const selectedPriceHistory = useMemo(
    () => histories[selectedBase] || [],
    [histories, selectedBase]
  );

  const clampHist = (arr, limit = maxHist) =>
    arr.length > limit ? arr.slice(arr.length - limit) : arr;

  const baseFromStreamSymbol = (streamSym) => {
    const up = String(streamSym || '').toUpperCase();
    return up.endsWith(uVS) ? up.slice(0, -uVS.length) : up; // "BTCUSDT" -> "BTC"
  };

  const streamFromSymbols = (arr) => {
    const lowVS = uVS.toLowerCase();
    return arr
      .map((s) => `${String(s).toLowerCase()}${lowVS}@miniTicker`)
      .join('/');
  };

  useEffect(() => {
    const bases = Array.from(new Set(symbols.map((s) => String(s).toUpperCase())));
    const streamBases = bases.filter((b) => b !== uVS); // evitamos USDT/USDT

    // Si incluyen USDT en la UI, lo fijamos a 1 (sin stream)
    if (bases.includes(uVS)) {
      setPrices((prev) => ({ ...prev, [uVS]: { price: 1, change: 0 } }));
      setHistories((prev) => ({ ...prev, [uVS]: prev[uVS] || [] }));
    }
    if (streamBases.length === 0) return;

    const url = `wss://stream.binance.com:9443/stream?streams=${streamFromSymbols(streamBases)}`;

    const openWS = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (retryRef.current.timer) {
          clearTimeout(retryRef.current.timer);
          retryRef.current.timer = null;
        }
        retryRef.current.tries = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          const data = msg?.data || msg; // combined stream
          const s = data?.s;               // "BTCUSDT"
          const c = Number(data?.c);       // last price
          const o = Number(data?.o);       // 24h open
          if (!s || !Number.isFinite(c)) return;

          const base = baseFromStreamSymbol(s);
          const isStable = base === uVS;
          const price = isStable ? 1 : c;
          const change = isStable || !Number.isFinite(o) || o <= 0 ? 0 : ((c - o) / o) * 100;

          setPrices((prev) => ({ ...prev, [base]: { price, change } }));

          setHistories((prev) => {
            const now = Date.now();
            const arr = prev[base] ? [...prev[base], { time: now, value: price }] : [{ time: now, value: price }];
            return { ...prev, [base]: clampHist(arr, maxHist) };
          });
        } catch { /* ignore */ }
      };

      const scheduleReconnect = () => {
        try { ws.close(); } catch {}
        const next = (retryRef.current.tries || 0) + 1;
        retryRef.current.tries = next;
        const wait = Math.min(30000, 500 * Math.pow(2, next)); // backoff hasta 30s
        retryRef.current.timer = setTimeout(openWS, wait);
      };

      ws.onerror = scheduleReconnect;
      ws.onclose = scheduleReconnect;
    };

    openWS();

    return () => {
      if (retryRef.current.timer) {
        clearTimeout(retryRef.current.timer);
        retryRef.current.timer = null;
      }
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(symbols), uVS, maxHist]);

  return { prices, histories, selectedPriceHistory };
}
