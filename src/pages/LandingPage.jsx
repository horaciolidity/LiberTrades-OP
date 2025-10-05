import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Shield,
  Users,
  Wallet,
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FaTelegramPlane,
  FaYoutube,
  FaTwitter,
  FaFacebookF,
  FaInstagram,
  FaDiscord,
} from "react-icons/fa";
import { useData } from "@/contexts/DataContext";

/* ---------------- Configuración ---------------- */
const plans = [
  { name: "Básico", price: "$100 - $999", ret: "1.5% diario", duration: "30 días" },
  { name: "Estándar", price: "$1,000 - $4,999", ret: "2.0% diario", duration: "30 días" },
  { name: "Premium", price: "$5,000 - $19,999", ret: "2.5% diario", duration: "30 días" },
  { name: "VIP", price: "$20,000+", ret: "3.0% diario", duration: "30 días" },
];

const features = [
  { icon: TrendingUp, title: "Trading Simulado", description: "Practica en tiempo real con nuestro simulador" },
  { icon: Shield, title: "Seguridad Avanzada", description: "Infraestructura y custodia de nivel empresarial" },
  { icon: Users, title: "Referidos", description: "Gana comisiones por invitar amigos" },
  { icon: Wallet, title: "Criptos Soportadas", description: "Invierte con BTC, ETH, USDT y más" },
];

const socialLinks = [
  { icon: FaTelegramPlane, href: "#", name: "Telegram" },
  { icon: FaYoutube, href: "#", name: "YouTube" },
  { icon: FaTwitter, href: "#", name: "Twitter/X" },
  { icon: FaFacebookF, href: "#", name: "Facebook" },
  { icon: FaInstagram, href: "#", name: "Instagram" },
  { icon: FaDiscord, href: "#", name: "Discord" },
];

/* ---------------- Utilidades ---------------- */
const fmt = (n, d = 2) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : (0).toFixed(d);
};

