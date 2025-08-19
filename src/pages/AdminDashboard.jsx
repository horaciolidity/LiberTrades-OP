// src/pages/AdminDashboard.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import {
  Users as UsersIcon,
  DollarSign,
  Download,
  Upload,
  RefreshCw,
  Search,
  Check,
  X as XIcon,
  Settings,
  Trash2,
  Plus,
  CalendarClock,
  Percent,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const TX_TABLE = 'wallet_transactions';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

export default function AdminDashboard() {
  const { user: authUser, refreshBalances } = useAuth();
  const [loading, setLoading] = useState(true);

  // -------- data existentes --------
  const [users, setUsers] = useState([]);
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [search, setSearch] = useState('');
  const [adjustValues, setAdjustValues] = useState({});
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    volume30d: 0,
    activeUsers30d: 0,
  });

  // -------- NUEVO: Mercado (instrumentos + reglas) --------
  const [instruments, setInstruments] = useState([]); // {id, symbol, name, source, base_price, decimals, volatility, enabled}
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [rules, setRules] = useState([]); // reglas del símbolo seleccionado

  // formularios
  const [instForm, setInstForm] = useState({
    symbol: '',
    name: '',
    source: 'real', // real | manual
    base_price: '',
    decimals: 2,
    volatility: 0.02,
    enabled: true,
  });

  const [ruleForm, setRuleForm] = useState({
    start_hour: 9,
    end_hour: 12,
    type: 'percent', // percent | absolute
    value: 5, // positivo o negativo
    label: 'Sube en la mañana',
    active: true,
  });

  // ------- fetchers existentes -------
  const fetchUsers = async () => {
    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, username, role, created_at')
      .order('created_at', { ascending: false });
    if (pErr) throw pErr;

    const { data: bals, error: bErr } = await supabase
      .from('balances')
      .select('user_id, usdc, demo_balance');
    if (bErr) throw bErr;

    const balMap = Object.fromEntries((bals || []).map(b => [b.user_id, b]));
    const merged = (profs || []).map(p => ({
      ...p,
      email: '',
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
      await Promise.all([fetchUsers(), fetchPending(), fetchInstruments()]);
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

  // ------- NUEVO: instrumentos + reglas -------
  const fetchInstruments = async () => {
    const { data, error } = await supabase
      .from('market_instruments')
      .select('*')
      .order('symbol', { ascending: true });
    if (error) throw error;
    setInstruments(data || []);
    if (!selectedSymbol && (data || []).length) {
      setSelectedSymbol(data[0].symbol);
    }
  };

  const fetchRulesForSymbol = async (symbol) => {
    if (!symbol) { setRules([]); return; }
    const { data, error } = await supabase
      .from('market_rules')
      .select('*')
      .eq('symbol', symbol)
      .order('start_hour', { ascending: true });
    if (error) throw error;
    setRules(data || []);
  };

  useEffect(() => { fetchRulesForSymbol(selectedSymbol).catch(() => {}); }, [selectedSymbol]);

  const addInstrument = async () => {
    try {
      const payload = {
        symbol: instForm.symbol.trim().toUpperCase(),
        name: instForm.name.trim(),
        source: instForm.source,
        base_price: Number(instForm.base_price || 0),
        decimals: Number(instForm.decimals || 2),
        volatility: Number(instForm.volatility || 0),
        enabled: !!instForm.enabled,
      };
      if (!payload.symbol || !payload.name) {
        toast({ title: 'Faltan datos', description: 'Símbolo y nombre son obligatorios.', variant: 'destructive' });
        return;
      }
      const { error } = await supabase.from('market_instruments').insert(payload);
      if (error) throw error;
      toast({ title: 'Cripto agregada', description: `${payload.symbol} creada.` });
      setInstForm({ symbol: '', name: '', source: 'real', base_price: '', decimals: 2, volatility: 0.02, enabled: true });
      await fetchInstruments();
      setSelectedSymbol(payload.symbol);
    } catch (e) {
      toast({ title: 'No se pudo crear', description: e.message, variant: 'destructive' });
    }
  };

  const updateInstrument = async (symbol, patch) => {
    try {
      const { error } = await supabase
        .from('market_instruments')
        .update(patch)
        .eq('symbol', symbol);
      if (error) throw error;
      toast({ title: 'Cripto actualizada', description: symbol });
      await fetchInstruments();
    } catch (e) {
      toast({ title: 'No se pudo actualizar', description: e.message, variant: 'destructive' });
    }
  };

  const removeInstrument = async (symbol) => {
    try {
      await supabase.from('market_rules').delete().eq('symbol', symbol); // limpiar reglas
      const { error } = await supabase.from('market_instruments').delete().eq('symbol', symbol);
      if (error) throw error;
      toast({ title: 'Cripto eliminada', description: symbol });
      await fetchInstruments();
      setSelectedSymbol(prev => (prev === symbol ? '' : prev));
      setRules([]);
    } catch (e) {
      toast({ title: 'No se pudo eliminar', description: e.message, variant: 'destructive' });
    }
  };

  const addRule = async () => {
    try {
      if (!selectedSymbol) {
        toast({ title: 'Selecciona una cripto', variant: 'destructive' });
        return;
      }
      const payload = {
        symbol: selectedSymbol,
        start_hour: Number(ruleForm.start_hour),
        end_hour: Number(ruleForm.end_hour),
        type: ruleForm.type, // percent | absolute
        value: Number(ruleForm.value || 0), // puede ser negativo
        label: ruleForm.label?.trim() || null,
        active: !!ruleForm.active,
      };
      if (payload.end_hour === payload.start_hour) {
        toast({ title: 'Rango inválido', description: 'start_hour y end_hour no pueden ser iguales.', variant: 'destructive' });
        return;
      }
      const { error } = await supabase.from('market_rules').insert(payload);
      if (error) throw error;
      toast({ title: 'Regla creada', description: payload.label || `${payload.type} ${payload.value}` });
      await fetchRulesForSymbol(selectedSymbol);
    } catch (e) {
      toast({ title: 'No se pudo crear la regla', description: e.message, variant: 'destructive' });
    }
  };

  const updateRule = async (id, patch) => {
    try {
      const { error } = await supabase.from('market_rules').update(patch).eq('id', id);
      if (error) throw error;
      toast({ title: 'Regla actualizada' });
      await fetchRulesForSymbol(selectedSymbol);
    } catch (e) {
      toast({ title: 'No se pudo actualizar la regla', description: e.message, variant: 'destructive' });
    }
  };

  const removeRule = async (id) => {
    try {
      const { error } = await supabase.from('market_rules').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Regla eliminada' });
      await fetchRulesForSymbol(selectedSymbol);
    } catch (e) {
      toast({ title: 'No se pudo eliminar', description: e.message, variant: 'destructive' });
    }
  };

  // ------- Preview 24h del precio (aplicando reglas) -------
  const selectedInst = instruments.find(i => i.symbol === selectedSymbol);
  const previewData = useMemo(() => {
    if (!selectedInst) return [];
    const base = Number(selectedInst.base_price || 0);
    const dec = Number(selectedInst.decimals || 2);
    const list = [];
    for (let h = 0; h < 24; h++) {
      let price = base;
      // aplicar reglas activas que incluyan la hora h
      const hits = rules.filter(r => r.active && (
        (r.start_hour < r.end_hour && h >= r.start_hour && h < r.end_hour) ||
        (r.start_hour > r.end_hour && (h >= r.start_hour || h < r.end_hour)) // rango que cruza medianoche
      ));
      hits.forEach(r => {
        if (r.type === 'percent') {
          price = price * (1 + Number(r.value || 0) / 100);
        } else {
          price = price + Number(r.value || 0);
        }
      });
      list.push({ hour: `${h.toString().padStart(2, '0')}:00`, price: Number(price.toFixed(dec)) });
    }
    return list;
  }, [rules, selectedInst]);

  // ------- acciones admin existentes -------
  const maybeRefreshSelf = async (affectedUserId) => {
    if (authUser?.id && authUser.id === affectedUserId && typeof refreshBalances === 'function') {
      await refreshBalances();
    }
  };

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

      await maybeRefreshSelf(userId);
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

      await maybeRefreshSelf(tx.user_id);
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

      await maybeRefreshSelf(tx.user_id);
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

  // ------- filtros usuarios -------
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

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
          <RefreshCw className="h-8 w-8 mr-3 text-cyan-400" />
          Panel de Administración
        </h1>
        <p className="text-slate-300">Métricas, usuarios, depósitos/retiros y mercado (trade).</p>
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

      {/* NUEVO: Mercado (Trade) */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Settings className="h-5 w-5 mr-2 text-cyan-400" />
            Mercado (Trade): Criptomonedas y Reglas
          </CardTitle>
          <CardDescription className="text-slate-300">
            Agrega/edita monedas, programa horarios para subir o bajar el precio y visualiza un preview.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Gestión de instrumentos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lista de instrumentos */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Criptomonedas</h3>
                <div className="flex items-center gap-2">
                  <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                    <SelectTrigger className="w-[180px] bg-slate-800 text-white border-slate-700">
                      <SelectValue placeholder="Seleccionar símbolo" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 text-white border-slate-700">
                      {instruments.map(i => (
                        <SelectItem key={i.symbol} value={i.symbol}>{i.symbol}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedSymbol && (
                    <Button variant="outline" onClick={() => removeInstrument(selectedSymbol)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                    </Button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-300">
                      <th className="text-left py-2">Símbolo</th>
                      <th className="text-left py-2">Nombre</th>
                      <th className="text-right py-2">Base</th>
                      <th className="text-left py-2">Fuente</th>
                      <th className="text-right py-2">Dec</th>
                      <th className="text-right py-2">Vol</th>
                      <th className="text-center py-2">Activo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instruments.map(i => (
                      <tr key={i.symbol} className="border-b border-slate-800/60">
                        <td className="py-2 text-white">{i.symbol}</td>
                        <td className="py-2 text-slate-300">{i.name}</td>
                        <td className="py-2 text-right text-slate-200">${fmt(i.base_price, i.decimals)}</td>
                        <td className="py-2 text-slate-300">{i.source}</td>
                        <td className="py-2 text-right text-slate-300">{i.decimals}</td>
                        <td className="py-2 text-right text-slate-300">{fmt(i.volatility, 4)}</td>
                        <td className="py-2 text-center">
                          <Button
                            size="sm"
                            variant={i.enabled ? 'default' : 'outline'}
                            onClick={() => updateInstrument(i.symbol, { enabled: !i.enabled })}
                          >
                            {i.enabled ? 'ON' : 'OFF'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {instruments.length === 0 && (
                      <tr><td colSpan="7" className="py-6 text-center text-slate-400">Sin criptomonedas.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Alta / edición simple */}
            <div>
              <h3 className="text-white font-semibold mb-2">Agregar cripto</h3>
              <div className="space-y-3">
                <Input placeholder="Símbolo (p.ej. BTC)" className="bg-slate-800 border-slate-600 text-white"
                  value={instForm.symbol} onChange={(e) => setInstForm(v => ({ ...v, symbol: e.target.value }))} />
                <Input placeholder="Nombre (Bitcoin)" className="bg-slate-800 border-slate-600 text-white"
                  value={instForm.name} onChange={(e) => setInstForm(v => ({ ...v, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={instForm.source} onValueChange={(val) => setInstForm(v => ({ ...v, source: val }))}>
                    <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                      <SelectValue placeholder="Fuente" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 text-white border-slate-700">
                      <SelectItem value="real">Real</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Base price (USD)" type="number" className="bg-slate-800 border-slate-600 text-white"
                    value={instForm.base_price} onChange={(e) => setInstForm(v => ({ ...v, base_price: e.target.value }))} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Decimales" type="number" className="bg-slate-800 border-slate-600 text-white"
                    value={instForm.decimals} onChange={(e) => setInstForm(v => ({ ...v, decimals: e.target.value }))} />
                  <Input placeholder="Volatilidad" type="number" className="bg-slate-800 border-slate-600 text-white"
                    value={instForm.volatility} onChange={(e) => setInstForm(v => ({ ...v, volatility: e.target.value }))} />
                  <Select value={instForm.enabled ? 'true' : 'false'} onValueChange={(val) => setInstForm(v => ({ ...v, enabled: val === 'true' }))}>
                    <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                      <SelectValue placeholder="Activo" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 text-white border-slate-700">
                      <SelectItem value="true">Activo</SelectItem>
                      <SelectItem value="false">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full bg-gradient-to-r from-green-500 to-blue-500" onClick={addInstrument}>
                  <Plus className="h-4 w-4 mr-2" /> Agregar
                </Button>
              </div>
            </div>
          </div>

          {/* Reglas por horario */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form regla */}
            <div>
              <h3 className="text-white font-semibold mb-2">Nueva regla para {selectedSymbol || '—'}</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-slate-400" />
                    <Input type="number" min={0} max={23} placeholder="Start (0-23)" className="bg-slate-800 border-slate-600 text-white"
                      value={ruleForm.start_hour}
                      onChange={(e) => setRuleForm(v => ({ ...v, start_hour: e.target.value }))} />
                  </div>
                  <Input type="number" min={0} max={23} placeholder="End (0-23)" className="bg-slate-800 border-slate-600 text-white"
                    value={ruleForm.end_hour}
                    onChange={(e) => setRuleForm(v => ({ ...v, end_hour: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={ruleForm.type} onValueChange={(val) => setRuleForm(v => ({ ...v, type: val }))}>
                    <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                      <SelectValue placeholder="Tipo efecto" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 text-white border-slate-700">
                      <SelectItem value="percent">Porcentaje</SelectItem>
                      <SelectItem value="absolute">Absoluto</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder={ruleForm.type === 'percent' ? '% (p.ej. -3, 5)' : 'Δ precio (p.ej. -100, 200)'}
                    className="bg-slate-800 border-slate-600 text-white"
                    value={ruleForm.value}
                    onChange={(e) => setRuleForm(v => ({ ...v, value: e.target.value }))} />
                </div>
                <Input placeholder="Etiqueta (opcional)" className="bg-slate-800 border-slate-600 text-white"
                  value={ruleForm.label} onChange={(e) => setRuleForm(v => ({ ...v, label: e.target.value }))} />
                <Select value={ruleForm.active ? 'true' : 'false'} onValueChange={(val) => setRuleForm(v => ({ ...v, active: val === 'true' }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="Activa" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 text-white border-slate-700">
                    <SelectItem value="true">Activa</SelectItem>
                    <SelectItem value="false">Inactiva</SelectItem>
                  </SelectContent>
                </Select>
                <Button disabled={!selectedSymbol} className="w-full bg-gradient-to-r from-green-500 to-blue-500" onClick={addRule}>
                  <Plus className="h-4 w-4 mr-2" /> Agregar regla
                </Button>
                <p className="text-[11px] text-slate-400">
                  Las reglas se aplican <b>diariamente</b> dentro del rango horario indicado (UTC). Si varias reglas coinciden, sus efectos se acumulan.
                </p>
              </div>
            </div>

            {/* Lista reglas */}
            <div className="lg:col-span-1">
              <h3 className="text-white font-semibold mb-2">Reglas de {selectedSymbol || '—'}</h3>
              <div className="space-y-3">
                {rules.map(r => (
                  <div key={r.id} className="p-3 bg-slate-800/50 rounded border border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-semibold">
                          {r.label || (r.type === 'percent' ? `${r.value}%` : `${r.value >= 0 ? '+' : ''}${r.value}`)}
                        </p>
                        <p className="text-slate-400 text-xs">
                          {r.start_hour}:00 → {r.end_hour}:00 · {r.type === 'percent' ? <><Percent className="inline h-3 w-3" /> %</> : 'Abs'} · {r.active ? 'Activa' : 'Inactiva'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => updateRule(r.id, { active: !r.active })}>
                          {r.active ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => removeRule(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {rules.length === 0 && <p className="text-slate-400">No hay reglas.</p>}
              </div>
            </div>

            {/* Preview */}
            <div className="lg:col-span-1">
              <h3 className="text-white font-semibold mb-2">Preview 24 h</h3>
              {selectedInst ? (
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={previewData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', border: 'none', borderRadius: 8 }}
                        labelStyle={{ color: '#cbd5e1' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="price" stroke="#22c55e" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-2 text-xs text-slate-400">
                    Base: <span className="text-slate-200">${fmt(selectedInst.base_price, selectedInst.decimals)}</span> ·
                    Fuente: <span className="text-slate-200">{selectedInst.source}</span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400">Selecciona una cripto.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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
              placeholder="Buscar por usuario o id…"
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
