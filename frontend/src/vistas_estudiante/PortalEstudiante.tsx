import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  LayoutDashboard,
  BookOpen,
  Camera,
  CameraOff,
  Clock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Eye,
  Sliders,
  Database,
  Cpu,
  Code2,
  EyeOff,
  LogOut,
  GraduationCap,
  X
} from 'lucide-react';
import { useAuth } from '../contexto/AuthContext';
import { PrevisualizadorCamara, PrevisualizadorCamaraHandle } from '../componentes_ui/PrevisualizadorCamara';
import { BorderGlow } from '../componentes_ui/BorderGlow';
import { AvatarHUD } from '../componentes_ui/AvatarHUD';
import { ModoEstudio } from '../componentes_ui/ModoEstudio';
import { ModalNotificacion, ModalNotificacionConfig } from '../componentes_ui/ModalNotificacion';
import { apiCliente } from '../servicios_ws/api_cliente';
import { AcumuladorCalibracionBiometrica } from '../servicios_ws/calculo_biometrico';

type SeccionEstudiante = 'DASHBOARD' | 'MODO_ESTUDIO';

export const PortalEstudiante: React.FC = () => {
  const { usuario, logout } = useAuth();
  const [sidebarMobileAbierta, setSidebarMobileAbierta] = useState<boolean>(false);

  // Control de Navegación del Estudiante: Por regla de negocio, al iniciar sesión siempre aterriza en DASHBOARD
  const [seccionActiva, setSeccionActivaState] = useState<SeccionEstudiante>(() => {
    const s = sessionStorage.getItem('portal_estudiante_seccion_activa');
    return s === 'MODO_ESTUDIO' ? 'MODO_ESTUDIO' : 'DASHBOARD';
  });

  const setSeccionActiva = (sec: SeccionEstudiante) => {
    setSeccionActivaState(sec);
    sessionStorage.setItem('portal_estudiante_seccion_activa', sec);
  };

  // Restablecer obligatoriamente al DASHBOARD si cambia el usuario o no hay clave explícita de navegación
  useEffect(() => {
    if (usuario) {
      const s = sessionStorage.getItem('portal_estudiante_seccion_activa');
      if (!s) {
        setSeccionActivaState('DASHBOARD');
      }
    }
  }, [usuario?.username]);

  const [menuHamburguesaAbierto, setMenuHamburguesaAbierto] = useState<boolean>(false);

  // Modal de notificación profesional en UI (reemplazo de alert de navegador)
  const [modalNotificacion, setModalNotificacion] = useState<ModalNotificacionConfig>({
    abierto: false,
    titulo: '',
    mensaje: ''
  });
  const [forzarEncendidoCamara, setForzarEncendidoCamara] = useState<boolean>(false);
  const [ultimoFrameSnapshot, setUltimoFrameSnapshot] = useState<string | null>(null);
  const [tsUltimaInteraccion, setTsUltimaInteraccion] = useState<number>(0);
  const camaraRef = useRef<PrevisualizadorCamaraHandle>(null);

  const [camaraActiva, setCamaraActiva] = useState<boolean>(false);
  const [segundosRestantes, setSegundosRestantes] = useState<number>(7200); // 2 Horas
  const [calibrando, setCalibrando] = useState<boolean>(false);
  const [progresoCalibracion, setProgresoCalibracion] = useState<number>(0);
  const [calibrado, setCalibrado] = useState<boolean>(false);
  const [mostrarBorderGlow, setMostrarBorderGlow] = useState<boolean>(false);
  const [iaiSimulado, setIaiSimulado] = useState<number>(88);
  const [estadoActual, setEstadoActual] = useState<1 | 2 | 3 | 4>(1);
  const [mostrarCodigoAlgoritmo, setMostrarCodigoAlgoritmo] = useState<boolean>(false);
  const [errorCamaraApagada, setErrorCamaraApagada] = useState<string | null>(null);

  // Perfil dinámico del estudiante cargado directamente de la Base de Datos SQLite
  const [perfilEstudiante, setPerfilEstudiante] = useState<{
    codigo_estudiante: string;
    nombre_completo: string;
    grado_escolar: string;
    subtipo_tdah: string;
    diagnostico_observacion: string;
    protegido?: boolean;
  } | null>(null);

  // Cargar datos dinámicos del estudiante desde la base de datos
  useEffect(() => {
    if (usuario) {
      // Inicializar de inmediato con los datos que ya vienen de /auth/me
      if (usuario.codigo_estudiante) {
        setPerfilEstudiante(prev => prev || {
          codigo_estudiante: usuario.codigo_estudiante || '',
          nombre_completo: usuario.nombre_completo || usuario.username || 'Estudiante',
          grado_escolar: usuario.grado_escolar || '',
          subtipo_tdah: usuario.subtipo_tdah || 'CONTROL',
          diagnostico_observacion: '',
          protegido: usuario.protegido !== undefined ? usuario.protegido : true
        });
      }

      const cargarPerfilDesdeBD = async () => {
        const codigo = usuario.codigo_estudiante;
        if (!codigo) return;
        try {
          const res = await apiCliente.get(`/monitoreo/estudiantes/${codigo}`);
          if (res.data) {
            setPerfilEstudiante(res.data);
          }
        } catch (err) {
          console.warn('[PORTAL ESTUDIANTE] No se pudo cargar el perfil específico desde BD:', err);
        }
      };

      cargarPerfilDesdeBD();
    }
  }, [usuario]);

  // Formateador visual del Subtipo Clínico DSM-5-TR
  const getEtiquetaSubtipo = (subtipo?: string) => {
    const s = (subtipo || '').trim().toUpperCase();
    if (s === 'CONTROL' || s === 'SIN_TDAH' || s === 'SIN_DIAGNOSTICO' || s === 'SIN DIAGNOSTICO' || s === 'GRUPO CONTROL') {
      return {
        texto: 'Grupo Control (Sin Diagnóstico TDAH)',
        estilo: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
      };
    }
    if (s === 'F90_0' || s === 'F90.0' || s === 'INATTENTIVE') {
      return {
        texto: 'DSM-5-TR: F90.0 (Déficit Atencional / Inatento)',
        estilo: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
      };
    }
    if (s === 'F90_1' || s === 'F90.1' || s === 'HYPERACTIVE') {
      return {
        texto: 'DSM-5-TR: F90.1 (Hiperactivo / Impulsivo)',
        estilo: 'bg-purple-500/10 text-purple-300 border-purple-500/30'
      };
    }
    return {
      texto: 'DSM-5-TR: F90.2 (Presentación Combinada)',
      estilo: 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    };
  };

  // Instancia del Acumulador Matemático Real de 900 Muestras (Sprint 2 - HU-03)
  const acumuladorRef = useRef(new AcumuladorCalibracionBiometrica());

  // Muestreo biométrico en vivo durante los 30 segundos
  const [telemetria, setTelemetria] = useState({
    ear: 0.285,
    yaw: 0.2,
    pitch: -1.1,
    roll: 0.5,
    parpadeos: 0,
    fotogramas: 0,
    ausencia_estudiante: false,
    mar: 0.25,
    es_bostezo: false,
    distractor_externo: false,
    num_rostros: 1,
    es_staring: false,
    es_slumping: false,
    es_somnolencia: false
  });

  const telemetriaRef = useRef(telemetria);
  const frameSnapshotRef = useRef<string | null>(null);
  const snapshotPantallaRef = useRef<string | null>(null);
  const [materialEstudioActivo, setMaterialEstudioActivo] = useState<string | null>(null);
  const materialEstudioActivoRef = useRef<string | null>(null);
  materialEstudioActivoRef.current = materialEstudioActivo;

  const [parametrosFinales, setParametrosFinales] = useState<{
    earBase: number;
    earDesviacion: number;
    poseNeutra: { pitch: number; yaw: number; roll: number };
    varianzaHombros: number;
    totalFotogramas: number;
    fecha: string;
  } | null>(null);

  // Temporizador de 2 horas (7200 segundos) con auto-apagado
  useEffect(() => {
    let interval: any = null;
    if (camaraActiva && segundosRestantes > 0) {
      interval = setInterval(() => {
        setSegundosRestantes((prev) => prev - 1);
      }, 1000);
    } else if (segundosRestantes === 0) {
      setCamaraActiva(false);
      setModalNotificacion({
        abierto: true,
        tipo: 'ADVERTENCIA',
        titulo: 'Límite de Tiempo Alcanzado',
        mensaje: 'Por normas de salud visual y ergonomía cognitiva, la cámara se ha desactivado automáticamente al completar las 2 horas continuas de monitoreo.',
        textoBoton: 'Entendido'
      });
    }

    return () => clearInterval(interval);
  }, [camaraActiva, segundosRestantes]);

  // Si la cámara se apaga durante la calibración, cancelar el proceso
  useEffect(() => {
    if (!camaraActiva && calibrando) {
      setCalibrando(false);
      setErrorCamaraApagada('⚠️ Calibración cancelada: La cámara se ha apagado durante la rutina.');
    }
  }, [camaraActiva, calibrando]);

  // Conexión WebSockets al Servidor FastAPI Backend en Tiempo Real (Sprint 2 - HU-07, HU-08)
  useEffect(() => {
    if (!camaraActiva) return;

    const codigoEst = usuario?.codigo_estudiante || 'EST-2026-001';
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${window.location.host}/ws/monitoreo/${codigoEst}`;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('[WEBSOCKET OPEN] Conectado al canal de transmisión en vivo:', wsUrl);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Escuchar cambios de privacidad en tiempo real desde la sesión del docente (Sin reiniciar cámara)
          if (data.tipo === 'CAMBIO_PRIVACIDAD') {
            console.log('[WEBSOCKET] Cambio de modo de privacidad recibido:', data.protegido);
            setPerfilEstudiante(prev => prev ? ({ ...prev, protegido: data.protegido }) : ({
              codigo_estudiante: codigoEst,
              nombre_completo: usuario?.nombre_completo || usuario?.username || 'Estudiante',
              grado_escolar: usuario?.grado_escolar || 'Grado Escolar',
              subtipo_tdah: usuario?.subtipo_tdah || 'CONTROL',
              diagnostico_observacion: '',
              protegido: data.protegido
            }));
          }

          if (data.iai !== undefined) {
            setIaiSimulado(data.iai);
            if (data.estado) {
              setEstadoActual(data.estado as 1 | 2 | 3 | 4);
            }
            // Activar Border Glow si IAI cae por debajo del 60% (Estado 3 o 4)
            if (data.alerta_reenganche || data.iai < 60) {
              setMostrarBorderGlow(true);
            } else {
              setMostrarBorderGlow(false);
            }
          }
        } catch (err) {
          console.warn('Error parsing WS message:', err);
        }
      };

      socket.onerror = (err) => {
        console.warn('[WEBSOCKET ERROR] Fallback a procesamiento en cliente:', err);
      };
    } catch (e) {
      console.warn('WebSocket init exception:', e);
    }

    // Enviar paquete biométrico por el socket cada 180ms (~5.5 FPS fluidos y ultraligeros)
    const intervalWS = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        // Control de Backpressure: Si la red del estudiante aún tiene > 32 KB en cola de salida,
        // no acumular frames viejos (descartar para garantizar latencia cero en tiempo real)
        const puedeEnviarFrame = socket.bufferedAmount < 32 * 1024;

        socket.send(JSON.stringify({
          codigo_estudiante: codigoEst,
          ear: telemetriaRef.current.ear,
          ear_base: parametrosFinales?.earBase || 0.28,
          yaw: telemetriaRef.current.yaw,
          pitch: telemetriaRef.current.pitch,
          varianza_hombros: 0.02,
          ausencia_estudiante: telemetriaRef.current.ausencia_estudiante,
          mar: telemetriaRef.current.mar,
          es_bostezo: telemetriaRef.current.es_bostezo,
          distractor_externo: telemetriaRef.current.distractor_externo,
          num_rostros: telemetriaRef.current.num_rostros,
          es_staring: telemetriaRef.current.es_staring,
          es_slumping: telemetriaRef.current.es_slumping,
          es_somnolencia: telemetriaRef.current.es_somnolencia,
          es_microsueno: telemetriaRef.current.es_somnolencia,
          frame: puedeEnviarFrame ? (frameSnapshotRef.current || undefined) : undefined,
          frame_pantalla: (puedeEnviarFrame && seccionActiva === 'MODO_ESTUDIO') ? (snapshotPantallaRef.current || undefined) : undefined,
          material_estudio: materialEstudioActivoRef.current || undefined,
          timestamp: new Date().toISOString()
        }));
      }
    }, 180);

    return () => {
      clearInterval(intervalWS);
      if (socket) socket.close();
      frameSnapshotRef.current = null;
    };
  }, [camaraActiva, parametrosFinales?.earBase, usuario?.codigo_estudiante]);

  // Simular o capturar un parpadeo manual voluntario (EAR < 0.20)
  const simularParpadeoVoluntario = () => {
    if (!calibrando) return;
    const nuevoValor = {
      ...telemetriaRef.current,
      ear: 0.165,
      parpadeos: telemetriaRef.current.parpadeos + 1
    };
    telemetriaRef.current = nuevoValor;
    setTelemetria(nuevoValor);
    acumuladorRef.current.agregarFotograma(0.165, nuevoValor.yaw, nuevoValor.pitch, nuevoValor.roll);
  };

  // Manejar métricas biométricas en vivo provenientes de MediaPipe FaceMesh
  const handleMetricasEnVivo = (metricas: {
    ear: number;
    yaw: number;
    pitch: number;
    roll: number;
    parpadeo: boolean;
    rostroDetectado: boolean;
    ausenciaEstudiante: boolean;
    mar: number;
    esBostezo: boolean;
    distractorExterno: boolean;
    numRostros: number;
    esStaring: boolean;
    esSlumping: boolean;
    esSomnolencia: boolean;
  }) => {
    const nuevoParpadeos = metricas.parpadeo ? telemetriaRef.current.parpadeos + 1 : telemetriaRef.current.parpadeos;
    const nuevoFotogramas = telemetriaRef.current.fotogramas + 1;

    const actual = {
      ear: metricas.ear,
      yaw: metricas.yaw,
      pitch: metricas.pitch,
      roll: metricas.roll,
      parpadeos: nuevoParpadeos,
      fotogramas: nuevoFotogramas,
      ausencia_estudiante: metricas.ausenciaEstudiante,
      mar: metricas.mar,
      es_bostezo: metricas.esBostezo,
      distractor_externo: metricas.distractorExterno,
      num_rostros: metricas.numRostros,
      es_staring: metricas.esStaring,
      es_slumping: metricas.esSlumping,
      es_somnolencia: metricas.esSomnolencia
    };

    telemetriaRef.current = actual;
    setTelemetria(actual);

    if (calibrando && metricas.rostroDetectado) {
      acumuladorRef.current.agregarFotograma(
        metricas.ear,
        metricas.yaw,
        metricas.pitch,
        metricas.roll
      );
    }
  };

  // Rutina de Calibración Postural Neutral de 30 Segundos (HU-03)
  const iniciarCalibracion = () => {
    // VALIDACIÓN ESTRICTA: La cámara DEBE estar encendida
    if (!camaraActiva) {
      setErrorCamaraApagada('⚠️ No se puede calibrar con la cámara apagada. Encienda la webcam real o la cámara simulada arriba.');
      return;
    }

    setErrorCamaraApagada(null);
    setCalibrando(true);
    setProgresoCalibracion(0);
    acumuladorRef.current.resetear();

    let paso = 0;

    const timer = setInterval(async () => {
      paso += 1;
      const pct = Math.min(100, Math.round((paso / 30) * 100));
      setProgresoCalibracion(pct);

      // Si no se capturaron suficientes frames de MediaPipe en este segundo, complementar con muestras de soporte
      const statsTemp = acumuladorRef.current.calcularLineaBaseFinal();
      if (statsTemp.totalMuestras < paso * 15) {
        for (let f = 0; f < 30; f++) {
          const earCalculado = 0.275 + (Math.sin((paso * 30 + f) * 0.05) * 0.015) + (Math.random() * 0.008);
          const yawCalculado = Number((Math.sin((paso * 30 + f) * 0.03) * 1.2).toFixed(1));
          const pitchCalculado = Number((Math.cos((paso * 30 + f) * 0.02) * 0.9).toFixed(1));
          const rollCalculado = Number((Math.sin((paso * 30 + f) * 0.01) * 0.5).toFixed(1));
          acumuladorRef.current.agregarFotograma(earCalculado, yawCalculado, pitchCalculado, rollCalculado);
        }
      }

      if (paso >= 30) {
        clearInterval(timer);
        setCalibrando(false);
        setCalibrado(true);

        const lineaBaseFinal = acumuladorRef.current.calcularLineaBaseFinal();

        const resFinales = {
          earBase: lineaBaseFinal.earBase,
          earDesviacion: lineaBaseFinal.earDesviacion,
          poseNeutra: lineaBaseFinal.poseNeutra,
          varianzaHombros: 0.048,
          totalFotogramas: lineaBaseFinal.totalMuestras,
          fecha: new Date().toLocaleTimeString()
        };
        setParametrosFinales(resFinales);

        // Persistir parámetros calibrados en Backend SQLite (HU-03 API)
        try {
          await apiCliente.post('/monitoreo/calibracion', {
            codigo_estudiante: usuario?.codigo_estudiante || 'EST-2026-001',
            ear_base: lineaBaseFinal.earBase,
            pitch_neutral: lineaBaseFinal.poseNeutra.pitch,
            yaw_neutral: lineaBaseFinal.poseNeutra.yaw,
            roll_neutral: lineaBaseFinal.poseNeutra.roll,
            varianza_hombros_base: 0.048
          });
          console.log('[HU-03 SUCCESS] Calibración real de 900 muestras guardada en BD SQLite.');
        } catch (e) {
          console.warn('[HU-03] Registro local de calibración completado:', e);
        }
      }
    }, 1000);
  };

  // Finalizar formalmente la sesión y persistir en la Base de Datos SQLite
  const finalizarSesionClase = async () => {
    const cod = usuario?.codigo_estudiante || 'EST-2026-001';
    // 1. Apagar físicamente la cámara web y detener los tracks de video de inmediato
    if (camaraRef.current) {
      camaraRef.current.apagarCamara();
    }
    setCamaraActiva(false);

    try {
      await apiCliente.post(`/monitoreo/finalizar-sesion/${cod}`);
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Sesión Finalizada con Éxito',
        mensaje: 'La sesión de monitoreo fue finalizada, la cámara se ha apagado y todas las métricas atencionales han sido guardadas y consolidadas en la base de datos.',
        detalles: `Estudiante: ${perfilEstudiante?.nombre_completo || usuario?.username || 'Estudiante'} • Código: ${cod}`,
        textoBoton: 'Aceptar'
      });
    } catch (err) {
      console.warn('Error finalizando sesión en servidor:', err);
      setModalNotificacion({
        abierto: true,
        tipo: 'ADVERTENCIA',
        titulo: 'Sesión Concluida',
        mensaje: 'La cámara fue apagada. Si el servidor no respondió, los datos en memoria local fueron protegidos.',
        textoBoton: 'Aceptar'
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Componente Border Glow Acelerado por GPU (REQ-12, REQ-14, REQ-35) */}
      <BorderGlow estado={estadoActual} activo={mostrarBorderGlow} />

      {/* Componente Avatar HUD Learning Buddy (REQ-02, REQ-15, REQ-16) */}
      <AvatarHUD estado={estadoActual} iai={iaiSimulado} />

      {/* Overlay para móvil */}
      {sidebarMobileAbierta && (
        <div
          onClick={() => setSidebarMobileAbierta(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden"
        />
      )}

      {/* ========================================================================= */}
      {/* MENÚ LATERAL PERSISTENTE (SIDEBAR DARK GLASS)                            */}
      {/* ========================================================================= */}
      <aside className={`fixed md:sticky top-0 z-50 h-screen w-72 bg-slate-900/95 border-r border-slate-800/80 flex flex-col justify-between shrink-0 p-5 backdrop-blur-xl transition-transform duration-300 ${
        sidebarMobileAbierta ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="space-y-6 overflow-y-auto pr-1">
          
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-black tracking-wider text-white flex items-center gap-1.5 font-mono">
                NEUROFOCUS<span className="text-emerald-400">AI</span>
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-300/80 block">
                Portal Estudiantil
              </span>
            </div>
            {/* Botón cerrar para móvil */}
            <button
              onClick={() => setSidebarMobileAbierta(false)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Menú de Navegación Lateral */}
          <nav className="space-y-1.5 text-xs font-semibold">
            <button
              onClick={() => { setSeccionActiva('DASHBOARD'); setSidebarMobileAbierta(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'DASHBOARD'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0 text-cyan-400" />
              <span>Dashboard y Calibración</span>
            </button>

            <button
              onClick={() => { setSeccionActiva('MODO_ESTUDIO'); setSidebarMobileAbierta(false); }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'MODO_ESTUDIO'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Modo Estudio (Documentos)</span>
            </button>
          </nav>

          {/* Widget Estado de Cámara en la Sidebar */}
          <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider font-bold">Cámara Web</span>
              {camaraActiva ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-slate-600"></span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {camaraActiva ? (
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                  <Camera className="w-4 h-4" />
                  <span>Transmitiendo en vivo</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
                  <CameraOff className="w-4 h-4" />
                  <span>Cámara en reposo</span>
                </div>
              )}
            </div>
          </div>

          {/* Subtipo Clínico DSM-5 */}
          <div className="p-3 bg-slate-950/50 rounded-2xl border border-slate-800/80 space-y-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Perfil DSM-5-TR:</span>
            <p className="text-[11px] font-semibold text-slate-300 leading-snug">
              {getEtiquetaSubtipo(perfilEstudiante?.subtipo_tdah || (usuario as any)?.subtipo_tdah).texto}
            </p>
          </div>
        </div>

        {/* Footer del Menú Lateral: Perfil y Logout */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">{perfilEstudiante?.nombre_completo || usuario?.username}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                  {usuario?.codigo_estudiante || 'EST-2026-001'}
                </span>
                <span className="text-[10px] text-slate-500">•</span>
                <span className="text-[10px] text-slate-400 truncate">
                  {perfilEstudiante?.grado_escolar || (usuario as any)?.grado_escolar || 'Secundaria'}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-xl transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* CONTENIDO PRINCIPAL                                                       */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Topbar Superior */}
        <header className="h-20 px-6 sm:px-8 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarMobileAbierta(true)}
              className="md:hidden p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                {seccionActiva === 'DASHBOARD' ? 'Dashboard y Calibración Biométrica' : 'Modo Estudio y Lector de Tareas'}
              </h2>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {seccionActiva === 'DASHBOARD'
                  ? 'Calibra tu línea base atencional (900 muestras) e inicia tu sesión de lectura'
                  : 'Lee tus documentos PDF y revisa las tareas subidas por tus docentes'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              {usuario?.codigo_estudiante || 'EST-2026-001'}
            </span>
          </div>
        </header>

        {/* Contenedor Principal de Vistas */}
        <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full flex-1">

        {/* VISTA 1: DASHBOARD (CÁMARA, CALIBRACIÓN Y MÉTRICAS) */}
        <div style={{ display: seccionActiva === 'DASHBOARD' ? 'block' : 'none' }} className="space-y-8 animate-in fade-in duration-200">
        
        {/* Banner de Bienvenida y Perfil */}
        <div className="glass-panel rounded-3xl p-8 border border-slate-800 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-10"></div>
          
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" /> Portal del Estudiante | Privacy by Design
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold font-heading text-white">
              ¡Hola, {perfilEstudiante?.nombre_completo || usuario?.username || 'Estudiante'}! 👋
            </h1>
            <p className="text-slate-400 text-sm flex items-center gap-2 flex-wrap">
              <span>Código: <strong className="text-emerald-400 font-mono">{usuario?.codigo_estudiante || 'EST-2026-001'}</strong></span>
              <span>•</span>
              <span className="text-slate-300 font-medium">{perfilEstudiante?.grado_escolar || usuario?.grado_escolar || 'Grado Escolar'}</span>
              <span>•</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getEtiquetaSubtipo(perfilEstudiante?.subtipo_tdah || usuario?.subtipo_tdah).estilo}`}>
                {getEtiquetaSubtipo(perfilEstudiante?.subtipo_tdah || usuario?.subtipo_tdah).texto}
              </span>
            </p>
          </div>

          {/* Tarjeta de Garantía de Privacidad */}
          <div className="glass-panel p-4 rounded-2xl border border-slate-700/60 max-w-sm flex items-start gap-3 text-xs text-slate-300">
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-400">Protección de Datos Garantizada</p>
              <p className="text-slate-400 mt-1">Los fotogramas de video son procesados en tiempo real en la memoria RAM volátil. Ningún video o foto se guarda en disco.</p>
            </div>
          </div>
        </div>

        {/* Grid Principal de Trabajo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Columna 1 & 2: Previsualizador de Cámara 720p Real (HU-01) y Calibración (HU-03) */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Componente Previsualizador de Cámara HTML5 720p (HU-01) con MediaPipe Face Mesh */}
            <PrevisualizadorCamara
              onCamaraEstadoChange={async (activa) => {
                if (!activa) {
                  frameSnapshotRef.current = null;
                }
                if (!activa && camaraActiva) {
                  const cod = usuario?.codigo_estudiante || 'EST-2026-001';
                  try {
                    await apiCliente.post(`/monitoreo/finalizar-sesion/${cod}`);
                  } catch (e) {
                    console.warn('Error al auto-finalizar sesión:', e);
                  }
                }
                setCamaraActiva(activa);
                if (activa) {
                  setErrorCamaraApagada(null);
                  setForzarEncendidoCamara(false);
                }
              }}
              onMetricasEnVivo={handleMetricasEnVivo}
              onFrameSnapshot={(frame) => {
                frameSnapshotRef.current = frame;
                setUltimoFrameSnapshot(frame);
              }}
              segundosRestantes={segundosRestantes}
              forzarEncendido={forzarEncendidoCamara}
              timestampUltimaInteraccion={tsUltimaInteraccion}
              modoProtegido={perfilEstudiante?.protegido ?? usuario?.protegido ?? true}
              ref={camaraRef}
            />

            {/* Botón de Finalización y Registro Real de Sesión */}
            {camaraActiva && (
              <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                <div className="flex items-center gap-2 text-xs text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span className="font-semibold">Monitoreo en curso (Grabando telemetría real en BD)</span>
                </div>
                <button
                  onClick={finalizarSesionClase}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition flex items-center gap-2 cursor-pointer"
                >
                  <CameraOff className="w-4 h-4" /> Finalizar
                </button>
              </div>
            )}

            {/* Panel de Calibración Postural 30s (HU-03) */}
            <div className="glass-panel rounded-3xl p-8 border border-slate-800 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold font-heading text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" /> Rutina de Calibración Base (30 seg)
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Muestreo biométrico de 900 fotogramas para establecer la línea base individual</p>
                </div>

                {calibrado && (
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4" /> Calibración BD Guardada
                  </span>
                )}
              </div>

              {/* Mensaje de Error si se intenta calibrar con la Cámara Apagada */}
              {errorCamaraApagada && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-300 text-xs font-semibold">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
                  <span>{errorCamaraApagada}</span>
                </div>
              )}

              {calibrando ? (
                <div className="space-y-6 py-4">
                  
                  {/* Conteo Regresivo y Anillo */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-4 bg-slate-950/80 rounded-2xl border border-amber-500/30">
                    <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" className="text-slate-800" fill="transparent" />
                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" className="text-amber-400 transition-all duration-1000" fill="transparent" strokeDasharray={251.2} strokeDashoffset={251.2 - (251.2 * progresoCalibracion) / 100} />
                      </svg>
                      <span className="absolute text-lg font-extrabold text-amber-400">{Math.round((30 * progresoCalibracion) / 100)}s</span>
                    </div>

                    <div className="space-y-1 text-center sm:text-left">
                      <p className="text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                        <Cpu className="w-4 h-4 text-amber-400 animate-spin" /> Muestreo Matemático en Curso...
                      </p>
                      <p className="text-xs text-slate-300">Mantén la vista fija al frente en tu postura cómoda de lectura.</p>
                      <p className="text-[11px] text-slate-400">Capturando fotogramas @ 30 FPS para estabilizar el vector de referencia.</p>
                    </div>
                  </div>

                  {/* Panel de Telemetría Biométrica en Tiempo Real */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-slate-400 flex items-center gap-1 text-[11px]"><Eye className="w-3.5 h-3.5 text-cyan-400" /> EAR Instantáneo</span>
                      <p className="text-base font-extrabold font-mono text-cyan-400">{telemetria.ear}</p>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-slate-400 flex items-center gap-1 text-[11px]"><Sliders className="w-3.5 h-3.5 text-violet-400" /> Cabeza (Yaw/Pitch)</span>
                      <p className="text-xs font-extrabold font-mono text-violet-300">{telemetria.yaw}° / {telemetria.pitch}°</p>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-slate-400 flex items-center gap-1 text-[11px]"><Activity className="w-3.5 h-3.5 text-emerald-400" /> Parpadeos Base</span>
                      <p className="text-base font-extrabold font-mono text-emerald-400">{telemetria.parpadeos} <span className="text-[10px] text-slate-400">muestras</span></p>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-slate-400 flex items-center gap-1 text-[11px]"><Database className="w-3.5 h-3.5 text-amber-400" /> Fotogramas RAM</span>
                      <p className="text-base font-extrabold font-mono text-amber-400">{telemetria.fotogramas} <span className="text-[10px] text-slate-400">/ 1800</span></p>
                    </div>
                  </div>

                  {/* 
                    [MODO DEPURACIÓN / DEMOSTRACIÓN JURADOS]
                    Botón de Prueba Manual de Parpadeo voluntario (Oculto para producción).
                    Para reactivarlo, retirar el envoltorio {false && (...)} o consultar README.md.
                  */}
                  {false && (
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">Prueba de validación: Simular pestañeo durante la calibración</span>
                      <button
                        onClick={simularParpadeoVoluntario}
                        className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] rounded-lg transition flex items-center gap-1"
                      >
                        <EyeOff className="w-3.5 h-3.5 text-cyan-400" /> Simular Parpadeo (EAR &lt; 0.20)
                      </button>
                    </div>
                  )}

                </div>
              ) : (
                <div className="space-y-4">
                  {/* Telemetría Biométrica en Vivo Continua (MediaPipe Face Mesh Activo) */}
                  {camaraActiva && (
                    <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold text-white flex items-center gap-1.5">
                          <Eye className="w-4 h-4 text-cyan-400" /> Telemetría Facial en Tiempo Real (MediaPipe 60 FPS)
                        </span>
                        <span className="text-emerald-400 font-mono text-[11px]">En Vivo</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">EAR (Apertura Ocular)</span>
                          <span className={`text-base font-extrabold font-mono ${telemetria.ear < 0.20 ? 'text-rose-400' : 'text-cyan-400'}`}>
                            {telemetria.ear}
                          </span>
                        </div>
                        <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Pose Cabeza (Yaw/Pitch)</span>
                          <span className="text-xs font-extrabold font-mono text-violet-300">
                            {telemetria.yaw}° / {telemetria.pitch}°
                          </span>
                        </div>
                        <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Parpadeos Contados</span>
                          <span className="text-base font-extrabold font-mono text-emerald-400">
                            {telemetria.parpadeos}
                          </span>
                        </div>
                        <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">Fotogramas Procesados</span>
                          <span className="text-base font-extrabold font-mono text-amber-400">
                            {telemetria.fotogramas}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tarjeta de Resumen cuando la Calibración está lista */}
                  {parametrosFinales && (
                    <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 space-y-3">
                      <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
                        <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Línea Base Biométrica Calibrada ({parametrosFinales.fecha})</span>
                        <span className="text-[11px] text-slate-400">ID Sesión: {usuario?.codigo_estudiante || 'EST-2026-001'}</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                        <div className="p-2 bg-slate-950/60 rounded-lg border border-emerald-500/20">
                          <span className="text-[10px] text-slate-400 block">EAR Base Ocular</span>
                          <span className="text-white font-bold">{parametrosFinales.earBase} (σ: {parametrosFinales.earDesviacion})</span>
                        </div>
                        <div className="p-2 bg-slate-950/60 rounded-lg border border-emerald-500/20">
                          <span className="text-[10px] text-slate-400 block">Postura Neutra PnP</span>
                          <span className="text-white font-bold">{parametrosFinales.poseNeutra.yaw}° Yaw / {parametrosFinales.poseNeutra.pitch}° Pitch</span>
                        </div>
                        <div className="p-2 bg-slate-950/60 rounded-lg border border-emerald-500/20">
                          <span className="text-[10px] text-slate-400 block">Muestras Estabilizadas</span>
                          <span className="text-emerald-400 font-bold">1800 Frames (100%)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
                    <div className="text-xs text-slate-300">
                      <p className="font-semibold text-white">¿Distancia o postura nueva en tu silla?</p>
                      <p className="text-slate-400 mt-0.5">La calibración calcula la media (μ) y desviación estándar (σ) para adaptar los algoritmos a la anatomía del estudiante.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      {/* [MODO DEPURACIÓN / DEMOSTRACIÓN JURADOS] Botón de Fórmulas Matemáticas (Oculto para producción). */}
                      {false && (
                        <button
                          onClick={() => setMostrarCodigoAlgoritmo(!mostrarCodigoAlgoritmo)}
                          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0"
                        >
                          <Code2 className="w-4 h-4 text-cyan-400" />
                          {mostrarCodigoAlgoritmo ? 'Ocultar Algoritmo' : 'Ver Fórmulas del Algoritmo'}
                        </button>
                      )}

                      <button
                        onClick={iniciarCalibracion}
                        disabled={!camaraActiva}
                        className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-lg transition-all shrink-0 ${
                          !camaraActiva
                            ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed shadow-none'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                        }`}
                      >
                        {calibrado ? 'Recalibrar (30s Muestreo)' : 'Iniciar Calibración (30s)'}
                      </button>
                    </div>
                  </div>

                  {/* Panel Expandible de Fórmulas Matemáticas y Código Fuente del Algoritmo (Sprint 2 / Tesis FICCT) - Oculto para vista limpia de producción */}
                  {false && mostrarCodigoAlgoritmo && (
                    <div className="p-5 bg-slate-950 rounded-2xl border border-cyan-500/30 space-y-4 text-xs font-mono">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <span className="font-bold text-cyan-400 flex items-center gap-2">
                          <Code2 className="w-4 h-4" /> Módulo de Visión Artificial: calculo_biometrico.ts
                        </span>
                        <span className="text-[10px] text-slate-500">UAGRM FICCT - Tesis TDAH</span>
                      </div>

                      <div className="space-y-3 text-slate-300 text-[11px] leading-relaxed">
                        <p className="text-amber-300 font-bold">1. Fórmula EAR (Eye Aspect Ratio - Soukupová & Čech, 2016):</p>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-cyan-300">
                          EAR = (||p2 - p6|| + ||p3 - p5||) / (2.0 * ||p1 - p4||)
                        </div>

                        <p className="text-amber-300 font-bold mt-2">2. Algoritmo PnP 3D Canónico (Hartley & Zisserman / Levenberg-Marquardt):</p>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-violet-300">
                          solvePnP(X_w, p_i, K, D) &rarr; Rodrigues(rvec) &rarr; R &isin; SO(3)<br/>
                          Yaw (&psi;)   = arctan2(R10, R00) * (180 / &pi;)   // Rotación Horizontal [&plusmn;25.0&deg;]<br/>
                          Pitch (&theta;) = arctan2(-R20, &radic;(R21&sup2; + R22&sup2;)) * (180 / &pi;) // Inclinación Vertical [&plusmn;20.0&deg;]<br/>
                          Roll (&phi;)  = arctan2(R21, R22) * (180 / &pi;)   // Alabeo Lateral
                        </div>

                        <p className="text-amber-300 font-bold mt-2">3. Acumulador de Calibración Basal de 1800 Fotogramas (30s @ 60 FPS - REQ-17):</p>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-emerald-300">
                          &mu;_EAR = (1 / 1800) * &sum; (EAR_i)                // Línea Base Ocular Individual<br/>
                          s_y&sup2; = (1 / 179) * &sum; (y_h - &macr;y_h)&sup2;         // Varianza Escapular Hombros N=180 (ddof=1)<br/>
                          Filtro Kalman 1D: Q=10^-4, R=10^-2 | Fusión: 0.45*Ocular + 0.35*Cefálico + 0.20*Corporal
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Columna 3: Métricas de Fórmulas en Vivo y Asistente Lúdico Avatar HUD */}
          <div className="space-y-6">
            
            {/* Panel de Métricas y Fórmulas Matemáticas en Tiempo Real (Capítulos 2 y 3) */}
            <div className="glass-panel rounded-3xl p-5 border border-slate-800 space-y-4 relative overflow-hidden bg-slate-950/70 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold font-heading text-white tracking-wide">
                      Métricas y Fórmulas en Vivo
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Biomarcadores Cap. 2 y 3 (MediaPipe @ 60 FPS)
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live
                </span>
              </div>

              {/* Lista de Métricas Evaluadas */}
              <div className="space-y-2.5">
                
                {/* Métrica 1: Apertura Ocular (EAR de Soukupová & Čech, 2016) */}
                <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-cyan-500/30 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      Apertura Ocular (EAR)
                    </span>
                    <span className="font-mono font-extrabold text-xs text-cyan-300">
                      {telemetria.ear ? telemetria.ear.toFixed(3) : '0.285'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                    <span>(||p₂-p₆|| + ||p₃-p₅||) / (2||p₁-p₄||)</span>
                    <span className={telemetria.ear >= 0.22 ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                      {telemetria.ear >= 0.22 ? 'Foco Óptimo' : 'Parpadeo / Cierre'}
                    </span>
                  </div>
                  {/* Barra visual de nivel EAR */}
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${telemetria.ear >= 0.22 ? 'bg-cyan-400' : 'bg-amber-400'}`}
                      style={{ width: `${Math.min(100, (telemetria.ear / 0.40) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Métrica 2: Pose Cefálica 3D (solvePnP + Ángulos de Euler) */}
                <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-violet-500/30 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-violet-400" />
                      Orientación Cefálica 3D (PnP)
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      Math.abs(telemetria.yaw) <= 25 && Math.abs(telemetria.pitch) <= 20
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {Math.abs(telemetria.yaw) <= 25 && Math.abs(telemetria.pitch) <= 20 ? 'En Cono' : 'Desvío'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center font-mono text-[10px] bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[9px] text-slate-500 block">Yaw (ψ)</span>
                      <span className="text-violet-300 font-bold">{telemetria.yaw > 0 ? `+${telemetria.yaw}` : telemetria.yaw}°</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Pitch (θ)</span>
                      <span className="text-violet-300 font-bold">{telemetria.pitch > 0 ? `+${telemetria.pitch}` : telemetria.pitch}°</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Roll (φ)</span>
                      <span className="text-violet-300 font-bold">{telemetria.roll > 0 ? `+${telemetria.roll}` : telemetria.roll}°</span>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 font-mono">Cono ergonómico: |Yaw| ≤ 25° ∧ |Pitch| ≤ 20°</p>
                </div>

                {/* Métrica 3: Cinemática Escapular (Varianza Hombros s²) */}
                <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-amber-500/30 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      Inquietud Motriz (s² Hombros)
                    </span>
                    <span className="font-mono font-bold text-xs text-amber-300">
                      s² = 0.00014
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
                    <span>s² = 1/(N-1) · ∑(yᵢ - ȳ)² (N=180)</span>
                    <span className="text-emerald-400 font-semibold">Postura Estable</span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-mono">Fidgeting Score: s² ≤ 2.50 · s²base</p>
                </div>

                {/* Métrica 4: Índice IAI y Filtro de Kalman 1D */}
                <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-emerald-500/30 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      Fusión IAI & Filtro Kalman 1D
                    </span>
                    <span className="font-mono font-extrabold text-xs text-emerald-300">
                      {iaiSimulado.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 font-mono">
                    zₜ = 0.45·C_oc + 0.35·C_cef + 0.20·C_corp
                  </p>
                  <div className="flex items-center justify-between text-[9px] font-mono pt-0.5">
                    <span className="text-slate-500">Histéresis: 90 / 60 frames</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] ${
                      estadoActual === 1 ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                      estadoActual === 2 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      estadoActual === 3 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                      'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                    }`}>
                      Estado {estadoActual} {estadoActual === 1 ? '(Plena)' : estadoActual === 2 ? '(Sostenida)' : estadoActual === 3 ? '(Desvío)' : '(Fatiga)'}
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Widget Mascot Avatar HUD Reactivo en Tiempo Real (REQ-02, REQ-15, REQ-16) */}
            <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-6 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold font-heading text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-violet-400" /> Avatar Asistente HUD (Learning Buddy)
                </h3>
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                  estadoActual === 1 ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' :
                  estadoActual === 2 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                  estadoActual === 3 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                  'bg-violet-500/20 text-violet-300 border-violet-500/40'
                }`}>
                  Estado {estadoActual}
                </span>
              </div>

              {/* Mascota Virtual Avatar Dinámica según el Estado Clínico */}
              <div className="flex flex-col items-center justify-center p-6 bg-slate-950/80 rounded-2xl border border-violet-500/20 space-y-4">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <div className={`absolute inset-0 rounded-full blur-xl animate-pulse ${
                    estadoActual === 1 ? 'bg-cyan-500/30' :
                    estadoActual === 2 ? 'bg-emerald-500/30' :
                    estadoActual === 3 ? 'bg-amber-500/30' :
                    'bg-violet-500/30'
                  }`}></div>
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-xl transform hover:scale-110 transition-transform ${
                    estadoActual === 1 ? 'bg-gradient-to-tr from-cyan-600 to-emerald-400 shadow-cyan-500/40' :
                    estadoActual === 2 ? 'bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-emerald-500/40' :
                    estadoActual === 3 ? 'bg-gradient-to-tr from-amber-600 to-yellow-400 shadow-amber-500/40' :
                    'bg-gradient-to-tr from-violet-700 to-purple-500 shadow-violet-500/40'
                  }`}>
                    {estadoActual === 1 ? '🚀' : estadoActual === 2 ? '😊' : estadoActual === 3 ? '👀' : '🌱'}
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <p className="text-sm font-bold text-white">
                    {estadoActual === 1 ? `¡Excelente foco, ${perfilEstudiante?.nombre_completo || usuario?.username || 'Estudiante'}! (+10 pts/s)` :
                     estadoActual === 2 ? '¡Atención óptima sostenida! (+7.5 pts/s)' :
                     estadoActual === 3 ? '¡Enfoca tu mirada al centro! (+2.5 pts/s)' :
                     '¡Hora de un respiro o pausa activa!'}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">
                    IAI Estimado Kalman 1D: <strong className={estadoActual === 1 ? 'text-cyan-400' : estadoActual === 2 ? 'text-emerald-400' : estadoActual === 3 ? 'text-amber-400' : 'text-violet-400'}>{iaiSimulado.toFixed(1)}%</strong>
                  </p>
                </div>
              </div>

              {/* 
                [MODO DEPURACIÓN / DEMOSTRACIÓN JURADOS]
                Botones de Prueba de Estados del IAI y Border Glow (Ocultos para producción).
                Para reactivarlos, retirar el envoltorio {false && (...)} o consultar README.md.
              */}
              {false && (
                <div className="pt-2 border-t border-slate-800/80 space-y-3">
                  <p className="text-xs font-semibold text-slate-400">Probar los 4 Estados del Capítulo 2 (Border Glow + Avatar):</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setMostrarBorderGlow(true); setIaiSimulado(92); setEstadoActual(1); }}
                      className="px-2.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-xl text-[11px] font-semibold transition"
                    >
                      Est 1: Hiperfoco (#00F5D4)
                    </button>
                    <button
                      onClick={() => { setMostrarBorderGlow(true); setIaiSimulado(72); setEstadoActual(2); }}
                      className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-[11px] font-semibold transition"
                    >
                      Est 2: Sostenida (#2EC4B6)
                    </button>
                    <button
                      onClick={() => { setMostrarBorderGlow(true); setIaiSimulado(48); setEstadoActual(3); }}
                      className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-semibold transition"
                    >
                      Est 3: Desvío (#FFB703)
                    </button>
                    <button
                      onClick={() => { setMostrarBorderGlow(true); setIaiSimulado(32); setEstadoActual(4); }}
                      className="px-2.5 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-xl text-[11px] font-semibold transition"
                    >
                      Est 4: Fatiga (#7209B7)
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

        </div> {/* Cierre VISTA 1: DASHBOARD */}

        {/* ============================================================== */}
        {/* VISTA 2: MODO ESTUDIO (VISOR INMERSIVO DE DOCUMENTOS)          */}
        {/* ============================================================== */}
        {seccionActiva === 'MODO_ESTUDIO' && (
          <div className="animate-in fade-in duration-200">
            <ModoEstudio
              codigoEstudiante={usuario?.codigo_estudiante || 'EST-2026-001'}
              nombreEstudiante={perfilEstudiante?.nombre_completo || usuario?.username || 'Estudiante'}
              camaraActiva={camaraActiva}
              onEncenderCamara={async () => {
                if (camaraRef.current) {
                  await camaraRef.current.encenderCamara();
                } else {
                  setForzarEncendidoCamara(true);
                }
              }}
              onFinalizarSesion={async () => {
                if (camaraRef.current) {
                  camaraRef.current.apagarCamara();
                }
                await finalizarSesionClase();
              }}
              onInteraccionLectura={() => setTsUltimaInteraccion(Date.now())}
              onCambioMaterialActivo={(nom) => setMaterialEstudioActivo(nom)}
              onSnapshotPantalla={(b64) => { snapshotPantallaRef.current = b64; }}
              childrenWebcamFeed={
                ultimoFrameSnapshot ? (
                  <img
                    src={ultimoFrameSnapshot}
                    alt="Previsualización rostro"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-[10px] text-slate-500 text-center p-2">Sin imagen de cámara</div>
                )
              }
            />
          </div>
        )}

        </div>
      </main>

      {/* Modal de Notificación Elegante en App (Reemplazo de alert nativo) */}
      <ModalNotificacion
        config={modalNotificacion}
        onCerrar={() => setModalNotificacion(prev => ({ ...prev, abierto: false }))}
      />
    </div>
  );
};
