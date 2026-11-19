import React, { useState, useEffect } from 'react';
import { 
  Search, Eye, UserCheck, Activity, Download, AlertCircle, FileText, 
  CheckCircle2, Sliders, Layers, Radio, Sparkles, Menu, X, 
  LayoutDashboard, Users, RefreshCw, ChevronRight, Clock, ShieldCheck, Edit3, Save,
  Camera, CameraOff, Video
} from 'lucide-react';
import { useAuth } from '../contexto/AuthContext';

interface EstudianteItem {
  id_estudiante: string;
  codigo_estudiante: string;
  nombre_completo: string;
  edad?: number;
  grado_escolar?: string;
  subtipo_tdah?: string;
  diagnostico_observacion?: string;
  fecha_registro?: string;
  sesion_activa?: boolean;
  total_sesiones?: number;
  ultimo_iai?: number;
  protegido?: boolean;
}

interface ReporteItem {
  id_sesion: string;
  codigo_estudiante: string;
  nombre_completo: string;
  grado_escolar: string;
  subtipo_tdah: string;
  fecha: string;
  duracion_minutos: number;
  iai_promedio: number;
  estado_lectura: string;
  url_descarga: string;
}

export interface SesionBitacoraItem {
  numero_sesion: number;
  id_sesion: string;
  fecha_inicio: string;
  fecha_fin: string;
  duracion_segundos: number;
  duracion_formateada: string;
  promedio_iai: number;
  estado_sesion: string;
  estado_lectura: string;
  total_metricas: number;
  total_desatenciones: number;
  eventos_resumen: string[];
  score_ocular: number;
  score_postural: number;
  score_motriz: number;
  url_pdf: string;
}

type SeccionMenu = 'DASHBOARD' | 'ESTUDIANTES' | 'HISTORIAL';

