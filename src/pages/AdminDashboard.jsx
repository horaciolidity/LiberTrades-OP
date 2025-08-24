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
  Save,
  Undo2,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const TX_TABLE = 'wallet_transactions';
const fmt = (n, dec = 2) => (Number.isFinite(Number(n)) ? Number(n).toFixed(dec) : (0).toFixed(dec));
const pct = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '0.00');

const DEFAULT_KEYS = [
  // PLANES
  'plans.default_daily_return_pct',
  'plans.withdraw_fee_pct',
  // BOTS
  'bots.profit_share_pct',
  // REFERIDOS
  'referrals.level1_pct',
  'referrals.level2_pct',
  // PROYECTOS TOKENIZADOS
  'projects.issuance_fee_pct',
  'projects.secondary_market_fee_pct',
  // TRADING
  'trading.slippage_pct_max',
];

const DEFAULT_VALUES = {
  'plans.default_daily_return_pct': 1.2,
  'plans.withdraw_fee_pct': 6.0,
  'bots.profit_share_pct': 30.0,
  'referrals.level1_pct': 5.0,
  'referrals.level2_pct': 2.0,
  'projects.issuance_fee_pct': 1.0,
  'projects.secondary_market_fee_pct': 0.5,
  'trading.slippage_pct_max': 0.2,
};

