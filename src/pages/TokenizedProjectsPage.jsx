// src/pages/TokenizedProjectsPage.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Coins, Rocket, TrendingUp, Zap, Calendar, Users, DollarSign, Eye, Wallet } from 'lucide-react';
import { useSound } from '@/contexts/SoundContext';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';

const fmt = (n, dec = 2) => {
  const num = Number(n);
  return Number.isFinite(num) ? num.toFixed(dec) : (0).toFixed(dec);
};

const upcomingProjects = [
  { 
    id: 1, name: 'SolarisChain', symbol: 'SOLC', description: 'Red descentralizada para financiamiento de proyectos de energía solar.', 
    category: 'Energía Renovable', launchDate: '2025-07-15', targetRaise: 5000000, minInvestment: 100, icon: Zap,
    imageUrl: 'abstract-solar-panels',
    details: 'SolarisChain busca democratizar el acceso a la inversión en energía solar, permitiendo a pequeños inversores participar en grandes proyectos fotovoltaicos. Utilizará contratos inteligentes para la distribución de beneficios y gobernanza.'
  },
  { 
    id: 2, name: 'AgroTokenX', symbol: 'AGTX', description: 'Plataforma para tokenizar commodities agrícolas y facilitar su comercio global.', 
    category: 'Agricultura', launchDate: '2025-08-01', targetRaise: 2000000, minInvestment: 50, icon: Rocket,
    imageUrl: 'modern-farm-automation',
    details: 'AgroTokenX permitirá a los productores agrícolas tokenizar sus cosechas, obteniendo liquidez inmediata y acceso a mercados internacionales. Los inversores podrán diversificar sus carteras con activos del mundo real.'
  },
  { 
    id: 3, name: 'EduVerse', symbol: 'EDUV', description: 'Metaverso educativo con NFTs para certificar habilidades y logros académicos.', 
    category: 'Educación', launchDate: '2025-09-10', targetRaise: 3000000, minInvestment: 75, icon: TrendingUp,
    imageUrl: 'futuristic-virtual-classroom',
    details: 'EduVerse creará un entorno de aprendizaje inmersivo donde los estudiantes podrán obtener certificaciones NFT verificables en la blockchain. Se enfocará en habilidades tecnológicas y desarrollo profesional.'
  },
];

export default function TokenizedProjectsPage() {
  const { playSound } = useSound();
  const { user, balances, buyProject } = useAuth();

  const [selectedProject, setSelectedProject] = useState(null);
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleViewDetails = (project) => {
    playSound('navigation');
    setSelectedProject(project);
    setInvestmentAmount('');
  };

  const handleInvest = async () => {
    if (!selectedProject) return;
    if (!user?.id) {
      playSound('error');
      toast({ title: 'Sin sesión', description: 'Inicia sesión para invertir.', variant: 'destructive' });
      return;
    }

    const amt = Number(investmentAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      playSound('error');
      toast({ title: 'Monto inválido', description: 'Ingresa un número válido.', variant: 'destructive' });
      return;
    }

    if (amt < Number(selectedProject.minInvestment)) {
      playSound('error');
      toast({
        title: 'Monto muy bajo',
        description: `El mínimo para ${selectedProject.symbol} es $${fmt(selectedProject.minInvestment)}.`,
        variant: 'destructive'
      });
      return;
    }

    const currentUsdc = Number(balances?.usdc ?? 0);
    if (amt > currentUsdc) {
      playSound('error');
      toast({ title: 'Fondos insuficientes', description: 'Tu saldo disponible no alcanza.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    playSound('invest');

    try {
      // ✅ RPC atómica: descuenta saldo y escribe wallet_transactions (reason: project_purchase)
      await buyProject({ projectName: selectedProject.name, amount: amt });

      // ⛳ (Opcional) Persistir metadata del proyecto en una tabla propia
      try {
        await supabase.from('project_investments').insert({
          user_id: user.id,
          project_symbol: selectedProject.symbol,
          project_name: selectedProject.name,
          amount_usd: amt,
          status: 'active',
        });
      } catch (metaErr) {
        console.warn('project_investments insert warn:', metaErr?.message);
      }

      toast({
        title: '¡Inversión realizada!',
        description: `Invertiste $${fmt(amt)} en ${selectedProject.name} (${selectedProject.symbol}).`
      });

      setSelectedProject(null);
      setInvestmentAmount('');
    } catch (e) {
      console.error('Error al invertir en proyecto:', e?.message || e);
      playSound('error');
      toast({
        title: 'Error',
        description: e?.message || 'No se pudo completar la inversión.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="space-y-8">
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
            Descubre e investe en los próximos grandes proyectos tokenizados.
          </p>
        </motion.div>

        {/* Saldo disponible */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Card className="crypto-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm font-medium">Saldo Disponible (App)</p>
                  <p className="text-3xl font-bold text-green-400 mt-1">${fmt(balances?.usdc ?? 0)}</p>
                </div>
                <div className="p-4 rounded-lg bg-green-500/10">
                  <Wallet className="h-8 w-8 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcomingProjects.map((project, index) => {
            const Icon = project.icon;
            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="crypto-card h-full flex flex-col">
                  <CardHeader>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-600 rounded-lg flex items-center justify-center">
                        <Icon className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl text-white">{project.name} ({project.symbol})</CardTitle>
                        <CardDescription className="text-blue-400">{project.category}</CardDescription>
                      </div>
                    </div>
                    <p className="text-slate-300 text-sm h-16 overflow-hidden">{project.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-3 flex-grow">
                    <div className="flex items-center text-sm text-slate-400">
                      <Calendar className="h-4 w-4 mr-2 text-purple-400" />
                      Lanzamiento: {new Date(project.launchDate).toLocaleDateString()}
                    </div>
                    <div className="flex items-center text-sm text-slate-400">
                      <DollarSign className="h-4 w-4 mr-2 text-green-400" />
                      Objetivo: ${project.targetRaise.toLocaleString()}
                    </div>
                    <div className="flex items-center text-sm text-slate-400">
                      <Users className="h-4 w-4 mr-2 text-orange-400" />
                      Inversión Mín.: ${project.minInvestment}
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

        {selectedProject && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedProject(null)}
          >
            <Card
              className="crypto-card w-full max-w-lg max-h[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader>
                <div className="flex items-center space-x-4 mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-600 rounded-lg flex items-center justify-center">
                    <Coins className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl text-white">
                      {selectedProject.name} ({selectedProject.symbol})
                    </CardTitle>
                    <CardDescription className="text-blue-400">{selectedProject.category}</CardDescription>
                  </div>
                </div>
                <p className="text-slate-300">{selectedProject.details}</p>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">Fecha de Lanzamiento:</p>
                    <p className="text-white font-semibold">
                      {new Date(selectedProject.launchDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Objetivo de Recaudación:</p>
                    <p className="text-white font-semibold">
                      ${selectedProject.targetRaise.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Inversión Mínima:</p>
                    <p className="text-white font-semibold">${selectedProject.minInvestment}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Monto a Invertir (USD)</Label>
                  <Input
                    type="number"
                    value={investmentAmount}
                    onChange={(e) => setInvestmentAmount(e.target.value)}
                    placeholder={`Mínimo $${selectedProject.minInvestment}`}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleInvest}
                    disabled={isSubmitting || !investmentAmount}
                    className="w-full bg-gradient-to-r from-green-500 to-teal-500 hover:from-green-600 hover:to-teal-600"
                  >
                    {isSubmitting ? 'Procesando…' : `Invertir en ${selectedProject.symbol}`}
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
