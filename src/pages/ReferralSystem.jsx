// src/pages/ReferralSystem.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function ReferralSystem() {
  const { user, profile, updateUser, loading } = useAuth();

  const [referrals, setReferrals] = useState([]);
  const [referralLink, setReferralLink] = useState('');
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [creatingCode, setCreatingCode] = useState(false);

  const referralCode = profile?.referral_code || '';

  // Armar link con fallback seguro
  useEffect(() => {
    if (!user) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setReferralLink(`${origin}/register?ref=${referralCode || ''}`);
  }, [user, referralCode]);

  // Traer referidos
  const fetchReferrals = useCallback(async () => {
    if (!user?.id || !referralCode) {
      setReferrals([]);
      return;
    }
    setLoadingRefs(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, created_at')
        .eq('referred_by', referralCode)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = (data || []).map(r => ({
        id: r.id,
        name: r.username || 'Usuario',
        createdAt: r.created_at,
      }));
      setReferrals(list);
    } catch (e) {
      console.error('Error trayendo referidos:', e?.message || e);
      toast({
        title: 'No se pudieron cargar los referidos',
        description: e?.message || 'Inténtalo de nuevo más tarde.',
        variant: 'destructive',
      });
      setReferrals([]);
    } finally {
      setLoadingRefs(false);
    }
  }, [user?.id, referralCode]);

  // Carga inicial
  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  // Realtime: actualizar cuando entren nuevos referidos con mi código
  useEffect(() => {
    if (!user?.id || !referralCode) return;
    const ch = supabase
      .channel('rt-referrals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `referred_by=eq.${referralCode}` },
        fetchReferrals
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, referralCode, fetchReferrals]);

  const copyReferralLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast({
        title: '¡Enlace copiado!',
        description: 'El enlace de referido ha sido copiado al portapapeles',
      });
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Copia manualmente por favor.',
        variant: 'destructive',
      });
    }
  };

  const shareReferralLink = () => {
    if (!referralLink) return;
    if (navigator.share) {
      navigator.share({
        title: 'Liber Trades - Únete y gana',
        text: '¡Únete a Liber Trades y comienza a invertir en criptomonedas!',
        url: referralLink,
      }).catch(() => {});
    } else {
      copyReferralLink();
    }
  };

  const handleGenerateCode = async () => {
    if (!user?.id) return;
    setCreatingCode(true);
    try {
      const newCode = generateReferralCode();
      await updateUser({ referral_code: newCode }); // AuthContext ya refresca profile
      toast({ title: 'Código creado', description: `Tu nuevo código es ${newCode}` });
    } catch (e) {
      toast({
        title: 'No se pudo crear el código',
        description: e?.message || 'Intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setCreatingCode(false);
    }
  };

  // Métricas (estimadas para UI)
  const totalEarnings = useMemo(() => referrals.length * 50, [referrals]);
  const activeReferrals = useMemo(() => {
    const now = Date.now();
    return referrals.filter(ref => {
      const ts = ref.createdAt ? new Date(ref.createdAt).getTime() : now;
      const days = (now - ts) / (1000 * 60 * 60 * 24);
      return days <= 30;
    }).length;
  }, [referrals]);

  const getReferralLevel = (count) => {
    if (count >= 100) return { name: 'Diamante', icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/10' };
    if (count >= 50)  return { name: 'Oro',      icon: Star,  color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    if (count >= 20)  return { name: 'Plata',    icon: TrendingUp, color: 'text-gray-400',  bg: 'bg-gray-500/10' };
    if (count >= 5)   return { name: 'Bronce',   icon: Gift,  color: 'text-orange-400', bg: 'bg-orange-500/10' };
    return { name: 'Principiante', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' };
  };

  const currentLevel = getReferralLevel(referrals.length);

  const stats = [
    { title: 'Total Referidos',   value: referrals.length.toString(), icon: Users,      color: 'text-blue-400',   bgColor: 'bg-blue-500/10' },
    { title: 'Referidos Activos', value: activeReferrals.toString(),  icon: TrendingUp, color: 'text-green-400',  bgColor: 'bg-green-500/10' },
    { title: 'Ganancias Totales', value: `$${totalEarnings.toFixed(2)}`, icon: DollarSign, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
    { title: 'Nivel Actual',      value: currentLevel.name,           icon: currentLevel.icon, color: currentLevel.color, bgColor: currentLevel.bg },
  ];

  if (loading) return <div className="p-6 text-slate-300">Cargando…</div>;
  if (!user)   return <div className="p-6 text-slate-300">Inicia sesión para ver tus referidos.</div>;

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2">Sistema de Referidos</h1>
          <p className="text-slate-300">Invita amigos y gana comisiones por cada referido activo</p>
        </motion.div>

        {/* Si no hay código de referido, botón para crearlo */}
        {!referralCode && (
          <Card className="crypto-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-300">Aún no tienes un código de referido.</p>
                  <p className="text-slate-400 text-sm">Créalo para empezar a invitar.</p>
                </div>
                <Button onClick={handleGenerateCode} disabled={creatingCode}
                  className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600">
                  {creatingCode ? 'Creando…' : 'Crear código'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
              >
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
          {/* Referral Link */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.4 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Share2 className="h-5 w-5 mr-2 text-green-400" />
                  Tu Enlace de Referido
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Comparte este enlace para ganar comisiones
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex space-x-2">
                    <Input value={referralLink} readOnly className="bg-slate-800 border-slate-600 text-white" />
                    <Button onClick={copyReferralLink} size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={copyReferralLink}
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
                    {referralCode ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(referralCode);
                            toast({ title: '¡Código copiado!', description: 'El código de referido ha sido copiado' });
                          } catch {
                            toast({ title: 'No se pudo copiar', variant: 'destructive' });
                          }
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    ) : (
                      <Button size="sm" onClick={handleGenerateCode} disabled={creatingCode}>
                        {creatingCode ? 'Creando…' : 'Crear código'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Referral Progress */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.5 }}>
            <Card className="crypto-card">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Crown className="h-5 w-5 mr-2 text-purple-400" />
                  Progreso de Nivel
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Tu progreso hacia el siguiente nivel
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center">
                  <div className={`inline-flex items-center px-4 py-2 rounded-full ${currentLevel.bg} mb-4`}>
                    <currentLevel.icon className={`h-5 w-5 mr-2 ${currentLevel.color}`} />
                    <span className={`font-semibold ${currentLevel.color}`}>
                      Nivel {currentLevel.name}
                    </span>
                  </div>
                  <p className="text-slate-300">{referrals.length} referidos totales</p>
                </div>

                {currentLevel.name !== 'Diamante' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Progreso al siguiente nivel</span>
                      <span className="text-white">
                        {referrals.length}/
                        {currentLevel.name === 'Principiante' ? 5 :
                         currentLevel.name === 'Bronce' ? 20 :
                         currentLevel.name === 'Plata' ? 50 : 100}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (referrals.length / (
                            currentLevel.name === 'Principiante' ? 5 :
                            currentLevel.name === 'Bronce' ? 20 :
                            currentLevel.name === 'Plata' ? 50 : 100
                          )) * 100)}%`
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <h4 className="text-white font-semibold mb-2">Beneficios Actuales</h4>
                  <ul className="space-y-1 text-sm text-slate-300">
                    <li>• $50 por cada referido</li>
                    <li>• Comisiones instantáneas</li>
                    <li>• Seguimiento en tiempo real</li>
                    {currentLevel.name !== 'Principiante' && <li>• Bonos adicionales de nivel</li>}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Niveles y beneficios */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Niveles y Beneficios</CardTitle>
              <CardDescription className="text-slate-300">
                Descubre todos los beneficios de cada nivel
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-300">Nivel</th>
                      <th className="text-left py-3 px-4 text-slate-300">Referidos</th>
                      <th className="text-left py-3 px-4 text-slate-300">Comisión</th>
                      <th className="text-left py-3 px-4 text-slate-300">Beneficios Extra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { level: 'Principiante', refs: '1-4 referidos',  com: '$50 por referido',  bonus: 'Bono de bienvenida' },
                      { level: 'Bronce',       refs: '5-19 referidos', com: '$75 por referido',  bonus: 'Acceso a webinars exclusivos' },
                      { level: 'Plata',        refs: '20-49 referidos', com: '$100 por referido', bonus: 'Asesoría personalizada' },
                      { level: 'Oro',          refs: '50-99 referidos', com: '$150 por referido', bonus: 'Acceso VIP + Señales premium' },
                      { level: 'Diamante',     refs: '100+ referidos',  com: '$200 por referido', bonus: 'Todos los beneficios + Participación en ganancias' },
                    ].map((b) => (
                      <tr
                        key={b.level}
                        className={`border-b border-slate-700/50 ${b.level === currentLevel.name ? 'bg-green-500/10' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${b.level === currentLevel.name ? 'text-green-400' : 'text-white'}`}>
                            {b.level}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{b.refs}</td>
                        <td className="py-3 px-4 text-green-400 font-semibold">{b.com}</td>
                        <td className="py-3 px-4 text-slate-300">{b.bonus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Lista de referidos */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.7 }}>
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Tus Referidos</CardTitle>
              <CardDescription className="text-slate-300">
                Lista de usuarios que se registraron con tu código {loadingRefs ? '(actualizando…)' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {referrals.length > 0 ? (
                <div className="space-y-4">
                  {referrals.map((referral) => (
                    <div key={referral.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                      <div>
                        <p className="text-white font-medium">{referral.name}</p>
                        <p className="text-slate-400 text-sm">
                          Registrado: {new Date(referral.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-semibold">+$50.00</p>
                        <p className="text-slate-400 text-sm">Comisión estimada</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">
                    {referralCode
                      ? 'Aún no tienes referidos'
                      : 'Genera tu código para comenzar a invitar'}
                  </p>
                  <p className="text-slate-500 text-sm">Comparte tu enlace para comenzar a ganar</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
}
