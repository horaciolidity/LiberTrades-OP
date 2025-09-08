// src/components/trading/TradesHistory.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Activity, Clock, Info } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useData } from '@/contexts/DataContext';

/* ------------------------ utils base ------------------------ */
const safeArr = (a) => (Array.isArray(a) ? a : []);
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

const fmt = (v, d = 2) =>
  (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : (0).toFixed(d));

const fmtSigned = (v, d = 2) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return (0).toFixed(d);
  if (Object.is(x, -0)) return (0).toFixed(d);
  if (x === 0) return (0).toFixed(d);
  return `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
};

const fmtPriceSafe = (v, d = 2) => {
  const x = Number(v);
  if (!Number.isFinite(x) || x <= 0 || x > 1e8) return '—';
  return x.toFixed(d);
};

const normalizePair = (pair, fb = 'BTC/USDT') => {
  if (!pair) return fb;
  const s = String(pair).trim().toUpperCase();
  if (!s) return fb;
  if (s.includes('/')) {
    const [b = 'BTC', q = 'USDT'] = s.split('/');
    return `${b}/${q}`;
  }
  if (s.endsWith('USDT')) return `${s.slice(0, -4)}/USDT`;
  if (s.endsWith('USDC')) return `${s.slice(0, -4)}/USDC`;
  return `${s}/USDT`;
};
const baseFromPair = (pair) => {
  if (!pair || typeof pair !== 'string') return 'BTC';
  const s = pair.trim().toUpperCase();
  if (s.includes('/')) return s.split('/')[0];
  if (s.endsWith('USDT')) return s.slice(0, -4);
  if (s.endsWith('USDC')) return s.slice(0, -4);
  return s;
};
const noSlash = (s) => String(s || '').replace('/', '').toUpperCase();

const parseTsMs = (ts) => {
  if (ts == null) return NaN;
  if (typeof ts === 'number') return ts < 2e10 ? ts * 1000 : ts;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    if (Number.isFinite(ms)) return ms;
    const n = Number(ts);
    if (Number.isFinite(n)) return n < 2e10 ? n * 1000 : n;
  }
  const d = new Date(ts);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

const fmtTime = (ts) => {
  const ms = parseTsMs(ts);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const fmtDateTime = (ts) => {
  const ms = parseTsMs(ts);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString();
};
const fmtDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
};

/* --------------------- helpers de trading -------------------- */
const getQty = (t) => {
  const direct =
    num(t?.qty, NaN) ??
    num(t?.quantity, NaN) ??
    num(t?.units, NaN) ??
    num(t?.size, NaN);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const entry = num(t?.entry_price ?? t?.entryPrice ?? t?.price ?? t?.priceAtExecution, 0);

  const amount =
    num(t?.amountAtOpen ?? t?.amount_usd ?? t?.amount_usd_open ?? t?.notional_usd ?? t?.amount, 0);

  if (entry > 0 && amount > 0) return amount / entry;
  return 0;
};

const getOpenNotional = (t) => {
  const entry = num(t?.entry_price ?? t?.entryPrice ?? t?.price ?? t?.priceAtExecution, 0);
  const amountOpen =
    num(t?.amountAtOpen ?? t?.amount_usd ?? t?.amount_usd_open ?? t?.notional_usd, NaN) ??
    num(t?.amount, NaN);
  if (Number.isFinite(amountOpen) && amountOpen > 0) return amountOpen;

  const qty = getQty(t);
  if (entry > 0 && qty > 0) return entry * qty;
  return 0;
};

const remainingSeconds = (trade) => {
  if (!trade || String(trade.status || '').toLowerCase() !== 'open') return null;
  let closeAtMs = parseTsMs(trade.closeAt ?? trade.closeat);
  if (!Number.isFinite(closeAtMs)) {
    const ts =
      parseTsMs(trade.timestamp) ??
      parseTsMs(trade.openedAt) ??
      parseTsMs(trade.opened_at) ??
      parseTsMs(trade.createdAt) ??
      parseTsMs(trade.created_at) ??
      Date.now();
    const durSec = num(trade.durationSeconds ?? trade.duration, 0);
    if (durSec > 0 && Number.isFinite(ts)) closeAtMs = ts + durSec * 1000;
  }
  if (!Number.isFinite(closeAtMs)) return null;
  return Math.max(0, Math.floor((closeAtMs - Date.now()) / 1000));
};

/* ------------- getter robusto de precio en vivo -------------- */
const useLivePriceGetter = (externalPrices) => {
  const { cryptoPrices: ctxPrices = {}, getPairInfo } = useData();

  return useCallback(
    (pair) => {
      const norm = normalizePair(pair);
      const base = baseFromPair(norm);

      // 1) props (si vienen)
      const pExt =
        externalPrices?.[norm]?.price ??
        externalPrices?.[base]?.price ??
        externalPrices?.[noSlash(norm)]?.price;
      if (Number.isFinite(Number(pExt))) return Number(pExt);

      // 2) helper del contexto
      if (typeof getPairInfo === 'function') {
        const info = getPairInfo(norm);
        const pCtx = Number(info?.price);
        if (Number.isFinite(pCtx)) return pCtx;

        const hist = Array.isArray(info?.history) ? info.history : [];
        const last = hist.length ? Number(hist[hist.length - 1]?.value) : NaN;
        if (Number.isFinite(last)) return last;
      }

      // 3) mapa directo del contexto
      const tries = [
        ctxPrices?.[norm]?.price,
        ctxPrices?.[base]?.price,
        ctxPrices?.[noSlash(norm)]?.price,
        ctxPrices?.[norm]?.history?.at?.(-1)?.value,
        ctxPrices?.[base]?.history?.at?.(-1)?.value,
      ];
      for (const p of tries) {
        if (Number.isFinite(Number(p))) return Number(p);
      }
      return NaN;
    },
    [externalPrices, ctxPrices, getPairInfo]
  );
};

/* ----------- helpers PnL persistido / cierre ----------- */
// Ignorar null/undefined
const realizedFromRow = (t) => {
  const cands = [
    t?.realized_pnl_usd,
    t?.realized_pnl,
    t?.pnl_usd,
    t?.pnlUsd,
    t?.profit_usd,
    t?.profit,
    t?.realized,
  ];
  for (const v of cands) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
};

const sideOf = (t) => String(t?.type ?? t?.side ?? '').toLowerCase();

const calcUPnL = (trade, getLive) => {
  const live = Number(getLive(trade?.pair ?? (trade?.symbol ? `${trade.symbol}/${trade.quote || 'USDT'}` : '')));
  const entry = num(trade?.entry_price ?? trade?.entryPrice ?? trade?.price ?? trade?.priceAtExecution, NaN);
  const qty = getQty(trade);
  if (!Number.isFinite(live) || !Number.isFinite(entry) || !qty) return 0;
  const side = sideOf(trade);
  return side === 'sell' ? (entry - live) * qty : (live - entry) * qty;
};

const inferClosePriceIfMissing = (trade, live, localHint) => {
  if (Number.isFinite(localHint)) return localHint;

  const explicit =
    trade.close_price ??
    trade.closePrice ??
    trade.closeprice;
  if (explicit != null && Number.isFinite(Number(explicit))) return Number(explicit);

  const entry = num(trade.entry_price ?? trade.entryPrice ?? trade.price ?? trade.priceAtExecution, NaN);
  const qty = getQty(trade);
  const side = sideOf(trade);

  const persisted = realizedFromRow(trade);
  if (Number.isFinite(persisted) && Number.isFinite(entry) && qty) {
    return side === 'sell' ? entry - persisted / qty : entry + persisted / qty;
  }

  return Number.isFinite(live) ? live : null;
};

/* --------------------------- Row ---------------------------- */
const TradeRow = ({
  t, getLive, onClose, onDetails, closing,
  pnlDecimals, priceDecimals, getCloseHint,
}) => {
  const pairRaw = t.pair ?? (t.symbol ? `${t.symbol}/${t.quote || 'USDT'}` : 'BTC/USDT');
  const pair = normalizePair(pairRaw);
  const side = sideOf(t);
  const entry = num(t.entry_price ?? t.entryPrice ?? t.price ?? t.priceAtExecution, 0);
  const isOpen = String(t.status || '').toLowerCase() === 'open';

  const computedOpen = calcUPnL(t, getLive);

  let pnlClosed = 0;
  if (!isOpen) {
    const persisted = realizedFromRow(t);
    const live = Number(getLive(pair));
    const closeP = inferClosePriceIfMissing(t, live, getCloseHint?.(t.id));
    const qty = getQty(t);
    const tol = 1e-9;
    const canRecalc = Number.isFinite(closeP) && qty > 0 && Math.abs(closeP - entry) > tol;

    if (!Number.isFinite(persisted) || (persisted === 0 && canRecalc)) {
      pnlClosed = side === 'sell' ? (entry - closeP) * qty : (closeP - entry) * qty;
    } else {
      pnlClosed = persisted;
    }
  }

  const pnlShown = isOpen ? computedOpen : pnlClosed;
  const pnlPos = pnlShown > 0;
  const pnlNeg = pnlShown < 0;

  const secs = remainingSeconds(t);
  const mm = Number.isFinite(secs) ? Math.floor(secs / 60) : null;
  const ss = Number.isFinite(secs) ? String(secs % 60).padStart(2, '0') : null;

  const amountForRow =
    num(t.amountAtOpen ?? t.amount_usd ?? t.amount_usd_open ?? t.notional_usd ?? t.amount, NaN);
  const amountText = Number.isFinite(amountForRow)
    ? `$${fmt(amountForRow, 2)}`
    : (entry > 0 && getQty(t) > 0 ? `$${fmt(entry * getQty(t), 2)}` : '$0.00');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700/50"
    >
      <div className="flex-1">
        <div className="flex items-center space-x-4">
          <div
            className={`px-2 py-1 rounded text-xs font-medium ${
              side === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}
          >
            {side === 'buy' ? 'BUY' : 'SELL'}
          </div>
          <div>
            <p className="text-white font-medium">{pair}</p>
            <p className="text-slate-400 text-sm">
              {amountText} @ ${fmtPriceSafe(entry, priceDecimals)}
            </p>
          </div>
        </div>
      </div>

      <div className="text-right">
        <p
          className={`font-semibold ${
            pnlShown > 0 ? 'text-green-400' : pnlShown < 0 ? 'text-red-400' : 'text-slate-300'
          }`}
        >
          {fmtSigned(pnlShown, pnlDecimals)}
        </p>
        <p className="text-slate-400 text-sm">{fmtTime(t.timestamp ?? t.created_at ?? t.createdAt)}</p>
      </div>

      <div className="ml-4 w-44 flex items-center justify-end gap-2">
        {isOpen ? (
          <>
            <div className="flex items-center text-yellow-400 text-sm">
              <Clock className="h-3 w-3 mr-1" />
              {Number.isFinite(secs) ? `${mm}:${ss}` : '—'}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
              onClick={() => onClose?.(t.id)}
              disabled={closing}
            >
              {closing ? 'Cerrando…' : 'Cerrar'}
            </Button>
          </>
        ) : (
          <span
            className={`px-2 py-1 rounded text-xs ${
              pnlPos
                ? 'bg-green-500/20 text-green-400'
                : pnlNeg
                ? 'bg-red-500/20 text-red-400'
                : 'bg-slate-500/20 text-slate-300'
            }`}
          >
            {pnlPos ? 'Ganancia' : pnlNeg ? 'Pérdida' : '±0'}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="border-slate-600 text-slate-200 hover:bg-slate-700"
          onClick={() => onDetails?.(t)}
        >
          <Info className="h-4 w-4 mr-1" />
          Detalles
        </Button>
      </div>
    </motion.div>
  );
};

