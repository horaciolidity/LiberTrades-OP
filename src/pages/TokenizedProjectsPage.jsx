// src/pages/TokenizedProjectsPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Coins,
  Calendar,
  Users,
  DollarSign,
  Eye,
  Rocket,
  TrendingUp,
  Zap,
  Gauge,
  Info,
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
import { Label } from '@/components/ui/label';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';

const fmt = (n, dec = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(dec) : (0).toFixed(dec);
};

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1572177812156-58036aae439c';

const PLACEHOLDER = [
  {
    symbol: 'SOLC',
    name: 'SolarisChain',
    category: 'Energía Renovable',
    launch_date: '2025-07-15',
    target_raise: 5_000_000,
    min_investment: 100,
    icon: Zap,
    details:
      'SolarisChain busca democratizar la inversión en energía solar, con contratos inteligentes para distribución de beneficios.',
    cover: 'https://images.unsplash.com/photo-1658204212985-e0126040f88f',
  },
  {
    symbol: 'AGTX',
    name: 'AgroTokenX',
    category: 'Agricultura',
    launch_date: '2025-08-01',
    target_raise: 2_000_000,
    min_investment: 50,
    icon: Rocket,
    details:
      'Tokenización de commodities agrícolas, liquidez para productores y acceso global para inversores.',
    cover: 'https://images.unsplash.com/photo-1556906781-9a412961c28c',
  },
  {
    symbol: 'EDUV',
    name: 'EduVerse',
    category: 'Educación',
    launch_date: '2025-09-10',
    target_raise: 3_000_000,
    min_investment: 75,
    icon: TrendingUp,
    details:
      'Metaverso educativo con certificaciones NFT verificables y enfoque en habilidades tecnológicas.',
    cover: 'https://images.unsplash.com/photo-1555255707-c07966088b7b',
  },
];