const CryptoTicker = () => {
  const { cryptoPrices = {} } = useData() || {};
  const pairs = useMemo(() => ["BTC", "ETH", "USDT"], []);
  if (!pairs.length) return null;

  return (
    <div className="w-full overflow-hidden border-b border-slate-800 bg-slate-900/70 backdrop-blur">
      <div className="animate-[ticker_30s_linear_infinite] whitespace-nowrap py-2">
        <style>{`
          @keyframes ticker {
            0% { transform: translateX(0%); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
        {[...Array(2)].map((_, loop) => (
          <span key={loop}>
            {pairs.map((sym) => {
              const price = Number(cryptoPrices?.[sym]?.price ?? (sym === "USDT" ? 1 : 0));
              const chg = Number(cryptoPrices?.[sym]?.change ?? 0);
              const up = chg >= 0;
              return (
                <span
                  key={`${sym}-${loop}`}
                  className="inline-flex items-center gap-2 px-4 text-sm text-slate-300"
                >
                  <span className="font-semibold text-white">{sym}</span>
                  <span className="tabular-nums">
                    ${fmt(price, sym === "USDT" ? 4 : 2)}
                  </span>
                  <span
                    className={`inline-flex items-center ${
                      up ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {up ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {fmt(Math.abs(chg), 2)}%
                  </span>
                </span>
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );
};

const Counter = ({ to = 0, prefix = "", suffix = "", duration = 1200, className = "" }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setVal(to * p);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [to, duration]);
  return <span className={className}>{prefix}{fmt(val, 0)}{suffix}</span>;
};

const FAQItem = ({ q, a }) => (
  <details className="group border border-slate-700 rounded-lg p-4 bg-slate-800/40">
    <summary className="cursor-pointer list-none text-white font-medium flex items-center justify-between">
      <span>{q}</span>
      <span className="ml-4 text-slate-400 group-open:rotate-45 transition-transform">+</span>
    </summary>
    <p className="mt-3 text-slate-300">{a}</p>
  </details>
);

/* ---------------- Hero con imágenes ---------------- */
const TextImageCarousel = () => {
  const slides = [
    "/images/quiero_que_alguien_este_usando_su.jpeg",
    "/images/quiero_que_alguien_este_usando_su (1).jpeg",
    "/images/quiero_que_alguien_este_usando_su (3).jpeg",
  ];

  const [index, setIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full h-[80vh] flex items-center justify-center overflow-hidden rounded-[40px]">
      <AnimatePresence mode="wait">
        <motion.img
          key={slides[index]}
          src={slides[index]}
          alt="LiberTrades hero"
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/80"></div>

      <div className="relative z-10 text-center px-6">
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
          Invierte en el{" "}
          <span className="bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            Futuro Digital
          </span>
        </h1>
        <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-8">
          Planes configurables, trading simulado, sistema de referidos y cotizaciones en tiempo real — todo en una sola plataforma.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/register">
            <Button size="lg" className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-lg px-8 py-4">
              Comenzar Ahora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <Link to="/simulator">
            <Button size="lg" variant="outline" className="text-lg px-8 py-4 border-slate-600 text-white hover:bg-slate-800">
              Ver Demo
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Carrusel de videos tipo diapositiva (profesional con argumentos) ---------------- */
const VideoCarousel = () => {
  const videos = [
    {
      src: "/videos/media.mp4",
      title: "Trading en Tiempo Real",
      desc: "Viví la adrenalina del mercado minuto a minuto con operaciones inteligentes y precisas. Los bots de LiberTrades gestionan tus movimientos con análisis técnico avanzado para maximizar resultados.",
    },
    {
      src: "/videos/media2.mp4",
      title: "Ganancias del 5% al 20% mensual",
      desc: "Nuestros bots automatizados te permiten obtener rendimientos consistentes entre un 5% y 20% mensual. Vos decidís el riesgo, LiberTrades se encarga del resto: sin emociones, sin errores humanos.",
    },
    {
      src: "/videos/media3.mp4",
      title: "Automatización Inteligente",
      desc: "Activa tus bots, monitoreá su rendimiento y recibí ganancias en tiempo real. Tecnología, IA y estrategia se combinan para ofrecerte una experiencia de trading moderna y rentable.",
    },
  ];

  const [index, setIndex] = useState(0);
  const videoRefs = useRef([]);

  // Controla reproducción del video activo
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === index) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [index]);

  // Rotación automática cada 8s
  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % videos.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [videos.length]);

  return (
    <section className="relative w-full py-24 bg-gradient-to-b from-black via-slate-950 to-black overflow-hidden">
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="text-center text-4xl md:text-5xl font-bold text-white mb-12"
      >
        Experiencia LiberTrades
      </motion.h2>

      <div className="relative flex justify-center items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 1, ease: 'easeInOut' }}
            className="relative w-[90%] md:w-[70%] lg:w-[55%] rounded-[32px] overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.6)] border border-slate-800"
          >
            <video
              ref={(el) => (videoRefs.current[index] = el)}
              src={videos[index].src}
              muted
              loop
              playsInline
              preload="auto"
              autoPlay
              className="w-full h-[50vh] object-cover rounded-[32px]"
            />

            {/* Overlay suave */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

            {/* Texto descriptivo con más argumento */}
            <div className="absolute bottom-8 left-0 right-0 text-center text-white px-8">
              <h3 className="text-2xl md:text-3xl font-semibold mb-3 drop-shadow-lg">
                {videos[index].title}
              </h3>
              <p className="text-slate-200 text-sm md:text-lg max-w-2xl mx-auto leading-relaxed drop-shadow-md">
                {videos[index].desc}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Indicadores de diapositiva */}
      <div className="flex justify-center mt-8 space-x-3">
        {videos.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all duration-500 ${
              i === index ? 'bg-green-500 w-10' : 'bg-slate-600 w-4'
            }`}
          />
        ))}
      </div>
    </section>
  );
};

/* ---------------- Página principal ---------------- */
export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900">
      <CryptoTicker />

      {/* Navbar */}
      <nav className="sticky top-0 w-full z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
                LiberTrades
              </span>
            </Link>
            <div className="flex items-center space-x-3">
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

      {/* Hero */}
      <section className="relative pt-10 pb-20 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
        <TextImageCarousel />
      </section>

      {/* Carrusel de videos */}
      <VideoCarousel />

      {/* Features */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-white mb-3">Características Principales</h2>
            <p className="text-xl text-slate-300">Todo lo que necesitás para invertir mejor</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.05 }}
                >
                  <Card className="crypto-card h-full">
                    <CardHeader className="text-center">
                      <div className="mx-auto w-12 h-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-lg flex items-center justify-center mb-4">
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <CardTitle className="text-white">{f.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="text-slate-300 text-center">{f.description}</CardDescription>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-white mb-3">Planes de Inversión</h2>
            <p className="text-xl text-slate-300">Elegí el plan que mejor se adapte a tu perfil</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {plans.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.06 }}
              >
                <Card className="crypto-card h-full">
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl text-white">{p.name}</CardTitle>
                    <CardDescription className="text-3xl font-bold text-green-400">{p.ret}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center space-y-4">
                    <div className="text-slate-300">
                      <p className="text-lg font-semibold">{p.price}</p>
                      <p>Duración: {p.duration}</p>
                    </div>
                    <Link to="/plans">
                      <Button className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600">
                        Seleccionar Plan
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Métricas */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
              <div className="text-4xl font-bold text-green-400 mb-2">
                <Counter to={10000} suffix="+" />
              </div>
              <div className="text-slate-300">Usuarios Activos</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.05 }}>
              <div className="text-4xl font-bold text-blue-400 mb-2">
                <Counter to={50} prefix="$" suffix="M+" />
              </div>
              <div className="text-slate-300">Volumen Invertido</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}>
              <div className="text-4xl font-bold text-purple-400 mb-2">99.9%</div>
              <div className="text-slate-300">Uptime</div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-900/40">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold text-white mb-8 text-center"
          >
            Preguntas Frecuentes
          </motion.h2>

          <div className="space-y-4">
            <FAQItem
              q="¿Cómo funcionan los planes?"
              a="Elegís un plan, invertís el monto deseado y recibís un rendimiento diario fijo durante la duración del plan."
            />
            <FAQItem
              q="¿Puedo practicar antes de invertir?"
              a="Sí. Tenés acceso a un simulador de trading en tiempo real para practicar estrategias sin riesgo."
            />
            <FAQItem
              q="¿Cómo invito a amigos?"
              a="Cada usuario tiene un enlace de referido. Compartilo y ganá comisiones cuando se registren e inviertan."
            />
            <FAQItem
              q="¿Qué criptomonedas soportan?"
              a="Actualmente USDT, BTC y ETH para depósitos e inversiones. Seguimos agregando nuevas opciones."
            />
          </div>

          <p className="mt-6 text-xs text-slate-400 text-center">
            * Rendimientos estimados. Invertir en criptoactivos implica riesgos. Realizá tu propia investigación.
          </p>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-green-600 to-blue-600">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2 className="text-4xl font-bold text-white mb-4">¿Listo para empezar?</h2>
            <p className="text-lg text-white/90 mb-8">Unite a miles de inversores que ya usan LiberTrades.</p>
            <Link to="/register">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-slate-100 text-lg px-8 py-4">
                Crear Cuenta Gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              LiberTrades
            </span>
          </div>
          <div className="flex justify-center space-x-6 mb-6">
            {socialLinks.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-green-400 transition-colors"
                aria-label={s.name}
              >
                <s.icon className="h-6 w-6" />
              </a>
            ))}
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-center gap-3 text-sm text-slate-400 mb-2">
            <span className="inline-flex items-center">
              <MessageSquare className="h-4 w-4 mr-2 text-blue-400" />
              <a href="mailto:support@cryptoinvestpro.com" className="hover:text-slate-200">
                support@cryptoinvestpro.com
              </a>
            </span>
            <span className="hidden md:inline">•</span>
            <Link to="/terms" className="hover:text-slate-200">Términos</Link>
            <span className="hidden md:inline">•</span>
            <Link to="/privacy" className="hover:text-slate-200">Privacidad</Link>
          </div>

          <p className="text-center text-slate-600 text-sm">
            © {new Date().getFullYear()} LiberTrades. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
