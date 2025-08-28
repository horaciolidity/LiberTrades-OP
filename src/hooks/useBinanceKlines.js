// src/hooks/useBinanceKlines.js
import { useEffect, useRef, useState } from 'react';

/**
 * Hook de velas para lightweight-charts.
 * - 1m/5m/15m: seed con klines + WS kline
 * - 5s/15s   : seed plano con el último precio + WS miniTicker agregado a buckets
 *
 * Devuelve { candles, price, status }
 *  status: 'seeding' | 'live' | 'error'
 *
 * Usar sólo con símbolos REALES de Binance (e.g. 'BTCUSDT').
 */
export function useBinanceKlines(symbol, tfKey = '1m', limit = 200, opts = {}) {
  const enabled = opts?.enabled !== false && !!symbol;
  const [candles, setCandles] = useState([]);
  const [price, setPrice] = useState(undefined);
  const [status, setStatus] = useState(enabled ? 'seeding' : 'live');

  const wsRef = useRef(null);
  const buffRef = useRef([]);         // ticks {t(sec), v}
  const lastFlushRef = useRef(0);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const isTiny = tfKey === '5s' || tfKey === '15s';
  const tfSec =
    tfKey === '5s' ? 5 :
    tfKey === '15s' ? 15 :
    tfKey === '5m' ? 300 :
    tfKey === '15m' ? 900 : 60;

  const cap = (arr, n) => (arr.length > n ? arr.slice(arr.length - n) : arr);
  const resetBuffers = () => { buffRef.current = []; lastFlushRef.current = 0; };

  // -------- seed inicial --------
  useEffect(() => {
    mountedRef.current = true;
    resetBuffers();

    if (!enabled) {
      setCandles([]);
      setStatus('live');
      return () => { mountedRef.current = false; };
    }

    (async () => {
      try {
        if (isTiny) {
          // Seed plano con último precio (sin 1m para no crear “velas gigantes”)
          const url = `https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`;
          const r = await fetch(url);
          const j = await r.json();
          const p = Number(j?.price);
          if (Number.isFinite(p)) {
            const now = Math.floor(Date.now() / 1000);
            const arr = [];
            const from = now - tfSec * limit;
            for (let t = from; t <= now; t += tfSec) {
              arr.push({ time: t, open: p, high: p, low: p, close: p });
            }
            if (!mountedRef.current) return;
            setCandles(arr);
            setPrice(p);
            setStatus('live');
          } else {
            setStatus('error');
          }
        } else {
          // Seed con klines reales (1m/5m/15m)
          const interval = tfKey;
          const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.max(limit, 100)}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arr = await res.json();
          const seeded = arr.map((k) => ({
            time: Math.floor(k[0] / 1000),
            open: +k[1],
            high: +k[2],
            low:  +k[3],
            close:+k[4],
          }));
          if (!mountedRef.current) return;
          const base = cap(seeded, limit);
          setCandles(base);
          setPrice(base.length ? base[base.length - 1].close : undefined);
          setStatus('live');
        }
      } catch (e) {
        console.warn('[useBinanceKlines seed]', e?.message || e);
        if (mountedRef.current) setStatus('error');
      }
    })();

    return () => { mountedRef.current = false; };
  }, [symbol, tfKey, limit, enabled, isTiny, tfSec]);

  // -------- WS --------
  useEffect(() => {
    if (!enabled) return;

    let closed = false;
    resetBuffers();

    const clearWS = () => {
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };

    const connect = () => {
      clearWS();
      const stream = isTiny
        ? `${symbol.toLowerCase()}@miniTicker`
        : `${symbol.toLowerCase()}@kline_${tfKey}`;
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
        if (mountedRef.current) setStatus('live');
      };

      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (!d) return;

          if (isTiny) {
            // miniTicker → agregamos en buckets 5s/15s
            const p = Number(d?.c);
            const tSec = Math.floor((Number(d?.E) || Date.now()) / 1000);
            if (!Number.isFinite(p)) return;
            setPrice(p);

            buffRef.current.push({ t: tSec, v: p });
            // recortar buffer (2 ventanas)
            const from = tSec - tfSec * (limit + 2);
            buffRef.current = buffRef.current.filter((x) => x.t >= from);

            const now = Date.now();
            if (now - lastFlushRef.current < 180) return; // throttle
            lastFlushRef.current = now;

            const buckets = new Map();
            for (const { t, v } of buffRef.current) {
              const b = Math.floor(t / tfSec) * tfSec;
              const prev = buckets.get(b);
              if (!prev) buckets.set(b, { time: b, open: v, high: v, low: v, close: v });
              else {
                prev.high = Math.max(prev.high, v);
                prev.low = Math.min(prev.low, v);
                prev.close = v;
              }
            }
            const arr = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
            if (mountedRef.current) setCandles(cap(arr, limit));
          } else {
            // kline en curso
            const k = d?.k;
            if (!k) return;
            const c = {
              time: Math.floor(k.t / 1000), // open time
              open: +k.o,
              high: +k.h,
              low:  +k.l,
              close:+k.c,
            };
            setPrice(+k.c);
            if (!mountedRef.current) return;
            setCandles((prev) => {
              if (!prev?.length) return [c];
              const last = prev[prev.length - 1];
              if (c.time > last.time) return cap([...prev, c], limit);
              const next = prev.slice();
              next[next.length - 1] = c;
              return next;
            });
          }
        } catch {}
      };

      // no forzamos close en onerror (evita "Ping after close")
      ws.onerror = () => {};

      ws.onclose = () => {
        if (closed) return;
        // backoff progresivo
        const delay = Math.min(backoffRef.current, 30000);
        backoffRef.current *= 2;
        setTimeout(() => { if (!closed) connect(); }, delay);
      };
    };

    connect();
    return () => { closed = true; clearWS(); };
  }, [symbol, tfKey, enabled, isTiny, tfSec, limit]);

  return { candles, price, status };
}
