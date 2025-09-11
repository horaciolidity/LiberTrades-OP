// src/hooks/useLivePrice.js
import { useEffect, useMemo, useRef, useState } from 'react';

const BINANCE_WS_ROOT = 'wss://stream.binance.com:9443/ws';

function inRangeUTC(h, start, end) {
  if (start === end) return true;                 // 24h
  if (start < end)  return h >= start && h < end; // 10→13
  return h >= start || h < end;                   // 22→03
}

function simulatePrice(inst, rules) {
  const base = Number(inst?.base_price ?? 0) || 0;
  const dec  = Number(inst?.decimals ?? 2) || 2;
  const hour = new Date().getUTCHours();

  const symU = String(inst?.symbol || '').toUpperCase();
  const hits = (rules || []).filter(
    (r) => {
      const rSym = String(r?.symbol || r?.asset_symbol || '').toUpperCase();
      return rSym === symU &&
        r?.active &&
        inRangeUTC(hour, Number(r.start_hour ?? 0), Number(r.end_hour ?? 0));
    }
  );

  let mult = 1;
  let add  = 0;
  for (const r of hits) {
    const v = Number(r.value ?? 0);
    if (String(r.type || '').toLowerCase() === 'percent') mult *= 1 + v / 100;
    else add += v;
  }

  // “respiración” controlada por volatility_bps (basis points)
  const t   = Date.now() / 1000;
  const vol = Number(inst?.volatility_bps ?? 0) / 10000; // 50 bps = 0.5%
  const wave = 0.5 * Math.sin(t / 30) + 0.3 * Math.sin(t / 7) + 0.2 * Math.sin(t / 3);

  const p = base * mult + add;
  const price = p * (1 + vol * wave);

  return Number(price.toFixed(dec));
}

/**
 * Hook de precio vivo + cambio 24h para un instrumento.
 * - source='binance'  -> Binance WS miniTicker + fallback REST ticker/24hr
 * - source in {'manual','simulated','real'} -> simulación local con reglas
 * Devuelve: { price: number|null, change: number|null }
 */
export function useLivePrice(inst, rules) {
  const [quote, setQuote] = useState({ price: null, change: null });

  const wsRef   = useRef(null);
  const pollRef = useRef(null);
  const refPriceRef = useRef(null); // para % en simulados
  const dayKeyRef   = useRef(null);

  // helper: reinicia ref diario UTC
  const ensureRefForToday = (price) => {
    const now = new Date();
    const key = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
    if (dayKeyRef.current !== key || refPriceRef.current == null) {
      dayKeyRef.current = key;
      refPriceRef.current = Number(price || 0) || 0;
    }
  };

  // redondeo final según inst.decimals (si viene)
  const round = useMemo(() => {
    const d = Number(inst?.decimals ?? 2);
    const dec = Number.isFinite(d) ? d : 2;
    return (x) => (Number.isFinite(x) ? Number(x.toFixed(dec)) : x);
  }, [inst?.decimals]);

  useEffect(() => {
    const clean = () => {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    clean();
    setQuote({ price: null, change: null });
    refPriceRef.current = null;
    dayKeyRef.current   = null;

    if (!inst?.symbol) return;

    const src = String(inst?.source || '').toLowerCase();

    // === BINANCE LIVE ===
    if (src === 'binance' && inst?.binance_symbol) {
      const stream = `${String(inst.binance_symbol).toLowerCase()}@miniTicker`;
      const ws = new WebSocket(`${BINANCE_WS_ROOT}/${stream}`);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          // miniTicker single-stream -> objeto plano con c (last) y P (pct)
          const data = JSON.parse(ev.data);
          const c = Number(data?.c ?? data?.data?.c);
          const P = Number(data?.P ?? data?.data?.P); // % cambio 24h
          if (!Number.isFinite(c)) return;

          setQuote({ price: round(c), change: Number.isFinite(P) ? P : null });
        } catch {}
      };

      // 🔧 si hay error, cerramos para que dispare onclose y el fallback REST
      ws.onerror = () => { try { ws.close(); } catch {} };

      ws.onclose = () => {
        // fallback REST cada 5s (usa 24hr para traer %)
        pollRef.current = setInterval(async () => {
          try {
            const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${inst.binance_symbol}`;
            const res = await fetch(url);
            const j = await res.json();
            const price  = Number(j?.lastPrice ?? j?.c);
            const change = Number(j?.priceChangePercent ?? j?.P);
            if (Number.isFinite(price)) {
              setQuote({ price: round(price), change: Number.isFinite(change) ? change : null });
            }
          } catch {}
        }, 5000);
      };

      // pull inicial rápido (24hr para traer % desde el arranque)
      (async () => {
        try {
          const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${inst.binance_symbol}`;
          const res = await fetch(url);
          const j = await res.json();
          const price  = Number(j?.lastPrice ?? j?.c);
          const change = Number(j?.priceChangePercent ?? j?.P);
          if (Number.isFinite(price)) {
            setQuote({ price: round(price), change: Number.isFinite(change) ? change : null });
          }
        } catch {}
      })();

      return clean;
    }

    // === SIMULADO / MANUAL / REAL (servidor) ===
    const tick = () => {
      const p = simulatePrice(inst, rules);
      ensureRefForToday(p);
      const ref = refPriceRef.current || p || 0;
      const chg = ref > 0 ? ((p - ref) / ref) * 100 : 0;
      setQuote({ price: round(p), change: chg });
    };

    // seed + intervalo 1s
    tick();
    pollRef.current = setInterval(tick, 1000);

    return clean;
  }, [
    inst?.symbol,
    String(inst?.source || '').toLowerCase(),
    inst?.binance_symbol,
    inst?.base_price,
    inst?.volatility_bps,
    inst?.decimals,
    JSON.stringify(rules || []),
    round, // eslint feliz
  ]);

  return quote; // { price, change }
}

export default useLivePrice;
