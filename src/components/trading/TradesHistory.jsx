// src/components/trading/TradesHistory.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Activity, Clock, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const safeArr = (a) => (Array.isArray(a) ? a : []);
const n = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const fmt = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d) : (0).toFixed(d));
const fmtSigned = (v, d = 2) => {
  const x = Number(v);
  if (!Number.isFinite(x)) return `+${(0).toFixed(d)}`;
  return `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
};

// BASE desde "BTC/USDT" o "BTCUSDT"
const baseFromPair = (pair) => {
  if (!pair || typeof pair !== 'string') return 'BTC';
  if (pair.includes('/')) return pair.split('/')[0].toUpperCase();
  // "BTCUSDT" -> quitar sufijo común
  const up = pair.toUpperCase();
  if (up.endsWith('USDT')) return up.slice(0, -4);
  if (up.endsWith('USDC')) return up.slice(0, -4);
  return up;
};

// Normaliza timestamps variados a ms
const parseTsMs = (ts) => {
  if (ts == null) return NaN;
  if (typeof ts === 'number') return ts < 2e10 ? ts * 1000 : ts;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    if (Number.isFinite(ms)) return ms;
    const num = Number(ts);
    if (Number.isFinite(num)) return num < 2e10 ? num * 1000 : num;
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

// ======= Cálculos de PnL y tiempos =======
const calcUPnL = (trade, cryptoPrices = {}) => {
  const base = baseFromPair(trade?.pair);
  const live = n(cryptoPrices?.[base]?.price, NaN);
  const entry = n(trade?.price ?? trade?.priceAtExecution, NaN);
  const amount = n(trade?.amount, NaN);
  if (!Number.isFinite(live) || !Number.isFinite(entry) || !Number.isFinite(amount) || !amount || !entry) return 0;
  const qty = amount / entry;
  const side = String(trade?.type || '').toLowerCase();
  return side === 'sell' ? (entry - live) * qty : (live - entry) * qty;
};

const remainingSeconds = (trade) => {
  if (!trade || String(trade.status || '').toLowerCase() !== 'open') return null;

  let closeAtMs = parseTsMs(trade.closeAt ?? trade.closeat);
  if (!Number.isFinite(closeAtMs)) {
    const ts = parseTsMs(trade.timestamp ?? Date.now());
    const durSec = n(trade.durationSeconds ?? trade.duration, 0);
    if (durSec > 0 && Number.isFinite(ts)) closeAtMs = ts + durSec * 1000;
  }
  if (!Number.isFinite(closeAtMs)) return null;

  return Math.max(0, Math.floor((closeAtMs - Date.now()) / 1000));
};

const computeQty = (amountUsd, entry) => {
  const a = n(amountUsd, 0);
  const e = n(entry, 0);
  if (!a || !e) return 0;
  return a / e;
};

const inferClosePriceIfMissing = (trade) => {
  const explicit = trade.closeprice ?? trade.closePrice;
  if (explicit != null && Number.isFinite(Number(explicit))) return Number(explicit);

  const entry = n(trade.price ?? trade.priceAtExecution, NaN);
  const amount = n(trade.amount, NaN);
  const qty = computeQty(amount, entry);
  const profit = n(trade.profit, NaN);
  const side = String(trade.type || '').toLowerCase();

  if (!Number.isFinite(entry) || !Number.isFinite(qty)) return null;
  if (!Number.isFinite(profit)) return null;

  // profit = (close - entry) * qty   (buy)
  // profit = (entry - close) * qty   (sell)
  return side === 'sell' ? entry - profit / qty : entry + profit / qty;
};

// ======= Row =======
const TradeRow = ({ t, cryptoPrices, onClose, onDetails, closing }) => {
  const pair = typeof t.pair === 'string' ? t.pair : 'BTC/USDT';
  const side = String(t.type || '').toLowerCase(); // buy|sell
  const amount = n(t.amount, 0);
  const entry = n(t.price ?? t.priceAtExecution, 0);
  const upnl = n(t.upnl, null);
  const computed = Number.isFinite(upnl) ? upnl : calcUPnL(t, cryptoPrices);
  const isOpen = String(t.status || '').toLowerCase() === 'open';

  const secs = remainingSeconds(t);
  const mm = Number.isFinite(secs) ? Math.floor(secs / 60) : null;
  const ss = Number.isFinite(secs) ? String(secs % 60).padStart(2, '0') : null;

  const pnlShown = isOpen ? computed : n(t.profit, 0);
  const pnlPos = pnlShown >= 0;

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
              side === 'buy'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {side === 'buy' ? 'BUY' : 'SELL'}
          </div>
          <div>
            <p className="text-white font-medium">{pair}</p>
            <p className="text-slate-400 text-sm">
              ${fmt(amount)} @ ${fmt(entry)}
            </p>
          </div>
        </div>
      </div>

      <div className="text-right">
        <p className={`font-semibold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
          {fmtSigned(pnlShown)}
        </p>
        <p className="text-slate-400 text-sm">{fmtTime(t.timestamp)}</p>
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
              pnlPos ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}
          >
            {pnlPos ? 'Ganancia' : 'Pérdida'}
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

