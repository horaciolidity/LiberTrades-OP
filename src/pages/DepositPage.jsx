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

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

export default function DepositPage() {
  const { user, balances } = useAuth();
  const { addTransaction } = useData();
  const { playSound } = useSound();

  const [depositMethod, setDepositMethod] = useState('crypto');
  const [cryptoCurrency, setCryptoCurrency] = useState('USDT');
  const [fiatMethod, setFiatMethod] = useState('alias');
  const [amount, setAmount] = useState('');

  // Dirección ERC-20 provista por ti (sirve para USDT y ETH en Ethereum)
  const APP_MAIN_ETH_ADDRESS = '0xBAeaDE80A2A1064E4F8f372cd2ADA9a00daB4BBE';

  const cryptoAddresses = {
    USDT: APP_MAIN_ETH_ADDRESS, // USDT (ERC-20)
    ETH: APP_MAIN_ETH_ADDRESS,  // ETH (ERC-20)
    BTC: 'bc1qBTC_DEPOSIT_ADDRESS_EXAMPLE', // cámbiala si tienes una real de BTC
  };

  const fiatAliases = {
    ARS: 'ALIAS.CRYPTOINVEST.ARS',
    BRL: 'ALIAS.CRYPTOINVEST.BRL',
    COP: 'ALIAS.CRYPTOINVEST.COP',
    MXN: 'ALIAS.CRYPTOINVEST.MXN',
  };

  const handleCopy = (text) => {
    playSound?.('click');
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado', description: `${text} copiado al portapapeles.` });
  };

  const handleDeposit = async () => {
    const depositAmount = Number(amount);
    if (!depositAmount || depositAmount <= 0) {
      playSound?.('error');
      toast({ title: 'Error', description: 'Ingresa un monto válido.', variant: 'destructive' });
      return;
    }

    const isCrypto = depositMethod === 'crypto';
    const currency = isCrypto ? cryptoCurrency : null; // evita fallo de FK si no tienes 'USD' en public.currencies
    const details = isCrypto
      ? `Depósito ${cryptoCurrency} a ${cryptoAddresses[cryptoCurrency]}`
      : `Depósito fiat vía ${fiatMethod}`;

    await addTransaction?.({
      amount: depositAmount,
      type: 'deposit',
      currency,
      description: details,
      referenceType: 'deposit_request',
      referenceId: null,
      status: 'pending',
    });

    playSound?.('success');
    toast({
      title: 'Solicitud enviada',
      description: `Tu depósito de ${fmt(depositAmount, 2)} quedó pendiente para aprobación del admin.`,
    });
    setAmount('');
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
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 100"
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <Button
            onClick={handleDeposit}
            className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
          >
            Notificar Depósito
          </Button>
          <p className="text-xs text-center text-slate-400">
            Tu transacción quedará <b>pendiente</b> hasta que un administrador la verifique y apruebe.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
