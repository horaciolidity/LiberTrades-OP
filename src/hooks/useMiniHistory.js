// src/hooks/useMiniHistory.js
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useMiniHistory(pairBase, limit = 40, refreshMs = 15000) {
  const [data, setData] = useState([]);
  const timer = useRef(null);

  async function load() {
    if (!pairBase) return;
    const { data, error } = await supabase
      .from('market_ticks')        // tu tabla histórica
      .select('price, ts')
      .eq('symbol', pairBase.toUpperCase())
      .order('ts', { ascending: false })
      .limit(limit);
    if (!error) {
      const arr = (data || []).map(d => ({ time: +new Date(d.ts), price: Number(d.price) }))
                               .reverse();
      setData(arr);
    }
  }

  useEffect(() => { load(); }, [pairBase]);
  useEffect(() => {
    timer.current = setInterval(load, refreshMs);
    return () => clearInterval(timer.current);
  }, [pairBase, refreshMs]);

  return data;
}
