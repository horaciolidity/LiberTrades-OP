// src/pages/WalletPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { getUserBalance, rechargeDemoBalance } from '@/lib/wallet';
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  TrendingDown,
  Coins,
  RefreshCw,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

const fmt = (n, dec = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(dec) : (0).toFixed(dec);
};
const clamp = (v, a = 0, b = 100) => Math.min(b, Math.max(a, v));

const WalletPage = () => {
  const { user, balances } = useAuth();
  const { transactions = [], cryptoPrices = {} } = useData();

  const [demoBalance, setDemoBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // === Demo balance (desde lib/wallet) ===
  const fetchDemo = async () => {
    if (!user?.id) return;
    try {
      const data = await getUserBalance(user.id);
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
      setBusy(true);
      await rechargeDemoBalance(user.id);
      await fetchDemo();
      toast({
        title: 'Demo recargado',
        description: 'Se actualizó tu saldo demo a $1000.',
      });
    } catch (error) {
      toast({
        title: 'Error al recargar demo',
        description: (error && error.message) || 'Intentá nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    fetchDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // === Precios (DataContext con stream) ===
  const priceUSDT = 1;
  const priceUSDC = 1;
  const priceBTC  = Number(cryptoPrices?.BTC?.price ?? 0) || 0;
  const priceETH  = Number(cryptoPrices?.ETH?.price ?? 0) || 0;

  // === Balances reales ===
  const real = {
    USDC: Number(balances?.usdc ?? 0),
    USDT: Number(balances?.usdt ?? 0),
    BTC:  Number(balances?.btc  ?? 0),
    ETH:  Number(balances?.eth  ?? 0),
  };

  const walletRows = useMemo(() => {
    const rows = [
      { ccy: 'USDC', amount: real.USDC, price: priceUSDC },
      { ccy: 'USDT', amount: real.USDT, price: priceUSDT },
      { ccy: 'BTC',  amount: real.BTC,  price: priceBTC  },
      { ccy: 'ETH',  amount: real.ETH,  price: priceETH  },
    ].filter(r => r.amount > 0 || r.ccy === 'USDC' || r.ccy === 'USDT'); // siempre mostrar estables
    const withUsd = rows.map(r => ({ ...r, usd: r.amount * (r.price || 0) }));
    const total = withUsd.reduce((a, r) => a + r.usd, 0);
    return withUsd
      .map(r => ({ ...r, share: total > 0 ? (r.usd / total) * 100 : 0 }))
      .sort((a, b) => b.usd - a.usd);
  }, [real, priceBTC, priceETH]);

  const totalUSD = walletRows.reduce((a, r) => a + r.usd, 0);

  // === Variación de mercado (24h) para mostrar flechitas en BTC/ETH ===
  const changeBTC = Number(cryptoPrices?.BTC?.change ?? 0);
  const changeETH = Number(cryptoPrices?.ETH?.change ?? 0);

  // === Últimos movimientos de billetera (depósitos/retiros/créditos/refunds/fees) ===
  const walletTypes = new Set(['deposit', 'withdrawal', 'admin_credit', 'refund', 'fee']);
  const recentWalletTx = (Array.isArray(transactions) ? transactions : [])
    .filter(t => walletTypes.has(String(t?.type || '').toLowerCase()))
    .slice(0, 6);

  if (loading) return <p className="text-white p-4">Cargando saldo...</p>;

  return (
    <div className="p-6 max-w-5xl mx-auto text-white space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Tu Billetera</h1>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Wallet className="w-4 h-4" />
          Valor de mercado en tiempo real
        </div>
      </div>

      {/* Resumen total + acciones rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-800 border-slate-700 text-white lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-white">Valor total de la billetera</CardTitle>
            <CardDescription className="text-slate-300">
              USDC/USDT a 1.00 • BTC/ETH a precio spot (Binance stream)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-bold">
              ${fmt(totalUSD, 2)} USD
            </div>

            {/* Barra de distribución */}
            <div className="w-full h-4 rounded-full bg-slate-900 overflow-hidden border border-slate-700">
              <div className="flex h-full">
                {walletRows.map((r) => (
                  <div
                    key={r.ccy}
                    className="h-full"
                    style={{
                      width: `${clamp(r.share)}%`,
                      background:
                        r.ccy === 'USDC'
                          ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                          : r.ccy === 'USDT'
                          ? 'linear-gradient(90deg,#14b8a6,#0ea5e9)'
                          : r.ccy === 'BTC'
                          ? 'linear-gradient(90deg,#f59e0b,#f97316)'
                          : 'linear-gradient(90deg,#a78bfa,#8b5cf6)',
                    }}
                    title={`${r.ccy}: ${fmt(r.share, 1)}%`}
                  />
                ))}
              </div>
            </div>

            {/* Tabla compacta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {walletRows.map((r) => (
                <div key={r.ccy} className="bg-slate-900/50 border border-slate-700 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                        <Coins className="w-4 h-4 text-slate-300" />
                      </div>
                      <div>
                        <div className="text-slate-200 font-semibold">{r.ccy}</div>
                        <div className="text-xs text-slate-400">
                          {r.ccy === 'BTC' && (
                            <span className={changeBTC >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {changeBTC >= 0 ? '+' : ''}
                              {fmt(Math.abs(changeBTC), 2)}%
                            </span>
                          )}
                          {r.ccy === 'ETH' && (
                            <span className={changeETH >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {changeETH >= 0 ? '+' : ''}
                              {fmt(Math.abs(changeETH), 2)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-100 font-semibold">
                        {r.ccy === 'BTC' || r.ccy === 'ETH' ? r.amount.toFixed(6) : r.amount.toFixed(2)} {r.ccy}
                      </div>
                      <div className="text-slate-400 text-sm">${fmt(r.usd, 2)} • {fmt(r.share, 1)}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Nota */}
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <Info className="w-4 h-4 mt-0.5" />
              Los valores en USD pueden variar por la volatilidad del mercado.
            </div>
          </CardContent>
        </Card>

        {/* Acciones + Demo */}
        <Card className="bg-slate-800 border-slate-700 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-white">Acciones</CardTitle>
            <CardDescription className="text-slate-300">Operaciones rápidas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/deposit">
              <Button className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700">
                <ArrowDownCircle className="w-4 h-4" />
                Depositar
              </Button>
            </Link>
            <Link to="/withdraw">
              <Button variant="secondary" className="w-full justify-start gap-2">
                <ArrowUpCircle className="w-4 h-4" />
                Retirar
              </Button>
            </Link>

            <div className="h-px bg-slate-700 my-3" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Saldo Demo</span>
                <span className="text-sm text-yellow-300 font-semibold">${fmt(demoBalance ?? 0, 2)}</span>
              </div>
              <Button
                onClick={handleRechargeDemo}
                disabled={busy}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Recargando...
                  </>
                ) : (
                  'Recargar Demo a $1000'
                )}
              </Button>
              <div className="text-xs text-slate-400">
                El saldo demo es para práctica y no afecta tu saldo real.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actividad reciente de billetera */}
      <Card className="bg-slate-800 border-slate-700 text-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-white">Actividad reciente</CardTitle>
          <CardDescription className="text-slate-300">
            Depósitos, retiros, créditos y reintegros más recientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentWalletTx.length ? (
            recentWalletTx.map((t) => {
              const type = String(t?.type || '').toLowerCase();
              const dt = new Date(t?.createdAt || t?.created_at || Date.now());
              const amt = Number(t?.amount || 0);
              const ccy = String(t?.currency || 'USDT').toUpperCase();
              const isPositive = ['deposit', 'refund', 'admin_credit'].includes(type);
              const Icon =
                type === 'deposit' ? CheckCircle2
                  : type === 'withdrawal' ? AlertTriangle
                  : type === 'admin_credit' ? TrendingUp
                  : type === 'refund' ? TrendingUp
                  : TrendingDown;

              return (
                <div key={t.id} className="flex items-center justify-between p-3 bg-slate-900/40 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`} />
                    <div>
                      <div className="text-slate-200 capitalize">
                        {type === 'deposit' ? 'Depósito'
                          : type === 'withdrawal' ? 'Retiro'
                          : type === 'admin_credit' ? 'Crédito Admin'
                          : type === 'refund' ? 'Reintegro'
                          : type}
                      </div>
                      <div className="text-xs text-slate-400">
                        {t.description || '—'} • {dt.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPositive ? '+' : '-'}{fmt(amt, 2)} {ccy}
                    </div>
                    <div className="text-xs text-slate-500">{t.status || 'pending'}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-slate-400 text-sm">Aún no hay movimientos de billetera.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletPage;
