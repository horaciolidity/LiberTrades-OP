// src/hooks/useHybridLivePrices.js
import { useEffect, useMemo, useRef, useState } from 'react';

const DEFAULTS = {
  BTC: 45000,
  ETH: 3200,
  BNB: 320,
  ADA: 0.85,
  USDT: 1.0,
};

const CG_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  ADA: 'cardano',
  USDT: 'tether',
};

function seedHistory(price, n = 60, stepMs = 1000) {
  const now = Date.now();
  const out = [];
  let p = price;
  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * stepMs;
    const noise = (Math.random() - 0.5) * 0.001 * p; // ±0.1%
    p = Math.max(0.000001, p + noise);
    out.push({ time: t, value: p });
  }
  return out;
}

export default function useHybridLivePrices({
  symbols = ['BTC', 'ETH', 'BNB', 'ADA', 'USDT'],
  vs = 'USDT',
  pollMs = 12000,
  tickMs = 1000,
  maxHist = 300,
  selectedPair, // ej: "BTC/USDT"
} = {}) {
  const [prices, setPrices] = useState(() => {
    const init = {};
    symbols.forEach((s) => {
      const p = DEFAULTS[s] ?? 1;
      init[s] = { price: p, change: 0, history: seedHistory(p) };
    });
    return init;
  });
  const [anchors, setAnchors] = useState(() => {
    const a = {};
    symbols.forEach((s) => (a[s] = prices[s]?.price ?? DEFAULTS[s] ?? 1));
    return a;
  });

  const historiesRef = useRef(
    Object.fromEntries(
      symbols.map((s) => [s, prices[s]?.history ? [...prices[s].history] : seedHistory(DEFAULTS[s] ?? 1)])
    )
  );
  const anchorsRef = useRef(anchors);
  const pricesRef = useRef(prices);

  useEffect(() => { anchorsRef.current = anchors; }, [anchors]);
  useEffect(() => { pricesRef.current = prices; }, [prices]);

  // ---- pull de anclas reales (CoinGecko -> fallback Coinbase) ----
  useEffect(() => {
    let alive = true;

    const fetchCoinGecko = async () => {
      const ids = symbols
        .map((s) => CG_IDS[s])
        .filter(Boolean)
        .join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
      const res = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (!res.ok) throw new Error('CG ' + res.status);
      const json = await res.json();
      const out = {};
      symbols.forEach((s) => {
        if (s === 'USDT') { out[s] = 1.0; return; }
        const id = CG_IDS[s];
        const usd = json?.[id]?.usd;
        if (typeof usd === 'number') out[s] = usd; // USDT~USD
      });
      return out;
    };

    const fetchCoinbasePair = async (base) => {
      const url = `https://api.coinbase.com/v2/prices/${base}-USD/spot`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('CB ' + res.status);
      const json = await res.json();
      return Number(json?.data?.amount ?? NaN);
    };

    const pull = async () => {
      try {
        const cg = await fetchCoinGecko();
        if (!alive) return;
        setAnchors((prev) => ({ ...prev, ...cg }));
      } catch {
        const partial = {};
        try {
          const btc = await fetchCoinbasePair('BTC');
          if (Number.isFinite(btc)) partial.BTC = btc;
        } catch {}
        try {
          const eth = await fetchCoinbasePair('ETH');
          if (Number.isFinite(eth)) partial.ETH = eth;
        } catch {}
        if (Object.keys(partial).length && alive) {
          setAnchors((prev) => ({ ...prev, ...partial, USDT: 1.0 }));
        }
      }
    };

    pull(); // primer fetch
    const id = setInterval(pull, pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [symbols.join(','), pollMs]);

  // ---- ticks locales con reversión a la ancla ----
  useEffect(() => {
    let alive = true;
    const id = setInterval(() => {
      if (!alive) return;
      const next = {};
      const now = Date.now();

      symbols.forEach((s) => {
        const curr = pricesRef.current[s]?.price ?? DEFAULTS[s] ?? 1;
        const anchor = anchorsRef.current[s] ?? curr;
        const alpha = 0.15; // fuerza de reversión hacia el anchor real
        const noise = (Math.random() - 0.5) * 0.002 * curr; // ±0.2% por tick
        const drift = (anchor - curr) * alpha;
        const newPrice = Math.max(0.000001, curr + drift + noise);
        const changePct = curr > 0 ? ((newPrice - curr) / curr) * 100 : 0;

        const hist = historiesRef.current[s] || [];
        const newHist = [...hist, { time: now, value: newPrice }].slice(-maxHist);
        historiesRef.current[s] = newHist;

        next[s] = { price: newPrice, change: changePct, history: newHist };
      });

      setPrices(next);
    }, tickMs);

    return () => { alive = false; clearInterval(id); };
  }, [symbols.join(','), tickMs, maxHist]);

  const selectedBase = useMemo(() => {
    if (typeof selectedPair !== 'string' || !selectedPair.includes('/')) return 'BTC';
    return selectedPair.split('/')[0]?.toUpperCase() || 'BTC';
  }, [selectedPair]);

  const selectedPriceHistory = historiesRef.current[selectedBase] || [];

  const historyBySymbol = useMemo(() => {
    const out = {};
    symbols.forEach((s) => { out[s] = historiesRef.current[s] || []; });
    return out;
  }, [prices, symbols.join(',')]);

  return { prices, historyBySymbol, selectedPriceHistory };
}
