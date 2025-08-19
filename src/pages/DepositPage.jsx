// src/pages/DepositPage.jsx
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DollarSign,
  Copy,
  QrCode,
  CreditCard,
  Info,
  CheckCircle2,
  Timer,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/components/ui/use-toast';
import { useSound } from '@/contexts/SoundContext';
import { Link } from 'react-router-dom';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

export default function DepositPage() {
  const { user, balances } = useAuth();
  const { addTransaction, transactions = [], cryptoPrices = {} } = useData();
  const { playSound } = useSound();

  const [depositMethod, setDepositMethod] = useState('crypto'); // 'crypto' | 'fiat'
  const [cryptoCurrency, setCryptoCurrency] = useState('USDT');
  const [network, setNetwork] = useState('ERC20'); // por defecto para USDT/ETH
  const [fiatMethod, setFiatMethod] = useState('alias');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  // ===== Direcciones configurables (placeholder) =====
  // Podés reemplazarlas por las reales. Si una no aplica, dejála igual a la principal.
  const cryptoAddressBook = {
    USDT: {
      ERC20: '0xUSDT_ERC20_DEPOSIT_ADDRESS_EXAMPLE',
      TRC20: 'TRC20USDT_DEPOSIT_ADDRESS_EXAMPLE',
      BEP20: '0xUSDT_BEP20_DEPOSIT_ADDRESS_EXAMPLE',
    },
    BTC: {
      BTC: 'bc1qBTC_DEPOSIT_ADDRESS_EXAMPLE',
    },
    ETH: {
      ERC20: '0xETH_DEPOSIT_ADDRESS_EXAMPLE',
    },
  };

  const fiatAliases = {
    ARS: 'ALIAS.CRYPTOINVEST.ARS',
    BRL: 'ALIAS.CRYPTOINVEST.BRL',
    COP: 'ALIAS.CRYPTOINVEST.COP',
    MXN: 'ALIAS.CRYPTOINVEST.MXN',
  };

  // ===== Cálculos auxiliares =====
  const MIN_DEPOSIT_USD = 10;

  const address = useMemo(() => {
    const book = cryptoAddressBook[cryptoCurrency] || {};
    // si no existe la network actual, toma la primera disponible
    if (!book[network]) {
      const firstNet = Object.keys(book)[0];
      return book[firstNet];
    }
    return book[network];
  }, [cryptoCurrency, network]);

  const priceUSDT = useMemo(() => {
    // precios vienen de DataContext con pares *USDT* (BTCUSDT, ETHUSDT)
    if (cryptoCurrency === 'USDT') return 1;
    const p = Number(cryptoPrices?.[cryptoCurrency]?.price ?? 0);
    return Number.isFinite(p) && p > 0 ? p : 0;
  }, [cryptoPrices, cryptoCurrency]);

  const estTokens = useMemo(() => {
    const a = Number(amount);
    if (!a || a <= 0) return 0;
    if (cryptoCurrency === 'USDT') return a; // 1 USDT ~ 1 USD
    if (!priceUSDT) return 0;
    return a / priceUSDT;
  }, [amount, priceUSDT, cryptoCurrency]);

  const step = useMemo(() => {
    // stepper básico para sensación de progreso
    if (depositMethod === 'fiat') {
      return Number(amount) > 0 ? 4 : 3;
    }
    // crypto
    if (!address) return 1;
    if (Number(amount) > 0) return 4;
    return 2;
  }, [depositMethod, amount, address]);

  // ===== Handlers =====
  const handleCopy = (text) => {
    playSound('click');
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado', description: `${text} copiado al portapapeles.` });
  };

  const handleQuickAmount = (v) => {
    playSound('click');
    setAmount(String(v));
  };

  const handleDeposit = async () => {
    if (!user?.id) {
      playSound('error');
      toast({ title: 'No autenticado', description: 'Iniciá sesión para continuar.', variant: 'destructive' });
      return;
    }

    const depositAmount = Number(amount);
    if (!depositAmount || depositAmount <= 0) {
      playSound('error');
      toast({ title: 'Monto inválido', description: 'Ingresá un monto válido.', variant: 'destructive' });
      return;
    }
    if (depositAmount < MIN_DEPOSIT_USD) {
      playSound('error');
      toast({
        title: 'Monto mínimo',
        description: `El depósito mínimo es de ${MIN_DEPOSIT_USD} USD.`,
        variant: 'destructive',
      });
      return;
    }

    setBusy(true);
    try {
      const res = await addTransaction?.({
        type: 'deposit',
        amount: depositAmount,
        currency: depositMethod === 'crypto' ? cryptoCurrency : 'USD',
        description:
          depositMethod === 'crypto'
            ? `Depósito ${cryptoCurrency} (${network})`
            : `Depósito vía ${fiatMethod}`,
        status: 'pending',
      });

      playSound('success');
      toast({
        title: 'Solicitud enviada',
        description: `Tu depósito de ${fmt(depositAmount, 2)} quedó pendiente de confirmación.`,
      });
      setAmount('');
    } catch (err) {
      console.error('[deposit] error:', err);
      playSound('error');
      toast({
        title: 'Error',
        description: 'No se pudo registrar el depósito. Intentá nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  // ===== Últimos 5 depósitos =====
  const lastDeposits = useMemo(() => {
    const list = Array.isArray(transactions) ? transactions : [];
    return list
      .filter((t) => (t?.type || '').toLowerCase() === 'deposit')
      .slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-3xl font-bold text-white mb-2">Realizar Depósito</h1>
        <p className="text-slate-300">Recargá tu saldo para comenzar a invertir.</p>
        <div className="text-slate-400 mt-2 space-x-3">
          <span>
            Saldo USDC:{' '}
            <span className="text-green-400 font-semibold">
              ${fmt(balances?.usdc ?? 0, 2)}
            </span>
          </span>
          <span className="hidden sm:inline">•</span>
          <span>
            Saldo USDT:{' '}
            <span className="text-teal-400 font-semibold">
              ${fmt(balances?.usdt ?? 0, 2)}
            </span>
          </span>
        </div>
      </motion.div>

      <Card className="crypto-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center">
            <DollarSign className="h-6 w-6 mr-2 text-green-400" />
            Seleccioná el método
          </CardTitle>
          <CardDescription className="text-slate-300">
            Podés depositar con criptomonedas o dinero fiat.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Stepper (sensación de progreso) */}
          <div className="grid grid-cols-4 gap-3 text-xs">
            {[
              ['1', 'Elegir método'],
              ['2', 'Copiar dirección / Alias'],
              ['3', 'Enviar fondos'],
              ['4', 'Notificar depósito'],
            ].map(([num, label], i) => {
              const idx = i + 1;
              const active = step >= idx;
              return (
                <div key={num} className={`rounded-xl p-2 border ${active ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/40'}`}>
                  <div className="flex items-center gap-2 text-slate-200">
                    {active ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Timer className="w-4 h-4 text-slate-500" />}
                    <span className="font-semibold">{num}</span> {label}
                  </div>
                </div>
              );
            })}
          </div>

          <Tabs defaultValue="crypto" onValueChange={(v) => setDepositMethod(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800">
              <TabsTrigger value="crypto" className="text-white">Criptomonedas</TabsTrigger>
              <TabsTrigger value="fiat" className="text-white">Dinero Fiat</TabsTrigger>
            </TabsList>

            {/* ===== Crypto ===== */}
            <TabsContent value="crypto" className="mt-6">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white">Depositar con Criptomonedas</CardTitle>
                  <CardDescription className="text-slate-300">
                    Enviá la criptomoneda seleccionada a la dirección indicada.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Moneda */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white">Criptomoneda</Label>
                      <Select value={cryptoCurrency} onValueChange={(v) => {
                        setCryptoCurrency(v);
                        // ajustar network por defecto según moneda
                        if (v === 'BTC') setNetwork('BTC');
                        if (v === 'ETH') setNetwork('ERC20');
                        if (v === 'USDT') setNetwork('ERC20');
                      }}>
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

                    {/* Red */}
                    <div className="space-y-2">
                      <Label className="text-white">Red</Label>
                      <Select value={network} onValueChange={setNetwork}>
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border-slate-600">
                          {cryptoCurrency === 'USDT' && (
                            <>
                              <SelectItem value="ERC20">ERC20 (Ethereum)</SelectItem>
                              <SelectItem value="TRC20">TRC20 (Tron)</SelectItem>
                              <SelectItem value="BEP20">BEP20 (BSC)</SelectItem>
                            </>
                          )}
                          {cryptoCurrency === 'BTC' && <SelectItem value="BTC">Bitcoin</SelectItem>}
                          {cryptoCurrency === 'ETH' && <SelectItem value="ERC20">ERC20 (Ethereum)</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Dirección + copiar */}
                  <div className="space-y-2">
                    <Label className="text-white">Dirección de depósito ({cryptoCurrency} · {network})</Label>
                    <div className="flex items-center space-x-2">
                      <Input readOnly value={address || ''} className="bg-slate-700 border-slate-600 text-slate-300" />
                      <Button variant="outline" size="icon" onClick={() => handleCopy(address || '')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          playSound('click');
                          toast({
                            title: 'QR',
                            description: 'Podés usar esta dirección en tu billetera para generar el QR automáticamente.',
                          });
                        }}
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Estimación en tokens */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="amount" className="text-white">Monto a depositar (USD)</Label>
                      <Input
                        id="amount"
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Ej: 100"
                        className="bg-slate-800 border-slate-600 text-white"
                        min="0"
                        step="0.01"
                      />
                      <div className="flex gap-2">
                        {[50, 100, 250, 500].map((v) => (
                          <Button key={v} variant="secondary" size="xs" onClick={() => handleQuickAmount(v)}>
                            {v}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-400 text-xs">Precio {cryptoCurrency}</div>
                      <div className="text-white font-semibold text-lg">
                        {cryptoCurrency === 'USDT' ? '≈ 1.00 USDT' : (priceUSDT ? `≈ ${fmt(priceUSDT, 2)} USDT` : '—')}
                      </div>
                      <div className="text-slate-500 text-xs mt-1">
                        Fuente: stream en tiempo real.
                      </div>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                      <div className="text-slate-400 text-xs">Vas a enviar aprox.</div>
                      <div className="text-emerald-300 font-semibold text-lg">
                        {fmt(estTokens, cryptoCurrency === 'BTC' ? 6 : cryptoCurrency === 'ETH' ? 6 : 2)} {cryptoCurrency}
                      </div>
                      <div className="text-slate-500 text-xs mt-1">Sin contar fees de red.</div>
                    </div>
                  </div>

                  {/* Avisos */}
                  <div className="flex items-start space-x-2 p-3 bg-blue-900/30 rounded-lg border border-blue-700">
                    <Info className="h-5 w-5 text-blue-400 mt-1 shrink-0" />
                    <p className="text-sm text-blue-300">
                      Enviá <b>{cryptoCurrency}</b> en la red <b>{network}</b> únicamente a esta dirección.
                      Enviar otra moneda/red puede resultar en pérdida del depósito. Las confirmaciones pueden demorar.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ===== Fiat ===== */}
            <TabsContent value="fiat" className="mt-6">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white">Depositar con Dinero Fiat</CardTitle>
                  <CardDescription className="text-slate-300">
                    Transferí al alias de tu país y notificá el depósito.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-white">Método de pago</Label>
                    <Select value={fiatMethod} onValueChange={setFiatMethod}>
                      <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        <SelectItem value="alias">Transferencia con Alias (ARS, BRL, COP, MXN)</SelectItem>
                        <SelectItem value="card" disabled>Tarjeta (Próximamente)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {fiatMethod === 'alias' && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-white">Alias de envío</Label>
                        <Select
                          onValueChange={(value) => {
                            playSound('click');
                            const alias = fiatAliases[value];
                            handleCopy(alias);
                            toast({ title: 'Alias Copiado', description: `Alias para ${value}: ${alias}` });
                          }}
                        >
                          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                            <SelectValue placeholder="Seleccioná tu país para ver el alias" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-700 border-slate-600">
                            {Object.entries(fiatAliases).map(([country, alias]) => (
                              <SelectItem key={country} value={country}>
                                {country} — {alias}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-start space-x-2 p-3 bg-yellow-900/30 rounded-lg border border-yellow-700">
                        <AlertTriangle className="h-5 w-5 text-yellow-400 mt-1 shrink-0" />
                        <p className="text-sm text-yellow-300">
                          Trasferí al alias correspondiente y luego notificá el depósito.
                          La acreditación puede demorar hasta 24 hs.
                        </p>
                      </div>
                    </div>
                  )}

                  {fiatMethod === 'card' && (
                    <div className="flex items-center justify-center p-4 bg-slate-700 rounded-lg">
                      <CreditCard className="h-6 w-6 mr-2 text-slate-300" />
                      <p className="text-slate-300">Pagos con tarjeta estarán disponibles pronto.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Monto + CTA */}
          <div className="space-y-2 pt-2">
            <Label htmlFor="amount2" className="text-white">Monto del Depósito (USD)</Label>
            <Input
              id="amount2"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 100"
              className="bg-slate-800 border-slate-600 text-white"
              min="0"
              step="0.01"
            />
          </div>

          <Button
            onClick={handleDeposit}
            disabled={busy}
            className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 disabled:opacity-60"
          >
            {busy ? 'Enviando...' : 'Notificar Depósito'}
          </Button>
          <p className="text-xs text-center text-slate-400">
            Al hacer clic, tu transacción quedará <b>pendiente</b> de confirmación por nuestro equipo.
          </p>
        </CardContent>
      </Card>

      {/* ===== Últimos depósitos del usuario ===== */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white">Tus últimos depósitos</CardTitle>
          <CardDescription className="text-slate-300">
            Un resumen rápido de tus solicitudes recientes. <Link to="/history" className="text-emerald-400 underline">Ver historial completo</Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lastDeposits.length ? (
            <div className="space-y-3">
              {lastDeposits.map((t) => {
                const dt = new Date(t.createdAt || t.created_at || Date.now());
                const isPending = (t.status || '').toLowerCase() === 'pending';
                const isCompleted = (t.status || '').toLowerCase() === 'completed';
                const isFailed = (t.status || '').toLowerCase() === 'failed' || (t.status || '').toLowerCase() === 'cancelled';
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center gap-3">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : isFailed ? (
                        <AlertTriangle className="w-5 h-5 text-rose-400" />
                      ) : (
                        <Timer className="w-5 h-5 text-amber-400" />
                      )}
                      <div>
                        <div className="text-slate-200 text-sm">
                          {String(t.currency || '').toUpperCase()} • {t.description || 'Depósito'}
                        </div>
                        <div className="text-slate-500 text-xs">
                          {dt.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-semibold">+{fmt(t.amount, 2)} {String(t.currency || '').toUpperCase()}</div>
                      <div className={`text-xs ${isCompleted ? 'text-emerald-400' : isFailed ? 'text-rose-400' : 'text-amber-400'}`}>
                        {t.status}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-slate-400 text-sm">
              Aún no registraste depósitos.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
