import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Activity, Clock } from 'lucide-react';

const safeArr = (a) => (Array.isArray(a) ? a : []);
const fmt = (n, d = 2) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : (0).toFixed(d);
};

const baseFromPair = (pair) => {
  if (!pair || typeof pair !== 'string') return 'BTC';
  const [b] = pair.split('/');
  return (b || 'BTC').toUpperCase();
};

// Fallback por si no viene upnl desde el container
const calcUPnL = (trade, cryptoPrices = {}) => {
  const base = baseFromPair(trade?.pair);
  const current = Number(cryptoPrices?.[base]?.price ?? 0);
  const entry = Number(trade?.price ?? trade?.priceAtExecution ?? 0);
  const notional = Number(trade?.amount ?? 0);
  if (!current || !entry || !notional) return 0;

  const qty = notional / entry;
  const side = String(trade?.type || '').toLowerCase(); // buy | sell
  return side === 'sell' ? (entry - current) * qty : (current - entry) * qty;
};

const remainingSeconds = (trade) => {
  if (!trade || String(trade.status || '').toLowerCase() !== 'open') return null;

  // Soporta closeAt/closeat (ISO o epoch), o calcula si viene durationSeconds
  const closeAtIso = trade.closeAt || trade.closeat;
  let closeAtMs = closeAtIso ? new Date(closeAtIso).getTime() : NaN;

  if (!Number.isFinite(closeAtMs)) {
    const ts = new Date(trade.timestamp || Date.now()).getTime();
    const dur = Number(trade.durationSeconds || trade.duration || 0) * 1000;
    if (dur > 0) closeAtMs = ts + dur;
  }
  if (!Number.isFinite(closeAtMs)) return null;

  return Math.max(0, Math.floor((closeAtMs - Date.now()) / 1000));
};

const TradesHistory = ({ trades = [], cryptoPrices = {}, closeTrade = () => {} }) => {
  const list = safeArr(trades);

  return (
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
              list.map((t) => {
                const pair = typeof t.pair === 'string' ? t.pair : 'BTC/USDT';
                const side = String(t.type || '').toLowerCase(); // buy|sell
                const amount = Number(t.amount ?? 0);
                const entry = Number(t.price ?? t.priceAtExecution ?? 0);
                const upnl = Number(t.upnl ?? calcUPnL(t, cryptoPrices));
                const isOpen = String(t.status || '').toLowerCase() === 'open';
                const ts = t.timestamp ? new Date(t.timestamp) : new Date();

                const secs = remainingSeconds(t); // puede ser null
                const mm = Number.isFinite(secs) ? Math.floor(secs / 60) : null;
                const ss = Number.isFinite(secs) ? String(secs % 60).padStart(2, '0') : null;

                // Ganancia mostrada: uPnL si abierto, profit si cerrado
                const pnlShown = isOpen ? upnl : Number(t.profit ?? 0);
                const pnlPos = pnlShown >= 0;

                return (
                  <motion.div
                    key={t.id ?? `${pair}-${ts.getTime()}`}
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
                        {pnlPos ? '+' : ''}${fmt(pnlShown)}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div className="ml-4 w-32 text-center">
                      {isOpen ? (
                        <div className="flex flex-col items-center">
                          <div className="flex items-center text-yellow-400 text-sm">
                            <Clock className="h-3 w-3 mr-1" />
                            {Number.isFinite(secs) ? `${mm}:${ss}` : '—'}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-500 hover:bg-red-500/10 mt-1"
                            // 👇 no mandamos "true" como profit; dejamos que el contenedor calcule
                            onClick={() => closeTrade(t.id)}
                          >
                            Cerrar Manual
                          </Button>
                        </div>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            pnlPos ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {pnlPos ? 'Ganancia' : 'Pérdida'}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })
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
  );
};

export default TradesHistory;
