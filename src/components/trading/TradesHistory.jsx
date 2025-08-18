import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, Activity, Square, Clock } from 'lucide-react';

const TradesHistory = ({ trades, cryptoPrices, closeTrade }) => {
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
            {trades.length > 0 ? (
              trades.map((trade) => {
                const crypto = trade.pair.split('/')[0];
                const currentPrice = cryptoPrices[crypto]?.price || 0;
                const unrealizedProfit = trade.status === 'open' 
                  ? trade.type === 'buy' 
                    ? (currentPrice - trade.priceAtExecution) * (trade.amount / trade.priceAtExecution)
                    : (trade.priceAtExecution - currentPrice) * (trade.amount / trade.priceAtExecution)
                  : trade.profit;

                const timeLeft = trade.status === 'open' 
                  ? Math.max(0, Math.floor((trade.closeAt - Date.now()) / 1000))
                  : 0;

                return (
                  <div key={trade.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div className={`px-2 py-1 rounded text-xs font-medium ${
                          trade.type === 'buy' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {trade.type.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-medium">{trade.pair}</p>
                          <p className="text-slate-400 text-sm">
                            ${trade.amount.toFixed(2)} @ ${trade.priceAtExecution.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${
                        unrealizedProfit >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {unrealizedProfit >= 0 ? '+' : ''}${unrealizedProfit.toFixed(2)}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {new Date(trade.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="ml-4 w-28 text-center">
                      {trade.status === 'open' ? (
                        <div className="flex flex-col items-center">
                           <div className="flex items-center text-yellow-400 text-sm">
                            <Clock className="h-3 w-3 mr-1" />
                            {`${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-500 hover:bg-red-500/10 mt-1"
                            onClick={() => closeTrade(trade.id, true)} 
                          >
                            Cerrar Manual
                          </Button>
                        </div>
                      ) : (
                        <span className={`px-2 py-1 rounded text-xs ${
                          trade.profit >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {trade.profit >= 0 ? 'Ganancia' : 'Pérdida'}
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