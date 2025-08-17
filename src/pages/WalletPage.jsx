import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getUserBalance, rechargeDemoBalance } from '@/lib/wallet';
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { DollarSign, Bot, ArrowRightLeft } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

const fmt = (v, d = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d);
};

// Normaliza transacción (snake/camel) a un shape consistente para la UI
const normTx = (t) => ({
  ...t,
  id: t?.id,
  user_id: t?.user_id ?? t?.userId,
  type: (t?.type || '').toLowerCase(),
  status: (t?.status || '').toLowerCase(),
  referenceType: (t?.referenceType ?? t?.reference_type ?? '').toLowerCase(),
  created_at: t?.created_at ?? t?.createdAt ?? new Date().toISOString(),
  amount: Number(t?.amount ?? 0),
  description: t?.description ?? '',
});

export default function WalletPage() {
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

  // Estado local para reflejar Realtime sin romper compat con DataContext
  const [liveTx, setLiveTx] = useState([]);

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

  // Seed inicial desde el contexto + refrescos del server
  useEffect(() => {
    if (!user?.id) return;
    fetchDemo();
    refreshTransactions?.();
    refreshBotActivations?.();

    // Semilla inicial para liveTx con las del contexto
    const uid = user.id;
    const mine = Array.isArray(transactions)
      ? transactions.filter((t) => (t.user_id ?? t.userId) === uid).map(normTx)
      : [];
    // Orden DESC por fecha
    mine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setLiveTx(mine);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Si cambian las del contexto (por un refresh externo), sincronizamos el seed
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const mine = Array.isArray(transactions)
      ? transactions.filter((t) => (t.user_id ?? t.userId) === uid).map(normTx)
      : [];
    mine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    setLiveTx((prev) => {
      // Si el contexto trae algo más nuevo, preferimos el contexto
      // Evitamos sobrescribir si prev ya contiene esas ids
      const idsPrev = new Set(prev.map((x) => x.id));
      const union = [...mine, ...prev.filter((x) => !idsPrev.has(x.id))];
      union.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return union.slice(0, 100); // cap de seguridad
    });
  }, [transactions, user?.id]);

  // Realtime: wallet_transactions del usuario (INSERT/UPDATE/DELETE)
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel('wallet-page-tx')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setLiveTx((prev) => {
            let list = Array.isArray(prev) ? [...prev] : [];
            if (payload.eventType === 'INSERT') {
              const nx = normTx(payload.new);
              if (!list.some((x) => x.id === nx.id)) {
                list.unshift(nx);
              }
            } else if (payload.eventType === 'UPDATE') {
              const nx = normTx(payload.new);
              list = list.map((x) => (x.id === nx.id ? nx : x));
            } else if (payload.eventType === 'DELETE') {
              list = list.filter((x) => x.id !== payload.old?.id);
            }
            list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return list.slice(0, 100);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const recentTx = useMemo(() => {
    const uid = user?.id;
    const base = Array.isArray(liveTx) && liveTx.length
      ? liveTx
      : (Array.isArray(transactions) ? transactions : []).map(normTx);

    const mine = base.filter((t) => (t.user_id ?? uid) === uid);
    return [...mine]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6);
  }, [liveTx, transactions, user?.id]);

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
          <Button onClick={() => navigate('/deposit')} className="bg-blue-600 hover:bg-blue-700">
            <DollarSign className="h-4 w-4 mr-2" />
            Depositar
          </Button>
          <Button onClick={() => navigate('/trading-bots')} className="bg-purple-600 hover:bg-purple-700">
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
            <Button onClick={() => refreshBalances?.()} variant="outline" className="mt-2">
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
            <Button onClick={() => navigate('/trading-bots')} variant="outline" className="mt-2">
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
              Depósitos, retiros, compras de planes, inversiones y transacciones de bots
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
                    const tt = normTx(t);
                    const date = new Date(tt.created_at);
                    // Etiquetas amigables (contempla investment_purchase)
                    const r = tt.referenceType;
                    const niceType =
                      r === 'bot_activation' ? 'Bot: activación' :
                      r === 'bot_profit'    ? 'Bot: ganancia' :
                      r === 'bot_refund'    ? 'Bot: reembolso' :
                      r === 'bot_fee'       ? 'Bot: fee' :
                      tt.type === 'investment_purchase' ? 'Compra de plan' :
                      tt.type === 'investment' ? 'Inversión' :
                      tt.type === 'withdrawal' ? 'Retiro' :
                      tt.type === 'deposit' ? 'Depósito' :
                      t.type || '—';

                    return (
                      <tr key={tt.id} className="border-t border-slate-700/60">
                        <td className="py-2 pr-4">{date.toLocaleString()}</td>
                        <td className="py-2 pr-4 capitalize">{niceType}</td>
                        <td className="py-2 pr-4">{tt.description}</td>
                        <td className="py-2 pr-4">${fmt(tt.amount)}</td>
                        <td className="py-2 pr-4 capitalize">{tt.status}</td>
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
}