// ======= Main =======
const TradesHistory = ({ trades = [], cryptoPrices = {}, closeTrade = () => {} }) => {
  const list = safeArr(trades);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // estados para UX de cierre
  const [closingModal, setClosingModal] = useState(false);
  const [rowClosingId, setRowClosingId] = useState(null);

  const openForDetails = (t) => {
    setSelected(t);
    setDetailOpen(true);
  };

  // Si cambia el trade seleccionado en la lista (p.ej., se cierra), refrescar modal / cerrarlo
  useEffect(() => {
    if (!selected) return;
    const updated = list.find((t) => t.id === selected.id);
    if (updated) {
      setSelected(updated);
      if (detailOpen && String(updated.status || '').toLowerCase() === 'closed') {
        setDetailOpen(false);
      }
    }
  }, [list, selected?.id, detailOpen]);

  // wrapper que espera al closeTrade y luego cierra modal si corresponde
  const handleRowClose = async (id) => {
    if (!id) return;
    try {
      setRowClosingId(id);
      const result = await closeTrade?.(id, true);
      const ok = (typeof result === 'boolean') ? result : true; // si no devuelve explicitamente
      if (ok && detailOpen && selected?.id === id) {
        setDetailOpen(false);
      }
    } finally {
      setRowClosingId(null);
    }
  };

  // Datos calculados para el modal
  const details = useMemo(() => {
    if (!selected) return null;

    const side = String(selected.type || '').toLowerCase();
    const amount = n(selected.amount, 0);
    const entry = n(selected.price ?? selected.priceAtExecution, 0);
    const qty = computeQty(amount, entry);

    const liveBase = baseFromPair(selected.pair);
    const live = n(cryptoPrices?.[liveBase]?.price, NaN);

    const isOpen = String(selected.status || '').toLowerCase() === 'open';
    const closePrice = isOpen ? (Number.isFinite(live) ? live : null) : inferClosePriceIfMissing(selected);

    const upnlLive = (() => {
      if (!isOpen || !Number.isFinite(live) || !entry || !qty) return 0;
      return side === 'sell' ? (entry - live) * qty : (live - entry) * qty;
    })();

    const realized = isOpen ? null : n(selected.profit, 0);
    const pnlShown = isOpen ? upnlLive : realized ?? 0;
    const pnlPct = amount ? (pnlShown / amount) * 100 : 0;

    const tsOpen = parseTsMs(selected.timestamp);
    const tsClose = isOpen ? null : (parseTsMs(selected.closeat ?? selected.closeAt) || null);
    const secondsElapsed = Number.isFinite(tsOpen)
      ? Math.floor(((tsClose ?? Date.now()) - tsOpen) / 1000)
      : null;

    return {
      side,
      amount,
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
  }, [selected, cryptoPrices]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6 }}
      >
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
                    key={t.id ?? `${t.pair}-${parseTsMs(t.timestamp) || Math.random()}`}
                    t={t}
                    cryptoPrices={cryptoPrices}
                    onClose={handleRowClose}
                    onDetails={openForDetails}
                    closing={rowClosingId === t.id}
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
              Información completa del trade {selected?.pair || ''}
            </DialogDescription>
          </DialogHeader>

          {selected && details && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Tipo</p>
                  <p className={`font-semibold ${details.side === 'sell' ? 'text-red-400' : 'text-green-400'}`}>
                    {details.side === 'sell' ? 'SELL' : 'BUY'}
                  </p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Par</p>
                  <p className="font-semibold">{selected.pair}</p>
                </div>

                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Monto (USD)</p>
                  <p className="font-semibold">${fmt(details.amount)}</p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Cantidad (qty)</p>
                  <p className="font-semibold">{fmt(details.qty, 6)}</p>
                </div>

                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Precio de entrada</p>
                  <p className="font-semibold">${fmt(details.entry)}</p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">
                    {details.isOpen ? 'Precio actual' : 'Precio de cierre'}
                  </p>
                  <p className="font-semibold">
                    {details.isOpen
                      ? (details.live != null ? `$${fmt(details.live)}` : '—')
                      : (details.closePrice != null ? `$${fmt(details.closePrice)}` : '—')}
                  </p>
                </div>

                <div className="p-3 rounded bg-slate-800/60 col-span-2">
                  <p className="text-slate-400 text-xs">PnL</p>
                  <p className={`font-semibold ${details.pnlShown >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtSigned(details.pnlShown)} ({fmtSigned(details.pnlPct)}%)
                  </p>
                </div>

                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Abierto</p>
                  <p className="font-semibold">{fmtDateTime(selected.timestamp)}</p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">{details.isOpen ? 'Duración' : 'Cerrado'}</p>
                  <p className="font-semibold">
                    {details.isOpen
                      ? fmtDuration(details.secondsElapsed ?? NaN)
                      : fmtDateTime(selected.closeat ?? selected.closeAt)}
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
                    setClosingModal(true);
                    const result = await closeTrade?.(selected.id, true);
                    setClosingModal(false);
                    const ok = (typeof result === 'boolean') ? result : true;
                    if (ok) setDetailOpen(false);
                  }}
                  className="bg-red-600 hover:bg-red-700"
                  disabled={closingModal}
                >
                  {closingModal ? 'Cerrando…' : 'Cerrar ahora'}
                </Button>
              )}
              <Button
                variant="outline"
                className="border-slate-600"
                onClick={() => setDetailOpen(false)}
                disabled={closingModal}
              >
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
