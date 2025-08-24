import { useEffect, useRef, useState } from 'react';

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

function inRangeUTC(h, start, end) {
  if (start === end) return true;                 // 24h
  if (start < end) return h >= start && h < end;  // 10→13
  return h >= start || h < end;                   // 22→03
}

function simulatePriceTick(inst, rules) {
  const base = Number(inst.base_price || 0) || 0;
  const dec = Number(inst.decimals || 2) || 2;
  const hour = new Date().getUTCHours();

  const hits = (rules || []).filter(
    r => r.symbol === inst.symbol && r.active && inRangeUTC(hour, r.start_hour, r.end_hour)
  );

  // aplico reglas: % multiplicativas + absolutos
  let mult = 1, add = 0;
  for (const r of hits) {
    if (r.type === 'percent') mult *= 1 + Number(r.value || 0) / 100;
    else add += Number(r.value || 0);
  }
  let price = base * mult + add;

  // “respiración” controlada por volatility_bps (basis points)
  const t = Date.now() / 1000;
  const vol = (Number(inst.volatility_bps || 0) / 10000); // 50 bps = 0.5%
  const wave = 0.5 * Math.sin(t / 30) + 0.3 * Math.sin(t / 7) + 0.2 * Math.sin(t / 3);
  price *= (1 + vol * wave);

  return Number(price.toFixed(dec));
}

/** Devuelve un precio vivo para 1 instrumento.
 *  - source='real'  -> Binance WS + fallback REST
 *  - source='manual'-> simulación (base_price + reglas + volatility_bps)
 */
export function useLivePrice(inst, rules) {
  const [price, setPrice] = useState(null);
  const wsRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    const clean = () => {
      if (wsRef.current) { try { wsRef.current.close(); } catch {} ; wsRef.current = null; }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    clean();
    if (!inst) return;

    if (inst.source === 'real' && inst.binance_symbol) {
      const stream = `${inst.binance_symbol.toLowerCase()}@miniTicker`;
      const ws = new WebSocket(`${BINANCE_WS}/${stream}`);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const p = Number(data.c || data.data?.c);
          if (!Number.isNaN(p)) setPrice(p);
        } catch {}
      };

      // Fallback si el WS se corta
      ws.onclose = () => {
        pollRef.current = setInterval(async () => {
          try {
            const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${inst.binance_symbol}`);
            const j = await res.json();
            const p = Number(j.price);
            if (!Number.isNaN(p)) setPrice(p);
          } catch {}
        }, 5000);
      };

      // Pull inicial rápido
      (async () => {
        try {
          const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${inst.binance_symbol}`);
          const j = await res.json();
          const p = Number(j.price);
          if (!Number.isNaN(p)) setPrice(p);
        } catch {}
      })();
    } else {
      // Simulación para “manual”
      setPrice(simulatePriceTick(inst, rules));
      pollRef.current = setInterval(() => {
        setPrice(simulatePriceTick(inst, rules));
      }, 1000);
    }

    return clean;
  }, [
    inst?.symbol, inst?.source, inst?.binance_symbol,
    inst?.base_price, inst?.volatility_bps, inst?.decimals,
    JSON.stringify(rules)
  ]);

  return price;
}