/* --------------------------- Main --------------------------- */
const TradesHistory = ({
  trades = [],
  cryptoPrices = {},
  // closeTrade: (tradeId, closePrice|null, force?) => Promise<boolean|void>
  closeTrade = undefined,
  autoCloseDemo = true,
  pnlDecimals = 4,
  pnlPctDecimals = 4,
  priceDecimals = 4,
}) => {
  const list = safeArr(trades);
  const getLive = useLivePriceGetter(cryptoPrices);

  // si no nos pasan closeTrade por props, usar el del DataContext (RPC)
  const { closeTrade: ctxCloseTrade } = useData();
  const doCloseTrade = useMemo(
    () => (typeof closeTrade === 'function' ? closeTrade : ctxCloseTrade),
    [closeTrade, ctxCloseTrade]
  );

  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((x) => (x + 1) % 1e9), 1000);
    return () => clearInterval(id);
  }, []);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // hints locales de cierre (id -> precio capturado al cerrar)
  const closeHintsRef = useRef(new Map());
  const setCloseHint = (id, price) => {
    if (!id || !Number.isFinite(price)) return;
    closeHintsRef.current.set(id, Number(price));
  };
  const getCloseHint = (id) => closeHintsRef.current.get(id);

  const wasOpenAtOpenRef = useRef(false);

  const [closingModal, setClosingModal] = useState(false);
  const [rowClosingId, setRowClosingId] = useState(null);

  const openForDetails = (t) => {
    setSelected(t);
    wasOpenAtOpenRef.current = String(t?.status || '').toLowerCase() === 'open';
    setDetailOpen(true);
  };

  useEffect(() => {
    if (!selected) return;
    const updated = list.find((t) => t.id === selected.id);
    if (!updated) return;
    setSelected(updated);

    if (
      detailOpen &&
      wasOpenAtOpenRef.current &&
      String(updated.status || '').toLowerCase() === 'closed'
    ) {
      setDetailOpen(false);
    }
  }, [list, selected?.id, detailOpen]);

  const callCloseRpc = useCallback(
    async (id, priceHint) => {
      if (typeof doCloseTrade !== 'function') return false;
      const cp = Number.isFinite(priceHint) ? Number(priceHint) : null;
      const result = await doCloseTrade(id, cp, true);
      return typeof result === 'boolean' ? result : !!result;
    },
    [doCloseTrade]
  );

  const handleRowClose = async (id) => {
    if (!id) return;
    try {
      const t = list.find((x) => x.id === id);
      const pair = t?.pair ?? (t?.symbol ? `${t.symbol}/${t.quote || 'USDT'}` : '');
      const p = Number(getLive(pair));
      if (Number.isFinite(p)) setCloseHint(id, p);

      setRowClosingId(id);
      const ok = await callCloseRpc(id, p);
      if (ok && detailOpen && selected?.id === id) setDetailOpen(false);
    } finally {
      setRowClosingId(null);
    }
  };

  /* --------- AUTOCIERRE DEMO --------- */
  const autoClosingSet = useRef(new Set());
  useEffect(() => {
    if (!autoCloseDemo) return;
    const id = setInterval(async () => {
      for (const t of list) {
        if (!t?.id) continue;
        if (String(t.status || '').toLowerCase() !== 'open') continue;

        const hasDur =
          Number(num(t.durationSeconds ?? t.duration, 0)) > 0 ||
          Number.isFinite(parseTsMs(t.closeAt ?? t.closeat));
        if (!hasDur) continue;

        const secs = remainingSeconds(t);
        if (secs === 0 && !autoClosingSet.current.has(t.id)) {
          autoClosingSet.current.add(t.id);
          try {
            const pair = t?.pair ?? (t?.symbol ? `${t.symbol}/${t?.quote || 'USDT'}` : '');
            const p = Number(getLive(pair));
            if (Number.isFinite(p)) setCloseHint(t.id, p);
            await callCloseRpc(t.id, p);
          } finally {
            setTimeout(() => autoClosingSet.current.delete(t.id), 2000);
          }
        }
      }
    }, 500);
    return () => clearInterval(id);
  }, [list, autoCloseDemo, callCloseRpc, getLive]);

  // Datos para el modal
  const details = useMemo(() => {
    if (!selected) return null;

    const side = sideOf(selected);
    const entry = num(selected.entry_price ?? selected.entryPrice ?? selected.price ?? selected.priceAtExecution, 0);
    const qty = getQty(selected);
    const amountOpen = getOpenNotional(selected);

    const pair = selected.pair ?? (selected.symbol ? `${selected.symbol}/${selected.quote || 'USDT'}` : '');
    const live = Number(getLive(pair));
    const isOpen = String(selected.status || '').toLowerCase() === 'open';

    const closePrice = isOpen
      ? (Number.isFinite(live) ? live : null)
      : inferClosePriceIfMissing(selected, live, getCloseHint(selected.id));

    const upnlLive = (() => {
      if (!isOpen || !Number.isFinite(live) || !entry || !qty) return 0;
      return side === 'sell' ? (entry - live) * qty : (live - entry) * qty;
    })();

    let realized = null;
    if (!isOpen) {
      const persisted = realizedFromRow(selected);
      const tol = 1e-9;
      const canRecalc =
        Number.isFinite(closePrice) && qty > 0 && Math.abs((closePrice ?? entry) - entry) > tol;

      if (!Number.isFinite(persisted) || (persisted === 0 && canRecalc)) {
        realized = side === 'sell' ? (entry - closePrice) * qty : (closePrice - entry) * qty;
      } else {
        realized = persisted;
      }
    }

    const pnlShown = isOpen ? upnlLive : (realized ?? 0);
    const denom = amountOpen > 0 ? amountOpen : (entry > 0 && qty > 0 ? entry * qty : 0);
    const pnlPct = denom ? (pnlShown / denom) * 100 : 0;

    const tsOpen =
      parseTsMs(selected.timestamp) ??
      parseTsMs(selected.openedAt) ??
      parseTsMs(selected.opened_at) ??
      parseTsMs(selected.createdAt) ??
      parseTsMs(selected.created_at) ??
      NaN;

    const tsClose = isOpen ? null : (parseTsMs(selected.closeat ?? selected.closeAt) || null);
    const secondsElapsed = Number.isFinite(tsOpen)
      ? Math.floor(((tsClose ?? Date.now()) - tsOpen) / 1000)
      : null;

    return {
      side,
      amount: amountOpen,
      entry,
      qty,
      live: Number.isFinite(live) ? live : null,
      closePrice,
      pnlShown,
      pnlPct,
      isOpen,
      tsOpen,
      tsClose,
      secondsElapsed,
    };
  }, [selected, getLive, pnlDecimals, pnlPctDecimals, priceDecimals]);

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6 }}>
        <Card className="crypto-card">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-blue-400" />
              Historial de Trades
            </CardTitle>
            <CardDescription className="text-slate-300">
              Tus trades recientes y activos
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto scrollbar-hide">
              {list.length > 0 ? (
                list.map((t) => (
                  <TradeRow
                    key={String(t.id ?? `${t.pair ?? t.symbol}-${parseTsMs(t.timestamp ?? t.created_at) || Math.random()}`)}
                    t={t}
                    getLive={getLive}
                    onClose={handleRowClose}
                    onDetails={openForDetails}
                    closing={rowClosingId === t.id}
                    pnlDecimals={pnlDecimals}
                    priceDecimals={priceDecimals}
                    getCloseHint={getCloseHint}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No tienes trades aún</p>
                  <p className="text-slate-500 text-sm">Ejecuta tu primer trade para comenzar</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Modal de Detalle */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-white">Detalle de la operación</DialogTitle>
            <DialogDescription className="text-slate-400">
              Información completa del trade {normalizePair(selected?.pair ?? (selected?.symbol ? `${selected.symbol}/${selected.quote || 'USDT'}` : ''))}
            </DialogDescription>
          </DialogHeader>

          {selected && details && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Tipo</p>
                  <p className={`font-semibold ${details.pnlShown >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {sideOf(selected) === 'sell' ? 'SELL' : 'BUY'}
                  </p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Par</p>
                  <p className="font-semibold">{normalizePair(selected?.pair ?? (selected?.symbol ? `${selected.symbol}/${selected.quote || 'USDT'}` : ''))}</p>
                </div>

                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Monto (USD)</p>
                  <p className="font-semibold">${fmt(details.amount, 2)}</p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Cantidad (qty)</p>
                  <p className="font-semibold">{fmt(details.qty, 6)}</p>
                </div>

                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Precio de entrada</p>
                  <p className="font-semibold">${fmtPriceSafe(details.entry, priceDecimals)}</p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">
                    {details.isOpen ? 'Precio actual' : 'Precio de cierre'}
                  </p>
                  <p className="font-semibold">
                    {details.isOpen
                      ? (details.live != null ? `$${fmtPriceSafe(details.live, priceDecimals)}` : '—')
                      : (details.closePrice != null ? `$${fmtPriceSafe(details.closePrice, priceDecimals)}` : '—')}
                  </p>
                </div>

                <div className="p-3 rounded bg-slate-800/60 col-span-2">
                  <p className="text-slate-400 text-xs">PnL</p>
                  <p className={`font-semibold ${details.pnlShown >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtSigned(details.pnlShown, pnlDecimals)} ({fmtSigned(details.pnlPct, pnlPctDecimals)}%)
                  </p>
                </div>

                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Abierto</p>
                  <p className="font-semibold">{fmtDateTime(details.tsOpen)}</p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">{details.isOpen ? 'Duración' : 'Cerrado'}</p>
                  <p className="font-semibold">
                    {details.isOpen
                      ? fmtDuration(details.secondsElapsed ?? NaN)
                      : fmtDateTime(details.tsClose)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="justify-between">
            <div className="text-xs text-slate-500">ID: {selected?.id || '—'}</div>
            <div className="flex gap-2">
              {selected && String(selected.status || 'open').toLowerCase() === 'open' && (
                <Button
                  onClick={async () => {
                    if (!selected?.id) return;
                    const pair = selected?.pair ?? (selected?.symbol ? `${selected.symbol}/${selected.quote || 'USDT'}` : '');
                    const p = Number(getLive(pair));
                    if (Number.isFinite(p)) setCloseHint(selected.id, p);

                    setClosingModal(true);
                    const ok = await callCloseRpc(selected.id, p);
                    setClosingModal(false);
                    if (ok) setDetailOpen(false);
                  }}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={closingModal}
                >
                  {closingModal ? 'Cerrando…' : 'Cerrar ahora'}
                </Button>
              )}
              <Button variant="outline" className="border-slate-600" onClick={() => setDetailOpen(false)} disabled={closingModal}>
                Cerrar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TradesHistory;