export default function TokenizedProjectsPage() {
  const { playSound } = useSound();
  const { user, balances } = useAuth();
  const { addTransaction, refreshTransactions } = useData();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [raisedMap, setRaisedMap] = useState({}); // {project_id: raised_usd}
  const [error, setError] = useState(null);

  const [selectedProject, setSelectedProject] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');

  // ===== Fetch projects + raised amounts =====
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        // 1) Traer proyectos tokenizados
        const { data: projs, error: projErr } = await supabase
          .from('tokenized_projects')
          .select('*')
          .order('launch_date', { ascending: true });

        let list = Array.isArray(projs) ? projs : [];
        if (projErr) throw projErr;

        // Fallback a placeholders si no hay datos en la tabla
        if (!list.length) {
          list = PLACEHOLDER.map((p, i) => ({
            id: `placeholder-${i}`,
            symbol: p.symbol,
            name: p.name,
            category: p.category,
            launch_date: p.launch_date,
            target_raise: p.target_raise,
            min_investment: p.min_investment,
            cover: p.cover,
            details: p.details,
            _placeholder: true,
          }));
        }

        setProjects(list);

        // 2) Traer inversiones por proyecto para calcular recaudación
        const { data: invs, error: invErr } = await supabase
          .from('project_investments')
          .select('project_id, amount_usd, status');

        if (invErr) throw invErr;

        const sum = {};
        (invs || []).forEach((r) => {
          const st = String(r?.status || '').toLowerCase();
          // Contabilizamos activas / aprobadas
          if (st === 'active' || st === 'approved' || st === 'completed') {
            sum[r.project_id] = (sum[r.project_id] || 0) + Number(r.amount_usd || 0);
          }
        });
        setRaisedMap(sum);
      } catch (e) {
        console.error('[projects fetch]', e);
        setError('No se pudieron cargar los proyectos.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const usdBalance = Number(balances?.usdc ?? 0);

  const withProgress = useMemo(() => {
    return (projects || []).map((p, idx) => {
      const target = Number(p?.target_raise || 0);
      const raised = Number(raisedMap[p.id] || 0);
      const pct = target > 0 ? Math.max(0, Math.min(100, (raised / target) * 100)) : 0;

      const Icon =
        p?.symbol === 'SOLC' ? Zap :
        p?.symbol === 'AGTX' ? Rocket :
        p?.symbol === 'EDUV' ? TrendingUp :
        Gauge;

      return {
        ...p,
        target,
        raised,
        progressPct: pct,
        icon: Icon,
        cover: p.cover || FALLBACK_IMG,
      };
    });
  }, [projects, raisedMap]);

  const handleViewDetails = (project) => {
    playSound?.('navigation');
    setSelectedProject(project);
    setInvestmentAmount('');
  };

  const handleInvest = async () => {
    if (!user?.id) {
      playSound?.('error');
      toast({ title: 'Sin sesión', description: 'Iniciá sesión para invertir.', variant: 'destructive' });
      return;
    }
    if (!selectedProject) return;

    const amountUsd = Number(investmentAmount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      playSound?.('error');
      toast({ title: 'Monto inválido', description: 'Ingresá un monto válido en USD.', variant: 'destructive' });
      return;
    }

    const min = Number(selectedProject?.min_investment || 0);
    if (amountUsd < min) {
      playSound?.('error');
      toast({
        title: 'Monto por debajo del mínimo',
        description: `La inversión mínima es $${fmt(min)}.`,
        variant: 'destructive',
      });
      return;
    }

    if (amountUsd > usdBalance) {
      playSound?.('error');
      toast({
        title: 'Fondos insuficientes',
        description: 'No tenés saldo suficiente en la app.',
        variant: 'destructive',
      });
      return;
    }

    try {
      playSound?.('invest');

      // 1) Insert en project_investments
      const payload = {
        user_id: user.id,
        project_id: selectedProject.id, // FK a tokenized_projects
        project_symbol: selectedProject.symbol,
        project_name: selectedProject.name,
        amount_usd: amountUsd,
        status: 'active',
      };

      const { data: inserted, error: insErr } = await supabase
        .from('project_investments')
        .insert(payload)
        .select('*')
        .single();

      if (insErr) throw insErr;

      // 2) Registrar wallet transaction (usamos type 'other' + reference_type detallado)
      await addTransaction?.({
        amount: amountUsd,
        type: 'other',
        currency: 'USDC',
        description: `Inversión en ${selectedProject.name} (${selectedProject.symbol})`,
        referenceType: 'project_investment',
        referenceId: inserted?.id,
        status: 'completed',
      });

      // 3) Descontar saldo interno USDC
      const { error: balErr } = await supabase
        .from('balances')
        .update({ usdc: Math.max(0, usdBalance - amountUsd), updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (balErr) console.warn('[balances update]', balErr);

      // 4) Refresh recaudación para el proyecto
      setRaisedMap((prev) => ({
        ...prev,
        [selectedProject.id]: Number(prev[selectedProject.id] || 0) + amountUsd,
      }));
      await refreshTransactions?.();

      toast({
        title: '¡Inversión creada!',
        description: `Aportaste $${fmt(amountUsd)} a ${selectedProject.name}.`,
      });
      setSelectedProject(null);
      setInvestmentAmount('');
    } catch (e) {
      console.error('[project invest]', e);
      playSound?.('error');
      toast({
        title: 'No se pudo invertir',
        description: 'Intentá nuevamente en unos instantes.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-300">Cargando proyectos…</div>;
  }
  if (error) {
    return <div className="p-6 text-red-400">{error}</div>;
  }

  return (
    <>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
            <Coins className="h-8 w-8 mr-3 text-yellow-400" />
            Proyectos Tokenizados
          </h1>
          <p className="text-slate-300">
            Descubrí e invertí en próximos lanzamientos de activos tokenizados del mundo real.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {withProgress.map((project, index) => {
            const Icon = project.icon || Gauge;
            const launchStr = project.launch_date
              ? new Date(project.launch_date).toLocaleDateString()
              : '—';
            const daysToLaunch = project.launch_date
              ? Math.ceil(
                  (new Date(project.launch_date).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24)
                )
              : null;

            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
              >
                <Card className="crypto-card h-full flex flex-col">
                  <CardHeader>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-600 rounded-lg flex items-center justify-center overflow-hidden">
                        <img
                          src={project.cover || FALLBACK_IMG}
                          alt={`${project.name} cover`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <CardTitle className="text-xl text-white">
                          {project.name} ({project.symbol})
                        </CardTitle>
                        <CardDescription className="text-blue-400">
                          {project.category || 'General'}
                        </CardDescription>
                      </div>
                    </div>
                    <p className="text-slate-300 text-sm line-clamp-3">
                      {project.details || 'Proyecto tokenizado listado en la plataforma.'}
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-4 flex-grow">
                    <div className="flex items-center text-sm text-slate-400">
                      <Calendar className="h-4 w-4 mr-2 text-purple-400" />
                      Lanzamiento: {launchStr}{' '}
                      {Number.isFinite(daysToLaunch) && (
                        <span className="ml-2 text-xs text-slate-500">
                          ({daysToLaunch >= 0 ? `Faltan ${daysToLaunch} días` : `Lanzado hace ${Math.abs(daysToLaunch)} días`})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center text-sm text-slate-400">
                      <DollarSign className="h-4 w-4 mr-2 text-green-400" />
                      Objetivo: ${project.target.toLocaleString()}
                    </div>
                    <div className="flex items-center text-sm text-slate-400">
                      <Users className="h-4 w-4 mr-2 text-orange-400" />
                      Inversión mínima: ${fmt(project.min_investment || project.minInvestment || 0)}
                    </div>

                    {/* Progreso de recaudación */}
                    <div className="pt-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-400">Recaudado</span>
                        <span className="text-slate-300">
                          ${project.raised.toLocaleString()} · {fmt(project.progressPct)}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-2 bg-gradient-to-r from-emerald-500 to-cyan-500"
                          style={{ width: `${project.progressPct}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>

                  <CardContent className="pt-0">
                    <Button
                      onClick={() => handleViewDetails(project)}
                      className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    >
                      <Eye className="h-4 w-4 mr-2" /> Ver Detalles
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Modal Detalles + Inversión */}
        {selectedProject && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedProject(null)}
          >
            <Card
              className="crypto-card w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader>
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-600 rounded-lg overflow-hidden">
                    <img
                      src={selectedProject.cover || FALLBACK_IMG}
                      alt={`${selectedProject.name} cover`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <CardTitle className="text-2xl text-white">
                      {selectedProject.name} ({selectedProject.symbol})
                    </CardTitle>
                    <CardDescription className="text-blue-400">
                      {selectedProject.category || 'General'}
                    </CardDescription>
                  </div>
                </div>
                <img
                  className="w-full h-44 object-cover rounded-lg mb-4"
                  alt={`Imagen de ${selectedProject.name}`}
                  src={selectedProject.cover || FALLBACK_IMG}
                />
                <p className="text-slate-300">
                  {selectedProject.details || 'Proyecto tokenizado listado en la plataforma.'}
                </p>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Fecha de lanzamiento:</p>
                    <p className="text-white font-semibold">
                      {selectedProject.launch_date
                        ? new Date(selectedProject.launch_date).toLocaleDateString()
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Objetivo de recaudación:</p>
                    <p className="text-white font-semibold">
                      ${Number(selectedProject.target).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Inversión mínima:</p>
                    <p className="text-white font-semibold">
                      ${fmt(selectedProject.min_investment || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Recaudado (estimado):</p>
                    <p className="text-white font-semibold">
                      ${Number(raisedMap[selectedProject.id] || 0).toLocaleString()} ({fmt(selectedProject.progressPct)}%)
                    </p>
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3 rounded-md text-xs text-slate-300 flex gap-2">
                  <Info className="h-4 w-4 text-cyan-400 mt-0.5" />
                  Las inversiones en proyectos pueden requerir aprobación. Tu saldo se debita al confirmar la inversión.
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Monto a invertir (USD)</Label>
                  <Input
                    type="number"
                    value={investmentAmount}
                    onChange={(e) => setInvestmentAmount(e.target.value)}
                    placeholder={`Mínimo $${fmt(selectedProject.min_investment || 0)}`}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                  {Number(investmentAmount) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Saldo disponible:</span>
                      <span className="text-slate-200">${fmt(usdBalance)}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handleInvest}
                    className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
                    disabled={
                      !user?.id ||
                      !investmentAmount ||
                      Number(investmentAmount) <= 0
                    }
                  >
                    Invertir en {selectedProject.symbol}
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedProject(null)} className="w-full">
                    Cerrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </>
  );
}
