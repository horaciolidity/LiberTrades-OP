// src/components/trading/TransactionTabs.jsx
import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { History, DollarSign, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

const safeArr = (a) => (Array.isArray(a) ? a : []);
const n = (v, d = 2) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const fmt = (v, d = 2) => n(v).toFixed(d);

const parseTsMs = (ts) => {
  if (!ts) return NaN;
  if (typeof ts === 'number') return ts < 2e10 ? ts * 1000 : ts;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    if (Number.isFinite(ms)) return ms;
    const asNum = Number(ts);
    if (Number.isFinite(asNum)) return asNum < 2e10 ? asNum * 1000 : asNum;
  }
  const d = new Date(ts);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

const normType = (t) => String(t || '').toLowerCase();
const normStatus = (s) => String(s || '').toLowerCase();

const TransactionItem = ({ transaction = {} }) => {
  const type = normType(transaction.type);
  const status = normStatus(transaction.status);

  const getTransactionIcon = (t) => {
    switch (t) {
      case 'deposit': return ArrowDownLeft;
      case 'withdrawal': return ArrowUpRight;
      case 'investment': return DollarSign;
      default: return History;
    }
  };

  const getTransactionColor = (t) => {
    switch (t) {
      case 'deposit': return 'text-green-400';
      case 'withdrawal': return 'text-red-400';
      case 'investment': return 'text-blue-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusColor = (s) => {
    switch (s) {
      case 'completed': return 'bg-green-500/20 text-green-400';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const Icon = getTransactionIcon(type);
  const colorCls = getTransactionColor(type);
  const sign = (type === 'withdrawal' || type === 'investment') ? '-' : '+';
  const amount = n(transaction.amount);

  const createdMs = parseTsMs(transaction.createdAt ?? transaction.created_at);
  const createdStr = Number.isFinite(createdMs)
    ? new Date(createdMs).toLocaleDateString()
    : '—';

  return (
    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
      <div className="flex items-center space-x-4">
        <div className="p-2 rounded-lg bg-slate-700">
          <Icon className={`h-5 w-5 ${colorCls}`} />
        </div>
        <div>
          <p className="text-white font-medium capitalize">
            {type === 'deposit' ? 'Depósito'
              : type === 'withdrawal' ? 'Retiro'
              : type === 'investment' ? 'Inversión'
              : (transaction.type || 'Transacción')}
          </p>
          <p className="text-slate-400 text-sm">
            {transaction.description || transaction.note || 'Sin descripción'}
          </p>
        </div>
      </div>

      <div className="text-right">
        <p className={`font-semibold ${colorCls}`}>
          {sign}${fmt(amount)}
        </p>
        <div className="flex items-center space-x-2 justify-end">
          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(status)}`}>
            {status === 'completed' ? 'Completado'
              : status === 'pending' ? 'Pendiente'
              : status === 'failed' ? 'Fallido'
              : (transaction.status || '—')}
          </span>
          <span className="text-slate-400 text-sm">{createdStr}</span>
        </div>
      </div>
    </div>
  );
};

const InvestmentItem = ({ investment = {} }) => {
  const createdMs = parseTsMs(investment.createdAt ?? investment.created_at);
  const createdStr = Number.isFinite(createdMs)
    ? new Date(createdMs).toLocaleDateString()
    : '—';

  const amount = n(investment.amount);
  const durationDays = Math.max(1, n(investment.duration ?? investment.duration_days ?? investment.days ?? 0));
  const dailyReturn = n(investment.dailyReturn ?? investment.daily_return ?? investment.daily_return_pct ?? 0);

  const daysPassed = Number.isFinite(createdMs)
    ? Math.floor((Date.now() - createdMs) / (1000 * 60 * 60 * 24))
    : 0;

  const clampedDays = Math.min(Math.max(daysPassed, 0), durationDays);
  const progress = Math.min((clampedDays / durationDays) * 100, 100);
  const earnedSoFar = amount * (dailyReturn / 100) * clampedDays;

  return (
    <div className="p-4 bg-slate-800/50 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white font-medium">{investment.planName ?? investment.plan_name ?? 'Plan'}</p>
          <p className="text-slate-400 text-sm">
            Iniciado: {createdStr}
          </p>
        </div>
        <div className="text-right">
          <p className="text-white font-semibold">${fmt(amount)}</p>
          <p className="text-green-400 text-sm">{fmt(dailyReturn)}% diario</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Progreso</span>
          <span className="text-white">{clampedDays}/{durationDays} días</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div
            className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Ganado hasta ahora:</span>
          <span className="text-green-400 font-semibold">${fmt(earnedSoFar)}</span>
        </div>
      </div>
    </div>
  );
};

const TransactionTabs = ({ filteredTransactions = [], investments = [] }) => {
  const txs = safeArr(filteredTransactions);
  const invs = safeArr(investments);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.5 }}
    >
      <Tabs defaultValue="transactions" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800">
          <TabsTrigger value="transactions" className="text-white">Transacciones</TabsTrigger>
          <TabsTrigger value="investments" className="text-white">Inversiones</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Historial de Transacciones</CardTitle>
              <CardDescription className="text-slate-300">
                {txs.length} transacciones encontradas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {txs.length > 0 ? (
                <div className="space-y-4">
                  {txs.map((transaction) => (
                    <TransactionItem
                      key={transaction.id ?? `${transaction.type}-${parseTsMs(transaction.createdAt ?? transaction.created_at) || Math.random()}`}
                      transaction={transaction}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <History className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No se encontraron transacciones</p>
                  <p className="text-slate-500 text-sm">Ajusta los filtros para ver más resultados</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="investments">
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Historial de Inversiones</CardTitle>
              <CardDescription className="text-slate-300">
                {invs.length} inversiones realizadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invs.length > 0 ? (
                <div className="space-y-4">
                  {invs.map((investment) => (
                    <InvestmentItem
                      key={investment.id ?? `${investment.planName ?? investment.plan_name}-${parseTsMs(investment.createdAt ?? investment.created_at) || Math.random()}`}
                      investment={investment}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <DollarSign className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">No tienes inversiones aún</p>
                  <p className="text-slate-500 text-sm">Comienza invirtiendo en nuestros planes</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default TransactionTabs;
