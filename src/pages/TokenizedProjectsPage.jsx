// src/pages/TokenizedProjectsPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Coins,
  Rocket,
  TrendingUp,
  Zap,
  Calendar,
  Users,
  DollarSign,
  Eye,
} from 'lucide-react';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

const DEFAULT_CCY = 'USDC';

// Fallback estático por si aún no cargaste proyectos en DB
const staticUpcoming = [
  {
    id: 1,
    name: 'SolarisChain',
    symbol: 'SOLC',
    description: 'Red descentralizada para financiamiento de proyectos de energía solar.',
    category: 'Energía Renovable',
    launchDate: '2025-07-15',
    targetRaise: 5_000_000,
    minInvestment: 100,
    icon: Zap,
    imageUrl: 'https://images.unsplash.com/photo-1658204212985-e0126040f88f',
    details:
      'SolarisChain busca democratizar el acceso a la inversión en energía solar, permitiendo a pequeños inversores participar en grandes proyectos.',
  },
  {
    id: 2,
    name: 'AgroTokenX',
    symbol: 'AGTX',
    description:
      'Plataforma para tokenizar commodities agrícolas y facilitar su comercio global.',
    category: 'Agricultura',
    launchDate: '2025-08-01',
    targetRaise: 2_000_000,
    minInvestment: 50,
    icon: Rocket,
    imageUrl: 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6',
    details:
      'AgroTokenX permitirá a productores tokenizar sus cosechas, obteniendo liquidez inmediata y acceso a mercados.',
  },
  {
    id: 3,
    name: 'EduVerse',
    symbol: 'EDUV',
    description:
      'Metaverso educativo con NFTs para certificar habilidades y logros académicos.',
    category: 'Educación',
    launchDate: '2025-09-10',
    targetRaise: 3_000_000,
    minInvestment: 75,
    icon: TrendingUp,
    imageUrl: 'https://images.unsplash.com/photo-1513258496099-48168024aec0',
    details:
      'EduVerse creará un entorno de aprendizaje inmersivo con certificaciones NFT verificables en blockchain.',
  },
];