export default function AdminDashboard() {
  const { user: authUser, refreshBalances } = useAuth();
  const [loading, setLoading] = useState(true);

  // -------- settings --------
  const [settings, setSettings] = useState({});
  const [settingsOriginal, setSettingsOriginal] = useState({});
  const [savingAll, setSavingAll] = useState(false);

  // -------- usuarios / tx --------
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

  // -------- mercado --------
  const [instruments, setInstruments] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [rules, setRules] = useState([]);

  // forms (UI puede tener más campos que tu DB; sólo enviaremos a la DB los válidos)
  const [instForm, setInstForm] = useState({
    symbol: '',
    name: '',
    source: 'binance',               // binance | simulated | manual | real
    binance_symbol: '',              // usado por otras vistas; no existe en DB
    quote: 'USDT',                   // idem
    base_price: '',                  // si manual/simulated
    decimals: 2,
    volatility_bps: 50,              // UI en bps; DB guarda decimal
    difficulty: 'intermediate',      // easy | intermediate | nervous
    enabled: true,
  });

  const [ruleForm, setRuleForm] = useState({
    start_hour: 9,
    end_hour: 12,
    type: 'percent', // 'percent' | 'abs'
    value: 5,
    label: 'Sube en la mañana',
    active: true,
  });

  // ---------- helpers ----------
  const buildUserMap = async (userIds) => {
    const ids = Array.from(new Set(userIds)).filter(Boolean);
    if (ids.length === 0) return {};
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, username')
      .in('id', ids);
    if (error) return {};
    const map = {};
    (data || []).forEach((p) => {
      map[p.id] = { email: p.email || '', username: p.username || '' };
    });
    return map;
  };

  const BOUNDS = {
    // PLANES
    'plans.default_daily_return_pct': [0, 10],
    'plans.withdraw_fee_pct': [0, 20],
    // BOTS
    'bots.profit_share_pct': [0, 100],
    // REFERIDOS
    'referrals.level1_pct': [0, 100],
    'referrals.level2_pct': [0, 100],
    // PROYECTOS
    'projects.issuance_fee_pct': [0, 10],
    'projects.secondary_market_fee_pct': [0, 10],
    // TRADING
    'trading.slippage_pct_max': [0, 5],
  };

  const parseNum = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s.length) return null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const inBounds = (key, n) => {
    const [min, max] = BOUNDS[key] || [-Infinity, Infinity];
    return n >= min && n <= max;
  };

  // ---------- SETTINGS: fetch / save ----------
  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.rpc('get_admin_settings', { prefix: null });
      if (error) throw error;

      // partimos de defaults
      const map = { ...DEFAULT_VALUES };
      for (const row of (data || [])) {
        const k = row.setting_key;
        const n = parseNum(row.setting_value);
        if (n === null) continue;          // ignoramos nulos/blank
        map[k] = n;                        // sobreescribe si es válido
      }
      setSettings(map);
      setSettingsOriginal(map);
    } catch (e) {
      console.error(e);
      toast({ title: 'No se pudieron cargar los ajustes', description: e.message, variant: 'destructive' });
    }
  };

  const saveSetting = async (key, value) => {
    const n = parseNum(value);
    if (n === null) {
      toast({ title: 'Valor inválido', description: 'Debes ingresar un número', variant: 'destructive' });
      return;
    }
    if (!inBounds(key, n)) {
      const [min, max] = BOUNDS[key] || [];
      toast({ title: 'Fuera de rango', description: `Permitido: ${min ?? '-∞'} a ${max ?? '+∞'}`, variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.rpc('set_admin_setting', { p_key: key, p_value: n, p_note: null });
      if (error) throw error;
      toast({ title: 'Ajuste guardado', description: `${key}: ${pct(n)}%` });
      setSettingsOriginal((o) => ({ ...o, [key]: n }));
    } catch (e) {
      console.error(e);
      toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' });
    }
  };

  const saveAllSettings = async () => {
    setSavingAll(true);
    try {
      const entries = Object.entries(settings).filter(([k]) => DEFAULT_KEYS.includes(k));
      for (const [k, v] of entries) {
        const n = parseNum(v);
        if (n === null || !inBounds(k, n)) {
          const [min, max] = BOUNDS[k] || [];
          throw new Error(`Clave "${k}" inválida. Debe ser número${min !== undefined ? ` entre ${min} y ${max}` : ''}.`);
        }
      }
      for (const [k, v] of entries) {
        const n = Number(v);
        const { error } = await supabase.rpc('set_admin_setting', { p_key: k, p_value: n, p_note: 'bulk' });
        if (error) throw error;
      }
      toast({ title: 'Configuración guardada', description: 'Se aplicaron todos los cambios.' });
      setSettingsOriginal(settings);
    } catch (e) {
      console.error(e);
      toast({ title: 'Fallo guardando', description: e.message, variant: 'destructive' });
    } finally {
      setSavingAll(false);
    }
  };

  const revertSettings = () => {
    setSettings(settingsOriginal);
    toast({ title: 'Cambios descartados' });
  };

  // ---------- fetchers ----------
  const fetchUsers = async () => {
    const { data: profs, error: pErr } = await supabase
      .from('profiles')
      .select('id, email, username, role, created_at')
      .order('created_at', { ascending: false });
    if (pErr) throw pErr;

    const { data: bals, error: bErr } = await supabase
      .from('balances')
      .select('user_id, usdc, demo_balance');
    if (bErr) throw bErr;

    const balMap = Object.fromEntries((bals || []).map((b) => [b.user_id, b]));
    const merged = (profs || []).map((p) => ({
      ...p,
      balance: Number(balMap[p.id]?.usdc ?? 0),
      demo_balance: Number(balMap[p.id]?.demo_balance ?? 0),
    }));
    setUsers(merged);
  };

  const fetchPending = async () => {
    const sel = 'id, user_id, amount, type, status, currency, created_at';
    const { data: dep, error: dErr } = await supabase
      .from(TX_TABLE)
      .select(sel)
      .eq('type', 'deposit')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (dErr) throw dErr;

    const { data: wit, error: wErr } = await supabase
      .from(TX_TABLE)
      .select(sel)
      .eq('type', 'withdrawal')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (wErr) throw wErr;

    const ids = [...(dep || []).map((t) => t.user_id), ...(wit || []).map((t) => t.user_id)];
    const userMap = await buildUserMap(ids);

    setPendingDeposits((dep || []).map((t) => ({
      ...t,
      user_email: userMap[t.user_id]?.email || '',
      user_name: userMap[t.user_id]?.username || '',
    })));
    setPendingWithdrawals((wit || []).map((t) => ({
      ...t,
      user_email: userMap[t.user_id]?.email || '',
      user_name: userMap[t.user_id]?.username || '',
    })));
  };

  const fetchMetrics = async (usersList, depList, witList) => {
    const fromISO = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: tx30, error } = await supabase
      .from(TX_TABLE)
      .select('amount, type, status, created_at, user_id')
      .gte('created_at', fromISO)
      .eq('status', 'completed');
    if (error) throw error;

    const volume30d = (tx30 || []).reduce((s, t) => s + Number(t.amount || 0), 0);
    const activeUserIds = new Set((tx30 || []).map((t) => t.user_id));
    const activeUsers30d = usersList.filter((u) => activeUserIds.has(u.id)).length;

    setMetrics({
      totalUsers: usersList.length,
      pendingDeposits: depList.length,
      pendingWithdrawals: witList.length,
      volume30d,
      activeUsers30d,
    });
  };

  const fetchInstruments = async () => {
    const { data, error } = await supabase
      .from('market_instruments')
      .select('*')
      .order('symbol', { ascending: true });
    if (error) throw error;
    setInstruments(data || []);
    if (!selectedSymbol && (data || []).length) setSelectedSymbol(data[0].symbol);
  };

  const fetchRulesForSymbol = async (symbol) => {
    if (!symbol) return setRules([]);
    const { data, error } = await supabase
      .from('market_rules')
      .select('*')
      .eq('symbol', symbol)
      .order('start_hour', { ascending: true });
    if (error) throw error;
    setRules(data || []);
  };

  const reloadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchSettings(), fetchUsers(), fetchPending(), fetchInstruments()]);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error cargando datos', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reloadAll(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { fetchMetrics(users, pendingDeposits, pendingWithdrawals).catch(() => {}); }, [users, pendingDeposits, pendingWithdrawals]);
  useEffect(() => { fetchRulesForSymbol(selectedSymbol).catch(() => {}); }, [selectedSymbol]);

  // ---------- CRUD instrumentos ----------
  const addInstrument = async () => {
    try {
      const payload = {
        // SOLO columnas existentes en tu tabla:
        symbol: (instForm.symbol || '').trim().toUpperCase(),
        name: (instForm.name || '').trim(),
        source: instForm.source, // texto libre en tu esquema actual
        base_price: instForm.source === 'binance'
          ? 0 // NOT NULL en DB: si es binance, dejamos 0 (se actualizará por feed externo)
          : (instForm.base_price === '' ? 0 : Number(instForm.base_price)),
        decimals: Number(instForm.decimals || 2),
        volatility: Number(instForm.volatility_bps || 50) / 10_000, // 50 bps -> 0.005
        difficulty: instForm.difficulty,
        enabled: !!instForm.enabled,
      };

      if (!payload.symbol || !payload.name) {
        toast({ title: 'Faltan datos', description: 'Símbolo y nombre son obligatorios.', variant: 'destructive' });
        return;
      }
      // Si querés exigir par de Binance en modo binance (aunque no se guarda en DB)
      if (instForm.source === 'binance' && !instForm.binance_symbol.trim()) {
        toast({ title: 'Falta par de Binance', description: 'Ej: BTCUSDT', variant: 'destructive' });
        return;
      }

      const { error } = await supabase.from('market_instruments').insert(payload);
      if (error) throw error;

      toast({ title: 'Cripto agregada', description: `${payload.symbol} creada.` });

      // reset del form (manteniendo opciones por defecto)
      setInstForm({
        symbol: '',
        name: '',
        source: 'binance',
        binance_symbol: '',
        quote: 'USDT',
        base_price: '',
        decimals: 2,
        volatility_bps: 50,
        difficulty: 'intermediate',
        enabled: true,
      });

      await fetchInstruments();
      setSelectedSymbol(payload.symbol);
    } catch (e) {
      toast({ title: 'No se pudo crear', description: e.message, variant: 'destructive' });
    }
  };

  const updateInstrument = async (symbol, patch) => {
    try {
      // patch debe contener SOLO columnas reales (p.ej. { enabled: true })
      const { error } = await supabase.from('market_instruments').update(patch).eq('symbol', symbol);
      if (error) throw error;
      toast({ title: 'Cripto actualizada', description: symbol });
      await fetchInstruments();
    } catch (e) {
      toast({ title: 'No se pudo actualizar', description: e.message, variant: 'destructive' });
    }
  };

  const removeInstrument = async (symbol) => {
    try {
      await supabase.from('market_rules').delete().eq('symbol', symbol);
      const { error } = await supabase.from('market_instruments').delete().eq('symbol', symbol);
      if (error) throw error;
      toast({ title: 'Cripto eliminada', description: symbol });
      await fetchInstruments();
      if (selectedSymbol === symbol) { setSelectedSymbol(''); setRules([]); }
    } catch (e) {
      toast({ title: 'No se pudo eliminar', description: e.message, variant: 'destructive' });
    }
  };

  // ---------- CRUD reglas ----------
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
        type: ruleForm.type, // 'percent' | 'abs'
        value: Number(ruleForm.value || 0),
        label: ruleForm.label?.trim() || null,
        active: !!ruleForm.active,
      };
      if (!Number.isFinite(payload.start_hour) || !Number.isFinite(payload.end_hour) || payload.start_hour < 0 || payload.start_hour > 23 || payload.end_hour < 0 || payload.end_hour > 23) {
        toast({ title: 'Horas inválidas', description: '0..23', variant: 'destructive' });
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

  // ---------- métricas ----------
  const maybeRefreshSelf = async (affectedUserId) => {
    if (authUser?.id && authUser.id === affectedUserId && typeof refreshBalances === 'function') {
      await refreshBalances();
    }
  };

  const adjustBalance = async (userId, deltaStr) => {
    const delta = Number(deltaStr);
    if (!deltaStr || !Number.isFinite(delta)) {
      toast({ title: 'Monto inválido', description: 'Ingresa +100 o -50', variant: 'destructive' });
      return;
    }
    try {
      const { data: row, error: gErr } = await supabase.from('balances').select('usdc').eq('user_id', userId).single();
      if (gErr) throw gErr;
      const current = Number(row?.usdc || 0);
      const newUsdc = current + delta;
      if (newUsdc < 0) {
        toast({ title: 'Saldo insuficiente', description: 'No puedes dejar el saldo negativo', variant: 'destructive' });
        return;
      }

      const { error: uErr } = await supabase.from('balances').update({ usdc: newUsdc, updated_at: new Date().toISOString() }).eq('user_id', userId);
      if (uErr) throw uErr;

      // TIPOS válidos en tu CHECK: deposit|withdrawal|plan_purchase|admin_credit|refund|fee|transfer|other
      const positive = delta >= 0;
      const insertTx = {
        user_id: userId,
        type: positive ? 'admin_credit' : 'admin_debit',
        amount: Math.abs(delta),
        status: 'completed',
        currency: 'USDC',
        description: positive ? 'Ajuste admin (+)' : 'Ajuste admin (-)',
      };
      const { error: tErr } = await supabase.from(TX_TABLE).insert(insertTx);
      if (tErr) throw tErr;

      toast({ title: 'Balance actualizado', description: `Nuevo saldo: $${fmt(newUsdc)}` });
      await maybeRefreshSelf(userId);
      await reloadAll();
      setAdjustValues((v) => ({ ...v, [userId]: '' }));
    } catch (e) {
      console.error(e);
      toast({ title: 'Error ajustando balance', description: e.message, variant: 'destructive' });
    }
  };

  const approveDeposit = async (tx) => {
    try {
      // 1) Intento vía RPC segura (si la creamos): approve_deposit_v2(p_tx_id)
      const { data: rpcData, error: rpcErr } = await supabase.rpc('approve_deposit_v2', { p_tx_id: tx.id });
      if (!rpcErr && rpcData?.ok) {
        toast({ title: 'Depósito aprobado', description: `Acreditado $${fmt(tx.amount)}` });
        await maybeRefreshSelf(tx.user_id);
        await reloadAll();
        return;
      }
      // 2) Fallback: método actual (update + balance)
      const { data: balRow, error: gErr } = await supabase.from('balances').select('usdc').eq('user_id', tx.user_id).single();
      if (gErr) throw gErr;
      const newUsdc = Number(balRow?.usdc || 0) + Number(tx.amount || 0);

      const { error: bErr } = await supabase.from('balances').update({ usdc: newUsdc, updated_at: new Date().toISOString() }).eq('user_id', tx.user_id);
      if (bErr) throw bErr;

      const { error: tErr } = await supabase.from(TX_TABLE).update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', tx.id);
      if (tErr) throw tErr;

      toast({ title: 'Depósito aprobado (fallback)', description: `Acreditado $${fmt(tx.amount)}` });
      await maybeRefreshSelf(tx.user_id);
      await reloadAll();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error aprobando depósito', description: e.message, variant: 'destructive' });
    }
  };

  const approveWithdrawal = async (tx) => {
    try {
      const { data: balRow, error: gErr } = await supabase.from('balances').select('usdc').eq('user_id', tx.user_id).single();
      if (gErr) throw gErr;
      const current = Number(balRow?.usdc || 0);
      const amt = Number(tx.amount || 0);
      if (current < amt) {
        toast({ title: 'Saldo insuficiente', description: 'No alcanza para aprobar', variant: 'destructive' });
        return;
      }
      const { error: bErr } = await supabase.from('balances').update({ usdc: current - amt, updated_at: new Date().toISOString() }).eq('user_id', tx.user_id);
      if (bErr) throw bErr;

      const { error: tErr } = await supabase.from(TX_TABLE).update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', tx.id);
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
      const { error } = await supabase.from(TX_TABLE).update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', tx.id);
      if (error) throw error;
      toast({ title: 'Solicitud rechazada' });
      await reloadAll();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ---------- filtros ----------
  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.id || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  // ---------- preview 24h ----------
  const selectedInst = instruments.find((i) => i.symbol === selectedSymbol);
  const previewData = useMemo(() => {
    if (!selectedInst) return [];
    const base = Number(selectedInst.base_price || 0);
    const dec = Number(selectedInst.decimals || 2);
    const list = [];
    for (let h = 0; h < 24; h++) {
      let price = base || 0;
      const hits = rules.filter(
        (r) =>
          r.active &&
          ((r.start_hour < r.end_hour && h >= r.start_hour && h < r.end_hour) ||
            (r.start_hour > r.end_hour && (h >= r.start_hour || h < r.end_hour)))
      );
      hits.forEach((r) => {
        if (r.type === 'percent') price *= 1 + Number(r.value || 0) / 100;
        else price += Number(r.value || 0); // 'abs'
      });
      list.push({ hour: `${String(h).padStart(2, '0')}:00`, price: Number(price.toFixed(dec)) });
    }
    return list;
  }, [rules, selectedInst]);

  // ---------- render ----------
  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
          <RefreshCw className="h-8 w-8 mr-3 text-cyan-400" />
          Panel de Administración
        </h1>
        <p className="text-slate-300">Métricas, usuarios, depósitos/retiros, mercado y configuración.</p>
      </motion.div>

      {/* Configuración (%) */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Settings className="h-5 w-5 mr-2 text-cyan-400" />
            Configuración (%)
          </CardTitle>
          <CardDescription className="text-slate-300">
            Define porcentajes para planes, bots, referidos, proyectos y trading. (Sólo admins)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={revertSettings}>
              <Undo2 className="h-4 w-4 mr-2" /> Descartar cambios
            </Button>
            <Button onClick={saveAllSettings} disabled={savingAll} className="bg-gradient-to-r from-green-500 to-blue-500">
              <Save className="h-4 w-4 mr-2" /> Guardar todo
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* PLANES */}
            <SettingItem
              label="Planes: Retorno diario (%)"
              k="plans.default_daily_return_pct"
              value={settings['plans.default_daily_return_pct']}
              onChange={(v) => setSettings((s) => ({ ...s, 'plans.default_daily_return_pct': v }))}
              onSave={() => saveSetting('plans.default_daily_return_pct', settings['plans.default_daily_return_pct'])}
            />
            <SettingItem
              label="Planes: Fee de retiro (%)"
              k="plans.withdraw_fee_pct"
              value={settings['plans.withdraw_fee_pct']}
              onChange={(v) => setSettings((s) => ({ ...s, 'plans.withdraw_fee_pct': v }))}
              onSave={() => saveSetting('plans.withdraw_fee_pct', settings['plans.withdraw_fee_pct'])}
            />

            {/* BOTS */}
            <SettingItem
              label="Bots: Profit share (%)"
              k="bots.profit_share_pct"
              value={settings['bots.profit_share_pct']}
              onChange={(v) => setSettings((s) => ({ ...s, 'bots.profit_share_pct': v }))}
              onSave={() => saveSetting('bots.profit_share_pct', settings['bots.profit_share_pct'])}
            />

            {/* REFERIDOS */}
            <SettingItem
              label="Referrals: Nivel 1 (%)"
              k="referrals.level1_pct"
              value={settings['referrals.level1_pct']}
              onChange={(v) => setSettings((s) => ({ ...s, 'referrals.level1_pct': v }))}
              onSave={() => saveSetting('referrals.level1_pct', settings['referrals.level1_pct'])}
            />
            <SettingItem
              label="Referrals: Nivel 2 (%)"
              k="referrals.level2_pct"
              value={settings['referrals.level2_pct']}
              onChange={(v) => setSettings((s) => ({ ...s, 'referrals.level2_pct': v }))}
              onSave={() => saveSetting('referrals.level2_pct', settings['referrals.level2_pct'])}
            />

            {/* PROYECTOS */}
            <SettingItem
              label="Proyectos: Emisión (%)"
              k="projects.issuance_fee_pct"
              value={settings['projects.issuance_fee_pct']}
              onChange={(v) => setSettings((s) => ({ ...s, 'projects.issuance_fee_pct': v }))}
              onSave={() => saveSetting('projects.issuance_fee_pct', settings['projects.issuance_fee_pct'])}
            />
            <SettingItem
              label="Proyectos: Mercado secundario (%)"
              k="projects.secondary_market_fee_pct"
              value={settings['projects.secondary_market_fee_pct']}
              onChange={(v) => setSettings((s) => ({ ...s, 'projects.secondary_market_fee_pct': v }))}
              onSave={() => saveSetting('projects.secondary_market_fee_pct', settings['projects.secondary_market_fee_pct'])}
            />

            {/* TRADING */}
            <SettingItem
              label="Trading: Slippage máx. (%)"
              k="trading.slippage_pct_max"
              value={settings['trading.slippage_pct_max']}
              onChange={(v) => setSettings((s) => ({ ...s, 'trading.slippage_pct_max': v }))}
              onSave={() => saveSetting('trading.slippage_pct_max', settings['trading.slippage_pct_max'])}
            />
          </div>
        </CardContent>
      </Card>

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

      {/* Mercado */}
      <Card className="crypto-card">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Settings className="h-5 w-5 mr-2 text-cyan-400" />
            Mercado (Trade): Criptomonedas y Reglas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Lista instrumentos */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold">Criptomonedas</h3>
                <div className="flex items-center gap-2">
                  <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                    <SelectTrigger className="w-[180px] bg-slate-800 text-white border-slate-700">
                      <SelectValue placeholder="Seleccionar símbolo" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 text-white border-slate-700">
                      {instruments.map((i) => (
                        <SelectItem key={i.symbol} value={i.symbol}>
                          {i.symbol}
                        </SelectItem>
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
                      <th className="text-left py-2">Fuente</th>
                      <th className="text-left py-2">Par Binance</th>
                      <th className="text-left py-2">Quote</th>
                      <th className="text-right py-2">Base</th>
                      <th className="text-right py-2">Dec</th>
                      <th className="text-right py-2">Vol (bps)</th>
                      <th className="text-left py-2">Dif.</th>
                      <th className="text-center py-2">Activo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instruments.map((i) => (
                      <tr key={i.symbol} className="border-b border-slate-800/60">
                        <td className="py-2 text-white">{i.symbol}</td>
                        <td className="py-2 text-slate-300">{i.name}</td>
                        <td className="py-2 text-slate-300">{i.source}</td>
                        <td className="py-2 text-slate-300">{i.binance_symbol || '—'}</td>
                        <td className="py-2 text-slate-300">{i.quote || 'USDT'}</td>
                        <td className="py-2 text-right text-slate-200">
                          {i.base_price ? `$${fmt(i.base_price, i.decimals)}` : '—'}
                        </td>
                        <td className="py-2 text-right text-slate-300">{i.decimals}</td>
                        <td className="py-2 text-right text-slate-300">
                          {Number.isFinite(Number(i.volatility))
                            ? Math.round(Number(i.volatility) * 10000)
                            : '—'}
                        </td>
                        <td className="py-2 text-slate-300">{i.difficulty || '—'}</td>
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
                      <tr>
                        <td colSpan="10" className="py-6 text-center text-slate-400">
                          Sin criptomonedas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Alta instrumento */}
            <div>
              <h3 className="text-white font-semibold mb-2">Agregar cripto</h3>
              <div className="space-y-3">
                <Input
                  placeholder="Símbolo (BTC)"
                  className="bg-slate-800 border-slate-600 text-white"
                  value={instForm.symbol}
                  onChange={(e) => setInstForm((v) => ({ ...v, symbol: e.target.value }))}
                />
                <Input
                  placeholder="Nombre (Bitcoin)"
                  className="bg-slate-800 border-slate-600 text-white"
                  value={instForm.name}
                  onChange={(e) => setInstForm((v) => ({ ...v, name: e.target.value }))}
                />

                <Select value={instForm.source} onValueChange={(val) => setInstForm((v) => ({ ...v, source: val }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="Fuente" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 text-white border-slate-700">
                    <SelectItem value="real">Real (Binance)</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>

                {instForm.source === 'binance' && (
                  <Input
                    placeholder="Par Binance (BTCUSDT)"
                    className="bg-slate-800 border-slate-600 text-white"
                    value={instForm.binance_symbol}
                    onChange={(e) => setInstForm((v) => ({ ...v, binance_symbol: e.target.value }))}
                  />
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Quote (USDT/USDC)"
                    className="bg-slate-800 border-slate-600 text-white"
                    value={instForm.quote}
                    onChange={(e) => setInstForm((v) => ({ ...v, quote: e.target.value }))}
                  />
                  <Input
                    placeholder="Decimales"
                    type="number"
                    className="bg-slate-800 border-slate-600 text-white"
                    value={instForm.decimals}
                    onChange={(e) => setInstForm((v) => ({ ...v, decimals: e.target.value }))}
                  />
                </div>

                {instForm.source !== 'binance' && (
                  <>
                    <Input
                      placeholder="Base price (USD)"
                      type="number"
                      className="bg-slate-800 border-slate-600 text-white"
                      value={instForm.base_price}
                      onChange={(e) => setInstForm((v) => ({ ...v, base_price: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Volatilidad (bps)"
                        type="number"
                        className="bg-slate-800 border-slate-600 text-white"
                        value={instForm.volatility_bps}
                        onChange={(e) => setInstForm((v) => ({ ...v, volatility_bps: e.target.value }))}
                      />
                      <Select value={instForm.difficulty} onValueChange={(val) => setInstForm((v) => ({ ...v, difficulty: val }))}>
                        <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                          <SelectValue placeholder="Dificultad" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 text-white border-slate-700">
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="nervous">Nervous</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <Select value={instForm.enabled ? 'true' : 'false'} onValueChange={(val) => setInstForm((v) => ({ ...v, enabled: val === 'true' }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                    <SelectValue placeholder="Activo" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 text-white border-slate-700">
                    <SelectItem value="true">Activo</SelectItem>
                    <SelectItem value="false">Inactivo</SelectItem>
                  </SelectContent>
                </Select>

                <Button className="w-full bg-gradient-to-r from-green-500 to-blue-500" onClick={addInstrument}>
                  <Plus className="h-4 w-4 mr-2" /> Agregar
                </Button>
              </div>
            </div>
          </div>

          {/* Reglas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <h3 className="text-white font-semibold mb-2">Nueva regla para {selectedSymbol || '—'}</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-slate-400" />
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      placeholder="Start (0-23)"
                      className="bg-slate-800 border-slate-600 text-white"
                      value={ruleForm.start_hour}
                      onChange={(e) => setRuleForm((v) => ({ ...v, start_hour: e.target.value }))}
                    />
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    placeholder="End (0-23)"
                    className="bg-slate-800 border-slate-600 text-white"
                    value={ruleForm.end_hour}
                    onChange={(e) => setRuleForm((v) => ({ ...v, end_hour: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={ruleForm.type} onValueChange={(val) => setRuleForm((v) => ({ ...v, type: val }))}>
                    <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                      <SelectValue placeholder="Tipo efecto" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 text-white border-slate-700">
                      <SelectItem value="percent">Porcentaje</SelectItem>
                      <SelectItem value="abs">Absoluto</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder={ruleForm.type === 'percent' ? '% (ej: -3, 5)' : 'Δ precio (ej: -100, 200)'}
                    className="bg-slate-800 border-slate-600 text-white"
                    value={ruleForm.value}
                    onChange={(e) => setRuleForm((v) => ({ ...v, value: e.target.value }))}
                  />
                </div>
                <Input
                  placeholder="Etiqueta (opcional)"
                  className="bg-slate-800 border-slate-600 text-white"
                  value={ruleForm.label}
                  onChange={(e) => setRuleForm((v) => ({ ...v, label: e.target.value }))}
                />
                <Select value={ruleForm.active ? 'true' : 'false'} onValueChange={(val) => setRuleForm((v) => ({ ...v, active: val === 'true' }))}>
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
                  Las reglas se aplican <b>diariamente</b> en el rango horario (UTC). Si coinciden varias, se acumulan.
                </p>
              </div>
            </div>

            {/* Lista reglas */}
            <div className="lg:col-span-1">
              <h3 className="text-white font-semibold mb-2">Reglas de {selectedSymbol || '—'}</h3>
              <div className="space-y-3">
                {rules.map((r) => (
                  <div key={r.id} className="p-3 bg-slate-800/50 rounded border border-slate-700/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-semibold">
                          {r.label || (r.type === 'percent' ? `${r.value}%` : `${r.value >= 0 ? '+' : ''}${r.value}`)}
                        </p>
                        <p className="text-slate-400 text-xs">
                          {r.start_hour}:00 → {r.end_hour}:00 · {r.type === 'percent' ? (<><Percent className="inline h-3 w-3" /> %</>) : 'Abs'} · {r.active ? 'Activa' : 'Inactiva'}
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
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(30, 41, 59, 0.95)', border: 'none', borderRadius: 8 }} labelStyle={{ color: '#cbd5e1' }} />
                      <Legend />
                      <Line type="monotone" dataKey="price" stroke="#22c55e" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-2 text-xs text-slate-400">
                    Base: <span className="text-slate-200">{selectedInst.base_price ? `$${fmt(selectedInst.base_price, selectedInst.decimals)}` : '—'}</span> ·
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
                {filteredUsers.map((u) => (
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
                          onChange={(e) => setAdjustValues((v) => ({ ...v, [u.id]: e.target.value }))}
                          className="w-28 bg-slate-800 border-slate-600 text-white"
                        />
                        <Button size="sm" onClick={() => adjustBalance(u.id, adjustValues[u.id])} className="bg-gradient-to-r from-green-500 to-teal-500 hover:opacity-90">
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
            {pendingDeposits.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div className="text-sm">
                  <p className="text-white font-medium">
                    Usuario: {tx.user_name || '—'} {tx.user_email ? `(${tx.user_email})` : ''} · <span className="text-slate-500">{tx.user_id}</span>
                  </p>
                  <p className="text-slate-400">
                    Monto: <span className="text-green-400 font-semibold">${fmt(tx.amount)}</span>
                    {tx.currency ? <span className="ml-2 text-slate-500">· {tx.currency}</span> : null}
                  </p>
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
            {pendingWithdrawals.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded">
                <div className="text-sm">
                  <p className="text-white font-medium">
                    Usuario: {tx.user_name || '—'} {tx.user_email ? `(${tx.user_email})` : ''} · <span className="text-slate-500">{tx.user_id}</span>
                  </p>
                  <p className="text-slate-400">
                    Monto: <span className="text-yellow-300 font-semibold">${fmt(tx.amount)}</span>
                    {tx.currency ? <span className="ml-2 text-slate-500">· {tx.currency}</span> : null}
                  </p>
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

/** Item reusable para Configuración (%) */
function SettingItem({ label, k, value, onChange, onSave }) {
  return (
    <div className="p-4 bg-slate-800/50 rounded border border-slate-700/50 space-y-2">
      <p className="text-slate-300 text-sm">{label}</p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="bg-slate-900 border-slate-700 text-white"
          placeholder="0.00"
        />
        <span className="text-slate-400 text-sm">%</span>
        <Button size="sm" onClick={onSave}>
          <Save className="h-4 w-4 mr-1" /> Guardar
        </Button>
      </div>
      <p className="text-[11px] text-slate-500 break-all">{k}</p>
    </div>
  );
}
