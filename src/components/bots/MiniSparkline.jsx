import React, { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';

export default function MiniSparkline({ pair, height = 48, strokeWidth = 2 }) {
  const { getPairInfo } = useData();
  const { history = [], price, change } = getPairInfo?.(pair) || {};

  const { path, min, max } = useMemo(() => {
    const pts = Array.isArray(history) ? history.slice(-60) : [];
    if (pts.length < 2) return { path: '', min: 0, max: 0 };
    const values = pts.map(p => Number(p.value)).filter(Number.isFinite);
    const vmin = Math.min(...values);
    const vmax = Math.max(...values);
    const rng = vmax - vmin || 1;

    const w = 120; // ancho fijo del sparkline
    const stepX = w / (pts.length - 1);
    const d = pts.map((p, i) => {
      const x = i * stepX;
      const y = height - ((Number(p.value) - vmin) / rng) * height;
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return { path: d, min: vmin, max: vmax };
  }, [history, height]);

  const color =
    change > 0 ? '#34d399' : change < 0 ? '#fb7185' : '#94a3b8';

  if (!path) {
    return (
      <div className="text-xs text-slate-400">—</div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <svg width="120" height={height} viewBox={`0 0 120 ${height}`}>
        <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} />
      </svg>
      <div className="text-right">
        <div className="text-xs text-slate-300">{pair}</div>
        <div className={`text-sm font-semibold`}
             style={{ color }}>
          {Number.isFinite(price) ? price : '—'}
        </div>
      </div>
    </div>
  );
}
