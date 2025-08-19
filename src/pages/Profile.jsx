// src/pages/Profile.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Bell, Shield, TrendingUp, Users, Wallet, Bot, Copy, Camera, Trash2, Save } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PersonalInfoTab from '@/components/profile/PersonalInfoTab';
import SecurityTab from '@/components/profile/SecurityTab';
import NotificationsTab from '@/components/profile/NotificationsTab';
import PreferencesTab from '@/components/profile/PreferencesTab';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

// helpers
const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};
const arr = (v) => (Array.isArray(v) ? v : []);

function getInitialAvatar(profile, user) {
  return profile?.avatar_url
    || user?.user_metadata?.avatar_url
    || null;
}

export default function Profile() {
  const { user, profile, balances, displayName } = useAuth();
  const {
    investments = [],
    transactions = [],
    referrals = [],
    botActivations = [],
    refreshInvestments,
    refreshTransactions,
    refreshReferrals,
    refreshBotActivations,
  } = useData() || {};

  // ---------- Estado local para UI reactiva ----------
  const [avatarUrl, setAvatarUrl] = useState(() => getInitialAvatar(profile, user));
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [name, setName] = useState(profile?.full_name || displayName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef(null);

  const uid = user?.id;
  const verified = !!(user?.email_confirmed_at || user?.confirmed_at);
  const role =
    profile?.role ||
    user?.user_metadata?.role ||
    (user?.email === 'admin@test.com' ? 'admin' : 'user');

  // ---------- Derivados para overview ----------
  useEffect(() => {
    if (!user?.id) return;
    refreshInvestments?.();
    refreshTransactions?.();
    refreshReferrals?.();
    refreshBotActivations?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const userInvs = useMemo(() => arr(investments).filter(i => (i.user_id ?? i.userId) === uid), [investments, uid]);
  const userTx   = useMemo(() => arr(transactions).filter(t => (t.user_id ?? t.userId) === uid), [transactions, uid]);
  const userBots = useMemo(() => arr(botActivations).filter(b => (b.user_id ?? b.userId) === uid), [botActivations, uid]);

  const activeInvs = userInvs.filter(i => (i.status ?? 'active') === 'active');
  const totalInvested = activeInvs.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  const totalEarnings = activeInvs.reduce((sum, inv) => {
    const created = new Date(inv.created_at ?? inv.createdAt ?? Date.now());
    const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)));
    const dur = Number(inv.duration ?? 0);
    const dReturn = Number(inv.daily_return ?? inv.dailyReturn ?? 0) / 100;
    const effectiveDays = Math.min(days, dur);
    return sum + Number(inv.amount ?? 0) * dReturn * effectiveDays;
  }, 0);
  const depositsCompleted = userTx
    .filter(t => (t.type ?? '').toLowerCase() === 'deposit' && (t.status ?? '').toLowerCase() === 'completed')
    .length;
  const botsActive = userBots.filter(b => (b.status ?? '').toLowerCase() === 'active').length;
  const referralsCount = arr(referrals).length;

  // barra “energía” (hitos de cuenta)
  const steps = [
    { key: 'email',    done: verified,                         label: 'Email verificado' },
    { key: 'deposit',  done: depositsCompleted > 0,            label: 'Depósito completado' },
    { key: 'invest',   done: activeInvs.length > 0,            label: 'Inversión activa' },
    { key: 'referral', done: referralsCount > 0,               label: 'Primer referido' },
  ];
  const achieved = steps.filter(s => s.done).length;
  const progressPct = Math.round((achieved / steps.length) * 100);

  const referralCode = profile?.referral_code ?? user?.referralCode ?? '';

  // ---------- Avatar: seleccionar / subir ----------
  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      toast({ title: 'Formato no soportado', description: 'Usa PNG, JPG o WebP.', variant: 'destructive' });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: 'Archivo muy grande', description: 'Máximo 3MB.', variant: 'destructive' });
      return;
    }
    await uploadAvatar(file);
    // limpiar input para permitir misma selección de nuevo si quiere
    e.target.value = '';
  };

  async function uploadAvatar(file) {
    if (!uid) return;
    setSavingAvatar(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${uid}/${Date.now()}.${ext}`;

      // Subir a bucket "avatars" (asume bucket existente; público recomendado)
      const { error: upErr } = await supabase
        .storage
        .from('avatars')
        .upload(path, file, { upsert: true, cacheControl: '3600' });

      if (upErr) throw upErr;

      // Obtener URL pública
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error('No se pudo obtener URL pública');

      // Guardar en auth.user_metadata (siempre disponible)
      const { error: authErr } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });
      if (authErr) {
        // no rompemos UX si falla, pero avisamos
        console.warn('[auth.updateUser] error:', authErr);
      }

      // Intento best-effort: guardar en profiles.avatar_url (si existe la columna)
      try {
        const { error: pErr } = await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl })
          .eq('id', uid);
        // Si la columna no existe, Supabase devuelve error: lo silenciamos
        if (pErr) console.info('[profiles.update avatar_url] aviso:', pErr?.message || pErr);
      } catch (e) {
        // silent
      }

      setAvatarUrl(publicUrl);
      toast({ title: 'Foto actualizada', description: 'Tu avatar fue guardado correctamente.' });
    } catch (err) {
      console.error('[uploadAvatar]', err);
      toast({ title: 'No se pudo guardar la foto', description: 'Intenta nuevamente.', variant: 'destructive' });
    } finally {
      setSavingAvatar(false);
    }
  }

  async function clearAvatar() {
    if (!uid) return;
    setSavingAvatar(true);
    try {
      // Quitar URL de auth.user_metadata
      const { error: authErr } = await supabase.auth.updateUser({ data: { avatar_url: null } });
      if (authErr) console.warn('[auth.updateUser clear avatar] error:', authErr);

      // Best-effort en profiles.avatar_url
      try {
        const { error: pErr } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', uid);
        if (pErr) console.info('[profiles.update clear avatar] aviso:', pErr?.message || pErr);
      } catch {}

      setAvatarUrl(null);
      toast({ title: 'Foto eliminada', description: 'Tu avatar fue quitado.' });
    } catch (e) {
      toast({ title: 'No se pudo quitar la foto', description: 'Intenta nuevamente.', variant: 'destructive' });
    } finally {
      setSavingAvatar(false);
    }
  }

  // ---------- Guardar nombre/username (tabla profiles) ----------
  async function saveProfileBasics() {
    if (!uid) return;
    setSavingProfile(true);
    try {
      const payload = {};
      if (name != null) payload.full_name = String(name).trim();
      if (username != null) payload.username = String(username).trim();

      const { error } = await supabase.from('profiles').update(payload).eq('id', uid);
      if (error) throw error;

      toast({ title: 'Perfil actualizado', description: 'Tus datos se guardaron correctamente.' });
    } catch (e) {
      console.error('[saveProfileBasics]', e);
      toast({ title: 'No se pudo guardar', description: 'Revisa los datos e intenta de nuevo.', variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  }

  // ---------- util ----------
  const copy = (text, label = 'Copiado') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast({ title: label, description: `${text} copiado al portapapeles.` });
  };

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="rounded-2xl overflow-hidden border border-slate-700/50 bg-[radial-gradient(50%_120%_at_50%_0%,rgba(56,189,248,0.15),rgba(17,24,39,0))]">
        <div className="p-6 sm:p-8 md:p-10">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between"
          >
            {/* Avatar + acciones */}
            <div className="flex items-center gap-5">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-slate-800 border border-slate-600 overflow-hidden flex items-center justify-center">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="h-10 w-10 text-slate-400" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onFileChange}
                />
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={onPickFile} disabled={savingAvatar}>
                    <Camera className="h-4 w-4 mr-2" />
                    {savingAvatar ? 'Guardando...' : 'Cambiar foto'}
                  </Button>
                  {avatarUrl && (
                    <Button size="sm" variant="outline" onClick={clearAvatar} disabled={savingAvatar}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Quitar
                    </Button>
                  )}
                </div>
              </div>

              {/* Nombre / username inline-edit */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div>
                    <Label className="text-slate-300 text-xs">Nombre</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-white w-64"
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300 text-xs">Usuario</Label>
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-white w-56"
                      placeholder="username"
                    />
                  </div>
                  <Button onClick={saveProfileBasics} disabled={savingProfile}>
                    <Save className="h-4 w-4 mr-2" />
                    {savingProfile ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>

                <div className="mt-3">
                  <p className="text-slate-300">{user?.email}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`px-3 py-1 rounded-full text-sm ${verified ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/30 text-slate-300'}`}>
                      {verified ? 'Cuenta verificada' : 'Cuenta sin verificar'}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm ${role === 'admin' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-300'}`}>
                      {role === 'admin' ? 'Administrador' : 'Usuario'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Saldo y progreso */}
            <div className="min-w-[240px] max-w-sm w-full">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Saldo actual</p>
                  <p className="text-2xl font-bold text-green-400">
                    ${fmt(balances?.usdc ?? 0, 2)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 text-xs">Progreso de cuenta</span>
                  <span className="text-slate-200 text-xs">{progressPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-2.5 bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {steps.map(s => (
                    <span
                      key={s.key}
                      className={`px-2 py-0.5 rounded-full text-[11px] border ${
                        s.done ? 'border-green-600/50 text-green-300' : 'border-slate-600/60 text-slate-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* KPIs rápidos */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05 }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="crypto-card">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total invertido</p>
                <p className="text-2xl font-bold text-white">${fmt(totalInvested)}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/10">
                <TrendingUp className="h-6 w-6 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="crypto-card">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Ganancias estimadas</p>
                <p className="text-2xl font-bold text-white">${fmt(totalEarnings)}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-500/10">
                <Wallet className="h-6 w-6 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="crypto-card">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Referidos</p>
                <p className="text-2xl font-bold text-white">{referralsCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/10">
                <Users className="h-6 w-6 text-purple-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="crypto-card">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Bots activos</p>
                <p className="text-2xl font-bold text-white">{botsActive}</p>
              </div>
              <div className="p-3 rounded-lg bg-cyan-500/10">
                <Bot className="h-6 w-6 text-cyan-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Código de referido */}
      {referralCode ? (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08 }}
        >
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Tu código de referido</CardTitle>
              <CardDescription className="text-slate-300">
                Compártelo para ganar comisiones cuando tus invitados inviertan.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div>
                <p className="text-2xl font-bold text-green-400 tracking-wider">{referralCode}</p>
                <p className="text-xs text-slate-400 mt-1">
                  Enlace: {typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${referralCode}` : '—'}
                </p>
              </div>
              <div className="shrink-0">
                <Button
                  onClick={() => {
                    const link = typeof window !== 'undefined'
                      ? `${window.location.origin}/register?ref=${referralCode}` : referralCode;
                    copy(link, 'Enlace copiado');
                  }}
                  className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                >
                  <Copy className="h-4 w-4 mr-2" /> Copiar
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : null}

      {/* Tabs de configuración/perfil existentes */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <Tabs defaultValue="personal" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-slate-800">
            <TabsTrigger value="personal" className="text-white">
              <User className="h-4 w-4 mr-2 sm:hidden md:inline-block" /> Personal
            </TabsTrigger>
            <TabsTrigger value="security" className="text-white">
              <Shield className="h-4 w-4 mr-2 sm:hidden md:inline-block" /> Seguridad
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-white">
              <Bell className="h-4 w-4 mr-2 sm:hidden md:inline-block" /> Notificaciones
            </TabsTrigger>
            <TabsTrigger value="preferences" className="text-white">Preferencias</TabsTrigger>
          </TabsList>

          <TabsContent value="personal">
            <PersonalInfoTab />
          </TabsContent>
          <TabsContent value="security">
            <SecurityTab />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsTab />
          </TabsContent>
          <TabsContent value="preferences">
            <PreferencesTab />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
