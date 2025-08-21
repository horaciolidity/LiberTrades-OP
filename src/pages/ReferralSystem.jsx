// src/pages/ReferralSystem.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Copy,
  DollarSign,
  TrendingUp,
  Share2,
  Gift,
  Crown,
  Star,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? Number(n).toFixed(dec) : (0).toFixed(dec);
};

// Bono fijo por referido acreditado (se mantiene como antes)
const REWARD_PER_REFERRAL = 50; // USD

// Niveles y umbrales (visual)
const LEVELS = [
  { name: 'Principiante', min: 0,   icon: Users,      color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  { name: 'Bronce',       min: 5,   icon: Gift,       color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { name: 'Plata',        min: 20,  icon: TrendingUp, color: 'text-gray-400',   bg: 'bg-gray-500/10' },
  { name: 'Oro',          min: 50,  icon: Star,       color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  { name: 'Diamante',     min: 100, icon: Crown,      color: 'text-purple-400', bg: 'bg-purple-500/10' },
];

// Tabla informativa (se adapta dinámicamente a los % admin)
const buildBenefitsTable = (level1Pct, level2Pct) => ([
  { level: 'Principiante', referrals: '1–4 referidos',   commission: `$${REWARD_PER_REFERRAL} por referido`,  bonus: `Comisión L1 ${fmt(level1Pct,0)}%` },
  { level: 'Bronce',       referrals: '5–19 referidos',  commission: `$${REWARD_PER_REFERRAL} por referido`,  bonus: `Comisión L1 ${fmt(level1Pct,0)}% · L2 ${fmt(level2Pct,0)}%` },
  { level: 'Plata',        referrals: '20–49 referidos', commission: `$${REWARD_PER_REFERRAL} por referido`,  bonus: `Comisión L1 ${fmt(level1Pct,0)}% · L2 ${fmt(level2Pct,0)}%` },
  { level: 'Oro',          referrals: '50–99 referidos', commission: `$${REWARD_PER_REFERRAL} por referido`,  bonus: `Comisión L1 ${fmt(level1Pct,0)}% · L2 ${fmt(level2Pct,0)}% + perks` },
  { level: 'Diamante',     referrals: '100+ referidos',  commission: `$${REWARD_PER_REFERRAL} por referido`,  bonus: `Comisión L1 ${fmt(level1Pct,0)}% · L2 ${fmt(level2Pct,0)}% + participación` },
]);

export default function ReferralSystem() {
  const { user, profile } = useAuth();
  const {
    referrals: ctxReferrals = [],
    refreshReferrals,
    settings: adminSettings, // si DataContext ya trae settings, los usamos directo
  } = useData();

  const [referrals, setReferrals] = useState([]);

  // ====== Porcentajes de referidos (desde Admin) ======
  // Defaults alineados con AdminDashboard (5% y 2%)
  const [level1Pct, setLevel1Pct] = useState(
    Number(adminSettings?.['referrals.level1_pct'] ?? 5)
  );
  const [level2Pct, setLevel2Pct] = useState(
    Number(adminSettings?.['referrals.level2_pct'] ?? 2)
  );

  // Si DataContext trae settings, se aplican; si no, fallback por RPC a get_admin_settings('referrals.')
  useEffect(() => {
    if (adminSettings) {
      if (adminSettings['referrals.level1_pct'] != null) {
        setLevel1Pct(Number(adminSettings['referrals.level1_pct']));
      }
      if (adminSettings['referrals.level2_pct'] != null) {
        setLevel2Pct(Number(adminSettings['referrals.level2_pct']));
      }
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_admin_settings', { prefix: 'referrals.' });
        if (error) return;
        const map = Object.fromEntries((data || []).map(r => [r.setting_key, Number(r.setting_value)]));
        if (map['referrals.level1_pct'] != null) setLevel1Pct(Number(map['referrals.level1_pct']));
        if (map['referrals.level2_pct'] != null) setLevel2Pct(Number(map['referrals.level2_pct']));
      } catch {
        // silencio; se quedan los defaults
      }
    })();
  }, [adminSettings]);

  const referralCode = profile?.referral_code || user?.referralCode || '';
  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/register?ref=${referralCode}`;

  // Traer/actualizar referidos reales desde DataContext
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      await refreshReferrals?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Sincronizar con el contexto
  useEffect(() => {
    setReferrals(Array.isArray(ctxReferrals) ? ctxReferrals : []);
  }, [ctxReferrals]);

  // Cálculos
  const totalReferrals = referrals.length;

  const activeReferrals = useMemo(() => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return referrals.filter((r) => {
      const d = new Date(r?.created_at || Date.now()).getTime();
      return now - d <= THIRTY_DAYS;
    }).length;
  }, [referrals]);

  // Se mantiene el bono fijo total (como venía)
  const totalEarnings = useMemo(
    () => totalReferrals * REWARD_PER_REFERRAL,
    [totalReferrals]
  );

  const currentLevel = useMemo(() => {
    let lvl = LEVELS[0];
    for (const L of LEVELS) if (totalReferrals >= L.min) lvl = L;
    return lvl;
  }, [totalReferrals]);

  const nextLevel = useMemo(() => {
    const idx = LEVELS.findIndex((l) => l.name === currentLevel.name);
    return LEVELS[idx + 1] || null;
  }, [currentLevel]);

  const progressToNext = useMemo(() => {
    if (!nextLevel) return { current: totalReferrals, target: currentLevel.min, pct: 100 };
    const base = currentLevel.min;
    const target = nextLevel.min;
    const cur = totalReferrals;
    const pct = Math.max(0, Math.min(100, ((cur - base) / (target - base)) * 100));
    return { current: cur, target, pct };
  }, [currentLevel, nextLevel, totalReferrals]);

  // UI helpers
  const copy = async (text, msg = 'Copiado') => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: msg, description: 'Se copió al portapapeles.' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const shareReferralLink = () => {
    if (!referralLink) return;
    if (navigator.share) {
      navigator
        .share({
          title: 'Liber Trades - Únete y gana',
          text: '¡Únete a Liber Trades y comenzá a invertir en criptomonedas!',
          url: referralLink,
        })
        .catch(() => {});
    } else {
      copy(referralLink, 'Enlace copiado');
    }
  };

  const benefitsTable = useMemo(() => buildBenefitsTable(level1Pct, level2Pct), [level1Pct, level2Pct]);

  const stats = [
    { title: 'Total Referidos', value: String(totalReferrals), icon: Users, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
    { title: 'Referidos Activos (30d)', value: String(activeReferrals), icon: TrendingUp, color: 'text-green-400', bgColor: 'bg-green-500/10' },
    { title: 'Ganancias Totales (bono)', value: `$${fmt(totalEarnings)}`, icon: DollarSign, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
    {
      title: 'Nivel Actual',
      value: currentLevel.name,
      icon: currentLevel.icon,
      color: currentLevel.color,
      bgColor: currentLevel.bg,
    },
  ];

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-3xl font-bold text-white mb-2">Sistema de Referidos</h1>
          <p className="text-slate-300">Invitá amigos y ganá comisiones por cada referido activo.</p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: i * 0.1 }}>
                <Card className="crypto-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm font-medium">{stat.title}</p>
                        <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                      </div>
                      <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                        <Icon className={`h-6 w-6 ${stat.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Enlace de referido */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.4 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Share2 className="h-5 w-5 mr-2 text-green-400" />
                  Tu Enlace de Referido
                </CardTitle>
                <CardDescription className="text-slate-300">Compartí este enlace para ganar comisiones.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex space-x-2">
                    <Input value={referralLink} readOnly className="bg-slate-800 border-slate-600 text-white" />
                    <Button onClick={() => copy(referralLink, 'Enlace copiado')} size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={() => copy(referralLink, 'Enlace copiado')}
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar
                    </Button>
                    <Button
                      onClick={shareReferralLink}
                      className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600"
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Compartir
                    </Button>
                  </div>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <h4 className="text-white font-semibold mb-2">Tu Código de Referido</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-green-400">{referralCode || '—'}</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!referralCode) return;
                        copy(referralCode, 'Código copiado');
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Progreso de nivel */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.5 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Crown className="h-5 w-5 mr-2 text-purple-400" />
                  Progreso de Nivel
                </CardTitle>
                <CardDescription className="text-slate-300">Tu camino hacia el siguiente nivel.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <div className={`inline-flex items-center px-4 py-2 rounded-full ${currentLevel.bg} mb-4`}>
                    {(() => {
                      const IconL = currentLevel.icon;
                      return <IconL className={`h-5 w-5 mr-2 ${currentLevel.color}`} />;
                    })()}
                    <span className={`font-semibold ${currentLevel.color}`}>Nivel {currentLevel.name}</span>
                  </div>
                  <p className="text-slate-300">{totalReferrals} referidos totales</p>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <h4 className="text-white font-semibold mb-2">Tus porcentajes de comisión</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>• Nivel 1: <span className="text-white font-semibold">{fmt(level1Pct, 0)}%</span></li>
                    <li>• Nivel 2: <span className="text-white font-semibold">{fmt(level2Pct, 0)}%</span></li>
                  </ul>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Definidos por administración. Se aplican sobre ganancias/pagos elegibles (planes/bots) de tu red.
                  </p>
                </div>

                {nextLevel ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Progreso al siguiente nivel</span>
                      <span className="text-white">
                        {Math.max(0, totalReferrals - currentLevel.min)}/{nextLevel.min - currentLevel.min}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressToNext.pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-400">
                      Te faltan <span className="text-white font-semibold">{Math.max(0, nextLevel.min - totalReferrals)}</span> referidos para llegar a{' '}
                      <span className="text-white font-semibold">{nextLevel.name}</span>.
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-emerald-400 font-semibold">¡Máximo nivel alcanzado!</div>
                )}

                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <h4 className="text-white font-semibold mb-2">Beneficios actuales</h4>
                  <ul className="space-y-1 text-sm text-slate-300">
                    <li>• Bono por referido acreditado: <span className="text-white font-semibold">${REWARD_PER_REFERRAL}</span></li>
                    <li>• Comisión L1: <span className="text-white font-semibold">{fmt(level1Pct, 0)}%</span></li>
                    <li>• Comisión L2: <span className="text-white font-semibold">{fmt(level2Pct, 0)}%</span></li>
                    <li>• Seguimiento en tiempo real</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Tabla de niveles/beneficios */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Niveles y Beneficios</CardTitle>
              <CardDescription className="text-slate-300">Conocé todas las ventajas de cada nivel.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-300">Nivel</th>
                      <th className="text-left py-3 px-4 text-slate-300">Referidos</th>
                      <th className="text-left py-3 px-4 text-slate-300">Bono por referido</th>
                      <th className="text-left py-3 px-4 text-slate-300">Beneficios Extra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benefitsTable.map((b) => (
                      <tr
                        key={b.level}
                        className={`border-b border-slate-700/50 ${b.level === currentLevel.name ? 'bg-green-500/10' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${b.level === currentLevel.name ? 'text-green-400' : 'text-white'}`}>
                            {b.level}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{b.referrals}</td>
                        <td className="py-3 px-4 text-green-400 font-semibold">{b.commission}</td>
                        <td className="py-3 px-4 text-slate-300">{b.bonus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Listado de referidos */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.7 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Tus Referidos</CardTitle>
              <CardDescription className="text-slate-300">Usuarios registrados con tu código.</CardDescription>
            </CardHeader>
            <CardContent>
              {referrals.length > 0 ? (
                <div className="space-y-4">
                  {referrals.map((r) => {
                    const display =
                      r?.full_name ||
                      r?.username ||
                      r?.email ||
                      r?.name ||
                      (r?.id ? `Usuario ${r.id.slice(0, 6)}` : 'Usuario');
                    const when = r?.created_at ? new Date(r.created_at).toLocaleDateString() : '—';
                    return (
                      <div key={r.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                        <div>
                          <p className="text-white font-medium">{display}</p>
                          <p className="text-slate-400 text-sm">Registrado: {when}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-green-400 font-semibold">+${fmt(REWARD_PER_REFERRAL)}</p>
                          <p className="text-slate-400 text-sm">Bono estimado</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Aún no tenés referidos</p>
                  <p className="text-slate-500 text-sm">Compartí tu enlace para empezar a ganar.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
}
