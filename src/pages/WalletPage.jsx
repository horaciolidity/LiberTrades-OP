// src/pages/WalletPage.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getUserBalance, rechargeDemoBalance } from '@/lib/wallet';
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { DollarSign, Bot, ArrowRightLeft } from 'lucide-react';

const WalletPage = () => {
  const navigate = useNavigate();
  const { user, balances, refreshBalances } = useAuth();
  const {
    transactions = [],
    botActivations = [],
    refreshTransactions,
    refreshBotActivations,
  } = useData();

  const [demoBalance, setDemoBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  const fmt = (v, d = 2) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d);
  };

  const fetchDemo = async () => {
    if (!user?.id) return;
    try {
      const data = await getUserBalance(user.id);
      setDemoBalance(Number(data?.demo_balance ?? 0));
    } catch {
      setDemoBalance(0);
    } finally {
      setLoading(false);
    }
  };

  const handleRechargeDemo = async () => {
    if (!user?.id) return;
    try {
      await rechargeDemoBalance(user.id);
      await fetchDemo();
      toast({ title: 'Demo recargado', description: 'Se actualizó tu saldo demo a $1000.' });
    } catch (error) {
      toast({
        title: 'Error al recargar demo',
        description: (error && error.message) || 'Intenta nuevamente.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchDemo();
    refreshTransactions?.();
    refreshBotActivations?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const recentTx = useMemo(() => {
    const uid = user?.id;
    const mine = Array.isArray(transactions)
      ? transactions.filter((t) => (t.user_id ?? t.userId) === uid)
      : [];
    return [...mine].sort((a, b) =>
      new Date(b.created_at ?? b.createdAt) - new Date(a.created_at ?? a.createdAt)
    ).slice(0, 6);
  }, [transactions, user?.id]);

  const myBots = useMemo(() => {
    const uid = user?.id;
    return Array.isArray(botActivations)
      ? botActivations.filter((b) => (b.user_id ?? b.userId) === uid)
      : [];
  }, [botActivations, user?.id]);

  if (loading) return <p className="text-white p-4">Cargando saldo...</p>;

  const realUsd = Number(balances?.usdc ?? 0);
  const realEth = Number(balances?.eth ?? 0);

  return (
    <div className="p-6 text-white space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tu Billetera</h1>
        <div className="flex gap-3">
          <Button
            onClick={() => navigate('/deposit')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Depositar
          </Button>
          <Button
            onClick={() => navigate('/trading-bots')}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Bot className="h-4 w-4 mr-2" />
            Bots de Trading
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-800 border-slate-600">
          <CardHeader>
            <CardTitle className="text-white">Saldo Real</CardTitle>
            <CardDescription className="text-slate-300">Disponible en la app</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl text-green-400">${fmt(realUsd)}</p>
            <p className="text-sm text-slate-400">ETH: {fmt(realEth, 6)}</p>
            <Button
              onClick={() => refreshBalances?.()}
              variant="outline"
              className="mt-2"
            >
              Actualizar balance
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-600">
          <CardHeader>
            <CardTitle className="text-white">Saldo Demo</CardTitle>
            <CardDescription className="text-slate-300">Sólo para pruebas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-3xl text-yellow-400">${fmt(demoBalance)}</p>
            <Button
              onClick={handleRechargeDemo}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              Recargar Demo a $1000
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-600">
          <CardHeader>
            <CardTitle className="text-white">Resumen de Bots</CardTitle>
            <CardDescription className="text-slate-300">Tus activaciones</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Activos</span>
              <span className="font-semibold">
                {myBots.filter((b) => (b.status || '').toLowerCase() === 'active').length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">En pausa</span>
              <span className="font-semibold">
                {myBots.filter((b) => (b.status || '').toLowerCase() === 'paused').length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-300">Capital en bots</span>
              <span className="font-semibold">
                $
                {fmt(
                  myBots
                    .filter((b) => ['active', 'paused'].includes((b.status || '').toLowerCase()))
                    .reduce((s, b) => s + Number(b.amountUsd ?? b.amount_usd ?? 0), 0)
                )}
              </span>
            </div>
            <Button
              onClick={() => navigate('/trading-bots')}
              variant="outline"
              className="mt-2"
            >
              Gestionar bots
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-600">
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center">
              <ArrowRightLeft className="h-5 w-5 mr-2 text-cyan-400" />
              Movimientos recientes
            </CardTitle>
            <CardDescription className="text-slate-300">
              Depósitos, retiros, inversiones y transacciones de bots
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => navigate('/history')}>Ver todo</Button>
        </CardHeader>
        <CardContent>
          {recentTx.length === 0 ? (
            <p className="text-slate-400">Aún no hay movimientos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Descripción</th>
                    <th className="py-2 pr-4">Monto</th>
                    <th className="py-2 pr-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {recentTx.map((t) => {
                    const date = new Date(t.created_at ?? t.createdAt);
                    const ref = (t.referenceType || '').toLowerCase();
                    const niceType =
                      ref === 'bot_activation'
                        ? 'Bot: activación'
                        : ref === 'bot_profit'
                        ? 'Bot: ganancia'
                        : ref === 'bot_refund'
                        ? 'Bot: reembolso'
                        : ref === 'bot_fee'
                        ? 'Bot: fee'
                        : (t.type || '—');
                    return (
                      <tr key={t.id} className="border-t border-slate-700/60">
                        <td className="py-2 pr-4">{date.toLocaleString()}</td>
                        <td className="py-2 pr-4 capitalize">{niceType}</td>
                        <td className="py-2 pr-4">{t.description || ''}</td>
                        <td className="py-2 pr-4">${fmt(t.amount)}</td>
                        <td className="py-2 pr-4">{t.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletPage;
