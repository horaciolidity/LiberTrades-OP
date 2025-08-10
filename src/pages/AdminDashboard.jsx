// src/pages/AdminDashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import {
  Users as UsersIcon,
  DollarSign,
  Download,
  Upload,
  RefreshCw,
  Search,
  Check,
  X as XIcon,
} from 'lucide-react';

const TX_TABLE = 'wallet_transactions';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);

  // data
  const [users, setUsers] = useState([]);           // {id, username, role, balance, demo_balance, created_at, email?}
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);

  // ui
  const [search, setSearch] = useState('');
  const [adjustValues, setAdjustValues] = useState({}); // { user_id: "+100" }

  // métricas
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    volume30d: 0,
    activeUsers30d: 0,
  });

  // ------- fetchers -------
  const fetchUsers = async () => {
    // perfiles (sin email porque tu tabla no lo tiene)
    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, username, role, created_at')
      .order('created_at', { ascending: false });
    if (pErr) throw pErr;

    // balances
    const { data: bals, error: bErr } = await supabase
      .from('balances')
      .select('user_id, usdc, demo_balance');
    if (bErr) throw bErr;

    const balMap = Object.fromEntries((bals || []).map(b => [b.user_id, b]));
    const merged = (profs || []).map(p => ({
      ...p,
      email: '', // opcional: quedará vacío hasta que agregues esa columna si querés mostrarla
      balance: Number(balMap[p.id]?.usdc ?? 0),
      demo_balance: Number(balMap[p.id]?.demo_balance ?? 0),
    }));
    setUsers(merged);
  };

  const fetchPending = async () => {
    const { data: dep, error: dErr } = await supabase
      .from(TX_TABLE)
      .select('id, user_id, amount, type, status, created_at')
      .eq('type', 'deposit')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (dErr) throw dErr;

    const { data: wit, error: wErr } = await supabase
      .from(TX_TABLE)
      .select('id, user_id, amount, type, status, created_at')
      .eq('type', 'withdrawal')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (wErr) throw wErr;

    setPendingDeposits(dep || []);
    setPendingWithdrawals(wit || []);
  };

  const fetchMetrics = async (usersList, depList, witList) => {
    const fromISO = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: tx30, error } = await supabase
      .from(TX_TABLE)
      .select('amount, type, status, created_at, user_id')
      .gte('created_at', fromISO)
      .eq('status', 'completed');
    if (error) throw error;

    const volume30d = (tx30 || []).reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const activeUserIds = new Set((tx30 || []).map(t => t.user_id));
    const activeUsers30d = usersList.filter(u => activeUserIds.has(u.id)).length;

    setMetrics({
      totalUsers: usersList.length,
      pendingDeposits: depList.length,
      pendingWithdrawals: witList.length,
      volume30d,
      activeUsers30d,
    });
  };

  const reloadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchUsers(), fetchPending()]);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error cargando datos', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reloadAll(); }, []);
  useEffect(() => {
    fetchMetrics(users, pendingDeposits, pendingWithdrawals).catch(() => {});
  }, [users, pendingDeposits, pendingWithdrawals]);

  // ------- acciones admin -------
  const adjustBalance = async (userId, deltaStr) => {
    const delta = Number(deltaStr);
    if (!deltaStr || !Number.isFinite(delta)) {
      toast({ title: 'Monto inválido', description: 'Ingresa un número (ej: +100 o -50).', variant: 'destructive' });
      return;
    }
    try {
      const { data: row, error: gErr } = await supabase
        .from('balances')
        .select('usdc')
        .eq('user_id', userId)
        .single();
      if (gErr) throw gErr;

      const newUsdc = Number(row?.usdc || 0) + delta;
      const { error: uErr } = await supabase
        .from('balances')
        .update({ usdc: newUsdc })
        .eq('user_id', userId);
      if (uErr) throw uErr;

      await supabase.from(TX_TABLE).insert({
        user_id: userId,
        type: delta >= 0 ? 'admin_credit' : 'admin_debit',
        amount: Math.abs(delta),
        status: 'completed',
      });

      toast({ title: 'Balance actualizado', description: `Nuevo saldo: $${fmt(newUsdc)}` });
      await reloadAll();
      setAdjustValues(v => ({ ...v, [userId]: '' }));
    } catch (e) {
      console.error(e);
      toast({ title: 'Error ajustando balance', description: e.message, variant: 'destructive' });
    }
  };

  const approveDeposit = async (tx) => {
    try {
      const { data: balRow, error: gErr } = await supabase
        .from('balances')
        .select('usdc')
        .eq('user_id', tx.user_id)
        .single();
      if (gErr) throw gErr;

      const newUsdc = Number(balRow?.usdc || 0) + Number(tx.amount || 0);
      const { error: bErr } = await supabase
        .from('balances')
        .update({ usdc: newUsdc })
        .eq('user_id', tx.user_id);
      if (bErr) throw bErr;

      const { error: tErr } = await supabase
        .from(TX_TABLE)
        .update({ status: 'completed' })
        .eq('id', tx.id);
      if (tErr) throw tErr;

      toast({ title: 'Depósito aprobado', description: `Acreditado $${fmt(tx.amount)}` });
      await reloadAll();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error aprobando depósito', description: e.message, variant: 'destructive' });
    }
  };

  const approveWithdrawal = async (tx) => {
    try {
      const { data: balRow, error: gErr } = await supabase
        .from('balances')
        .select('usdc')
        .eq('user_id', tx.user_id)
        .single();
      if (gErr) throw gErr;

      const current = Number(balRow?.usdc || 0);
      const amt = Number(tx.amount || 0);
      if (current < amt) {
        toast({ title: 'Saldo insuficiente', description: 'No alcanza para aprobar', variant: 'destructive' });
        return;
      }

      const { error: bErr } = await supabase
        .from('balances')
        .update({ usdc: current - amt })
        .eq('user_id', tx.user_id);
      if (bErr) throw bErr;

      const { error: tErr } = await supabase
        .from(TX_TABLE)
        .update({ status: 'completed' })
        .eq('id', tx.id);
      if (tErr) throw tErr;

      toast({ title: 'Retiro aprobado', description: `Debitado $${fmt(tx.amount)}` });
      await reloadAll();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error aprobando retiro', description: e.message, variant: 'destructive' });
    }
  };

  const rejectTx = async (tx) => {
    try {
      const { error } = await supabase
        .from(TX_TABLE)
        .update({ status: 'rejected' })
        .eq('id', tx.id);
      if (error) throw error;
      toast({ title: 'Solicitud rechazada' });
      await reloadAll();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ------- filtros -------
  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      u =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
          <RefreshCw className="h-8 w-8 mr-3 text-cyan-400" />
          Panel de Administración
        </h1>
        <p className="text-slate-300">Métricas, usuarios y aprobaciones de depósitos/retiros.</p>
      </motion.div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {[
          { t: 'Usuarios', v: metrics.totalUsers, icon: UsersIcon, color: 'text-purple-400', bg: 'bg-purple-500/10' },
          { t: 'Activos (30d)', v: metrics.activeUsers30d, icon: UsersIcon, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          { t: 'Depósitos Pend.', v: metrics.pendingDeposits, icon: Download, color: 'text-green-400', bg: 'bg-green-500/10' },
          { t: 'Retiros Pend.', v: metrics.pendingWithdrawals, icon: Upload, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { t: 'Volumen 30d', v: `$${fmt(metrics.volume30d)}`, icon: DollarSign, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
        ].map((m) => {
          const I = m.icon;
          return (
            <Card key={m.t} className="crypto-card">
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">{m.t}</p>
                  <p className="text-2xl font-bold text-white mt-1">{m.v}</p>
                </div>
                <div className={`p-3 rounded-lg ${m.bg}`}>
                  <I className={`h-6 w-6 ${m.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Usuarios */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white">Usuarios</CardTitle>
          <CardDescription className="text-slate-300">Buscar, ver saldo y ajustar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por email, usuario o id…"
              className="bg-slate-800 border-slate-600 text-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300">
                  <th className="text-left py-2">Usuario</th>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Rol</th>
                  <th className="text-right py-2">Saldo</th>
                  <th className="text-right py-2">Ajustar</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id} className="border-b border-slate-800/60">
                    <td className="py-2 text-white">{u.username || '—'}</td>
                    <td className="py-2 text-slate-300">{u.email || '—'}</td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded text-xs ${u.role === 'admin' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700 text-slate-300'}`}>
                        {u.role || 'user'}
                      </span>
                    </td>
                    <td className="py-2 text-right text-green-400 font-semibold">${fmt(u.balance)}</td>
                    <td className="py-2">
                      <div className="flex justify-end items-center gap-2">
                        <Input
                          placeholder="+100 o -50"
                          value={adjustValues[u.id] ?? ''}
                          onChange={(e) => setAdjustValues(v => ({ ...v, [u.id]: e.target.value }))}
                          className="w-28 bg-slate-800 border-slate-600 text-white"
                        />
                        <Button
                          size="sm"
                          onClick={() => adjustBalance(u.id, adjustValues[u.id])}
                          className="bg-gradient-to-r from-green-500 to-teal-500 hover:opacity-90"
                        >
                          Aplicar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan="5" className="py-6 text-center text-slate-400">Sin resultados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Depósitos pendientes */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center"><Download className="h-5 w-5 mr-2 text-green-400" /> Depósitos pendientes</CardTitle>
          <CardDescription className="text-slate-300">Aprueba o rechaza las solicitudes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pendingDeposits.map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div className="text-sm">
                  <p className="text-white font-medium">Usuario: {tx.user_id}</p>
                  <p className="text-slate-400">Monto: <span className="text-green-400 font-semibold">${fmt(tx.amount)}</span></p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approveDeposit(tx)} className="bg-green-600 hover:bg-green-700">
                    <Check className="h-4 w-4 mr-1" /> Aprobar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectTx(tx)}>
                    <XIcon className="h-4 w-4 mr-1" /> Rechazar
                  </Button>
                </div>
              </div>
            ))}
            {pendingDeposits.length === 0 && <p className="text-slate-400">No hay depósitos pendientes.</p>}
          </div>
        </CardContent>
      </Card>

      {/* Retiros pendientes */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center"><Upload className="h-5 w-5 mr-2 text-yellow-400" /> Retiros pendientes</CardTitle>
          <CardDescription className="text-slate-300">Aprueba o rechaza las solicitudes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pendingWithdrawals.map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div className="text-sm">
                  <p className="text-white font-medium">Usuario: {tx.user_id}</p>
                  <p className="text-slate-400">Monto: <span className="text-yellow-300 font-semibold">${fmt(tx.amount)}</span></p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approveWithdrawal(tx)} className="bg-blue-600 hover:bg-blue-700">
                    <Check className="h-4 w-4 mr-1" /> Aprobar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectTx(tx)}>
                    <XIcon className="h-4 w-4 mr-1" /> Rechazar
                  </Button>
                </div>
              </div>
            ))}
            {pendingWithdrawals.length === 0 && <p className="text-slate-400">No hay retiros pendientes.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
