import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserBalance, rechargeDemoBalance } from '@/lib/wallet';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const WalletPage = () => {
  const { user, balances } = useAuth();
  const [demoBalance, setDemoBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDemo = async () => {
    if (!user?.id) return;
    try {
      const data = await getUserBalance(user.id);
      // usamos balances.usdc para real; acá solo guardamos el demo
      setDemoBalance(Number(data?.demo_balance ?? 0));
    } catch (error) {
      console.error('Error al obtener demo_balance:', error);
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
      toast({
        title: 'Demo recargado',
        description: 'Se actualizó tu saldo demo a $1000.',
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading) return <p className="text-white p-4">Cargando saldo...</p>;

  const realUsd = Number(balances?.usdc ?? 0);

  return (
    <div className="p-6 max-w-xl mx-auto text-white space-y-6">
      <h1 className="text-2xl font-bold">Tu Billetera</h1>

      {/* Saldo Real (desde AuthContext) */}
      <Card className="bg-slate-800 border-slate-600 text-white">
        <CardContent className="space-y-4 pt-6">
          <CardTitle className="text-white text-lg">Saldo Real</CardTitle>
          <p className="text-3xl text-green-400">${realUsd.toFixed(2)}</p>
        </CardContent>
      </Card>

      {/* Saldo Demo (desde lib/wallet) */}
      <Card className="bg-slate-800 border-slate-600 text-white">
        <CardContent className="space-y-4 pt-6">
          <CardTitle className="text-white text-lg">Saldo Demo</CardTitle>
          <p className="text-3xl text-yellow-400">
            ${Number(demoBalance ?? 0).toFixed(2)}
          </p>
          <Button
            onClick={handleRechargeDemo}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            Recargar Demo a $1000
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletPage;
