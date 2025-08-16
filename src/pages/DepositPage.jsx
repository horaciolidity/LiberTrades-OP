// src/pages/DepositPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Copy, QrCode, CreditCard, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

export default function DepositPage() {
  const { user, balances } = useAuth();
  const { addTransaction, refreshTransactions } = useData();
  const { playSound } = useSound();

  // Depósitos
  const [depositMethod, setDepositMethod] = useState('crypto');
  const [cryptoCurrency, setCryptoCurrency] = useState('USDT');
  const [fiatMethod, setFiatMethod] = useState('alias');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Retiros
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawCurrency, setWithdrawCurrency] = useState('USDC');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawDestination, setWithdrawDestination] = useState('');

  // Dirección ERC-20 provista por ti (USDT/ETH en Ethereum)
  const APP_MAIN_ETH_ADDRESS = '0xBAeaDE80A2A1064E4F8f372cd2ADA9a00daB4BBE';

  const cryptoAddresses = {
    USDT: APP_MAIN_ETH_ADDRESS, // USDT (ERC-20)
    ETH: APP_MAIN_ETH_ADDRESS,  // ETH (ERC-20)
    BTC: 'bc1qBTC_DEPOSIT_ADDRESS_EXAMPLE', // reemplazar por real si usas BTC
  };

  const fiatAliases = {
    ARS: 'ALIAS.CRYPTOINVEST.ARS',
    BRL: 'ALIAS.CRYPTOINVEST.BRL',
    COP: 'ALIAS.CRYPTOINVEST.COP',
    MXN: 'ALIAS.CRYPTOINVEST.MXN',
  };

  const handleCopy = (text) => {
    try {
      playSound?.('click');
      navigator.clipboard.writeText(text);
      toast({ title: 'Copiado', description: `${text} copiado al portapapeles.` });
    } catch {
      toast({ title: 'No se pudo copiar', description: 'Cópialo manualmente.', variant: 'destructive' });
    }
  };

  const ensureCurrency = async (code) => {
    if (!code) return;
    const { error } = await supabase.from('currencies').upsert({ code }, { onConflict: 'code' });
    if (error) {
      console.warn('[DepositPage] ensureCurrency error:', error.message);
    }
  };

  // ---------- Depósito ----------
  const handleDeposit = async () => {
    const depositAmount = Number(amount);
    if (!user?.id) {
      playSound?.('error');
      toast({ title: 'Inicia sesión', description: 'Necesitas estar autenticado para depositar.', variant: 'destructive' });
      return;
    }
    if (!depositAmount || depositAmount <= 0) {
      playSound?.('error');
      toast({ title: 'Error', description: 'Ingresa un monto válido.', variant: 'destructive' });
      return;
    }

    const isCrypto = depositMethod === 'crypto';
    // Para FIAT registramos como USDT (tu backend acredita a balances.usdc)
    const currency = isCrypto ? String(cryptoCurrency || '').toUpperCase() : 'USDT';

    const details = isCrypto
      ? `Depósito ${currency} a ${cryptoAddresses[currency] ?? 'N/A'}`
      : `Depósito fiat vía ${fiatMethod}`;

    try {
      setSubmitting(true);
      await ensureCurrency(currency);

      await addTransaction?.({
        amount: depositAmount,
        type: 'deposit',
        currency, // FK -> public.currencies(code)
        description: details,
        referenceType: 'deposit_request',
        referenceId: null,
        status: 'pending',
      });

      await refreshTransactions?.();

      playSound?.('success');
      toast({
        title: 'Solicitud enviada',
        description: `Tu depósito de ${fmt(depositAmount, 2)} quedó pendiente para aprobación del admin.`,
      });
      setAmount('');
    } catch (e) {
      console.error('[DepositPage] handleDeposit error:', e);
      playSound?.('error');
      const msg = e?.message || 'No se pudo registrar el depósito.';
      toast({ title: 'Error al notificar', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Retiro ----------
  const handleWithdraw = async () => {
    const amt = Number(withdrawAmount);
    if (!user?.id) {
      playSound?.('error');
      toast({ title: 'Inicia sesión', description: 'Necesitas estar autenticado.', variant: 'destructive' });
      return;
    }
    if (!amt || amt <= 0) {
      playSound?.('error');
      toast({ title: 'Monto inválido', description: 'Ingresa un monto mayor a 0.', variant: 'destructive' });
      return;
    }

    const ccy = String(withdrawCurrency || 'USDC').toUpperCase();
    const have = ccy === 'ETH' ? Number(balances?.eth ?? 0) : Number(balances?.usdc ?? 0);
    if (amt > have) {
      playSound?.('error');
      toast({ title: 'Saldo insuficiente', description: `Tu saldo ${ccy} no alcanza.`, variant: 'destructive' });
      return;
    }

    try {
      setWithdrawing(true);
      await ensureCurrency(ccy);

      await addTransaction?.({
        amount: amt,
        type: 'withdrawal',
        currency: ccy,
        description: withdrawDestination
          ? `Retiro solicitado (${ccy}) → ${withdrawDestination}`
          : `Retiro solicitado (${ccy})`,
        referenceType: 'withdraw_request',
        referenceId: null,
        status: 'pending', // pendiente para aprobación del admin
      });

      await refreshTransactions?.();

      playSound?.('success');
      toast({ title: 'Solicitud enviada', description: `Tu retiro de ${ccy} ${fmt(amt)} quedó pendiente.` });
      setWithdrawAmount('');
      setWithdrawDestination('');
    } catch (e) {
      console.error('[DepositPage] handleWithdraw error:', e);
      playSound?.('error');
      toast({ title: 'Error al solicitar retiro', description: e?.message ?? 'Intenta de nuevo.', variant: 'destructive' });
    } finally {
      setWithdrawing(false);
    }
  };

  const renderNetworkHint = () => {
    if (cryptoCurrency === 'USDT' || cryptoCurrency === 'ETH') {
      return <p className="text-xs text-slate-400">Red: Ethereum (ERC-20)</p>;
    }
    if (cryptoCurrency === 'BTC') {
      return <p className="text-xs text-slate-400">Red: Bitcoin</p>;
    }
    return null;
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h1 className="text-3xl font-bold text-white mb-2">Realizar Depósito</h1>
        <p className="text-slate-300">Recarga tu saldo para comenzar a invertir.</p>
        <p className="text-slate-400 mt-2">
          Saldo actual: <span className="text-green-400 font-semibold">${fmt(balances?.usdc ?? 0, 2)}</span>
        </p>
      </motion.div>

      {/* Depósito */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <DollarSign className="h-6 w-6 mr-2 text-green-400" />
            Selecciona Método de Depósito
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <Tabs defaultValue="crypto" onValueChange={setDepositMethod} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800">
              <TabsTrigger value="crypto" className="text-white">Criptomonedas</TabsTrigger>
              <TabsTrigger value="fiat" className="text-white">Dinero Fiat</TabsTrigger>
            </TabsList>

            <TabsContent value="crypto" className="mt-6">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white">Depositar con Criptomonedas</CardTitle>
                  <CardDescription className="text-slate-300">
                    Envía la criptomoneda seleccionada a la dirección indicada.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-white">Selecciona Criptomoneda</Label>
                    <Select value={cryptoCurrency} onValueChange={setCryptoCurrency}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        <SelectItem value="USDT">USDT (Tether)</SelectItem>
                        <SelectItem value="BTC">BTC (Bitcoin)</SelectItem>
                        <SelectItem value="ETH">ETH (Ethereum)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white">Dirección de Depósito ({cryptoCurrency})</Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        readOnly
                        value={cryptoAddresses[cryptoCurrency]}
                        className="bg-slate-700 border-slate-600 text-slate-300"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(cryptoAddresses[cryptoCurrency])}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {renderNetworkHint()}
                  </div>

                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        playSound?.('click');
                        toast({
                          title: 'QR no disponible',
                          description: 'Puedes copiar la dirección y pegarla en tu wallet.',
                        });
                      }}
                    >
                      <QrCode className="h-10 w-10 text-slate-400 hover:text-white" />
                    </Button>
                  </div>

                  <div className="flex items-start space-x-2 p-3 bg-blue-900/30 rounded-lg border border-blue-700">
                    <Info className="h-5 w-5 text-blue-400 mt-1 shrink-0" />
                    <p className="text-sm text-blue-300">
                      Para USDT y ETH usa <span className="font-bold">Ethereum (ERC-20)</span>. Enviar a otra red puede
                      resultar en pérdida del depósito. La confirmación puede tardar algunos minutos.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fiat" className="mt-6">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white">Depositar con Dinero Fiat</CardTitle>
                  <CardDescription className="text-slate-300">
                    Utiliza un alias de envío según tu país.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-white">Método de Pago Fiat</Label>
                    <Select value={fiatMethod} onValueChange={setFiatMethod}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        <SelectItem value="alias">Transferencia con Alias (ARS, BRL, COP, MXN)</SelectItem>
                        <SelectItem value="card" disabled>Tarjeta de Crédito/Débito (Próximamente)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {fiatMethod === 'alias' && (
                    <div className="space-y-2">
                      <Label className="text-white">Alias de Envío (Selecciona tu país)</Label>
                      <Select
                        onValueChange={(value) => {
                          playSound?.('click');
                          handleCopy(fiatAliases[value]);
                          toast({ title: 'Alias Copiado', description: `Alias para ${value} copiado.` });
                        }}
                      >
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                          <SelectValue placeholder="Selecciona tu país para ver el alias" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border-slate-600">
                          {Object.entries(fiatAliases).map(([country, alias]) => (
                            <SelectItem key={country} value={country}>
                              {country} - {alias}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-start space-x-2 p-3 bg-yellow-900/30 rounded-lg border border-yellow-700">
                        <Info className="h-5 w-5 text-yellow-400 mt-1 shrink-0" />
                        <p className="text-sm text-yellow-300">
                          Realiza la transferencia al alias correspondiente. Luego notifica el depósito.
                          La acreditación puede demorar hasta 24hs tras la verificación del admin.
                        </p>
                      </div>
                    </div>
                  )}

                  {fiatMethod === 'card' && (
                    <div className="flex items-center justify-center p-4 bg-slate-700 rounded-lg">
                      <CreditCard className="h-6 w-6 mr-2 text-slate-400" />
                      <p className="text-slate-400">Pagos con tarjeta estarán disponibles pronto.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="space-y-2 pt-4">
            <Label htmlFor="amount" className="text-white">Monto del Depósito (USD)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 100"
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <Button
            onClick={handleDeposit}
            disabled={submitting}
            className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 disabled:opacity-60"
          >
            {submitting ? 'Enviando…' : 'Notificar Depósito'}
          </Button>
          <p className="text-xs text-center text-slate-400">
            Tu transacción quedará <b>pendiente</b> hasta que un administrador la verifique y apruebe.
          </p>
        </CardContent>
      </Card>

      {/* Retiro */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white">Solicitar Retiro</CardTitle>
          <CardDescription className="text-slate-300">
            Crea una solicitud de retiro. Un administrador la aprobará.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-white">Moneda</Label>
              <Select value={withdrawCurrency} onValueChange={setWithdrawCurrency}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-700 border-slate-600">
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white">Monto</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Ej: 50"
                className="bg-slate-800 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-400">
                Disponible {withdrawCurrency}:{' '}
                <span className="text-green-400">
                  {withdrawCurrency === 'ETH'
                    ? fmt(balances?.eth ?? 0)
                    : fmt(balances?.usdc ?? 0)}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-white">Destino (opcional)</Label>
              <Input
                value={withdrawDestination}
                onChange={(e) => setWithdrawDestination(e.target.value)}
                placeholder={withdrawCurrency === 'ETH' ? 'Dirección ERC-20' : 'Alias/Cuenta'}
                className="bg-slate-800 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-400">
                Se guardará en la descripción para que el admin lo use al procesar.
              </p>
            </div>
          </div>

          <Button
            onClick={handleWithdraw}
            disabled={withdrawing}
            className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 disabled:opacity-60"
          >
            {withdrawing ? 'Enviando…' : 'Solicitar Retiro'}
          </Button>

          <p className="text-xs text-center text-slate-400">
            Tu retiro quedará <b>pendiente</b> hasta la aprobación del administrador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
