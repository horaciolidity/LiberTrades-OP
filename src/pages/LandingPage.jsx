import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Shield, 
  Users, 
  Wallet, 
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FaTelegramPlane, FaYoutube, FaTwitter, FaFacebookF, FaInstagram, FaDiscord } from 'react-icons/fa';


const LandingPage = () => {
  const features = [
    {
      icon: TrendingUp,
      title: 'Trading Simulado',
      description: 'Practica con nuestro simulador de trading en tiempo real'
    },
    {
      icon: Shield,
      title: 'Seguridad Avanzada',
      description: 'Protección de última generación para tus inversiones'
    },
    {
      icon: Users,
      title: 'Sistema de Referidos',
      description: 'Gana comisiones por cada usuario que refiera'
    },
    {
      icon: Wallet,
      title: 'Múltiples Criptomonedas',
      description: 'Invierte en BTC, ETH, USDT y más'
    }
  ];

  const plans = [
    {
      name: 'Básico',
      price: '$100 - $999',
      return: '1.5% diario',
      duration: '30 días'
    },
    {
      name: 'Estándar',
      price: '$1,000 - $4,999',
      return: '2.0% diario',
      duration: '30 días'
    },
    {
      name: 'Premium',
      price: '$5,000 - $19,999',
      return: '2.5% diario',
      duration: '30 días'
    },
    {
      name: 'VIP',
      price: '$20,000+',
      return: '3.0% diario',
      duration: '30 días'
    }
  ];

  const socialLinks = [
    { icon: FaTelegramPlane, href: '#', name: 'Telegram' },
    { icon: FaYoutube, href: '#', name: 'YouTube' },
    { icon: FaTwitter, href: '#', name: 'Twitter/X' },
    { icon: FaFacebookF, href: '#', name: 'Facebook' },
    { icon: FaInstagram, href: '#', name: 'Instagram' },
    { icon: FaDiscord, href: '#', name: 'Discord' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <nav className="fixed top-0 w-full z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                CryptoInvest Pro
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/login">
                <Button variant="ghost" className="text-white hover:text-green-400">
                  Iniciar Sesión
                </Button>
              </Link>
              <Link to="/register">
                <Button className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600">
                  Registrarse
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
              Invierte en el
              <span className="bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                {' '}Futuro Digital
              </span>
            </h1>
            <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto">
              Plataforma profesional de inversión en criptomonedas con planes configurables, 
              sistema de referidos multinivel y trading simulado en tiempo real.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register">
                <Button size="lg" className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-lg px-8 py-4">
                  Comenzar Ahora
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="text-lg px-8 py-4 border-slate-600 text-white hover:bg-slate-800">
                  Ver Demo
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-white mb-4">
              Características Principales
            </h2>
            <p className="text-xl text-slate-300">
              Todo lo que necesitas para invertir de manera inteligente
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: index * 0.1 }}
                >
                  <Card className="crypto-card h-full">
                    <CardHeader className="text-center">
                      <div className="mx-auto w-12 h-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center mb-4">
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <CardTitle className="text-white">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-slate-300 text-center">
                        {feature.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-800/50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-white mb-4">
              Planes de Inversión
            </h2>
            <p className="text-xl text-slate-300">
              Elige el plan que mejor se adapte a tu perfil de inversor
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {plans.map((plan, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.1 }}
              >
                <Card className="crypto-card h-full">
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl text-white">{plan.name}</CardTitle>
                    <CardDescription className="text-3xl font-bold text-green-400">
                      {plan.return}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-center space-y-4">
                    <div className="text-slate-300">
                      <p className="text-lg font-semibold">{plan.price}</p>
                      <p>Duración: {plan.duration}</p>
                    </div>
                    <Button className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600">
                      Seleccionar Plan
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8 }}
            >
              <div className="text-4xl font-bold text-green-400 mb-2">10,000+</div>
              <div className="text-slate-300">Usuarios Activos</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <div className="text-4xl font-bold text-blue-400 mb-2">$50M+</div>
              <div className="text-slate-300">Volumen Invertido</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <div className="text-4xl font-bold text-purple-400 mb-2">99.9%</div>
              <div className="text-slate-300">Uptime</div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-green-600 to-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl font-bold text-white mb-4">
              ¿Listo para comenzar tu viaje de inversión?
            </h2>
            <p className="text-xl text-white/90 mb-8">
              Únete a miles de inversores que ya están generando ganancias con CryptoInvest Pro
            </p>
            <Link to="/register">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-slate-100 text-lg px-8 py-4">
                Crear Cuenta Gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              CryptoInvest Pro
            </span>
          </div>
          <div className="flex justify-center space-x-6 mb-8">
            {socialLinks.map((social, index) => (
              <a
                key={index}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-green-400 transition-colors duration-300"
                aria-label={social.name}
              >
                <social.icon className="h-6 w-6" />
              </a>
            ))}
          </div>
          <div className="flex justify-center items-center text-slate-400 mb-2">
            <MessageSquare className="h-5 w-5 mr-2 text-blue-400" />
            <span>Soporte: support@cryptoinvestpro.com</span>
          </div>
          <p className="text-center text-slate-500">
            © {new Date().getFullYear()} CryptoInvest Pro. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;