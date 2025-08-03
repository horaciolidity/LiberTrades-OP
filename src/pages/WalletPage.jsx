import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserBalance, rechargeDemoBalance } from '@/lib/wallet';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const WalletPage = () => {
  const { user } = useAuth();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBalance = async () => {
    try {
      const data = await getUserBalance(user.id);
      setBalance(data);
    } catch (error) {
      console.error('Error al obtener balance:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRechargeDemo = async () => {
    try {
      await rechargeDemoBalance(user.id);
      await fetchBalance();
    } catch (error) {
      alert('Error al recargar demo: ' + error.message);
    }
  };

  useEffect(() => {
    if (user?.id) fetchBalance();
  }, [user]);

  if (loading || !balance) return <p className="text-white p-4">Cargando saldo...</p>;

  return (
    <div className="p-6 max-w-xl mx-auto text-white">
      <h1 className="text-2xl font-bold mb-4">Tu Billetera</h1>

      <Card className="bg-slate-800 border-slate-600 text-white mb-6">
        <CardContent className="space-y-4">
          <CardTitle className="text-white text-lg">Saldo Real</CardTitle>
          <p className="text-3xl text-green-400">${balance.balance.toFixed(2)}</p>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-600 text-white">
        <CardContent className="space-y-4">
          <CardTitle className="text-white text-lg">Saldo Demo</CardTitle>
          <p className="text-3xl text-yellow-400">${balance.demo_balance.toFixed(2)}</p>
          <Button onClick={handleRechargeDemo} className="bg-gradient-to-r from-purple-500 to-pink-500">
            Recargar Demo a $1000
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletPage;
