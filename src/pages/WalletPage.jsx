// src/pages/WalletPage.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { Wallet, RefreshCw, DollarSign, Sparkles } from 'lucide-react';

const fmt = (n) => Number(n || 0);

export default function WalletPage() {
  const { user, balances, loading: authLoading, refreshBalances } = useAuth();
  const [demoBalance, setDemoBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchDemo = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('balances')
        .select('demo_balance')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      setDemoBalance(fmt(data?.demo_balance));
    } catch (e) {
      console.warn('demo_balance read:', e?.message || e);
      setDemoBalance(0);
    } finally {
      setLoading(false);
    }
  };

  const rechargeDemo = async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('balances')
        .update({ demo_balance: 1000, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;

      await fetchDemo();
      await refreshBalances?.();

      toast({ title: 'Demo recargado', description: 'Se actualizó tu saldo demo a $1000.' });
    } catch (e) {
      toast({
        title: 'Error al recargar demo',
        description: e?.message || 'Intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      setLoading(true);
      fetchDemo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (authLoading || loading) return <p className="text-white p-6">Cargando billetera…</p>;
  if (!user) return <p className="text-white p-6">Inicia sesión para ver tu billetera.</p>;

  const realUsd = fmt(balances?.usdc).toFixed(2);

  return (
    <div className="p-6 max-w-3xl mx-auto text-white space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-7 w-7 text-green-400" />
        <h1 className="text-2xl font-bold">Tu Billetera</h1>
      </div>

      {/* Saldo Real */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-400" /> Saldo Real (USDC)
            </CardTitle>
            <Button
              variant="outline"
              className="border-slate-600"
              onClick={async () => {
                await refreshBalances?.();
                toast({ title: 'Saldo real actualizado' });
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Refrescar
            </Button>
          </div>
          <p className="text-3xl text-green-400">${realUsd}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="/deposit">
              <Button className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:opacity-90">
                Depositar
              </Button>
            </Link>
            <Link to="/withdraw">
              <Button variant="outline" className="w-full border-slate-600 hover:bg-slate-700">
                Retirar
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Saldo Demo */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400" /> Saldo Demo
            </CardTitle>
            <Button variant="outline" className="border-slate-600" onClick={fetchDemo}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refrescar
            </Button>
          </div>

          <p className="text-3xl text-yellow-400">${Number(demoBalance).toFixed(2)}</p>

          <div className="flex gap-2">
            <Button
              onClick={rechargeDemo}
              disabled={busy}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
            >
              {busy ? 'Procesando…' : 'Recargar Demo a $1000'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
