// src/pages/WithdrawPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banknote, Upload, Info, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

export default function WithdrawPage() {
  const { user, balances } = useAuth();
  const [method, setMethod] = useState('crypto'); // 'crypto' | 'fiat' (próximamente)
  const [currency, setCurrency] = useState('USDT');
  const [network, setNetwork] = useState('TRC20');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const handleWithdraw = async () => {
    if (!user?.id) {
      toast({ title: 'Inicia sesión', description: 'Necesitas estar logueado para retirar.', variant: 'destructive' });
      return;
    }

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: 'Monto inválido', description: 'Ingresa un monto válido.', variant: 'destructive' });
      return;
    }

    if (amt < 10) {
      toast({ title: 'Mínimo de retiro', description: 'El mínimo de retiro es $10.', variant: 'destructive' });
      return;
    }

    const available = Number(balances?.usdc ?? 0);
    if (amt > available) {
      toast({ title: 'Saldo insuficiente', description: 'No tienes suficiente saldo disponible.', variant: 'destructive' });
      return;
    }

    if (method === 'crypto' && !address.trim()) {
      toast({ title: 'Falta dirección', description: 'Ingresa la dirección de retiro.', variant: 'destructive' });
      return;
    }

    const description =
      method === 'crypto'
        ? `Retiro ${currency} vía ${network} a ${address}`
        : `Retiro Fiat (pendiente de integración)`;

    setSaving(true);
    try {
      // Creamos solicitud PENDIENTE (no descuenta saldo aún)
      const { error } = await supabase.from('wallet_transactions').insert({
        user_id: user.id,
        type: 'withdrawal',
        amount: amt,
        currency: method === 'crypto' ? currency : 'USD',
        status: 'pending',
        description,
      });
      if (error) throw error;

      toast({
        title: 'Solicitud enviada',
        description: `Tu retiro de $${fmt(amt)} quedó pendiente de revisión.`,
      });

      setAmount('');
      setAddress('');
    } catch (e) {
      toast({
        title: 'No se pudo crear el retiro',
        description: e?.message || 'Intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
          <Upload className="h-8 w-8 mr-3 text-rose-400" />
          Solicitar Retiro
        </h1>
        <p className="text-slate-300">Envía una solicitud de retiro. Se aprobará manualmente.</p>
        <p className="text-slate-400 mt-2">
          Saldo disponible: <span className="text-green-400 font-semibold">${fmt(balances?.usdc ?? 0)}</span>
        </p>
      </motion.div>

      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Banknote className="h-6 w-6 mr-2 text-green-400" />
            Método de Retiro
          </CardTitle>
          <CardDescription className="text-slate-300">Por ahora, habilitado retiro en cripto.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white">Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="crypto">Criptomonedas</SelectItem>
                  <SelectItem value="fiat" disabled>Fiat (próximamente)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {method === 'crypto' && (
              <>
                <div className="space-y-2">
                  <Label className="text-white">Criptomoneda</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="USDT">USDT</SelectItem>
                      <SelectItem value="BTC">BTC</SelectItem>
                      <SelectItem value="ETH">ETH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Red</Label>
                  <Select value={network} onValueChange={setNetwork}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="TRC20">TRC20</SelectItem>
                      <SelectItem value="ERC20">ERC20</SelectItem>
                      <SelectItem value="BEP20">BEP20</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-white">Dirección de retiro</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej: TUd1r3cCi0nTRC20..."
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-white">Monto a retirar (USD)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 100"
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          <Button
            onClick={handleWithdraw}
            disabled={saving || !amount || (method === 'crypto' && !address)}
            className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:opacity-90"
          >
            {saving ? 'Enviando…' : 'Solicitar Retiro'}
          </Button>

          <div className="flex items-start space-x-2 p-3 bg-yellow-900/30 rounded-lg border border-yellow-700">
            <Info className="h-5 w-5 text-yellow-400 mt-1 shrink-0" />
            <p className="text-sm text-yellow-300">
              Los retiros se procesan manualmente. El saldo se descuenta al aprobar la solicitud.
              Si necesitas que se descuente al crear la solicitud, te agrego la lógica en otro paso.
            </p>
          </div>

          <div className="flex items-start space-x-2 p-3 bg-blue-900/30 rounded-lg border border-blue-700">
            <Shield className="h-5 w-5 text-blue-400 mt-1 shrink-0" />
            <p className="text-sm text-blue-300">
              Verifica que la red y la dirección ingresada sean correctas. En cripto, las operaciones son irreversibles.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
