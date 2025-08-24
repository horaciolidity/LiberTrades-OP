import { useEffect, useRef, useState } from 'react';

// Mapea nuestras llaves a intervalos Binance
const TF_TO_BINANCE = {
  '5s': '1s',   // Binance no tiene 5s: usamos 1s y agregamos nosotros si querés
  '15s': '1s',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
};

const clampInt = (n, def) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(1, Math.floor(v)) : def;
};

function parseKlineArr(arr) {
  // [ openTime, open, high, low, close, volume, closeTime, ...]
  return {
    time: Math.floor(Number(arr[0]) / 1000),
    open: Number(arr[1]),
    high: Number(arr[2]),
    low: Number(arr[3]),
    close: Number(arr[4]),
  };
}

export function useBinanceKlines(symbol = 'BTCUSDT', tfKey = '1m', limit = 200) {
  const interval = TF_TO_BINANCE[tfKey] || '1m';
  const lim = clampInt(limit, 200);

  const [candles, setCandles] = useState([]);
  const [price, setPrice] = useState(null);
  const [status, setStatus] = useState('idle'); // idle|seeding|live|polling|error

  const wsRef = useRef(null);
  const pollRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    setCandles([]);
    setPrice(null);
    setStatus('seeding');

    const lower = String(symbol).toLowerCase();
    const seed = async () => {
      try {
        // 1) Seed REST
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${lim}`);
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error('Bad klines seed');
        const seedCandles = data.map(parseKlineArr);
        if (!aliveRef.current) return;
        setCandles(seedCandles);
        setPrice(seedCandles[seedCandles.length - 1]?.close ?? null);

        // 2) WS live
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${lower}@kline_${interval}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!aliveRef.current) return;
          setStatus('live');
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            const k = msg?.k; // kline payload
            if (!k) return;
            const c = {
              time: Math.floor(Number(k.t) / 1000),
              open: Number(k.o),
              high: Number(k.h),
              low: Number(k.l),
              close: Number(k.c),
            };
            setPrice(c.close);

            setCandles((prev) => {
              if (!prev?.length) return [c];
              const last = prev[prev.length - 1];
              if (c.time === last.time) {
                // update misma vela
                const next = prev.slice(0, -1).concat(c);
                return next;
              }
              // vela nueva
              const next = prev.concat(c);
              return next.slice(-Math.max(lim, 20));
            });
          } catch {}
        };

        ws.onclose = () => {
          if (!aliveRef.current) return;
          // Fallback a polling
          startPolling();
        };

        ws.onerror = () => {
          try { ws.close(); } catch {}
        };
      } catch (e) {
        // Si seed falla, pasamos a polling
        startPolling();
      }
    };

    const startPolling = () => {
      if (!aliveRef.current) return;
      setStatus('polling');
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(lim, 5)}`);
          const data = await res.json();
          if (!Array.isArray(data)) throw new Error('Bad klines poll');
          const recent = data.map(parseKlineArr);
          const last = recent[recent.length - 1];
          setPrice(last?.close ?? null);
          setCandles((prev) => {
            const merged = [...(prev || [])];
            recent.forEach((c) => {
              const idx = merged.findIndex((x) => x.time === c.time);
              if (idx >= 0) merged[idx] = c; else merged.push(c);
            });
            return merged.sort((a, b) => a.time - b.time).slice(-Math.max(lim, 20));
          });
        } catch (e) {
          setStatus('error');
        }
      }, 1500);
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    seed();

    return () => {
      aliveRef.current = false;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      stopPolling();
    };
  }, [symbol, interval, lim]);

  return { candles, price, status };
}