export const DashboardAutoridades: React.FC = () => {
  const { usuario } = useAuth();
  
  // Control de Navegación persistente ante recargas F5
  const [seccionActiva, setSeccionActivaState] = useState<SeccionMenu>(() => {
    const s = sessionStorage.getItem('dashboard_seccion_activa');
    return (s === 'DASHBOARD' || s === 'ESTUDIANTES' || s === 'HISTORIAL') ? s : 'DASHBOARD';
  });

  const setSeccionActiva = (sec: SeccionMenu) => {
    setSeccionActivaState(sec);
    sessionStorage.setItem('dashboard_seccion_activa', sec);
  };

  const [menuHamburguesaAbierto, setMenuHamburguesaAbierto] = useState<boolean>(false);

  // Directorio y Lista de Estudiantes
  const [estudiantes, setEstudiantes] = useState<EstudianteItem[]>([]);
  const [cargandoEstudiantes, setCargandoEstudiantes] = useState<boolean>(false);
  const [filtroEstudiantes, setFiltroEstudiantes] = useState<string>('');

  // Historial de Reportes PDF
  const [historialReportes, setHistorialReportes] = useState<ReporteItem[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState<boolean>(false);

  // Código de Estudiante persistente ante recargas F5 (sin valores quemados)
  const [codigoBusqueda, setCodigoBusquedaState] = useState<string>(() => {
    return sessionStorage.getItem('dashboard_codigo_estudiante') || '';
  });

  const setCodigoBusqueda = (cod: string) => {
    setCodigoBusquedaState(cod);
    if (cod) {
      sessionStorage.setItem('dashboard_codigo_estudiante', cod);
    } else {
      sessionStorage.removeItem('dashboard_codigo_estudiante');
    }
  };

  // Estudiante Activo cargado 100% dinámicamente desde la BD SQLite (inicialmente null, sin datos estáticos)
  const [estudianteActivo, setEstudianteActivo] = useState<EstudianteItem | null>(null);
  const [estudianteEncontrado, setEstudianteEncontrado] = useState<boolean>(true);
  const [descargandoPdf, setDescargandoPdf] = useState<boolean>(false);
  const [codigoDescargando, setCodigoDescargando] = useState<string | null>(null);
  const [actualizandoPrivacidad, setActualizandoPrivacidad] = useState<string | null>(null);
  const [wsConectado, setWsConectado] = useState<boolean>(false);
  const [recibiendoTelemetria, setRecibiendoTelemetria] = useState<boolean>(false);
  const [frameStream, setFrameStream] = useState<string | null>(null);
  const [ultimoTimestamp, setUltimoTimestamp] = useState<string>('En espera de datos...');
  const [historialIai, setHistorialIai] = useState<number[]>([]);

  // Bitácora de Sesiones Históricas del Estudiante Activo (Tesis Longitudinal)
  const [sesionesBitacora, setSesionesBitacora] = useState<SesionBitacoraItem[]>([]);
  const [cargandoBitacora, setCargandoBitacora] = useState<boolean>(false);

  // Telemetría biométrica real del estudiante conectado por WebSocket (Sprint 2 - HU-10)
  const [metricasActuales, setMetricasActuales] = useState<{
    iai: number;
    scoreOcular: number;
    scorePostural: number;
    scoreMotriz: number;
    alertaActiva: boolean;
    estadoLectura: string;
    esAbandonoPuesto?: boolean;
    mar?: number;
    esBostezo?: boolean;
    distractorExterno?: boolean;
    esStaring?: boolean;
    esSlumping?: boolean;
    esSomnolencia?: boolean;
  } | null>(null);

  // Modal de actualización clínica / reclasificación de diagnóstico
  const [modalEditar, setModalEditar] = useState<boolean>(false);
  const [formEdicion, setFormEdicion] = useState<{
    grado_escolar: string;
    subtipo_tdah: string;
    diagnostico_observacion: string;
  }>({
    grado_escolar: '3º de Secundaria',
    subtipo_tdah: 'CONTROL',
    diagnostico_observacion: ''
  });
  const [guardandoEdicion, setGuardandoEdicion] = useState<boolean>(false);

  // Formateador amigable de Subtipo TDAH
  const getEtiquetaSubtipo = (subtipo?: string) => {
    switch (subtipo) {
      case 'CONTROL':
      case 'SIN_TDAH':
        return 'Grupo Control (Neurotípico)';
      case 'F90_0':
      case 'inattentive':
        return 'F90.0: Inatento';
      case 'F90_1':
      case 'hyperactive':
        return 'F90.1: Hiperactivo';
      case 'F90_2':
      case 'combined':
        return 'F90.2: Combinado';
      default:
        return subtipo || 'Grupo Control';
    }
  };

  const abrirModalEdicion = (est: EstudianteItem) => {
    setFormEdicion({
      grado_escolar: est.grado_escolar || '3º de Secundaria',
      subtipo_tdah: est.subtipo_tdah || 'CONTROL',
      diagnostico_observacion: est.diagnostico_observacion || ''
    });
    setModalEditar(true);
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estudianteActivo) return;
    setGuardandoEdicion(true);
    try {
      const resp = await fetch(`http://127.0.0.1:8000/api/v1/monitoreo/estudiantes/${estudianteActivo.codigo_estudiante}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formEdicion)
      });
      if (resp.ok) {
        await cargarEstudiantes();
        setEstudianteActivo(prev => ({
          ...prev,
          ...formEdicion
        }));
        setModalEditar(false);
      }
    } catch (err) {
      console.error('Error al actualizar estudiante:', err);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // Función para obtener iniciales del nombre
  const obtenerIniciales = (nombre: string) => {
    if (!nombre) return 'ES';
    const partes = nombre.trim().split(' ').filter(Boolean);
    if (partes.length >= 2) return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
    return partes[0].slice(0, 2).toUpperCase();
  };

  // Cargar estudiantes desde Backend API (GET /api/v1/monitoreo/estudiantes)
  const cargarEstudiantes = async () => {
    try {
      setCargandoEstudiantes(true);
      const resp = await fetch('http://127.0.0.1:8000/api/v1/monitoreo/estudiantes');
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          setEstudiantes(data);
          // Si el estudiante activo coincide o hay uno guardado en sesión, seleccionarlo
          const targetCod = sessionStorage.getItem('dashboard_codigo_estudiante') || codigoBusqueda;
          const match = targetCod ? data.find((e: EstudianteItem) => e.codigo_estudiante === targetCod) : null;
          if (match) {
            setEstudianteActivo(match);
            setCodigoBusqueda(match.codigo_estudiante);
            setEstudianteEncontrado(true);
          } else {
            // Seleccionar automáticamente al primer estudiante real de la base de datos
            setEstudianteActivo(data[0]);
            setCodigoBusqueda(data[0].codigo_estudiante);
            setEstudianteEncontrado(true);
          }
        } else {
          setEstudiantes([]);
          setEstudianteActivo(null);
          setEstudianteEncontrado(false);
        }
      }
    } catch (err) {
      console.warn('Error cargando estudiantes desde backend:', err);
    } finally {
      setCargandoEstudiantes(false);
    }
  };

  // Cargar historial de reportes (GET /api/v1/reportes/historial)
  const cargarHistorial = async () => {
    try {
      setCargandoHistorial(true);
      const resp = await fetch('http://127.0.0.1:8000/api/v1/reportes/historial');
      if (resp.ok) {
        const data = await resp.json();
        setHistorialReportes(data);
      }
    } catch (err) {
      console.warn('Error cargando historial de reportes:', err);
    } finally {
      setCargandoHistorial(false);
    }
  };

  // Cargar bitácora de sesiones históricas del estudiante (GET /api/v1/monitoreo/estudiantes/{cod}/sesiones)
  const cargarBitacoraEstudiante = async (codigo: string) => {
    if (!codigo) return;
    try {
      setCargandoBitacora(true);
      const resp = await fetch(`http://127.0.0.1:8000/api/v1/monitoreo/estudiantes/${codigo.trim().toUpperCase()}/sesiones`);
      if (resp.ok) {
        const data = await resp.json();
        setSesionesBitacora(Array.isArray(data) ? data : []);
      } else {
        setSesionesBitacora([]);
      }
    } catch (err) {
      console.warn('Error cargando bitácora de sesiones:', err);
      setSesionesBitacora([]);
    } finally {
      setCargandoBitacora(false);
    }
  };

  // Carga inicial al montar el componente
  useEffect(() => {
    cargarEstudiantes();
    cargarHistorial();

    // Sincronización continua de estado ACTIVO / EN VIVO de estudiantes (cada 6 segundos)
    const intervaloActivos = setInterval(() => {
      fetch('http://127.0.0.1:8000/api/v1/monitoreo/estudiantes')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setEstudiantes(data);
            // Mantener actualizado el objeto estudianteActivo si está seleccionado
            setEstudianteActivo(prev => {
              if (!prev) return prev;
              const match = data.find((e: EstudianteItem) => e.codigo_estudiante === prev.codigo_estudiante);
              return match ? { ...prev, sesion_activa: match.sesion_activa, ultimo_iai: match.ultimo_iai } : prev;
            });
          }
        })
        .catch(() => {});
    }, 6000);

    return () => clearInterval(intervaloActivos);
  }, []);

  // Recargar bitácora cada vez que cambie el estudiante activo
  useEffect(() => {
    if (estudianteActivo?.codigo_estudiante) {
      cargarBitacoraEstudiante(estudianteActivo.codigo_estudiante);
    }
  }, [estudianteActivo?.codigo_estudiante]);

  // Seleccionar estudiante desde la lista o selector
  const seleccionarEstudiante = (est: EstudianteItem) => {
    setEstudianteActivo(est);
    setCodigoBusqueda(est.codigo_estudiante);
    setEstudianteEncontrado(true);
    setRecibiendoTelemetria(false);
    setFrameStream(null);
    setMetricasActuales(null);
    setHistorialIai([]);
    setUltimoTimestamp('En espera de datos...');
    setSeccionActiva('DASHBOARD');
    setMenuHamburguesaAbierto(false);
    cargarBitacoraEstudiante(est.codigo_estudiante);
  };

  // Buscar por código ingresado manualmente
  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigoLimpio = codigoBusqueda.trim().toUpperCase();
    if (!codigoLimpio) return;

    setRecibiendoTelemetria(false);
    setFrameStream(null);
    setMetricasActuales(null);
    setHistorialIai([]);
    setUltimoTimestamp('En espera de datos...');
    cargarBitacoraEstudiante(codigoLimpio);

    // 1. Buscar en la lista local en memoria si ya fue cargada
    const localMatch = estudiantes.find(e => e.codigo_estudiante === codigoLimpio);
    if (localMatch) {
      setEstudianteActivo(localMatch);
      setEstudianteEncontrado(true);
      return;
    }

    // 2. Si no está en memoria, consultar endpoint específico
    try {
      const resp = await fetch(`http://127.0.0.1:8000/api/v1/monitoreo/estudiantes/${codigoLimpio}`);
      if (resp.ok) {
        const data = await resp.json();
        setEstudianteActivo(data);
        setEstudianteEncontrado(true);
      } else {
        // Fallback genérico para códigos nuevos
        setEstudianteActivo({
          id_estudiante: 'est-query',
          codigo_estudiante: codigoLimpio,
          nombre_completo: `Estudiante ${codigoLimpio}`,
          edad: 14,
          grado_escolar: '3º de Secundaria',
          subtipo_tdah: 'F90.2 (Presentación Combinada)',
          diagnostico_observacion: 'Monitoreo atencional activo'
        });
        setEstudianteEncontrado(true);
      }
    } catch (err) {
      setEstudianteEncontrado(false);
    }
  };

  // Cambio de Modo de Privacidad (Privacy by Design - Malla 3D vs Rostro Real)
  const togglePrivacidadEstudiante = async (est: EstudianteItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nuevoProtegido = est.protegido !== undefined ? !est.protegido : false;
    setActualizandoPrivacidad(est.codigo_estudiante);
    try {
      const resp = await fetch(`http://127.0.0.1:8000/api/v1/monitoreo/estudiantes/${est.codigo_estudiante}/privacidad`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protegido: nuevoProtegido })
      });
      if (resp.ok) {
        setEstudiantes(prev => prev.map(item => item.codigo_estudiante === est.codigo_estudiante ? { ...item, protegido: nuevoProtegido } : item));
        if (estudianteActivo?.codigo_estudiante === est.codigo_estudiante) {
          setEstudianteActivo(prev => prev ? { ...prev, protegido: nuevoProtegido } : null);
        }
      } else {
        alert('No se pudo actualizar el modo de privacidad.');
      }
    } catch (err) {
      console.warn('Error al actualizar privacidad:', err);
    } finally {
      setActualizandoPrivacidad(null);
    }
  };

  // Descarga de Reporte PDF (HU-11) — Permite descargar reporte completo o resumen (Top 8 eventos críticos)
  const handleExportarPdf = async (codigoParam?: string, idSesionParam?: string, resumido: boolean = false) => {
    const cod = (codigoParam || codigoBusqueda).trim().toUpperCase() || 'EST-2026-001';
    const downloadKey = idSesionParam 
      ? `${cod}-${idSesionParam}-${resumido ? 'resumen' : 'completo'}` 
      : `${cod}-${resumido ? 'resumen' : 'completo'}`;
    setCodigoDescargando(downloadKey);
    setDescargandoPdf(true);
    try {
      const queryResumido = resumido ? '?resumido=true' : '?resumido=false';
      const urlFetch = idSesionParam
        ? `http://127.0.0.1:8000/api/v1/reportes/sesion/${idSesionParam}/descargar${queryResumido}`
        : `http://127.0.0.1:8000/api/v1/reportes/descargar/${cod}${queryResumido}`;
      const resp = await fetch(urlFetch);
      if (!resp.ok) {
        throw new Error(`Error en el servidor: ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const prefijo = resumido ? 'Reporte_Resumen_Top8_' : 'Reporte_Completo_';
      const sufijoSesion = idSesionParam ? `_Sesion_${idSesionParam.slice(0, 8)}` : '';
      a.download = `${prefijo}NeuroFocus_${cod}${sufijoSesion}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      // Refrescar historial
      cargarHistorial();
      cargarBitacoraEstudiante(cod);
    } catch (err) {
      console.warn('Error al descargar PDF del backend:', err);
      alert(`⚠️ No se pudo conectar con el servidor backend en http://127.0.0.1:8000.`);
    } finally {
      setDescargandoPdf(false);
      setCodigoDescargando(null);
    }
  };

  // Generador de Curva SVG Dinámica para el gráfico de atención en vivo
  const generarRutaSvg = (puntos: number[]) => {
    if (puntos.length === 0) return 'M 0 75 L 500 75';
    if (puntos.length === 1) return `M 0 ${125 - (puntos[0] / 100) * 100} L 500 ${125 - (puntos[0] / 100) * 100}`;
    const stepX = 500 / (puntos.length - 1);
    return puntos.map((p, idx) => {
      const x = idx * stepX;
      const y = 125 - (Math.max(0, Math.min(100, p)) / 100) * 100;
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  // Conexión WebSockets en Tiempo Real al Canal del Estudiante Seleccionado (HU-10)
  useEffect(() => {
    if (!estudianteEncontrado || !codigoBusqueda) return;

    const codigoEst = codigoBusqueda.trim().toUpperCase();
    const wsUrl = `ws://127.0.0.1:8000/ws/monitoreo/${codigoEst}`;
    let socket: WebSocket | null = null;
    let pingInterval: any = null;
    let silenceTimer: any = null;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('[DASHBOARD WS OPEN] Suscrito a la telemetría en vivo del estudiante:', codigoEst);
        setWsConectado(true);

        pingInterval = setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ ping: true, codigo_estudiante: codigoEst }));
          }
        }, 8000);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.pong) return;

          // Fotograma de video en tiempo real con malla facial MediaPipe
          if (data.frame) {
            setFrameStream(data.frame);
          }

          if (data.iai !== undefined) {
            setRecibiendoTelemetria(true);
            const iaiValor = Number(data.iai.toFixed(1));
            let estado = 'Atención Alta';
            if (data.es_abandono_puesto) {
              estado = 'Ausente del Puesto';
            } else if (iaiValor < 50) {
              estado = 'Desatención Crítica';
            } else if (iaiValor < 70) {
              estado = 'Atención Moderada';
            }

            setMetricasActuales({
              iai: iaiValor,
              scoreOcular: data.score_ocular !== undefined ? Number(data.score_ocular.toFixed(1)) : 0,
              scorePostural: data.score_postural !== undefined ? Number(data.score_postural.toFixed(1)) : 0,
              scoreMotriz: data.score_motriz !== undefined ? Number(data.score_motriz.toFixed(1)) : 0,
              alertaActiva: data.alerta_reenganche || iaiValor < 50 || data.es_abandono_puesto || data.es_bostezo || data.distractor_externo || data.es_staring || data.es_slumping || data.es_microsueno || data.es_somnolencia,
              estadoLectura: estado,
              esAbandonoPuesto: !!data.es_abandono_puesto,
              mar: data.mar !== undefined ? Number(data.mar.toFixed(2)) : 0.25,
              esBostezo: !!data.es_bostezo,
              distractorExterno: !!data.distractor_externo,
              esStaring: !!data.es_staring,
              esSlumping: !!data.es_slumping,
              esSomnolencia: !!data.es_microsueno || !!data.es_somnolencia
            });

            setHistorialIai(prev => [...prev.slice(-24), iaiValor]);
            setUltimoTimestamp(new Date().toLocaleTimeString());

            // Si no llegan fotogramas en 3.5 segundos, la cámara se considera inactiva
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
              setRecibiendoTelemetria(false);
              setFrameStream(null);
            }, 3500);
          }
        } catch (err) {
          console.warn('Error parsing WS message in Dashboard:', err);
        }
      };

      socket.onerror = () => {
        setWsConectado(false);
        setRecibiendoTelemetria(false);
        setFrameStream(null);
      };

      socket.onclose = () => {
        setWsConectado(false);
        setRecibiendoTelemetria(false);
        setFrameStream(null);
      };
    } catch (e) {
      setWsConectado(false);
      setRecibiendoTelemetria(false);
      setFrameStream(null);
    }

    return () => {
      clearInterval(pingInterval);
      if (silenceTimer) clearTimeout(silenceTimer);
      if (socket) socket.close();
    };
  }, [codigoBusqueda, estudianteEncontrado]);

  const getTituloRol = (rol?: string) => {
    switch (rol) {
      case 'DOCENTE': return 'Panel de Monitoreo Docente de Aula';
      case 'PSICOLOGO': return 'Gabinete de Seguimiento Psicopedagógico';
      case 'DIRECTOR': return 'Panel de Supervisión Directiva Escolar';
      case 'TUTOR': return 'Portal de Acompañamiento Familiar';
      default: return 'Panel de Autoridades y Seguimiento';
    }
  };

  // Filtrado de estudiantes en la vista de Directorio
  const estudiantesFiltrados = estudiantes.filter(e => {
    const q = filtroEstudiantes.toLowerCase();
    return (
      e.nombre_completo.toLowerCase().includes(q) ||
      e.codigo_estudiante.toLowerCase().includes(q) ||
      (e.grado_escolar && e.grado_escolar.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-[calc(100vh-5rem)] p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      
      {/* ============================================================== */}
      {/* BARRA DE NAVEGACIÓN SUPERIOR CON MENÚ HAMBURGUESA             */}
      {/* ============================================================== */}
      <div className="glass-panel p-4 rounded-3xl border border-slate-800 flex items-center justify-between relative z-30">
        
        {/* Botón Hamburguesa e Indicador de Sección */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuHamburguesaAbierto(!menuHamburguesaAbierto)}
            className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-400 hover:text-cyan-300 transition shadow-lg flex items-center gap-2 cursor-pointer"
            title="Abrir Menú de Navegación"
          >
            {menuHamburguesaAbierto ? <X className="w-5 h-5 text-rose-400" /> : <Menu className="w-5 h-5" />}
            <span className="text-xs font-bold text-white hidden sm:inline">Menú</span>
          </button>

          <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="text-sm font-bold font-heading text-white tracking-wide">
              {seccionActiva === 'DASHBOARD' && 'Dashboard de Monitoreo'}
              {seccionActiva === 'ESTUDIANTES' && 'Directorio de Estudiantes'}
              {seccionActiva === 'HISTORIAL' && 'Historial de Reportes PDF'}
            </span>
          </div>
        </div>

        {/* Pestañas de Acceso Rápido (Desktop) */}
        <div className="hidden md:flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => { setSeccionActiva('DASHBOARD'); setMenuHamburguesaAbierto(false); }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
              seccionActiva === 'DASHBOARD'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </button>

          <button
            onClick={() => { setSeccionActiva('ESTUDIANTES'); setMenuHamburguesaAbierto(false); cargarEstudiantes(); }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
              seccionActiva === 'ESTUDIANTES'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" /> Estudiantes ({estudiantes.length})
          </button>

          <button
            onClick={() => { setSeccionActiva('HISTORIAL'); setMenuHamburguesaAbierto(false); cargarHistorial(); }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
              seccionActiva === 'HISTORIAL'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-4 h-4" /> Historial de Reportes
          </button>
        </div>

        {/* Badge de Rol Activo */}
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 font-mono font-bold text-xs uppercase">
            {usuario?.rol || 'DOCENTE'}
          </span>
        </div>

        {/* ============================================================== */}
        {/* DESPLEGABLE DEL MENÚ HAMBURGUESA                               */}
        {/* ============================================================== */}
        {menuHamburguesaAbierto && (
          <div className="absolute top-full left-4 mt-2 w-72 glass-panel p-3 rounded-2xl border border-slate-700 shadow-2xl space-y-1.5 animate-in fade-in zoom-in-95 duration-150 z-50">
            <p className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              Navegación del Sistema
            </p>
            
            <button
              onClick={() => { setSeccionActiva('DASHBOARD'); setMenuHamburguesaAbierto(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                seccionActiva === 'DASHBOARD'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-cyan-400" />
              <div className="text-left">
                <p className="font-bold">Dashboard</p>
                <p className="text-[10px] text-slate-400">Telemetría biométrica en vivo</p>
              </div>
            </button>

            <button
              onClick={() => { setSeccionActiva('ESTUDIANTES'); setMenuHamburguesaAbierto(false); cargarEstudiantes(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                seccionActiva === 'ESTUDIANTES'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-400" />
              <div className="text-left">
                <p className="font-bold">Estudiantes</p>
                <p className="text-[10px] text-slate-400">Lista completa ({estudiantes.length} registrados)</p>
              </div>
            </button>

            <button
              onClick={() => { setSeccionActiva('HISTORIAL'); setMenuHamburguesaAbierto(false); cargarHistorial(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                seccionActiva === 'HISTORIAL'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4 text-violet-400" />
              <div className="text-left">
                <p className="font-bold">Historial de Reportes</p>
                <p className="text-[10px] text-slate-400">Descarga de reportes PDF oficiales</p>
              </div>
            </button>
          </div>
        )}

      </div>

      {/* ============================================================== */}
      {/* VISTA 1: DASHBOARD DE MONITOREO                                */}
      {/* ============================================================== */}
      {seccionActiva === 'DASHBOARD' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Header del Dashboard */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 glass-panel p-6 rounded-3xl border border-slate-800">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <UserCheck className="w-4 h-4" /> {getTituloRol(usuario?.rol)} | Rol Activo: {usuario?.rol || 'DOCENTE'}
              </div>
              <h1 className="text-3xl font-bold font-heading text-white">Monitoreo de Atención de Estudiantes</h1>
              <p className="text-slate-400 text-sm mt-1">
                Bienvenido, <strong className="text-white">{usuario?.username}</strong>. Selecciona un estudiante o ingresa su código.
              </p>
            </div>

            {/* Selector Rápido y Buscador por Código */}
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
              
              {/* Selector desplegable de estudiantes registrados */}
              {estudiantes.length > 0 && (
                <select
                  value={estudianteActivo?.codigo_estudiante || ''}
                  onChange={(e) => {
                    const sel = estudiantes.find(est => est.codigo_estudiante === e.target.value);
                    if (sel) seleccionarEstudiante(sel);
                  }}
                  className="w-full sm:w-56 bg-slate-900 border border-slate-700 text-cyan-300 font-semibold text-xs rounded-xl px-3 py-2.5 outline-none focus:border-cyan-400 transition"
                >
                  {estudiantes.map((est) => (
                    <option key={est.codigo_estudiante} value={est.codigo_estudiante}>
                      {est.codigo_estudiante} - {est.nombre_completo}
                    </option>
                  ))}
                </select>
              )}

              {/* Formulario de Búsqueda por Código manual */}
              <form onSubmit={handleBuscar} className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-52">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={codigoBusqueda}
                    onChange={(e) => setCodigoBusqueda(e.target.value)}
                    placeholder="EST-2026-001"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white font-mono text-xs rounded-xl pl-9 pr-3 py-2.5 outline-none transition"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition shrink-0 cursor-pointer"
                >
                  Buscar
                </button>
              </form>

            </div>
          </div>

          {/* Ficha Dinámica del Estudiante Seleccionado */}
          {cargandoEstudiantes ? (
            <div className="glass-panel p-16 text-center rounded-3xl border border-slate-800 space-y-3">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-300">Cargando directorio de estudiantes desde la base de datos...</p>
              <p className="text-xs text-slate-500">Consultando registros biométricos en SQLite</p>
            </div>
          ) : estudianteEncontrado && estudianteActivo ? (
            <div className="space-y-6">
              
              {/* Card de Ficha del Estudiante */}
              <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-slate-950 font-bold text-2xl shadow-lg shadow-cyan-500/20 shrink-0">
                    {obtenerIniciales(estudianteActivo.nombre_completo)}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold font-heading text-white">{estudianteActivo.nombre_completo}</h2>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border flex items-center gap-1 ${
                        recibiendoTelemetria
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        <Radio className={`w-3 h-3 ${recibiendoTelemetria ? 'animate-pulse text-emerald-400' : 'text-slate-500'}`} />
                        {recibiendoTelemetria ? 'Transmitiendo en Vivo' : 'Cámara Apagada (En Espera)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Código: <strong className="font-mono text-emerald-400">{estudianteActivo.codigo_estudiante}</strong></span>
                      <span>•</span>
                      <span>Grado: <strong className="text-cyan-300">{estudianteActivo.grado_escolar || '3º de Secundaria'}</strong></span>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                        {getEtiquetaSubtipo(estudianteActivo.subtipo_tdah)}
                      </span>
                    </p>
                    <p className="text-xs text-amber-400 font-semibold mt-1">
                      Diagnóstico: {estudianteActivo.diagnostico_observacion || 'Atención y Actividad Motriz en Aula'}
                    </p>
                  </div>
                </div>

                {/* Botones de Acción */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={(e) => togglePrivacidadEstudiante(estudianteActivo, e)}
                    disabled={actualizandoPrivacidad === estudianteActivo.codigo_estudiante}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer shadow-md ${
                      estudianteActivo.protegido !== false
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                    }`}
                    title="Alternar entre Malla Facial 3D anonimizada o Rostro Real"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    {estudianteActivo.protegido !== false ? '🛡️ Malla 3D (Anonimizado)' : '📷 Rostro Real (Auditado)'}
                  </button>

                  <button
                    onClick={() => abrirModalEdicion(estudianteActivo)}
                    className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 hover:text-white border border-amber-500/30 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                    title="Editar diagnóstico clínico o grado del estudiante"
                  >
                    <Edit3 className="w-4 h-4" />
                    Editar
                  </button>

                  <button
                    onClick={() => handleExportarPdf(estudianteActivo.codigo_estudiante, undefined, false)}
                    disabled={descargandoPdf}
                    className="px-4 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-500/30 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    title="Descargar reporte completo (todos los episodios registrados)"
                  >
                    <Download className="w-4 h-4" />
                    {descargandoPdf && codigoDescargando === `${estudianteActivo.codigo_estudiante}-completo`
                      ? 'Generando...' 
                      : `PDF Completo`}
                  </button>

                  <button
                    onClick={() => handleExportarPdf(estudianteActivo.codigo_estudiante, undefined, true)}
                    disabled={descargandoPdf}
                    className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 font-bold text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    title="Descargar reporte resumen (8 eventos más críticos)"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    {descargandoPdf && codigoDescargando === `${estudianteActivo.codigo_estudiante}-resumen`
                      ? 'Resumiendo...' 
                      : `Resumen (Top 8)`}
                  </button>
                </div>
              </div>

              {/* Banner de Alerta Clínica en Vivo */}
              {metricasActuales?.alertaActiva && recibiendoTelemetria && (
                <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold animate-pulse border shadow-lg ${
                  metricasActuales.esAbandonoPuesto
                    ? 'bg-rose-950/40 border-rose-500/60 text-rose-200 shadow-rose-500/10'
                    : metricasActuales.distractorExterno
                    ? 'bg-purple-950/40 border-purple-500/60 text-purple-200 shadow-purple-500/10'
                    : metricasActuales.esBostezo
                    ? 'bg-amber-950/40 border-amber-500/60 text-amber-200 shadow-amber-500/10'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                    <span>
                      {metricasActuales.esAbandonoPuesto
                        ? '⚠️ ALERTA CRÍTICA (DSM-5): El estudiante ha abandonado su asiento o se encuentra fuera de cámara. Puntaje IAI colapsado a 0%.'
                        : metricasActuales.distractorExterno
                        ? '👥 DISTRACTOR EXTERNO EN AULA: Se detectan múltiples personas en el encuadre. Interrupción o distracción social en curso.'
                        : metricasActuales.esBostezo
                        ? `🥱 DETECCIÓN DE FATIGA PROFUNDA: Bostezo prolongado registrado (Apertura bucal MAR: ${metricasActuales.mar}). Considere una pausa cognitiva.`
                        : metricasActuales.esSomnolencia
                        ? '😴 SOMNOLENCIA / PÁRPADOS CANSADOS: Oclusión palpebral prolongada (>1.2s). El estudiante presenta signos de cabeceo o micro-sueño.'
                        : metricasActuales.esStaring
                        ? '👁️ MIRADA PERDIDA (F90.0): Fijación ocular rígida prolongada sin parpadeo (Ensoñación pasiva / Mind-wandering).'
                        : metricasActuales.esSlumping
                        ? '📉 HUNDIMIENTO POSTURAL: Pérdida del tono muscular o rostro colapsado hacia el pupitre (Slumping).'
                        : `⚠️ ALERTA DE REENGANCHE EN VIVO: El estudiante presenta un IAI crítico (${metricasActuales.iai}%). El avatar HUD y Border Glow están activos en su pantalla.`}
                    </span>
                  </div>
                  {metricasActuales.esAbandonoPuesto && (
                    <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold uppercase shrink-0">
                      Ausente
                    </span>
                  )}
                </div>
              )}

              {/* Banner Contextual Dinámico: Claridad de Origen de Datos (En Vivo vs Histórico) */}
              {recibiendoTelemetria ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-300 text-xs font-semibold shadow-lg shadow-emerald-500/5">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
                    <span>
                      <strong className="text-white">🔴 Transmisión en Vivo Activa:</strong> Recibiendo telemetría continua a 4 Hz desde la cámara del estudiante. Los indicadores y la línea de tiempo se actualizan en tiempo real.
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono shrink-0 w-fit">
                    4 Hz • RFC 6455
                  </span>
                </div>
              ) : sesionesBitacora.length > 0 || (estudianteActivo.ultimo_iai !== null && estudianteActivo.ultimo_iai !== undefined) ? (
                <div className="p-4 bg-slate-900/90 border border-cyan-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-slate-300 text-xs shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-white flex items-center gap-2">
                        <span>📁 Modo Histórico (Última Sesión Registrada)</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono text-[10px] border border-slate-700">
                          Cámara en espera
                        </span>
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        El estudiante no tiene la cámara encendida en este momento. Las métricas inferiores reflejan el consolidado de su última sesión formal registrada. Al iniciar la webcam en clase, estos paneles cambiarán automáticamente a telemetría en vivo.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3 text-slate-400 text-xs">
                  <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    ⚪ En Espera de Primer Monitoreo: El estudiante aún no cuenta con sesiones registradas en la base de datos. Los indicadores comenzarán a calcularse al iniciar su primera clase con cámara web.
                  </span>
                </div>
              )}

              {/* Grid de Velocímetro IAI y Métricas Biométricas en Vivo */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                
                {/* Velocímetro IAI 0-100% */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col items-center justify-center space-y-4 text-center">
                  <div className="w-full flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      {recibiendoTelemetria ? 'IAI en Vivo' : 'Último IAI'}
                    </span>
                    {recibiendoTelemetria ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold uppercase animate-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> En Vivo
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-bold uppercase">
                        Última Sesión
                      </span>
                    )}
                  </div>
                  
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="12" className="text-slate-800" fill="transparent" />
                      <circle
                        cx="72"
                        cy="72"
                        r="60"
                        stroke="currentColor"
                        strokeWidth="12"
                        className={`transition-all duration-300 ${
                          recibiendoTelemetria && metricasActuales
                            ? (metricasActuales.iai >= 70 ? 'text-emerald-400' : metricasActuales.iai >= 50 ? 'text-amber-400' : 'text-rose-400')
                            : (estudianteActivo.ultimo_iai ? (estudianteActivo.ultimo_iai >= 70 ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-800')
                        }`}
                        fill="transparent"
                        strokeDasharray={376.8}
                        strokeDashoffset={376.8 - (376.8 * Math.max(0, Math.min(100, (recibiendoTelemetria && metricasActuales) ? metricasActuales.iai : (estudianteActivo.ultimo_iai || 0)))) / 100}
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-3xl font-extrabold font-heading text-white">
                        {(recibiendoTelemetria && metricasActuales) 
                          ? `${metricasActuales.iai}%` 
                          : (estudianteActivo.ultimo_iai !== null && estudianteActivo.ultimo_iai !== undefined ? `${estudianteActivo.ultimo_iai}%` : '--')}
                      </span>
                      <span className={`block text-[10px] uppercase font-bold ${
                        (recibiendoTelemetria && metricasActuales) 
                          ? (metricasActuales.iai >= 70 ? 'text-emerald-400' : metricasActuales.iai >= 50 ? 'text-amber-400' : 'text-rose-400')
                          : (estudianteActivo.ultimo_iai !== null && estudianteActivo.ultimo_iai !== undefined ? 'text-cyan-400' : 'text-slate-500')
                      }`}>
                        {(recibiendoTelemetria && metricasActuales) 
                          ? metricasActuales.estadoLectura 
                          : (estudianteActivo.ultimo_iai !== null && estudianteActivo.ultimo_iai !== undefined ? 'Última Sesión' : 'Sin Evaluar')}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    {recibiendoTelemetria 
                      ? `Transmitiendo: ${ultimoTimestamp}` 
                      : (estudianteActivo.ultimo_iai !== null && estudianteActivo.ultimo_iai !== undefined ? 'Datos de sesión previa' : 'En espera de cámara web')}
                  </p>
                </div>

                {/* Sub-índice Ocular EAR */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-cyan-400" /> Sub-Índice Ocular EAR
                    </span>
                    {recibiendoTelemetria ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold uppercase animate-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> En Vivo
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-bold uppercase">
                        Última Sesión
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold font-heading text-white">
                    {recibiendoTelemetria && metricasActuales
                      ? `${metricasActuales.scoreOcular}%` 
                      : (sesionesBitacora.length > 0 ? `${sesionesBitacora[sesionesBitacora.length - 1].score_ocular}%` : '--')}
                  </p>
                  <p className="text-xs text-emerald-400 font-semibold">Tasa de Parpadeo Ponderada (45%)</p>
                  <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">Evaluación de fatiga palpebral y micro-somnolencia.</p>
                </div>

                {/* Sub-índice Postural PnP */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-violet-400" /> Sub-Índice Postural PnP
                    </span>
                    {recibiendoTelemetria ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold uppercase animate-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> En Vivo
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-bold uppercase">
                        Última Sesión
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold font-heading text-white">
                    {recibiendoTelemetria && metricasActuales
                      ? `${metricasActuales.scorePostural}%` 
                      : (sesionesBitacora.length > 0 ? `${sesionesBitacora[sesionesBitacora.length - 1].score_postural}%` : '--')}
                  </p>
                  <p className="text-xs text-violet-300 font-semibold">Orientación de Cabeza (35%)</p>
                  <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">Alineación con la pantalla de lectura (Yaw/Pitch).</p>
                </div>

                {/* Sub-índice Motriz Hombros */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-amber-400" /> Sub-Índice Motriz Hombros
                    </span>
                    {recibiendoTelemetria ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold uppercase animate-pulse flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> En Vivo
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-bold uppercase">
                        Última Sesión
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold font-heading text-white">
                    {recibiendoTelemetria && metricasActuales
                      ? `${metricasActuales.scoreMotriz}%` 
                      : (sesionesBitacora.length > 0 ? `${sesionesBitacora[sesionesBitacora.length - 1].score_motriz}%` : '--')}
                  </p>
                  <p className="text-xs text-amber-400 font-semibold">Varianza Cinemática (20%)</p>
                  <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">Detección de hiperactividad postural (Fidgeting).</p>
                </div>

              </div>

              {/* Sección de Monitorización: Monitor Visual (50%) y Línea de Tiempo (50%) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Panel Izquierdo: Monitor de Cámara y Malla Facial (MediaPipe Face Mesh 3D) */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold font-heading text-white flex items-center gap-2">
                        <Video className="w-5 h-5 text-cyan-400" /> Monitor de Cámara y Malla Facial
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Visión computacional MediaPipe FaceMesh & SolvePnP 3D</p>
                    </div>
                    {recibiendoTelemetria && frameStream ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> Feed HD en Vivo (~6 FPS)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-bold uppercase flex items-center gap-1.5">
                        <CameraOff className="w-3.5 h-3.5" /> Cámara en Espera
                      </span>
                    )}
                  </div>

                  {/* Viewport del Frame en Alta Definición y Aspect Ratio Nativo */}
                  <div className="w-full aspect-video max-h-80 rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden relative flex items-center justify-center shadow-2xl">
                    {recibiendoTelemetria && frameStream ? (
                      <div className="w-full h-full relative flex items-center justify-center bg-black/90">
                        <img
                          src={frameStream}
                          alt="Feed biométrico en vivo del estudiante"
                          className="w-full h-full object-contain rounded-xl select-none"
                          style={{ imageRendering: 'auto' }}
                        />
                        {/* Overlay de Abandono de Puesto Escolar */}
                        {metricasActuales?.esAbandonoPuesto && (
                          <div className="absolute inset-0 bg-rose-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-4 z-20">
                            <AlertCircle className="w-10 h-10 text-rose-400 animate-bounce mb-2" />
                            <p className="text-white font-bold text-sm">Estudiante Fuera de Cámara</p>
                            <p className="text-rose-300 text-xs mt-0.5">Abandono de puesto escolar detectado (IAI: 0%)</p>
                          </div>
                        )}

                        <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-700/80 text-[10px] font-mono text-emerald-300 flex items-center gap-2 z-10">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                          Malla Facial PnP Activa
                        </div>

                        {/* Badges de Biomarcadores Clínicos Específicos */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                          {metricasActuales?.esBostezo && (
                            <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-bold shadow animate-pulse">
                              🥱 Bostezo
                            </span>
                          )}
                          {metricasActuales?.distractorExterno && (
                            <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-[9px] font-bold shadow animate-pulse">
                              👥 Distractor (+1)
                            </span>
                          )}
                          {metricasActuales?.esSomnolencia && (
                            <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-bold shadow animate-pulse">
                              😴 Somnolencia
                            </span>
                          )}
                          {metricasActuales?.esStaring && (
                            <span className="px-2 py-0.5 rounded bg-cyan-600 text-white text-[9px] font-bold shadow">
                              👁️ Staring
                            </span>
                          )}
                          {metricasActuales?.esSlumping && (
                            <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold shadow">
                              📉 Slumping
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] font-mono text-slate-300 border border-slate-700">
                            4 Hz • PnP 3D
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
                          <Camera className="w-7 h-7 text-slate-500" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-slate-300">Cámara del Estudiante en Espera</p>
                          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                            Al encender la cámara en clase, la transmisión en vivo con la malla geométrica (ojos, nariz SolvePnP y hombros) se proyectará en esta ventana.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Panel Derecho: Gráfico SVG de Línea de Tiempo de Atención en Vivo */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold font-heading text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-emerald-400" /> Línea de Tiempo de Atención en Vivo
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">Telemetría continua del Índice IAI para {estudianteActivo.nombre_completo}</p>
                    </div>
                    <span className={`text-xs font-mono flex items-center gap-1 ${recibiendoTelemetria ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <Sparkles className="w-3.5 h-3.5" /> {recibiendoTelemetria ? 'Streaming Real' : 'En Espera'}
                    </span>
                  </div>

                  {historialIai.length > 0 ? (
                    <div className="h-56 w-full relative bg-slate-950/60 rounded-2xl border border-slate-800/80 p-4">
                      <svg className="w-full h-full" viewBox="0 0 500 150">
                        <line x1="0" y1="125" x2="500" y2="125" stroke="#334155" strokeWidth="1" />
                        <line x1="0" y1="75" x2="500" y2="75" stroke="#334155" strokeWidth="1" strokeDasharray="4" />
                        <line x1="0" y1="25" x2="500" y2="25" stroke="#334155" strokeWidth="1" strokeDasharray="4" />
                        
                        <text x="10" y="20" fill="#10B981" fontSize="9" fontFamily="monospace">100% (Atención Alta)</text>
                        <text x="10" y="70" fill="#F59E0B" fontSize="9" fontFamily="monospace">50% (Umbral Desatención)</text>
                        <text x="10" y="120" fill="#EF4444" fontSize="9" fontFamily="monospace">0%</text>

                        <path
                          d={generarRutaSvg(historialIai)}
                          fill="none"
                          stroke={(metricasActuales?.iai || 0) >= 70 ? '#10B981' : (metricasActuales?.iai || 0) >= 50 ? '#F59E0B' : '#EF4444'}
                          strokeWidth="3"
                          className="transition-all duration-300"
                        />

                        {historialIai.map((p, idx) => {
                          const stepX = 500 / Math.max(1, historialIai.length - 1);
                          const x = idx * stepX;
                          const y = 125 - (Math.max(0, Math.min(100, p)) / 100) * 100;
                          const esUltimo = idx === historialIai.length - 1;
                          return (
                            <circle
                              key={idx}
                              cx={x}
                              cy={y}
                              r={esUltimo ? 6 : 3}
                              fill={p >= 70 ? '#10B981' : p >= 50 ? '#F59E0B' : '#EF4444'}
                              stroke="#020617"
                              strokeWidth={esUltimo ? 2 : 1}
                              className={esUltimo ? 'animate-pulse' : ''}
                            />
                          );
                        })}
                      </svg>
                    </div>
                  ) : (
                    <div className="h-56 w-full flex flex-col items-center justify-center bg-slate-950/60 rounded-2xl border border-slate-800/80 p-6 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                        <Activity className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-300">Sin Telemetría en Tiempo Real Activa</p>
                        <p className="text-xs text-slate-500 max-w-xs mt-1">
                          El estudiante aún no ha encendido su cámara. La gráfica se trazará en tiempo real cuando inicie la transmisión.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* ============================================================== */}
              {/* SECCIÓN: BITÁCORA DE SESIONES HISTÓRICAS Y PROGRESIÓN (HU-11) */}
              {/* ============================================================== */}
              <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-6">
                
                {/* Header de la Bitácora */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
                      <Layers className="w-3.5 h-3.5" /> Bitácora Longitudinal de Evaluaciones
                    </div>
                    <h3 className="text-xl font-bold font-heading text-white">
                      Progresión y Sesiones Acumuladas
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Registro inmutable de cada sesión activa en aula. Evaluaciones conservadas para análisis psicopedagógico comparativo.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-mono text-xs flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      Total Sesiones: <strong className="text-white">{sesionesBitacora.length}</strong>
                    </span>
                    <button
                      onClick={() => cargarBitacoraEstudiante(estudianteActivo.codigo_estudiante)}
                      className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                      title="Refrescar bitácora de sesiones"
                    >
                      <RefreshCw className={`w-4 h-4 ${cargandoBitacora ? 'animate-spin text-cyan-400' : ''}`} />
                    </button>
                  </div>
                </div>

                {cargandoBitacora ? (
                  <div className="py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Consultando bitácora de sesiones en SQLite...</p>
                  </div>
                ) : sesionesBitacora.length > 0 ? (
                  <div className="space-y-6">
                    {/* 1. GRÁFICA DE PROGRESIÓN LONGITUDINAL (SESIÓN 1 -> SESIÓN N) */}
                    <div className="bg-slate-950/70 p-5 rounded-2xl border border-slate-800/90 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-cyan-400" /> Curva de Evolución Longitudinal (IAI Promedio por Sesión)
                          </h4>
                          <p className="text-[11px] text-slate-500">Tendencia atencional a través de las diferentes sesiones de monitoreo registradas.</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-mono">
                          <span className="flex items-center gap-1.5 text-emerald-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Sostenida (≥70%)
                          </span>
                          <span className="flex items-center gap-1.5 text-amber-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Moderada (50-69%)
                          </span>
                          <span className="flex items-center gap-1.5 text-rose-400">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Crítica (&lt;50%)
                          </span>
                        </div>
                      </div>

                      {/* SVG Longitudinal */}
                      <div className="h-44 w-full pt-2 relative">
                        <svg className="w-full h-full" viewBox="0 0 500 130">
                          {/* Líneas guía */}
                          <line x1="0" y1="110" x2="500" y2="110" stroke="#1e293b" strokeWidth="1" />
                          <line x1="0" y1="65" x2="500" y2="65" stroke="#334155" strokeWidth="1" strokeDasharray="3" />
                          <line x1="0" y1="20" x2="500" y2="20" stroke="#1e293b" strokeWidth="1" strokeDasharray="3" />
                          
                          <text x="5" y="18" fill="#10B981" fontSize="8" fontFamily="monospace">100%</text>
                          <text x="5" y="62" fill="#F59E0B" fontSize="8" fontFamily="monospace">70% Umbral Clínico</text>
                          <text x="5" y="108" fill="#EF4444" fontSize="8" fontFamily="monospace">0%</text>

                          {/* Curva de conexión si hay más de 1 punto */}
                          {sesionesBitacora.length > 1 && (
                            <path
                              d={sesionesBitacora.map((s, idx) => {
                                const stepX = 440 / (sesionesBitacora.length - 1);
                                const x = 40 + idx * stepX;
                                const y = 110 - (Math.max(0, Math.min(100, s.promedio_iai)) / 100) * 90;
                                return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                              }).join(' ')}
                              fill="none"
                              stroke="#06b6d4"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}

                          {/* Puntos de cada sesión */}
                          {sesionesBitacora.map((s, idx) => {
                            const stepX = sesionesBitacora.length === 1 ? 220 : 440 / (sesionesBitacora.length - 1);
                            const x = sesionesBitacora.length === 1 ? 250 : 40 + idx * stepX;
                            const y = 110 - (Math.max(0, Math.min(100, s.promedio_iai)) / 100) * 90;
                            const colorPunto = s.promedio_iai >= 70 ? '#10B981' : s.promedio_iai >= 50 ? '#F59E0B' : '#EF4444';

                            return (
                              <g key={s.id_sesion || idx}>
                                <circle
                                  cx={x}
                                  cy={y}
                                  r={5}
                                  fill={colorPunto}
                                  stroke="#020617"
                                  strokeWidth={2}
                                />
                                <text
                                  x={x}
                                  y={y - 8}
                                  textAnchor="middle"
                                  fill="#e2e8f0"
                                  fontSize="9"
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                >
                                  {s.promedio_iai}%
                                </text>
                                <text
                                  x={x}
                                  y={124}
                                  textAnchor="middle"
                                  fill="#94a3b8"
                                  fontSize="8"
                                  fontFamily="monospace"
                                >
                                  S{s.numero_sesion}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    {/* 2. TABLA DETALLADA DE SESIONES CON DESCARGA DE PDF INDIVIDUAL */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                          <tr>
                            <th className="px-5 py-3.5"># Sesión</th>
                            <th className="px-5 py-3.5">Fecha y Hora</th>
                            <th className="px-5 py-3.5">Duración & Telemetría</th>
                            <th className="px-5 py-3.5 text-center">IAI Promedio</th>
                            <th className="px-5 py-3.5">Desglose Canales</th>
                            <th className="px-5 py-3.5">Eventos Registrados</th>
                            <th className="px-5 py-3.5 text-right">Reportes PDF</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                          {sesionesBitacora.map((s) => {
                            const colorBadge = s.promedio_iai >= 70 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : s.promedio_iai >= 50 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

                            return (
                              <tr key={s.id_sesion} className="hover:bg-slate-900/40 transition">
                                <td className="px-5 py-4 font-bold text-white whitespace-nowrap">
                                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono text-cyan-300">
                                    Sesión {s.numero_sesion}
                                  </span>
                                </td>

                                <td className="px-5 py-4 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                                    {s.fecha_inicio}
                                  </div>
                                </td>

                                <td className="px-5 py-4 whitespace-nowrap">
                                  <div className="font-semibold text-white">{s.duracion_formateada}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">{s.total_metricas} muestras biométricas</div>
                                </td>

                                <td className="px-5 py-4 text-center whitespace-nowrap">
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border inline-block ${colorBadge}`}>
                                    {s.promedio_iai}%
                                  </span>
                                  <span className="block text-[9px] uppercase tracking-wider text-slate-500 mt-0.5">
                                    {s.estado_lectura}
                                  </span>
                                </td>

                                <td className="px-5 py-4 text-[11px] font-mono text-slate-400 whitespace-nowrap">
                                  <div>👁️ Ocular: <strong className="text-cyan-300">{s.score_ocular}%</strong></div>
                                  <div>📐 Postural: <strong className="text-violet-300">{s.score_postural}%</strong></div>
                                  <div>⚡ Motriz: <strong className="text-amber-300">{s.score_motriz}%</strong></div>
                                </td>

                                <td className="px-5 py-4">
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {s.eventos_resumen.map((ev, evIdx) => (
                                      <span 
                                        key={evIdx}
                                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                          ev.toLowerCase().includes('continua') || ev.toLowerCase().includes('sin incidentes')
                                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                                        }`}
                                      >
                                        {ev}
                                      </span>
                                    ))}
                                  </div>
                                </td>

                                <td className="px-5 py-4 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => handleExportarPdf(estudianteActivo.codigo_estudiante, s.id_sesion, false)}
                                      disabled={descargandoPdf}
                                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                      title={`Descargar Reporte Completo (100% de episodios) de la Sesión ${s.numero_sesion}`}
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>{descargandoPdf && codigoDescargando === `${estudianteActivo.codigo_estudiante}-${s.id_sesion}-completo` ? 'Generando...' : 'Descargar PDF'}</span>
                                    </button>
                                    <button
                                      onClick={() => handleExportarPdf(estudianteActivo.codigo_estudiante, s.id_sesion, true)}
                                      disabled={descargandoPdf}
                                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 hover:border-amber-400 font-bold text-xs rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                      title={`Descargar Reporte Resumen (Top 8 eventos más críticos) de la Sesión ${s.numero_sesion}`}
                                    >
                                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                      <span>{descargandoPdf && codigoDescargando === `${estudianteActivo.codigo_estudiante}-${s.id_sesion}-resumen` ? 'Resumiendo...' : 'Descargar Resumen'}</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center bg-slate-950/40 rounded-2xl border border-slate-800/80 p-6 space-y-2">
                    <FileText className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs font-semibold text-slate-300">Sin Sesiones Históricas Registradas</p>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                      El estudiante <strong className="text-slate-300">{estudianteActivo.nombre_completo}</strong> aún no cuenta con sesiones finalizadas de al menos 10 segundos. En cuanto active su cámara y presione "Finalizar y Guardar Sesión" en el Portal del Estudiante, cada sesión se archivará aquí permanentemente con su propio reporte PDF descargable.
                    </p>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="glass-panel p-12 rounded-3xl border border-slate-800 text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
              <h3 className="text-xl font-bold text-white">Estudiante no encontrado</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">No se encontraron registros para el código "{codigoBusqueda}". Verifique e intente nuevamente.</p>
            </div>
          )}

        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 2: DIRECTORIO DE ESTUDIANTES                             */}
      {/* ============================================================== */}
      {seccionActiva === 'ESTUDIANTES' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Header de la sección */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <Users className="w-4 h-4" /> Directorio de Estudiantes Registrados
              </div>
              <h2 className="text-2xl font-bold font-heading text-white">Estudiantes de la Institución</h2>
              <p className="text-slate-400 text-xs mt-1">
                Consulta los perfiles, grado escolar y solicita el reporte formal de cada estudiante.
              </p>
            </div>

            {/* Barra de búsqueda y botón refrescar */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={filtroEstudiantes}
                  onChange={(e) => setFiltroEstudiantes(e.target.value)}
                  placeholder="Buscar por nombre, código o curso..."
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:border-cyan-400 transition"
                />
              </div>
              <button
                onClick={cargarEstudiantes}
                className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition cursor-pointer"
                title="Actualizar lista de estudiantes"
              >
                <RefreshCw className={`w-4 h-4 ${cargandoEstudiantes ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Grid de Tarjetas de Estudiantes */}
          {cargandoEstudiantes ? (
            <div className="glass-panel p-12 text-center rounded-3xl border border-slate-800">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-400">Cargando estudiantes desde la base de datos...</p>
            </div>
          ) : estudiantesFiltrados.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {estudiantesFiltrados.map((est) => {
                const estaEnLinea = !!est.sesion_activa;
                const estaSeleccionado = estudianteActivo?.codigo_estudiante === est.codigo_estudiante;
                return (
                  <div
                    key={est.codigo_estudiante}
                    className={`glass-panel p-5 rounded-3xl border transition duration-200 flex flex-col justify-between space-y-4 ${
                      estaSeleccionado 
                        ? 'border-cyan-500/60 shadow-lg shadow-cyan-500/10 bg-slate-900/90' 
                        : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
                    }`}
                  >
                    <div>
                      {/* Top Header Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-slate-950 font-bold text-lg shadow-md shrink-0">
                            {obtenerIniciales(est.nombre_completo)}
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white line-clamp-1">{est.nombre_completo}</h3>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono font-bold text-[10px] border border-slate-700">
                              {est.codigo_estudiante}
                            </span>
                          </div>
                        </div>

                        {estaEnLinea ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold uppercase animate-pulse flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> En Vivo
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-bold uppercase">
                            Inactivo
                          </span>
                        )}
                      </div>

                      {/* Detalles del Estudiante */}
                      <div className="mt-4 space-y-1.5 text-xs text-slate-300">
                        <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                          <span className="text-slate-400">Grado Escolar:</span>
                          <span className="font-semibold text-white">{est.grado_escolar || '3º de Secundaria'}</span>
                        </div>
                        <div className="flex items-center justify-between py-1 border-b border-slate-800/80">
                          <span className="text-slate-400">Subtipo TDAH:</span>
                          <span className="font-semibold text-amber-300">{getEtiquetaSubtipo(est.subtipo_tdah)}</span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-slate-400">Último IAI registrado:</span>
                          {est.ultimo_iai !== null && est.ultimo_iai !== undefined ? (
                            <span className="font-mono font-bold text-emerald-400">{est.ultimo_iai}%</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
                              -- (Sin evaluar)
                            </span>
                          )}
                        </div>

                        {/* Control de Privacidad por Estudiante (Malla 3D vs Rostro Real) */}
                        <div className="flex items-center justify-between py-1 pt-2 border-t border-slate-800/60">
                          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Privacidad:
                          </span>
                          <button
                            onClick={(e) => togglePrivacidadEstudiante(est, e)}
                            disabled={actualizandoPrivacidad === est.codigo_estudiante}
                            className={`px-2 py-1 rounded-xl text-[10px] font-bold border transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                              est.protegido !== false
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                            }`}
                            title={est.protegido !== false ? 'Clic para permitir captura de Rostro Real' : 'Clic para activar Malla Facial 3D anonimizada'}
                          >
                            {actualizandoPrivacidad === est.codigo_estudiante ? (
                              <span className="animate-spin text-xs">⏳</span>
                            ) : est.protegido !== false ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                <span>🛡️ Malla 3D (Anonimizado)</span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                <span>📷 Rostro Real (Auditado)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="pt-2 flex items-center gap-2 border-t border-slate-800">
                      <button
                        onClick={() => seleccionarEstudiante(est)}
                        className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white rounded-xl border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver en Vivo
                      </button>

                      <button
                        onClick={() => {
                          seleccionarEstudiante(est);
                          abrirModalEdicion(est);
                        }}
                        className="p-2 bg-slate-900 hover:bg-slate-800 text-amber-300 hover:text-white rounded-xl border border-slate-700 transition cursor-pointer"
                        title="Editar diagnóstico clínico o grado"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExportarPdf(est.codigo_estudiante, undefined, false)}
                          disabled={descargandoPdf && codigoDescargando === `${est.codigo_estudiante}-completo`}
                          className="p-2 bg-violet-600/90 hover:bg-violet-500 text-white rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                          title={`Descargar reporte PDF completo (todos los episodios) de ${est.nombre_completo}`}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleExportarPdf(est.codigo_estudiante, undefined, true)}
                          disabled={descargandoPdf && codigoDescargando === `${est.codigo_estudiante}-resumen`}
                          className="p-2 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 rounded-xl shadow-md transition cursor-pointer disabled:opacity-50"
                          title={`Descargar reporte Resumen (Top 8 eventos más críticos) de ${est.nombre_completo}`}
                        >
                          <Sparkles className="w-4 h-4 text-amber-400" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-panel p-12 text-center rounded-3xl border border-slate-800 space-y-3">
              <Users className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-lg font-bold text-white">No se encontraron estudiantes</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No hay coincidencias para "{filtroEstudiantes}". Prueba con otro nombre o código.
              </p>
            </div>
          )}

        </div>
      )}

      {/* ============================================================== */}
      {/* VISTA 3: HISTORIAL DE REPORTES                                 */}
      {/* ============================================================== */}
      {seccionActiva === 'HISTORIAL' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Header de la sección */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <FileText className="w-4 h-4" /> Historial de Reportes Generados
              </div>
              <h2 className="text-2xl font-bold font-heading text-white">Reportes Psicopedagógicos Oficiales</h2>
              <p className="text-slate-400 text-xs mt-1">
                Documentos formales compilados con ReportLab Platypus, firma digital SHA-256 y código QR (REQ-21, REQ-36).
              </p>
            </div>

            <button
              onClick={cargarHistorial}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${cargandoHistorial ? 'animate-spin' : ''}`} /> Refrescar Historial
            </button>
          </div>

          {/* Tabla / Tarjetas de Historial de Reportes */}
          {cargandoHistorial ? (
            <div className="glass-panel p-12 text-center rounded-3xl border border-slate-800">
              <RefreshCw className="w-8 h-8 text-violet-400 animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-400">Consultando historial en la base de datos...</p>
            </div>
          ) : historialReportes.length > 0 ? (
            <div className="glass-panel rounded-3xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Estudiante</th>
                      <th className="px-6 py-4">Código</th>
                      <th className="px-6 py-4">Grado / Subtipo</th>
                      <th className="px-6 py-4">Fecha / Hora</th>
                      <th className="px-6 py-4 text-center">IAI Promedio</th>
                      <th className="px-6 py-4 text-center">Estado</th>
                      <th className="px-6 py-4 text-right">Reportes PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historialReportes.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40 transition">
                        <td className="px-6 py-4 font-bold text-white flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-violet-600/30 border border-violet-500/40 text-violet-300 flex items-center justify-center font-bold text-xs shrink-0">
                            {obtenerIniciales(item.nombre_completo)}
                          </div>
                          <span>{item.nombre_completo}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono font-bold text-[11px] border border-slate-700">
                            {item.codigo_estudiante}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-300">
                          <p className="font-semibold text-white">{item.grado_escolar}</p>
                          <p className="text-[10px] text-amber-300">{item.subtipo_tdah}</p>
                        </td>
                        <td className="px-6 py-4 text-slate-400 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {item.fecha}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-mono font-bold text-sm">
                          {item.iai_promedio !== null && item.iai_promedio !== undefined ? (
                            <span className="text-emerald-400">{item.iai_promedio}%</span>
                          ) : (
                            <span className="text-slate-500 font-normal">--</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.iai_promedio !== null
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-900 text-slate-500 border border-slate-800'
                          }`}>
                            {item.estado_lectura}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleExportarPdf(item.codigo_estudiante, item.id_sesion, false)}
                              disabled={descargandoPdf}
                              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              title="Descargar reporte PDF completo (todos los episodios)"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{descargandoPdf && codigoDescargando === `${item.codigo_estudiante}-${item.id_sesion}-completo` ? 'Generando...' : 'PDF Completo'}</span>
                            </button>
                            <button
                              onClick={() => handleExportarPdf(item.codigo_estudiante, item.id_sesion, true)}
                              disabled={descargandoPdf}
                              className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 hover:border-amber-400 font-bold text-xs rounded-xl shadow-md transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              title="Descargar reporte resumen (Top 8 eventos críticos)"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              <span>{descargandoPdf && codigoDescargando === `${item.codigo_estudiante}-${item.id_sesion}-resumen` ? 'Resumiendo...' : 'Resumen'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="glass-panel p-12 text-center rounded-3xl border border-slate-800 space-y-3">
              <FileText className="w-10 h-10 text-slate-500 mx-auto" />
              <h3 className="text-lg font-bold text-white">No hay reportes en el historial</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                A medida que los estudiantes completen sesiones de monitoreo, podrás consultar y descargar sus reportes aquí.
              </p>
            </div>
          )}

        </div>
      )}

      {/* Modal de Reclasificación / Actualización Diagnóstica */}
      {modalEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-panel p-6 rounded-3xl border border-slate-700 max-w-md w-full space-y-5 bg-slate-900/95 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Editar Clasificación Clínica</h3>
              </div>
              <button 
                onClick={() => setModalEditar(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Estudiante</label>
                <input 
                  type="text" 
                  disabled 
                  value={estudianteActivo ? `${estudianteActivo.nombre_completo} (${estudianteActivo.codigo_estudiante})` : ''}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-400 rounded-xl px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Grado Escolar</label>
                <select
                  value={formEdicion.grado_escolar}
                  onChange={(e) => setFormEdicion({ ...formEdicion, grado_escolar: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-400"
                >
                  <option value="1º de Secundaria">1º de Secundaria</option>
                  <option value="2º de Secundaria">2º de Secundaria</option>
                  <option value="3º de Secundaria">3º de Secundaria</option>
                  <option value="4º de Secundaria">4º de Secundaria</option>
                  <option value="5º de Secundaria">5º de Secundaria</option>
                  <option value="6º de Secundaria">6º de Secundaria</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Clasificación DSM-5-TR / Control</label>
                <select
                  value={formEdicion.subtipo_tdah}
                  onChange={(e) => setFormEdicion({ ...formEdicion, subtipo_tdah: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-amber-300 font-semibold rounded-xl px-3 py-2 text-xs outline-none focus:border-amber-400"
                >
                  <option value="CONTROL">Sin Diagnóstico Previo / Grupo Control (Neurotípico)</option>
                  <option value="F90_2">F90.2: Presentación Combinada (Déficit + Hiperactividad)</option>
                  <option value="F90_0">F90.0: Predominio Déficit de Atención (Inatento)</option>
                  <option value="F90_1">F90.1: Predominio Hiperactividad / Impulsividad</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Observaciones Clínicas / Psicopedagógicas</label>
                <textarea
                  rows={3}
                  value={formEdicion.diagnostico_observacion}
                  onChange={(e) => setFormEdicion({ ...formEdicion, diagnostico_observacion: e.target.value })}
                  placeholder="Detalles del seguimiento atencional, notas del gabinete de psicología o del docente..."
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-3 text-xs outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalEditar(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {guardandoEdicion ? 'Guardando en BD...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
