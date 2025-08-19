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
  Info,
  CheckCircle2,
  Timer,
  AlertTriangle,
  Upload,
  Download,
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
  const { addTransaction, transactions = [] } = useData();
  const { playSound } = useSound();

  // ======= Estado general =======
  const [tab, setTab] = useState('deposit'); // deposit | withdraw

  // ======= DEPÓSITO (solo USDC) =======
  const [network, setNetwork] = useState('ERC20'); // ERC20 | BEP20 | OPTIMISM
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  // Dirección única provista (EVM – sirve para ERC20, BEP20, Optimism)
  const MASTER_DEPOSIT_ADDRESS = '0xBAeaDE80A2A1064E4F8f372cd2ADA9a00daB4BBE';

  // Stepper visual
  const step = useMemo(() => {
    if (!MASTER_DEPOSIT_ADDRESS) return 1;
    if (Number(amount) > 0) return 4;
    return 2;
  }, [amount]);

  // ======= RETIRO (solo USDC) =======
  const [wNetwork, setwNetwork] = useState('ERC20');
  const [wAmount, setwAmount] = useState('');
  const [wAddress, setwAddress] = useState('');
  const [wBusy, setwBusy] = useState(false);

  // ===== Handlers comunes =====
  const handleCopy = (text) => {
    if (!text) return;
    playSound?.('click');
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado', description: `${text} copiado al portapapeles.` });
  };

  const handleQuickAmount = (v) => {
    playSound?.('click');
    setAmount(String(v));
  };

  // ====== Enviar DEPÓSITO (pendiente) ======
  const MIN_DEPOSIT_USD = 10;

  const handleDeposit = async () => {
    if (!user?.id) {
      playSound?.('error');
      toast({ title: 'No autenticado', description: 'Iniciá sesión para continuar.', variant: 'destructive' });
      return;
    }

    const depositAmount = Number(amount);
    if (!depositAmount || depositAmount <= 0) {
      playSound?.('error');
      toast({ title: 'Monto inválido', description: 'Ingresá un monto válido.', variant: 'destructive' });
      return;
    }
    if (depositAmount < MIN_DEPOSIT_USD) {
      playSound?.('error');
      toast({
        title: 'Monto mínimo',
        description: `El depósito mínimo es de ${MIN_DEPOSIT_USD} USDC.`,
        variant: 'destructive',
      });
      return;
    }

    setBusy(true);
    try {
      await addTransaction?.({
        type: 'deposit',
        amount: depositAmount,
        currency: 'USDC',
        description: `Depósito USDC (${network}) → ${MASTER_DEPOSIT_ADDRESS.slice(0, 6)}…${MASTER_DEPOSIT_ADDRESS.slice(-4)}`,
        status: 'pending',
      });

      playSound?.('success');
      toast({
        title: 'Solicitud enviada',
        description: `Tu depósito de ${fmt(depositAmount, 2)} USDC quedó pendiente de confirmación.`,
      });
      setAmount('');
    } catch (err) {
      console.error('[deposit] error:', err);
      playSound?.('error');
      toast({
        title: 'Error',
        description: 'No se pudo registrar el depósito. Intentá nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  // ====== Enviar RETIRO (pendiente) ======
  const MIN_WITHDRAW_USDC = 10;

  const handleWithdraw = async () => {
    if (!user?.id) {
      playSound?.('error');
      toast({ title: 'No autenticado', description: 'Iniciá sesión para continuar.', variant: 'destructive' });
      return;
    }

    const amt = Number(wAmount);
    if (!amt || amt <= 0) {
      playSound?.('error');
      toast({ title: 'Monto inválido', description: 'Ingresá un monto válido.', variant: 'destructive' });
      return;
    }
    if (amt < MIN_WITHDRAW_USDC) {
      playSound?.('error');
      toast({
        title: 'Monto mínimo',
        description: `El retiro mínimo es de ${MIN_WITHDRAW_USDC} USDC.`,
        variant: 'destructive',
      });
      return;
    }
    if (!wAddress || !/^0x[a-fA-F0-9]{40}$/.test(wAddress.trim())) {
      playSound?.('error');
      toast({
        title: 'Dirección inválida',
        description: 'Ingresá una dirección EVM válida (0x...).',
        variant: 'destructive',
      });
      return;
    }
    const currentUsdc = Number(balances?.usdc ?? 0);
    if (amt > currentUsdc) {
      playSound?.('error');
      toast({
        title: 'Saldo insuficiente',
        description: 'No tenés suficiente USDC para este retiro.',
        variant: 'destructive',
      });
      return;
    }

    setwBusy(true);
    try {
      await addTransaction?.({
        type: 'withdrawal',
        amount: amt,
        currency: 'USDC',
        description: `Retiro USDC (${wNetwork}) → ${wAddress.slice(0, 6)}…${wAddress.slice(-4)}`,
        status: 'pending',
      });

      playSound?.('success');
      toast({
        title: 'Retiro solicitado',
        description: `Tu retiro de ${fmt(amt, 2)} USDC quedó pendiente de aprobación.`,
      });
      setwAmount('');
      setwAddress('');
    } catch (err) {
      console.error('[withdraw] error:', err);
      playSound?.('error');
      toast({
        title: 'Error',
        description: 'No se pudo registrar el retiro. Intentá nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setwBusy(false);
    }
  };

  // ===== Últimos movimientos =====
  const lastDeposits = useMemo(() => {
    const list = Array.isArray(transactions) ? transactions : [];
    return list.filter((t) => (t?.type || '').toLowerCase() === 'deposit').slice(0, 5);
  }, [transactions]);

  const lastWithdrawals = useMemo(() => {
    const list = Array.isArray(transactions) ? transactions : [];
    return list.filter((t) => (t?.type || '').toLowerCase() === 'withdrawal').slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-3xl font-bold text-white mb-2">Depósitos y Retiros</h1>
        <p className="text-slate-300">Gestioná fondos en tu cuenta usando USDC.</p>
        <div className="text-slate-400 mt-2">
          Saldo USDC:{' '}
          <span className="text-green-400 font-semibold">
            ${fmt(balances?.usdc ?? 0, 2)}
          </span>
        </div>
      </motion.div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-800">
          <TabsTrigger value="deposit" className="text-white">
            <Download className="h-4 w-4 mr-2" /> Depositar
          </TabsTrigger>
          <TabsTrigger value="withdraw" className="text-white">
            <Upload className="h-4 w-4 mr-2" /> Retirar
          </TabsTrigger>
        </TabsList>

        {/* ===================== DEPÓSITO ===================== */}
        <TabsContent value="deposit">
          <Card className="crypto-card mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center">
                <DollarSign className="h-6 w-6 mr-2 text-green-400" />
                Depositar USDC
              </CardTitle>
              <CardDescription className="text-slate-300">
                Enviá USDC a nuestra dirección y notificá tu depósito. Quedará <b>pendiente</b> hasta su acreditación.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Stepper */}
              <div className="grid grid-cols-4 gap-3 text-xs">
                {[
                  ['1', 'Elegir red'],
                  ['2', 'Copiar dirección'],
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Red */}
                <div className="space-y-2">
                  <Label className="text-white">Red</Label>
                  <Select value={network} onValueChange={setNetwork}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="ERC20">ERC20 (Ethereum)</SelectItem>
                      <SelectItem value="BEP20">BEP20 (BNB Smart Chain)</SelectItem>
                      <SelectItem value="OPTIMISM">Optimism (OP Mainnet)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Dirección + copiar */}
                <div className="space-y-2">
                  <Label className="text-white">Dirección de depósito (USDC · {network})</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      readOnly
                      value={MASTER_DEPOSIT_ADDRESS}
                      className="bg-slate-700 border-slate-600 text-slate-300"
                    />
                    <Button variant="outline" size="icon" onClick={() => handleCopy(MASTER_DEPOSIT_ADDRESS)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        playSound?.('click');
                        toast({
                          title: 'QR',
                          description: 'Pegá la dirección en tu billetera para generar el QR automáticamente.',
                        });
                      }}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Monto */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-white">Monto a depositar (USDC)</Label>
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
                  <div className="text-slate-400 text-xs">Moneda</div>
                  <div className="text-white font-semibold text-lg">USDC (≈ 1.00 USD)</div>
                  <div className="text-slate-500 text-xs mt-1">Stablecoin soportada.</div>
                </div>

                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                  <div className="text-slate-400 text-xs">Vas a enviar</div>
                  <div className="text-emerald-300 font-semibold text-lg">
                    {fmt(Number(amount || 0), 2)} USDC
                  </div>
                  <div className="text-slate-500 text-xs mt-1">Sin contar fees de red.</div>
                </div>
              </div>

              {/* Aviso */}
              <div className="flex items-start space-x-2 p-3 bg-blue-900/30 rounded-lg border border-blue-700">
                <Info className="h-5 w-5 text-blue-400 mt-1 shrink-0" />
                <p className="text-sm text-blue-300">
                  Enviá <b>USDC</b> únicamente a esta dirección en la red seleccionada ({network}). Enviar activos o redes incorrectas puede resultar en pérdida de fondos.
                </p>
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

          {/* Últimos depósitos */}
          <Card className="crypto-card mt-6">
            <CardHeader>
              <CardTitle className="text-white">Tus últimos depósitos</CardTitle>
              <CardDescription className="text-slate-300">
                Resumen de solicitudes recientes. <Link to="/history" className="text-emerald-400 underline">Ver historial completo</Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lastDeposits.length ? (
                <div className="space-y-3">
                  {lastDeposits.map((t) => {
                    const dt = new Date(t.createdAt || t.created_at || Date.now());
                    const s = (t.status || '').toLowerCase();
                    const isPending = s === 'pending';
                    const isCompleted = s === 'completed';
                    const isFailed = s === 'failed' || s === 'cancelled';
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
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
                              USDC • {t.description || 'Depósito'}
                            </div>
                            <div className="text-slate-500 text-xs">{dt.toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-semibold">+{fmt(t.amount, 2)} USDC</div>
                          <div className={`text-xs ${isCompleted ? 'text-emerald-400' : isFailed ? 'text-rose-400' : 'text-amber-400'}`}>
                            {t.status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-slate-400 text-sm">Aún no registraste depósitos.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== RETIRO ===================== */}
        <TabsContent value="withdraw">
          <Card className="crypto-card mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-white">Solicitar Retiro (USDC)</CardTitle>
              <CardDescription className="text-slate-300">
                Enviá USDC a tu propia billetera. La solicitud quedará <b>pendiente</b> hasta su aprobación.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Red de retiro</Label>
                  <Select value={wNetwork} onValueChange={setwNetwork}>
                    <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-700 border-slate-600">
                      <SelectItem value="ERC20">ERC20 (Ethereum)</SelectItem>
                      <SelectItem value="BEP20">BEP20 (BNB Smart Chain)</SelectItem>
                      <SelectItem value="OPTIMISM">Optimism (OP Mainnet)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Dirección de tu billetera (EVM)</Label>
                  <Input
                    value={wAddress}
                    onChange={(e) => setwAddress(e.target.value)}
                    placeholder="0x..."
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-white">Monto a retirar (USDC)</Label>
                  <Input
                    type="number"
                    value={wAmount}
                    onChange={(e) => setwAmount(e.target.value)}
                    placeholder="Ej: 100"
                    className="bg-slate-800 border-slate-600 text-white"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                  <div className="text-slate-400 text-xs">Disponible</div>
                  <div className="text-white font-semibold text-lg">
                    {fmt(balances?.usdc ?? 0, 2)} USDC
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                  <div className="text-slate-400 text-xs">A retirar</div>
                  <div className="text-emerald-300 font-semibold text-lg">
                    {fmt(Number(wAmount || 0), 2)} USDC
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-2 p-3 bg-yellow-900/30 rounded-lg border border-yellow-700">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mt-1 shrink-0" />
                <p className="text-sm text-yellow-300">
                  Verificá la red y la dirección cuidadosamente. Los retiros, una vez aprobados y enviados on-chain, no pueden revertirse.
                </p>
              </div>

              <Button
                onClick={handleWithdraw}
                disabled={wBusy}
                className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 disabled:opacity-60"
              >
                {wBusy ? 'Enviando...' : 'Solicitar Retiro'}
              </Button>
              <p className="text-xs text-center text-slate-400">
                La solicitud se registrará como <b>pendiente</b> hasta ser revisada por el equipo.
              </p>
            </CardContent>
          </Card>

          {/* Últimos retiros */}
          <Card className="crypto-card mt-6">
            <CardHeader>
              <CardTitle className="text-white">Tus últimos retiros</CardTitle>
              <CardDescription className="text-slate-300">
                Estado de tus solicitudes de retiro. <Link to="/history" className="text-emerald-400 underline">Ver historial completo</Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lastWithdrawals.length ? (
                <div className="space-y-3">
                  {lastWithdrawals.map((t) => {
                    const dt = new Date(t.createdAt || t.created_at || Date.now());
                    const s = (t.status || '').toLowerCase();
                    const isPending = s === 'pending';
                    const isCompleted = s === 'completed';
                    const isFailed = s === 'failed' || s === 'cancelled';
                    return (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
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
                              USDC • {t.description || 'Retiro'}
                            </div>
                            <div className="text-slate-500 text-xs">{dt.toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-semibold">-{fmt(t.amount, 2)} USDC</div>
                          <div className={`text-xs ${isCompleted ? 'text-emerald-400' : isFailed ? 'text-rose-400' : 'text-amber-400'}`}>
                            {t.status}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-slate-400 text-sm">Aún no registraste retiros.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
