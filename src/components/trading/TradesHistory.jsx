import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  if (!Number.isFinite(x)) return `+${(0).toFixed(d)}`;
  return `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;
};

// evita imprimir monstruos astronómicos heredados de trades viejos bugueados
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

// ts variados a ms
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
// qty robusto: usa qty persistido si existe; si no, amount/entry
const getQty = (t) => {
  const q =
    num(t?.qty, NaN) ??
    num(t?.quantity, NaN) ??
    num(t?.units, NaN) ??
    num(t?.size, NaN);
  if (Number.isFinite(q) && q > 0) return q;

  const entry = num(t?.price ?? t?.priceAtExecution, 0);
  const amount =
    num(t?.amountAtOpen ?? t?.amount_usd ?? t?.amount, 0); // priorizamos amount de apertura
  if (entry > 0 && amount > 0) return amount / entry;
  return 0;
};

// notional de apertura para %: amountAtOpen > amount > entry*qty
const getOpenNotional = (t) => {
  const entry = num(t?.price ?? t?.priceAtExecution, 0);
  const amountOpen =
    num(t?.amountAtOpen ?? t?.amount_usd, NaN) ??
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
  const prices = useMemo(
    () => (externalPrices && Object.keys(externalPrices).length ? externalPrices : ctxPrices),
    [externalPrices, ctxPrices]
  );

  return (pair) => {
    const norm = normalizePair(pair);
    const base = baseFromPair(norm);

    // 1) API del DataContext (pref)
    if (typeof getPairInfo === 'function') {
      const info = getPairInfo(norm);
      if (info && Number.isFinite(Number(info.price))) return Number(info.price);
    }

    // 2) Fallbacks por claves frecuentes
    const tries = [
      prices?.[base]?.price,
      prices?.[norm]?.price,
      prices?.[noSlash(norm)]?.price,        // ej: BTCUSDT
      prices?.[base]?.c ?? prices?.[base]?.last,
    ];
    for (const p of tries) {
      if (Number.isFinite(Number(p))) return Number(p);
    }
    return NaN;
  };
};

/* ------------------ PnL (marca y realizado) ------------------ */
const calcUPnL = (trade, getLive) => {
  const live = Number(getLive(trade?.pair));
  const entry = num(trade?.price ?? trade?.priceAtExecution, NaN);
  const qty = getQty(trade);
  if (!Number.isFinite(live) || !Number.isFinite(entry) || !qty) return 0;
  const side = String(trade?.type || '').toLowerCase();
  return side === 'sell' ? (entry - live) * qty : (live - entry) * qty;
};

const inferClosePriceIfMissing = (trade, live, localHint) => {
  // 0) si capturamos el precio al cerrar, úsalo
  if (Number.isFinite(localHint)) return localHint;

  // 1) explícito desde backend
  const explicit =
    trade.closeprice ??
    trade.closePrice ??
    trade.close_price;
  if (explicit != null && Number.isFinite(Number(explicit))) return Number(explicit);

  // 2) derivarlo de profit si existe
  const entry = num(trade.price ?? trade.priceAtExecution, NaN);
  const qty = getQty(trade);
  const profit =
    num(trade.profit, NaN) ??
    num(trade.realized, NaN) ??
    num(trade.realized_pnl, NaN);
  const side = String(trade.type || '').toLowerCase();

  if (Number.isFinite(profit) && Number.isFinite(entry) && qty) {
    return side === 'sell' ? entry - profit / qty : entry + profit / qty;
  }

  // 3) último live como aproximación
  return Number.isFinite(live) ? live : null;
};

/* --------------------------- Row ---------------------------- */
const TradeRow = ({
  t, getLive, onClose, onDetails, closing,
  pnlDecimals, priceDecimals, getCloseHint,
}) => {
  const pair = typeof t.pair === 'string' ? normalizePair(t.pair) : 'BTC/USDT';
  const side = String(t.type || '').toLowerCase(); // buy|sell
  const entry = num(t.price ?? t.priceAtExecution, 0);
  const isOpen = String(t.status || '').toLowerCase() === 'open';

  // abiertos ⇒ calc con precio vivo SIEMPRE
  const computedOpen = calcUPnL(t, getLive);

  // cerrados ⇒ prioridad: closeHint > closePrice > profit > 0
  let pnlClosed = 0;
  if (!isOpen) {
    const live = Number(getLive(t.pair));
    const closeP = inferClosePriceIfMissing(t, live, getCloseHint?.(t.id));
    const qty = getQty(t);
    if (Number.isFinite(closeP) && qty) {
      pnlClosed = side === 'sell' ? (entry - closeP) * qty : (closeP - entry) * qty;
    } else {
      const p =
        num(t.profit, NaN) ??
        num(t.realized, NaN) ??
        num(t.realized_pnl, NaN);
      pnlClosed = Number.isFinite(p) ? p : 0;
    }
  }

  const pnlShown = isOpen ? computedOpen : pnlClosed;
  const pnlPos = pnlShown >= 0;

  const secs = remainingSeconds(t);
  const mm = Number.isFinite(secs) ? Math.floor(secs / 60) : null;
  const ss = Number.isFinite(secs) ? String(secs % 60).padStart(2, '0') : null;

  // notional para mostrar en la fila (opcional)
  const amountForRow =
    num(t.amountAtOpen ?? t.amount_usd ?? t.amount, NaN);
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
        <p className={`font-semibold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
          {fmtSigned(pnlShown, pnlDecimals)}
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

