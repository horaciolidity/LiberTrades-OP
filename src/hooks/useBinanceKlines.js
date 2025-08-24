// src/hooks/useBinanceKlines.js
import { useEffect, useRef, useState } from 'react';

/**
 * Hook para obtener velas listas para lightweight-charts:
 *  - TF '1m' | '5m' | '15m' -> REST seed (binance.vision CORS OK) + WS kline
 *  - TF '5s' | '15s'        -> seed básico + WS miniTicker y agregación por bucket
 *
 * Devuelve: { candles: [{time,open,high,low,close}], price, status }
 * status: 'seeding' | 'live' | 'polling' | 'error'
 *
 * Params:
 * - symbol: 'BTCUSDT' (¡real de Binance! en mayúsculas)
 * - tfKey: '5s'|'15s'|'1m'|'5m'|'15m'
 * - limit: cantidad de barras que querés mantener
 * - opts.enabled: si false, el hook NO hace nada (útil para pares manuales)
 */
export function useBinanceKlines(symbol, tfKey = '1m', limit = 200, opts = {}) {
  const enabled = opts?.enabled !== false && !!symbol;
  const [candles, setCandles] = useState([]);
  const [price, setPrice] = useState(undefined);
  const [status, setStatus] = useState(enabled ? 'seeding' : 'polling');

  const wsRef = useRef(null);
  const buffRef = useRef([]);        // buffer de ticks (para 5s/15s)
  const lastPushRef = useRef(0);
  const backoffRef = useRef(1000);   // reconexión exponencial
  const tfRef = useRef(tfKey);
  tfRef.current = tfKey;

  const tfMapKline = { '1m': '1m', '5m': '5m', '15m': '15m' };
  const isSmallTF = tfKey === '5s' || tfKey === '15s';
  const tfSec = tfKey === '5s' ? 5 : tfKey === '15s' ? 15 : tfKey === '5m' ? 300 : tfKey === '15m' ? 900 : 60;

  const cap = (arr, n) => (arr.length > n ? arr.slice(arr.length - n) : arr);

  // --- seed inicial ---
  useEffect(() => {
    if (!enabled) {
      setCandles([]);
      setStatus('polling');
      return;
    }
    let aborted = false;

    async function seed() {
      try {
        // Para TF chicos no hay klines 5s/15s, seed con 1m y después se va “llenando” con miniTicker
        const interval = tfMapKline[tfRef.current] || '1m';
        const seedLimit = Math.max(limit, 50);

        const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${seedLimit}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.json();

        const seeded = arr
          .map((k) => ({
            time: Math.floor(k[0] / 1000),
            open: +k[1],
            high: +k[2],
            low:  +k[3],
            close:+k[4],
          }))
          .filter((c) => Number.isFinite(c.time));

        const base = cap(seeded, limit);
        setCandles(base);
        setPrice(base.length ? base[base.length - 1].close : undefined);
        setStatus('live');
      } catch (e) {
        console.warn('[useBinanceKlines seed]', e?.message || e);
        setStatus('error');
      }
    }

    seed();

    return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tfKey, enabled, limit]);

  // --- conexión WS ---
  useEffect(() => {
    if (!enabled) return;

    let closed = false;

    const clearWS = () => {
      try { wsRef.current?.close(); } catch (_) {}
      wsRef.current = null;
    };

    const connect = () => {
      // cierra anterior
      clearWS();

      // stream según TF
      let stream;
      if (isSmallTF) {
        // 5s/15s -> miniTicker
        stream = `${symbol.toLowerCase()}@miniTicker`;
      } else {
        const iv = tfMapKline[tfRef.current] || '1m';
        stream = `${symbol.toLowerCase()}@kline_${iv}`;
      }

      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;   // reset backoff
        setStatus('live');
      };

      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (!d) return;

          if (isSmallTF) {
            // miniTicker -> precio last
            const p = Number(d?.c);
            const tSec = Math.floor((Number(d?.E) || Date.now()) / 1000);
            if (Number.isFinite(p)) {
              setPrice(p);
              // guarda ticks para agregar a buckets 5s/15s
              buffRef.current.push({ t: tSec, v: p });
              // mantené sólo lo necesario para "limit" velas
              const maxSecs = limit * (tfRef.current === '5s' ? 5 : 15) + 60;
              const from = tSec - maxSecs;
              buffRef.current = buffRef.current.filter((x) => x.t >= from);

              // throttle a ~5/s
              const now = Date.now();
              if (now - lastPushRef.current > 180) {
                lastPushRef.current = now;

                // recalcular velas desde buffer
                const buckets = new Map();
                const step = tfRef.current === '5s' ? 5 : 15;
                for (const { t, v } of buffRef.current) {
                  const b = Math.floor(t / step) * step;
                  const prev = buckets.get(b);
                  if (!prev) buckets.set(b, { time: b, open: v, high: v, low: v, close: v });
                  else {
                    prev.high = Math.max(prev.high, v);
                    prev.low  = Math.min(prev.low,  v);
                    prev.close = v;
                  }
                }
                const arr = Array.from(buckets.values()).sort((a,b)=>a.time-b.time);
                setCandles((prev) => cap(arr, limit));
              }
            }
          } else {
            // kline -> vela directa
            const k = d?.k;
            if (!k) return;
            const c = {
              time: Math.floor(k.t / 1000),
              open: +k.o, high: +k.h, low: +k.l, close: +k.c,
            };
            setPrice(+k.c);
            // update incremental
            setCandles((prev) => {
              if (!prev?.length) return [c];
              const last = prev[prev.length - 1];
              if (c.time > last.time) return cap([...prev, c], limit);
              // mismo bucket -> reemplazar
              const next = prev.slice();
              next[next.length - 1] = c;
              return next;
            });
          }
        } catch (e) {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        try { ws.close(); } catch (_) {}
      };

      ws.onclose = () => {
        if (closed) return;
        // reconexión con backoff exponencial
        const delay = Math.min(backoffRef.current, 30000);
        backoffRef.current *= 2;
        setTimeout(() => {
          if (!closed) connect();
        }, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      clearWS();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tfKey, enabled, limit]);

  return { candles, price, status };
}
