import React, { useState, useEffect } from 'react';
import { 
  LogIn, Camera, FileUp, BookOpen, CheckCircle, ArrowRight, Sparkles, 
  ShieldCheck, Eye, Activity, Play, Pause, ChevronRight, ChevronLeft
} from 'lucide-react';

interface TutorialInteractivoEstudianteProps {
  onIniciarSesion: () => void;
  onRegistrarse: () => void;
}

interface PasoTutorial {
  numero: number;
  titulo: string;
  subtitulo: string;
  descripcion: string;
  icono: React.ComponentType<{ className?: string }>;
  color: string;
  badge: string;
  mockupTitulo: string;
  mockupEstado: string;
  contenidoVisual: 'login' | 'camara' | 'documento' | 'estudio' | 'finalizar';
}

export const TutorialInteractivoEstudiante: React.FC<TutorialInteractivoEstudianteProps> = ({
  onIniciarSesion,
  onRegistrarse
}) => {
  const pasos: PasoTutorial[] = [
    {
      numero: 1,
      titulo: 'Inicia Sesión',
      subtitulo: 'Acceso seguro al portal escolar',
      descripcion: 'Ingresa con tu usuario y contraseña institucional generada por tu colegio. Al autenticarte, accederás de inmediato a tu panel de estudio personalizado.',
      icono: LogIn,
      color: 'from-emerald-500 to-teal-400',
      badge: 'Paso 1: Credenciales',
      mockupTitulo: 'Portal del Estudiante • Autenticación',
      mockupEstado: 'Sesión activa • Conexión cifrada',
      contenidoVisual: 'login'
    },
    {
      numero: 2,
      titulo: 'Activa la Cámara',
      subtitulo: 'Visión protegida con malla 3D',
      descripcion: 'Enciende tu cámara web estándar con un solo clic. El algoritmo de MediaPipe calibrará tus puntos faciales garantizando máxima privacidad (Privacy by Design: tu video no se guarda).',
      icono: Camera,
      color: 'from-cyan-500 to-blue-500',
      badge: 'Paso 2: Biometría Ética',
      mockupTitulo: 'Calibración Biométrica • 900 Muestras',
      mockupEstado: '🛡️ Malla 3D Anonimizada • 60 FPS',
      contenidoVisual: 'camara'
    },
    {
      numero: 3,
      titulo: 'Carga tu Documento',
      subtitulo: 'Libros, temas y guías escolares',
      descripcion: 'Selecciona de tu biblioteca o sube el documento escolar en PDF de tu preferencia. Nuestro visor interactivo lo adaptará para lectura inmersiva sin distracciones.',
      icono: FileUp,
      color: 'from-amber-500 to-orange-400',
      badge: 'Paso 3: Biblioteca Digital',
      mockupTitulo: 'Visor de Lectura Inmersivo • PDF Digital',
      mockupEstado: 'Material activo: "Biología - Tema 2"',
      contenidoVisual: 'documento'
    },
    {
      numero: 4,
      titulo: 'Disfruta de la Lectura',
      subtitulo: 'Acompañamiento reactivo y avatar lúdico',
      descripcion: 'Lee a tu propio ritmo. Un amigable avatar y un resplandor perimetral inteligente te acompañarán suavemente en caso de que pierdas el foco o te sientas fatigado.',
      icono: BookOpen,
      color: 'from-violet-500 to-purple-400',
      badge: 'Paso 4: Modo Estudio Activo',
      mockupTitulo: 'Modo Estudio • Asistente Atencional',
      mockupEstado: 'IAI Atencional: 94% (Óptimo) 🟢',
      contenidoVisual: 'estudio'
    },
    {
      numero: 5,
      titulo: 'Finaliza Sesión',
      subtitulo: 'Cierre seguro con un solo botón',
      descripcion: 'Cuando concluyas tu lectura o periodo de clase, presiona el botón "Finalizar". La cámara se apagará automáticamente y tu tiempo de lectura quedará guardado para tu tutor.',
      icono: CheckCircle,
      color: 'from-rose-500 to-pink-500',
      badge: 'Paso 5: Consolidación BD',
      mockupTitulo: 'Resumen de Sesión • Progreso Consolidado',
      mockupEstado: 'Cámara OFF • Reporte generado',
      contenidoVisual: 'finalizar'
    }
  ];

  const [pasoActivo, setPasoActivo] = useState<number>(0);
  const [reproduciendo, setReproduciendo] = useState<boolean>(true);

  // Avance automático interactivo (cada 4.5 segundos)
  useEffect(() => {
    if (!reproduciendo) return;
    const interval = setInterval(() => {
      setPasoActivo((prev) => (prev + 1) % pasos.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [reproduciendo, pasos.length]);

  const paso = pasos[pasoActivo];
  const IconoPaso = paso.icono;

  return (
    <section className="py-20 px-6 max-w-7xl mx-auto w-full space-y-12">
      {/* Encabezado de la Sección */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-cyan-500/40 text-cyan-400 text-xs font-semibold uppercase tracking-wider shadow-lg">
          <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" /> Tutorial para Estudiantes
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-heading text-white tracking-tight">
          ¿Cómo Usar <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">NeuroFocus</span> en 5 Pasos?
        </h2>
        <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
          Diseñado para ser amigable, rápido y libre de frustraciones. Conoce la experiencia interactiva que vivirás al ingresar a tu portal de estudio.
        </p>
      </div>

      {/* Barra de Navegación de Pasos (Stepper Interactivo) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {pasos.map((p, idx) => {
          const PIcono = p.icono;
          const esActivo = pasoActivo === idx;
          return (
            <button
              key={p.numero}
              onClick={() => {
                setPasoActivo(idx);
                setReproduciendo(false);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                esActivo
                  ? 'bg-slate-900 border-cyan-500/80 shadow-lg shadow-cyan-500/15 scale-[1.02]'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 text-slate-400'
              }`}
            >
              {esActivo && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-cyan-400 animate-pulse" />
              )}
              <div className="flex items-center justify-between">
                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                  esActivo ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  {p.numero}
                </span>
                <PIcono className={`w-4 h-4 ${esActivo ? 'text-cyan-400' : 'text-slate-500'}`} />
              </div>
              <p className={`font-bold text-xs mt-3 truncate ${esActivo ? 'text-white' : 'text-slate-300'}`}>
                {p.titulo}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                {p.subtitulo}
              </p>
            </button>
          );
        })}
      </div>

      {/* Escenario Demostrativo (Mockup Animado + Explicación) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center glass-panel p-6 sm:p-10 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl -z-10" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl -z-10" />

        {/* Columna Izquierda: Explicación del Paso Actual */}
        <div className="lg:col-span-5 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs font-mono font-semibold text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            {paso.badge}
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-3">
              <span className={`p-2.5 rounded-2xl bg-gradient-to-br ${paso.color} text-slate-950 shadow-md`}>
                <IconoPaso className="w-6 h-6" />
              </span>
              {paso.titulo}
            </h3>
            <p className="text-cyan-400 font-semibold text-sm">
              {paso.subtitulo}
            </p>
          </div>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            {paso.descripcion}
          </p>

          {/* Controles de Reproducción y Navegación */}
          <div className="pt-4 flex items-center gap-3">
            <button
              onClick={() => {
                setPasoActivo((prev) => (prev - 1 + pasos.length) % pasos.length);
                setReproduciendo(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer"
              title="Paso Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setReproduciendo(!reproduciendo)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition text-xs font-semibold flex items-center gap-2 cursor-pointer"
            >
              {reproduciendo ? (
                <>
                  <Pause className="w-3.5 h-3.5 text-amber-400" /> Pausar Animación
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-emerald-400" /> Reproducción Automática
                </>
              )}
            </button>
            <button
              onClick={() => {
                setPasoActivo((prev) => (prev + 1) % pasos.length);
                setReproduciendo(false);
              }}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer"
              title="Siguiente Paso"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={onIniciarSesion}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition cursor-pointer"
            >
              <LogIn className="w-4 h-4" /> Probar Ahora (Iniciar Sesión)
            </button>
          </div>
        </div>

        {/* Columna Derecha: Mockup Visual Simulado del Software */}
        <div className="lg:col-span-7">
          <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
            {/* Barra de Título del Mockup */}
            <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-mono text-[11px] text-slate-400 font-semibold">{paso.mockupTitulo}</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono">
                {paso.mockupEstado}
              </span>
            </div>

            {/* Contenido Visual Interactivo Según el Paso */}
            <div className="p-6 sm:p-8 min-h-[300px] flex items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900/80">
              {paso.contenidoVisual === 'login' && (
                <div className="w-full max-w-sm p-6 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-4 shadow-xl animate-in fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <LogIn className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-xs">Portal Institucional</p>
                      <p className="text-[10px] text-slate-400">U.E. Luis Barrancos Álvarez</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]">
                      estudiante@barrancos.edu.bo
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 font-mono text-[11px]">
                      ••••••••••••••••
                    </div>
                  </div>
                  <div className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs text-center shadow-md shadow-emerald-500/20">
                    Ingresar al Portal
                  </div>
                </div>
              )}

              {paso.contenidoVisual === 'camara' && (
                <div className="w-full max-w-md aspect-video bg-slate-950 border border-slate-800 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center shadow-xl animate-in fade-in duration-300">
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
                  {/* Malla Facial Biométrica Simulada */}
                  <div className="relative w-28 h-36 border border-emerald-400/50 rounded-full flex flex-col items-center justify-center shadow-lg shadow-emerald-500/10">
                    <div className="flex justify-between w-16 mb-2">
                      <span className="w-3 h-1.5 border border-cyan-400 rounded-full animate-pulse" />
                      <span className="w-3 h-1.5 border border-cyan-400 rounded-full animate-pulse" />
                    </div>
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full my-1" />
                    <span className="w-8 h-1 border-b border-cyan-400 rounded-full" />
                    <span className="absolute -bottom-3 text-[9px] font-mono text-emerald-400 bg-slate-950/90 px-2 py-0.5 rounded border border-emerald-500/30">
                      EAR: 0.31 | PnP: 0.1°
                    </span>
                  </div>
                  <div className="absolute top-3 left-3 px-2 py-1 rounded bg-slate-900/90 border border-emerald-500/40 text-[9px] text-emerald-300 font-mono flex items-center gap-1.5">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" /> Privacy by Design Activo
                  </div>
                </div>
              )}

              {paso.contenidoVisual === 'documento' && (
                <div className="w-full max-w-sm p-5 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-3 shadow-xl animate-in fade-in duration-300">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <FileUp className="w-4 h-4 text-amber-400" /> Mis Documentos y Tareas
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">3 archivos</span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-3 bg-slate-950 border border-amber-500/40 rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">PDF</span>
                        <div className="truncate">
                          <p className="font-semibold text-white truncate">Biología_Unidad_2.pdf</p>
                          <p className="text-[10px] text-slate-400">12 páginas • Asignado hoy</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[10px] shrink-0">
                        Abrir
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center gap-2.5 text-xs text-slate-400">
                      <span className="p-1 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">PDF</span>
                      <span className="truncate">Historia_Capitulo_4.pdf</span>
                    </div>
                  </div>
                </div>
              )}

              {paso.contenidoVisual === 'estudio' && (
                <div className="w-full max-w-md p-5 bg-slate-900/90 border border-violet-500/40 rounded-2xl space-y-4 shadow-xl shadow-violet-500/10 animate-in fade-in duration-300 relative">
                  {/* Simulación del Resplandor Atencional (Border Glow) */}
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-emerald-400/40 pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🦊</span>
                      <div>
                        <p className="text-xs font-bold text-white">Learning Buddy</p>
                        <p className="text-[10px] text-emerald-400">¡Excelente enfoque! Mantén el ritmo.</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 font-mono">
                      IAI: 95%
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="h-2 w-3/4 bg-slate-700 rounded-full" />
                    <div className="h-2 w-full bg-slate-800 rounded-full" />
                    <div className="h-2 w-5/6 bg-slate-800 rounded-full" />
                  </div>
                </div>
              )}

              {paso.contenidoVisual === 'finalizar' && (
                <div className="w-full max-w-sm p-6 bg-slate-900/80 border border-rose-500/30 rounded-2xl space-y-4 text-center shadow-xl animate-in fade-in duration-300">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-white font-bold text-sm">Sesión Concluida con Éxito</p>
                    <p className="text-xs text-slate-400">La cámara web se apagó y tus métricas fueron guardadas.</p>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-left space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Tiempo de estudio:</span>
                      <strong className="text-white font-mono">42 minutos</strong>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Nivel de atención:</span>
                      <strong className="text-emerald-400 font-mono">92% Promedio</strong>
                    </div>
                  </div>
                  <div className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/30">
                    Finalizar
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