/* --------------------------- Main --------------------------- */
const TradesHistory = ({
  trades = [],
  cryptoPrices = {},
  // closeTrade debe aceptar: (tradeId: string, closePrice?: number, force?: boolean) => Promise<boolean|void>
  closeTrade = async () => {},
  autoCloseDemo = true,      // autocerrar trades con duración (modo demo)
  pnlDecimals = 4,           // decimales PnL $
  pnlPctDecimals = 4,        // decimales PnL %
  priceDecimals = 4,         // decimales de precios
}) => {
  const list = safeArr(trades);
  const getLive = useLivePriceGetter(cryptoPrices);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // Hints de cierre locales: id -> price capturado al cerrar
  const closeHintsRef = useRef(new Map());
  const setCloseHint = (id, price) => {
    if (!id || !Number.isFinite(price)) return;
    closeHintsRef.current.set(id, Number(price));
  };
  const getCloseHint = (id) => closeHintsRef.current.get(id);

  // para cerrar auto SOLO si el trade estaba abierto al abrir el modal
  const wasOpenAtOpenRef = useRef(false);

  // estados UX cierre
  const [closingModal, setClosingModal] = useState(false);
  const [rowClosingId, setRowClosingId] = useState(null);

  const openForDetails = (t) => {
    setSelected(t);
    wasOpenAtOpenRef.current = String(t?.status || '').toLowerCase() === 'open';
    setDetailOpen(true);
  };

  // sincronizar cambios del trade seleccionado
  useEffect(() => {
    if (!selected) return;
    const updated = list.find((t) => t.id === selected.id);
    if (!updated) return;

    setSelected(updated);

    // solo autocerrar si originalmente estaba OPEN y pasó a CLOSED
    if (
      detailOpen &&
      wasOpenAtOpenRef.current &&
      String(updated.status || '').toLowerCase() === 'closed'
    ) {
      setDetailOpen(false);
    }
  }, [list, selected?.id, detailOpen]);

  const handleRowClose = async (id) => {
    if (!id) return;
    try {
      // Capturamos precio vivo ANTES de cerrar (hint local y envío al backend)
      const t = list.find(x => x.id === id);
      const p = Number(getLive(t?.pair));
      if (Number.isFinite(p)) setCloseHint(id, p);

      setRowClosingId(id);
      const result = await closeTrade?.(id, Number.isFinite(p) ? p : undefined, true);
      const ok = (typeof result === 'boolean') ? result : true;
      if (ok && detailOpen && selected?.id === id) setDetailOpen(false);
    } finally {
      setRowClosingId(null);
    }
  };

  /* --------- AUTOCIERRE DEMO: cuando llega a 0s --------- */
  const autoClosingSet = useRef(new Set());
  useEffect(() => {
    if (!autoCloseDemo) return;
    const id = setInterval(async () => {
      for (const t of list) {
        if (!t?.id) continue;
        const status = String(t.status || '').toLowerCase();
        if (status !== 'open') continue;

        // solo autocerrar si existe duración o closeAt (típico DEMO)
        const hasDur =
          Number(num(t.durationSeconds ?? t.duration, 0)) > 0 ||
          Number.isFinite(parseTsMs(t.closeAt ?? t.closeat));

        if (!hasDur) continue;

        const secs = remainingSeconds(t);
        if (secs === 0 && !autoClosingSet.current.has(t.id)) {
          autoClosingSet.current.add(t.id);
          try {
            const p = Number(getLive(t.pair));
            if (Number.isFinite(p)) setCloseHint(t.id, p);
            await closeTrade?.(t.id, Number.isFinite(p) ? p : undefined, true);
          } finally {
            setTimeout(() => autoClosingSet.current.delete(t.id), 2000);
          }
        }
      }
    }, 500);

    return () => clearInterval(id);
  }, [list, autoCloseDemo, closeTrade, getLive]);

  // Datos para el modal
  const details = useMemo(() => {
    if (!selected) return null;

    const side = String(selected.type || '').toLowerCase();
    const entry = num(selected.price ?? selected.priceAtExecution, 0);
    const qty = getQty(selected);
    const amountOpen = getOpenNotional(selected);

    const live = Number(getLive(selected.pair));
    const isOpen = String(selected.status || '').toLowerCase() === 'open';

    const closePrice = isOpen
      ? (Number.isFinite(live) ? live : null)
      : inferClosePriceIfMissing(selected, live, getCloseHint(selected.id));

    const upnlLive = (() => {
      if (!isOpen || !Number.isFinite(live) || !entry || !qty) return 0;
      return side === 'sell' ? (entry - live) * qty : (live - entry) * qty;
    })();

    // realized preferente: closeHint/closePrice > profit > 0
    let realized = null;
    if (!isOpen) {
      if (Number.isFinite(closePrice) && qty) {
        realized = side === 'sell' ? (entry - closePrice) * qty : (closePrice - entry) * qty;
      } else {
        const p =
          num(selected.profit, NaN) ??
          num(selected.realized, NaN) ??
          num(selected.realized_pnl, NaN);
        realized = Number.isFinite(p) ? p : 0;
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
  }, [selected, getLive]);

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
                    key={t.id ?? `${t.pair}-${parseTsMs(t.timestamp) || Math.random()}`}
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
              Información completa del trade {normalizePair(selected?.pair || '')}
            </DialogDescription>
          </DialogHeader>

          {selected && details && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Tipo</p>
                  <p className={`font-semibold ${details.pnlShown >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {String(selected.type || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY'}
                  </p>
                </div>
                <div className="p-3 rounded bg-slate-800/60">
                  <p className="text-slate-400 text-xs">Par</p>
                  <p className="font-semibold">{normalizePair(selected?.pair)}</p>
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
                    // capturamos hint y ENVIAMOS precio al backend
                    const p = Number(getLive(selected.pair));
                    if (Number.isFinite(p)) setCloseHint(selected.id, p);

                    setClosingModal(true);
                    const result = await closeTrade?.(selected.id, Number.isFinite(p) ? p : undefined, true);
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