export default function TokenizedProjectsPage() {
  const { playSound } = useSound();
  const { user, balances } = useAuth();
  const {
    // datos & helpers del DataContext
    projects = [],
    getProjectRaise,
    refreshProjects,
    myProjectInvestments = [],
    refreshMyProjectInvestments,
    addTransaction,
    refreshTransactions,
  } = useData();

  const [selectedProject, setSelectedProject] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');

  // Asegura que el catálogo esté actualizado (de todos modos el DataContext ya hace 1 fetch)
  useEffect(() => {
    refreshProjects?.();
  }, [refreshProjects]);

  useEffect(() => {
    if (user?.id) refreshMyProjectInvestments?.();
  }, [user?.id, refreshMyProjectInvestments]);

  const list = useMemo(() => {
    // Normaliza nombres/propiedades si vienen de DB
    const normalized = (projects || []).map((p) => ({
      id: p.id,
      name: p.name,
      symbol: p.symbol,
      description: p.description,
      category: p.category,
      launchDate: p.launch_date || p.launchDate,
      targetRaise: Number(p.target_raise_usd ?? p.targetRaise ?? 0),
      minInvestment: Number(p.min_investment_usd ?? p.minInvestment ?? 0),
      imageUrl:
        p.image_url ||
        p.imageUrl ||
        'https://images.unsplash.com/photo-1572177812156-58036aae439c',
      details: p.details || p.description || '',
      icon: Coins,
    }));

    // si aún no tienes DB poblada, mostramos los 3 estáticos
    return normalized.length ? normalized : staticUpcoming;
  }, [projects]);

  const handleViewDetails = (project) => {
    playSound?.('navigation');
    setSelectedProject(project);
  };

  const ensureCurrency = async (code) => {
    try {
      await supabase
        .from('currencies')
        .upsert({ code }, { onConflict: 'code', ignoreDuplicates: true });
    } catch {
      /* noop */
    }
  };

  const handleInvest = async () => {
    if (!selectedProject) return;

    const amt = Number(investmentAmount);
    if (!user?.id) {
      playSound?.('error');
      toast({
        title: 'Inicia sesión',
        description: 'Debes iniciar sesión para invertir en proyectos.',
        variant: 'destructive',
      });
      return;
    }
    if (!amt || amt < selectedProject.minInvestment) {
      playSound?.('error');
      toast({
        title: 'Monto inválido',
        description: `El mínimo para ${selectedProject.symbol} es $${fmt(
          selectedProject.minInvestment
        )}.`,
        variant: 'destructive',
      });
      return;
    }

    const available = Number(balances?.usdc ?? 0);
    if (amt > available) {
      playSound?.('error');
      toast({
        title: 'Saldo insuficiente',
        description: `Tu saldo USDC disponible es $${fmt(available)}.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      playSound?.('invest');
      await ensureCurrency(DEFAULT_CCY);

      // Inserta inversión PENDIENTE (el admin la aprobará)
      const { data: ins, error: iErr } = await supabase
        .from('project_investments')
        .insert({
          user_id: user.id,
          project_id: selectedProject.id ?? null, // si viene de DB
          project_symbol: selectedProject.symbol,
          project_name: selectedProject.name,
          amount_usd: amt,
          status: 'pending',
        })
        .select('id')
        .single();

      if (iErr) throw iErr;

      // Transacción de wallet relacionada, también pendiente
      await addTransaction?.({
        amount: amt,
        type: 'transfer',
        currency: DEFAULT_CCY,
        description: `Inversión en ${selectedProject.name} (${selectedProject.symbol})`,
        referenceType: 'project_investment',
        referenceId: ins?.id ?? null,
        status: 'pending',
      });

      await Promise.all([refreshTransactions?.(), refreshMyProjectInvestments?.()]);

      toast({
        title: 'Solicitud enviada',
        description: `Tu inversión en ${selectedProject.symbol} quedó pendiente de confirmación.`,
      });

      setInvestmentAmount('');
      setSelectedProject(null);
    } catch (e) {
      console.error('[TokenizedProjects] invest error:', e);
      playSound?.('error');
      toast({
        title: 'Error al invertir',
        description: e?.message ?? 'No se pudo registrar la inversión.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center">
          <Coins className="h-8 w-8 mr-3 text-yellow-400" />
          Proyectos Tokenizados
        </h1>
        <p className="text-slate-300">
          Descubre e invierte en los próximos grandes proyectos tokenizados.
        </p>
        <p className="text-slate-400 mt-2">
          Saldo USDC:{' '}
          <span className="text-green-400 font-semibold">
            ${fmt(balances?.usdc ?? 0, 2)}
          </span>
        </p>
      </motion.div>

      {/* Grid de proyectos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {list.map((project, index) => {
          const Icon = project.icon || Coins;
          const raised = Number(
            getProjectRaise?.(project.id) ?? project.raisedUsd ?? 0
          );
          const target = Number(project.targetRaise || 0);
          const pct = target > 0 ? Math.min(100, (raised / target) * 100) : 0;

          return (
            <motion.div
              key={`${project.id}-${project.symbol}-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
            >
              <Card className="crypto-card h-full flex flex-col">
                <CardHeader>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-600 rounded-lg grid place-items-center overflow-hidden">
                      <img
                        alt={`${project.name} logo`}
                        src={project.imageUrl}
                        className="w-12 h-12 object-cover"
                      />
                    </div>
                    <div>
                      <CardTitle className="text-xl text-white">
                        {project.name} ({project.symbol})
                      </CardTitle>
                      <CardDescription className="text-blue-400">
                        {project.category}
                      </CardDescription>
                    </div>
                  </div>
                  <p className="text-slate-300 text-sm h-16 overflow-hidden">
                    {project.description}
                  </p>
                </CardHeader>

                <CardContent className="space-y-3 flex-grow">
                  <div className="flex items-center text-sm text-slate-400">
                    <Calendar className="h-4 w-4 mr-2 text-purple-400" />
                    Lanzamiento:{' '}
                    {project.launchDate
                      ? new Date(project.launchDate).toLocaleDateString()
                      : '—'}
                  </div>
                  <div className="flex items-center text-sm text-slate-400">
                    <DollarSign className="h-4 w-4 mr-2 text-green-400" />
                    Objetivo: ${target.toLocaleString()}
                  </div>
                  <div className="flex items-center text-sm text-slate-400">
                    <Users className="h-4 w-4 mr-2 text-orange-400" />
                    Inversión mín.: ${project.minInvestment}
                  </div>

                  {/* Progreso de recaudación */}
                  <div className="pt-2">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Recaudado</span>
                      <span>
                        ${fmt(raised, 0)} / ${fmt(target, 0)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
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

      {/* Mis inversiones en proyectos */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <Card className="crypto-card">
          <CardHeader>
            <CardTitle className="text-white">Mis inversiones en proyectos</CardTitle>
            <CardDescription className="text-slate-300">
              Solicitudes realizadas desde tu wallet (estado en tiempo real)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {myProjectInvestments.length ? (
              <div className="space-y-3">
                {myProjectInvestments.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                  >
                    <div>
                      <div className="text-white font-medium">
                        {row.project_name} ({row.project_symbol || '—'})
                      </div>
                      <div className="text-slate-400 text-xs">
                        {new Date(row.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-semibold">${fmt(row.amount_usd)}</div>
                      <div
                        className={`text-xs ${
                          (row.status || '').toLowerCase() === 'approved'
                            ? 'text-green-400'
                            : (row.status || '').toLowerCase() === 'rejected'
                            ? 'text-red-400'
                            : 'text-yellow-400'
                        }`}
                      >
                        {row.status || 'pending'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-400">Aún no realizaste inversiones en proyectos.</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Modal de inversión */}
      {selectedProject && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
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
                    alt={`${selectedProject.name} logo`}
                    src={selectedProject.imageUrl}
                    className="w-16 h-16 object-cover"
                  />
                </div>
                <div>
                  <CardTitle className="text-2xl text-white">
                    {selectedProject.name} ({selectedProject.symbol})
                  </CardTitle>
                  <CardDescription className="text-blue-400">
                    {selectedProject.category}
                  </CardDescription>
                </div>
              </div>
              <img
                className="w-full h-48 object-cover rounded-lg mb-4"
                alt={`Imagen de ${selectedProject.name}`}
                src={selectedProject.imageUrl}
              />
              <p className="text-slate-300">{selectedProject.details}</p>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Fecha de Lanzamiento:</p>
                  <p className="text-white font-semibold">
                    {selectedProject.launchDate
                      ? new Date(selectedProject.launchDate).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Objetivo:</p>
                  <p className="text-white font-semibold">
                    ${Number(selectedProject.targetRaise || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Inversión mínima:</p>
                  <p className="text-white font-semibold">
                    ${fmt(selectedProject.minInvestment)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Monto a invertir (USDC)</Label>
                <Input
                  type="number"
                  min={selectedProject.minInvestment}
                  value={investmentAmount}
                  onChange={(e) => setInvestmentAmount(e.target.value)}
                  placeholder={`Mínimo $${selectedProject.minInvestment}`}
                  className="bg-slate-800 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-400">
                  Disponible:{' '}
                  <span className="text-green-400">
                    ${fmt(balances?.usdc ?? 0)}
                  </span>{' '}
                  USDC
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleInvest}
                  className="flex-1 bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
                >
                  Invertir en {selectedProject.symbol}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedProject(null)}
                  className="flex-1"
                >
                  Cerrar
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
