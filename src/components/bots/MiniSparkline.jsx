// src/components/bots/MiniSparkline.jsx
import React, { useMemo } from 'react';
import { useMiniHistory } from '@/hooks/useMiniHistory';

function toPath(points, w, h) {
  if (!points.length) return '';
  const xs = points.map(p => p.time);
  const ys = points.map(p => p.price);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = (maxX - minX) || 1;
  const dy = (maxY - minY) || 1;
  const mapX = t => ((t - minX) / dx) * (w - 2) + 1;
  const mapY = p => h - (((p - minY) / dy) * (h - 2) + 1);
  return points.map((p, i) => `${i ? 'L' : 'M'}${mapX(p.time)},${mapY(p.price)}`).join(' ');
}

export default function MiniSparkline({ pair='BTC/USDT', height=42 }) {
  const base = (pair || 'BTC/USDT').replace('/', '').replace(/USDT|USDC$/i, '');
  const hist = useMiniHistory(base, 40, 12000);
  const path = useMemo(() => toPath(hist, 160, height), [hist, height]);
  const last = hist.length ? hist[hist.length - 1].price : null;
  const first = hist.length ? hist[0].price : null;
  const diff = last && first ? last - first : 0;
  const color = diff >= 0 ? '#34d399' : '#f43f5e';

  return (
    <div className="flex items-center gap-2">
      <svg width="160" height={height} viewBox={`0 0 160 ${height}`}>
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className={`text-xs ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {diff >= 0 ? '+' : ''}{diff?.toFixed(2)}
      </div>
    </div>
  );
}
