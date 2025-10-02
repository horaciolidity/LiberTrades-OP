import { useEffect, useMemo, useRef, useState } from 'react';

const BINANCE_WS_ROOT = 'wss://stream.binance.com:9443/ws';

// helper para ver si la hora UTC está dentro del rango
function inRangeUTC(h, start, end) {
  if (start === end) return true;                 // 24h
  if (start < end)  return h >= start && h < end; // 10→13
  return h >= start || h < end;                   // 22→03
}

/**
 * Genera precio natural (ruido sinusoidal) sin reglas horarias.
 */
function simulateNaturalPrice(inst) {
  const base = Number(inst?.base_price ?? 0) || 0;
  const dec  = Number(inst?.decimals ?? 2) || 2;

  // “respiración” controlada por volatility_bps (basis points)
  const t   = Date.now() / 1000;
  const vol = Number(inst?.volatility_bps ?? 0) / 10000; // 50 bps = 0.5%
  const wave = 0.5 * Math.sin(t / 30) + 0.3 * Math.sin(t / 7) + 0.2 * Math.sin(t / 3);

  const price = base * (1 + vol * wave);
  return Number(price.toFixed(dec));
}

/**
 * Aplica reglas horarias sobre un precio natural.
 */
function applyMarketRules(symbol, rawPrice, rules = []) {
  const hour = new Date().getUTCHours();
  let price = rawPrice;

  (rules || []).forEach((r) => {
    const rSym = String(r.symbol || r.asset_symbol || '').toUpperCase();
    if (rSym !== String(symbol).toUpperCase()) return;
    if (!r.active) return;

    const inRange =
      (r.start_hour < r.end_hour && hour >= r.start_hour && hour < r.end_hour) ||
      (r.start_hour > r.end_hour && (hour >= r.start_hour || hour < r.end_hour)) ||
      (r.start_hour === r.end_hour);

    if (inRange) {
      if (String(r.type || '').toLowerCase() === 'percent') {
        price *= 1 + (Number(r.value) || 0) / 100;
      } else if (String(r.type || '').toLowerCase() === 'absolute') {
        price += Number(r.value) || 0;
      }
    }
  });

  return Number(price.toFixed(6));
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
          const data = JSON.parse(ev.data);
          const c = Number(data?.c ?? data?.data?.c);
          const P = Number(data?.P ?? data?.data?.P); // % cambio 24h
          if (!Number.isFinite(c)) return;
          setQuote({ price: round(c), change: Number.isFinite(P) ? P : null });
        } catch {}
      };

      ws.onerror = () => { try { ws.close(); } catch {} };

      ws.onclose = () => {
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
      const raw = simulateNaturalPrice(inst);               // velas naturales
      const adj = applyMarketRules(inst.symbol, raw, rules); // reglas horarias
      ensureRefForToday(adj);
      const ref = refPriceRef.current || adj || 0;
      const chg = ref > 0 ? ((adj - ref) / ref) * 100 : 0;
      setQuote({ price: round(adj), change: chg });
    };

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
    round,
  ]);

  return quote; // { price, change }
}

export default useLivePrice;
