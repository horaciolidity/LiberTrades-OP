import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  Copy, 
  DollarSign, 
  TrendingUp,
  Share2,
  Gift,
  Crown,
  Star
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { toast } from '@/components/ui/use-toast';

const ReferralSystem = () => {
  const { user } = useAuth();
  const { getReferrals } = useData();
  const [referrals, setReferrals] = useState([]);
  const [referralLink, setReferralLink] = useState('');

  useEffect(() => {
    if (user) {
      setReferrals(getReferrals(user.id));
      setReferralLink(`${window.location.origin}/register?ref=${user.referralCode}`);
    }
  }, [user, getReferrals]);

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast({
      title: "¡Enlace copiado!",
      description: "El enlace de referido ha sido copiado al portapapeles",
    });
  };

  const shareReferralLink = () => {
    if (navigator.share) {
      navigator.share({
        title: 'CryptoInvest Pro - Únete y gana dinero',
        text: '¡Únete a CryptoInvest Pro y comienza a invertir en criptomonedas!',
        url: referralLink,
      });
    } else {
      copyReferralLink();
    }
  };

  const totalEarnings = referrals.length * 50; // $50 por referido
  const activeReferrals = referrals.filter(ref => {
    const lastActivity = new Date(ref.createdAt);
    const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceActivity <= 30;
  }).length;

  const getReferralLevel = (count) => {
    if (count >= 100) return { name: 'Diamante', icon: Crown, color: 'text-purple-400', bg: 'bg-purple-500/10' };
    if (count >= 50) return { name: 'Oro', icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    if (count >= 20) return { name: 'Plata', icon: TrendingUp, color: 'text-gray-400', bg: 'bg-gray-500/10' };
    if (count >= 5) return { name: 'Bronce', icon: Gift, color: 'text-orange-400', bg: 'bg-orange-500/10' };
    return { name: 'Principiante', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' };
  };

  const currentLevel = getReferralLevel(referrals.length);
  const nextLevel = getReferralLevel(referrals.length + 1);

  const stats = [
    {
      title: 'Total Referidos',
      value: referrals.length.toString(),
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Referidos Activos',
      value: activeReferrals.toString(),
      icon: TrendingUp,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Ganancias Totales',
      value: `$${totalEarnings.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10'
    },
    {
      title: 'Nivel Actual',
      value: currentLevel.name,
      icon: currentLevel.icon,
      color: currentLevel.color,
      bgColor: currentLevel.bg
    }
  ];

  const referralBenefits = [
    {
      level: 'Principiante',
      referrals: '1-4 referidos',
      commission: '$50 por referido',
      bonus: 'Bono de bienvenida'
    },
    {
      level: 'Bronce',
      referrals: '5-19 referidos',
      commission: '$75 por referido',
      bonus: 'Acceso a webinars exclusivos'
    },
    {
      level: 'Plata',
      referrals: '20-49 referidos',
      commission: '$100 por referido',
      bonus: 'Asesoría personalizada'
    },
    {
      level: 'Oro',
      referrals: '50-99 referidos',
      commission: '$150 por referido',
      bonus: 'Acceso VIP + Señales premium'
    },
    {
      level: 'Diamante',
      referrals: '100+ referidos',
      commission: '$200 por referido',
      bonus: 'Todos los beneficios + Participación en ganancias'
    }
  ];

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-3xl font-bold text-white mb-2">
            Sistema de Referidos
          </h1>
          <p className="text-slate-300">
            Invita amigos y gana comisiones por cada referido activo
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={index}
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
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
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
                    <Input
                      value={referralLink}
                      readOnly
                      className="bg-slate-800 border-slate-600 text-white"
                    />
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
                    <span className="text-2xl font-bold text-green-400">{user?.referralCode}</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(user?.referralCode);
                        toast({
                          title: "¡Código copiado!",
                          description: "El código de referido ha sido copiado",
                        });
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Referral Progress */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
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
                  <p className="text-slate-300">
                    {referrals.length} referidos totales
                  </p>
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
                    {currentLevel.name !== 'Principiante' && (
                      <li>• Bonos adicionales de nivel</li>
                    )}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Referral Benefits Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
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
                    {referralBenefits.map((benefit, index) => (
                      <tr 
                        key={index} 
                        className={`border-b border-slate-700/50 ${
                          benefit.level === currentLevel.name ? 'bg-green-500/10' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${
                            benefit.level === currentLevel.name ? 'text-green-400' : 'text-white'
                          }`}>
                            {benefit.level}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{benefit.referrals}</td>
                        <td className="py-3 px-4 text-green-400 font-semibold">{benefit.commission}</td>
                        <td className="py-3 px-4 text-slate-300">{benefit.bonus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Referrals List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          <Card className="crypto-card">
            <CardHeader>
              <CardTitle className="text-white">Tus Referidos</CardTitle>
              <CardDescription className="text-slate-300">
                Lista de usuarios que se registraron con tu código
              </CardDescription>
            </CardHeader>
            <CardContent>
              {referrals.length > 0 ? (
                <div className="space-y-4">
                  {referrals.map((referral, index) => (
                    <div key={referral.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg">
                      <div>
                        <p className="text-white font-medium">{referral.name}</p>
                        <p className="text-slate-400 text-sm">
                          Registrado: {new Date(referral.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-semibold">+$50.00</p>
                        <p className="text-slate-400 text-sm">Comisión ganada</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Aún no tienes referidos</p>
                  <p className="text-slate-500 text-sm">Comparte tu enlace para comenzar a ganar</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </Layout>
  );
};

export default ReferralSystem;