import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { History, DollarSign, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

const TransactionItem = ({ transaction }) => {
  const getTransactionIcon = (type) => {
    switch (type) {
      case 'deposit': return ArrowDownLeft;
      case 'withdrawal': return ArrowUpRight;
      case 'investment': return DollarSign;
      default: return History;
    }
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'deposit': return 'text-green-400';
      case 'withdrawal': return 'text-red-400';
      case 'investment': return 'text-blue-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400';
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const Icon = getTransactionIcon(transaction.type);

  return (
    <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
      <div className="flex items-center space-x-4">
        <div className={`p-2 rounded-lg bg-slate-700`}>
          <Icon className={`h-5 w-5 ${getTransactionColor(transaction.type)}`} />
        </div>
        <div>
          <p className="text-white font-medium capitalize">
            {transaction.type === 'deposit' ? 'Depósito' :
             transaction.type === 'withdrawal' ? 'Retiro' :
             transaction.type === 'investment' ? 'Inversión' : transaction.type}
          </p>
          <p className="text-slate-400 text-sm">
            {transaction.description || 'Sin descripción'}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-semibold ${getTransactionColor(transaction.type)}`}>
          {transaction.type === 'withdrawal' || transaction.type === 'investment' ? '-' : '+'}${transaction.amount.toFixed(2)}
        </p>
        <div className="flex items-center space-x-2">
          <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(transaction.status)}`}>
            {transaction.status === 'completed' ? 'Completado' :
             transaction.status === 'pending' ? 'Pendiente' :
             transaction.status === 'failed' ? 'Fallido' : transaction.status}
          </span>
          <span className="text-slate-400 text-sm">
            {new Date(transaction.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
};

const InvestmentItem = ({ investment }) => {
  const daysPassed = Math.floor((Date.now() - new Date(investment.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const progress = Math.min((daysPassed / investment.duration) * 100, 100);
  const earnedSoFar = (investment.amount * (investment.dailyReturn / 100) * Math.min(daysPassed, investment.duration));
  
  return (
    <div className="p-4 bg-slate-800/50 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white font-medium">{investment.planName}</p>
          <p className="text-slate-400 text-sm">
            Iniciado: {new Date(investment.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-white font-semibold">${investment.amount.toFixed(2)}</p>
          <p className="text-green-400 text-sm">{investment.dailyReturn}% diario</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Progreso</span>
          <span className="text-white">{daysPassed}/{investment.duration} días</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Ganado hasta ahora:</span>
          <span className="text-green-400 font-semibold">${earnedSoFar.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

const TransactionTabs = ({ filteredTransactions, investments }) => {
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
                {filteredTransactions.length} transacciones encontradas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredTransactions.length > 0 ? (
                <div className="space-y-4">
                  {filteredTransactions.map((transaction) => (
                    <TransactionItem key={transaction.id} transaction={transaction} />
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
                {investments.length} inversiones realizadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {investments.length > 0 ? (
                <div className="space-y-4">
                  {investments.map((investment) => (
                    <InvestmentItem key={investment.id} investment={investment} />
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