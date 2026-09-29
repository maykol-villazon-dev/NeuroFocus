import React from 'react';
import { 
  ShieldCheck, Camera, Sparkles, Activity, Eye, Cpu, Lock, 
  ArrowRight, Mail, Phone, Facebook, Instagram, Youtube, Linkedin, UserPlus, LogIn, CheckCircle2
} from 'lucide-react';

interface LandingPageProps {
  onAbrirLogin: () => void;
  onAbrirRegistro: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onAbrirLogin, onAbrirRegistro }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* 1. HERO SECTION */}
      <section className="relative pt-12 pb-20 px-6 max-w-7xl mx-auto w-full space-y-12">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-to-tr from-emerald-500/20 via-violet-500/20 to-cyan-500/20 rounded-full blur-[120px] -z-10"></div>
        
        <div className="text-center max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-emerald-500/40 text-emerald-400 text-xs font-semibold uppercase tracking-wider shadow-lg">
            <Sparkles className="w-4 h-4 animate-pulse" /> Monitoreo Multimodal No Invasivo a 60 FPS
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold font-heading text-white tracking-tight leading-tight">
            Monitoreo Multimodal de Atención para Estudiantes con <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">TDAH</span>
          </h1>

          <p className="text-slate-300 text-base sm:text-lg max-w-3xl mx-auto leading-relaxed">
            Plataforma computacional web desarrollada para la <strong>U.E. Luis Barrancos Álvarez</strong>. Fusiona visión por computador (MediaPipe), modelos biométricos (EAR, PnP, Varianza) y asistencia lúdica reactiva para mitigar la desconexión en clases digitales.
          </p>

          {/* Botones CTA Principales */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={onAbrirRegistro}
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-2xl shadow-xl shadow-emerald-500/25 flex items-center gap-2 transition transform hover:-translate-y-0.5"
            >
              <UserPlus className="w-5 h-5" /> Registrarse Gratis
            </button>
            <button
              onClick={onAbrirLogin}
              className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl border border-slate-700 hover:border-slate-500 flex items-center gap-2 transition transform hover:-translate-y-0.5"
            >
              <LogIn className="w-5 h-5 text-emerald-400" /> Iniciar Sesión <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Banner de Garantías Clave */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex items-start gap-4">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Privacy by Design</h3>
              <p className="text-xs text-slate-400 mt-1">Cero almacenamiento de video en disco. Procesamiento exclusivo de vectores numéricos en RAM volátil.</p>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex items-start gap-4">
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-400 shrink-0">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Cámara Web RGB Estándar</h3>
              <p className="text-xs text-slate-400 mt-1">Sin sensores invasivos en el cuerpo. Funciona con cualquier webcam estándar a 720p/1080p.</p>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex items-start gap-4">
            <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-2xl text-violet-400 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Reenganche Lúdico</h3>
              <p className="text-xs text-slate-400 mt-1">Avatar interactivo silencioso y resplandor perimetral (Border Glow) sin estigmatización.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. GRID DE TECNOLOGÍAS BIOMÉTRICAS */}
      <section className="py-16 px-6 bg-slate-900/40 border-y border-slate-800/80">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl font-extrabold font-heading text-white">Fundamento Técnico y Biométrico</h2>
            <p className="text-slate-400 text-sm">Integración multimodal de algoritmos de visión por computador y modelos estadísticos</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4 hover:border-emerald-500/50 transition">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Eye className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Apertura Ocular (EAR)</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Calcula la relación de aspecto Eye Aspect Ratio (EAR) a partir de los puntos palpebrales para cuantificar el parpadeo y detectar episodios de micro-somnolencia.
              </p>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4 hover:border-cyan-500/50 transition">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Pose Cefálica 3D (PnP)</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Resuelve el problema Perspective-n-Point estimando los ángulos de Euler (Yaw, Pitch, Roll) para determinar si la mirada del alumno sale del monitor.
              </p>
            </div>

            <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4 hover:border-amber-500/50 transition">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Inquietud Motriz (Fidgeting)</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Mide la varianza cinemática en la posición de hombros y torso para registrar desplazamientos corporales continuos o balanceo en la silla.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* 3. SECCIÓN DE MISIÓN Y VISIÓN */}
      <section className="py-20 px-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          
          <div className="glass-panel p-10 rounded-3xl border border-slate-800 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10"></div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase">
              Misión Institucional
            </div>
            <h2 className="text-3xl font-extrabold font-heading text-white">Nuestra Misión</h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Proporcionar una herramienta tecnológica no invasiva basada en visión por computador para detectar oportunamente episodios de desatención y fatiga en estudiantes con TDAH, ofreciendo apoyo lúdico reactivo y reportes analíticos objetivos al cuerpo docente y psicopedagógico de la U.E. Luis Barrancos Álvarez.
            </p>
          </div>

          <div className="glass-panel p-10 rounded-3xl border border-slate-800 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -z-10"></div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase">
              Visión Institucional
            </div>
            <h2 className="text-3xl font-extrabold font-heading text-white">Nuestra Visión</h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Transformar los entornos de aprendizaje digital escolar en espacios inclusivos, adaptativos y protegidos que optimicen la retención atencional y el seguimiento psicopedagógico clínico-académico en instituciones educativas y de apoyo integral.
            </p>
          </div>

        </div>
      </section>

      {/* 4. FOOTER COMPLETO ACTUALIZADO (NEUROFOCUS AI) */}
      <footer className="mt-auto bg-slate-950 border-t border-slate-800/80 pt-16 pb-12 px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            
            {/* Columna 1: Brand & Contacto Personalizado (NEUROFOCUS AI) */}
            <div className="md:col-span-1 space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src="/Logo.jpg"
                  alt="NEUROFOCUS AI Logo"
                  className="w-12 h-12 rounded-full object-contain bg-white p-0.5 shadow-lg shadow-cyan-500/20 shrink-0"
                />
                <div>
                  <h3 className="text-lg font-extrabold font-heading text-white tracking-wide">NEUROFOCUS <span className="text-cyan-400">AI</span></h3>
                  <p className="text-[9px] text-slate-400 font-mono tracking-wider uppercase font-semibold">ENTERPRISE AI EDUCATION TECHNOLOGY</p>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-400 pt-2">
                <p className="flex items-center gap-2 hover:text-emerald-400 transition">
                  <Mail className="w-4 h-4 text-emerald-400" /> lokyamvf15@gmail.com
                </p>
                <p className="flex items-center gap-2 hover:text-emerald-400 transition">
                  <Phone className="w-4 h-4 text-emerald-400" /> +591 71322951
                </p>
              </div>

              <button
                onClick={onAbrirRegistro}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-lg shadow-emerald-500/20"
              >
                Regístrate gratis
              </button>
            </div>

            {/* Columna 2: Inicia hoy */}
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-white uppercase tracking-wider">Inicia hoy</h4>
              <ul className="space-y-2 text-slate-400">
                <li><button onClick={onAbrirRegistro} className="hover:text-emerald-400 transition">Regístrate</button></li>
                <li><button onClick={onAbrirLogin} className="hover:text-emerald-400 transition">Iniciar Sesión</button></li>
              </ul>
            </div>

            {/* Columna 3: Leer Más */}
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-white uppercase tracking-wider">Leer Más</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#terminos" className="hover:text-emerald-400 transition">Términos y Condiciones</a></li>
                <li><a href="#privacidad" className="hover:text-emerald-400 transition">Políticas de Privacidad</a></li>
              </ul>
            </div>

            {/* Columna 4: Nosotros & UAGRM */}
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-white uppercase tracking-wider">Nosotros</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="#mision" className="hover:text-emerald-400 transition">Misión Institucional</a></li>
                <li><a href="#vision" className="hover:text-emerald-400 transition">Visión Institucional</a></li>
                <li><span className="text-slate-400">Desarrolladores: UAGRM FICCT</span></li>
              </ul>
            </div>

          </div>

          {/* Redes Sociales e Iconos */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-slate-900">
            <div className="flex items-center gap-4">
              <a href="#facebook" className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition">
                <Facebook className="w-4 h-4" />
              </a>
              <a href="#instagram" className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition">
                <Instagram className="w-4 h-4" />
              </a>
              <a href="#youtube" className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition">
                <Youtube className="w-4 h-4" />
              </a>
              <a href="#linkedin" className="w-9 h-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 transition">
                <Linkedin className="w-4 h-4" />
              </a>
            </div>

            <p className="text-xs text-slate-500 text-center sm:text-right">
              © 2026 NEUROFOCUS AI. Todos los derechos reservados. <br className="hidden sm:inline" />
              Desarrollado con el apoyo de UAGRM FICCT.
            </p>
          </div>

        </div>
      </footer>

    </div>
  );
};
