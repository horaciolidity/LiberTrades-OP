// src/components/trading/TradesHistory.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Activity, Clock } from 'lucide-react';

const num = (v, d = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d);
};

const pick = (obj, ...keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

const TradesHistory = ({ trades = [], cryptoPrices = {}, closeTrade }) => {
  const list = Array.isArray(trades) ? trades : [];

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
              list.map((trade) => {
                const pair = trade?.pair || 'BTC/USDT';
                const [base] = pair.split('/');
                const priceObj = cryptoPrices?.[base];
                const currentPrice = Number(priceObj?.price ?? priceObj ?? 0) || 0;

                // Campos compatibles demo/real
                const status = (pick(trade, 'status', 'state') || 'open').toLowerCase();
                const side = (pick(trade, 'type', 'side') || 'buy').toLowerCase();

                const entryPrice = Number(pick(trade, 'priceAtExecution', 'entryPrice', 'price')) || 0;
                // amount puede ser USD invertido; si existe quantity/qty lo usamos directo
                const amountUsd = Number(pick(trade, 'amountUsd', 'amount_usd', 'amount')) || 0;
                const qtyField = Number(pick(trade, 'quantity', 'qty'));
                const units = Number.isFinite(qtyField) && qtyField > 0
                  ? qtyField
                  : (entryPrice > 0 ? amountUsd / entryPrice : 0);

                // PnL
                const realized = Number(pick(trade, 'profit', 'pnl', 'pl')) || 0;
                const livePnL =
                  status === 'open' && entryPrice > 0 && units > 0 && currentPrice > 0
                    ? (side === 'buy'
                        ? (currentPrice - entryPrice)
                        : (entryPrice - currentPrice)
                      ) * units
                    : realized;

                // Tiempos
                const ts = pick(trade, 'timestamp', 'created_at', 'createdAt') || Date.now();
                const closeAtRaw = pick(trade, 'closeAt', 'closeat', 'close_at');
                // closeAt puede venir en ms o ISO; new Date maneja ambos
                const closeMs = closeAtRaw != null ? new Date(closeAtRaw).getTime() : undefined;
                const timeLeft = status === 'open' && closeMs
                  ? Math.max(0, Math.floor((closeMs - Date.now()) / 1000))
                  : null;

                return (
                  <div key={trade.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            side === 'buy'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {side.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-medium">{pair}</p>
                          <p className="text-slate-400 text-sm">
                            {/* Mostramos USD y precio de entrada si están */}
                            {amountUsd > 0 ? `$${num(amountUsd)} · ` : ''}
                            {entryPrice > 0 ? `@ $${num(entryPrice)}` : ''}
                            {units > 0 ? ` · ${num(units, 6)} unidades` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          livePnL >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {livePnL >= 0 ? '+' : ''}${num(livePnL)}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <div className="ml-4 w-32 text-center">
                      {status === 'open' ? (
                        <div className="flex flex-col items-center">
                          {Number.isFinite(timeLeft) ? (
                            <div className="flex items-center text-yellow-400 text-sm">
                              <Clock className="h-3 w-3 mr-1" />
                              {`${Math.floor(timeLeft / 60)}:${(timeLeft % 60)
                                .toString()
                                .padStart(2, '0')}`}
                            </div>
                          ) : (
                            <div className="text-slate-400 text-xs">Sin temporizador</div>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-500 hover:bg-red-500/10 mt-1"
                            onClick={() => closeTrade(trade.id, Number(num(livePnL)))}
                          >
                            Cerrar Manual
                          </Button>
                        </div>
                      ) : (
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            realized >= 0
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {realized >= 0 ? 'Ganancia' : 'Pérdida'}
                        </span>
                      )}
                    </div>
                  </div>
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
