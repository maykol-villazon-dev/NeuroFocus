import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Sparkles,
  Camera,
  CameraOff,
  Clock,
  BookOpen,
  Trash2,
  RefreshCw,
  FolderOpen,
  FileCode,
  Image as ImageIcon
} from 'lucide-react';
import { apiCliente } from '../servicios_ws/api_cliente';
import { ModalNotificacion, ModalNotificacionConfig } from './ModalNotificacion';

export interface MaterialEstudioItem {
  id: string;
  nombre_archivo: string;
  nombre_pdf: string;
  url_pdf: string;
  extension_original: string;
  tamano_kb: number;
  fecha_subida: string;
  titulo?: string;
  descripcion_tarea?: string;
  es_docente?: boolean;
  docente_nombre?: string;
}

export interface DocenteMaterialesGrupo {
  id_docente: string;
  nombre_docente: string;
  materiales: MaterialEstudioItem[];
}

interface ModoEstudioProps {
  codigoEstudiante: string;
  nombreEstudiante: string;
  camaraActiva: boolean;
  onEncenderCamara: () => void;
  onFinalizarSesion: () => void;
  childrenWebcamFeed?: React.ReactNode;
  onInteraccionLectura?: () => void;
  onCambioMaterialActivo?: (nombreDoc: string | null) => void;
  onSnapshotPantalla?: (b64: string) => void;
}

export const ModoEstudio: React.FC<ModoEstudioProps> = ({
  codigoEstudiante,
  nombreEstudiante,
  camaraActiva,
  onEncenderCamara,
  onFinalizarSesion,
  childrenWebcamFeed,
  onInteraccionLectura,
  onCambioMaterialActivo,
  onSnapshotPantalla
}) => {
  const [materiales, setMateriales] = useState<MaterialEstudioItem[]>([]);
  const [docentesGrupos, setDocentesGrupos] = useState<DocenteMaterialesGrupo[]>([]);
  const [seccionMateriales, setSeccionMateriales] = useState<string>('PROPIOS'); // 'PROPIOS' o id_docente
  const [materialActivo, setMaterialActivo] = useState<MaterialEstudioItem | null>(null);
  const [cargandoLista, setCargandoLista] = useState<boolean>(false);
  const [modalNotificacion, setModalNotificacion] = useState<ModalNotificacionConfig>({
    abierto: false,
    titulo: '',
    mensaje: ''
  });
  const [subiendoArchivo, setSubiendoArchivo] = useState<boolean>(false);
  const [mensajeEstado, setMensajeEstado] = useState<string | null>(null);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);

  // Controles de Visualización
  const [mostrarPipCamara, setMostrarPipCamara] = useState<boolean>(false);
  const [modoPantallaCompleta, setModoPantallaCompleta] = useState<boolean>(false);
  const [tiempoEstudioSegundos, setTiempoEstudioSegundos] = useState<number>(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notificar al portal sobre el material de estudio activo para el reporte de eventos
  useEffect(() => {
    if (onCambioMaterialActivo) {
      onCambioMaterialActivo(materialActivo?.nombre_archivo || null);
    }
  }, [materialActivo, onCambioMaterialActivo]);

  const snapshotRealDocumentoRef = useRef<string | null>(null);

  // Renderizar la página real del documento a Canvas usando Mozilla PDF.js o Image
  const renderizarDocumentoReal = async (mat: MaterialEstudioItem | null) => {
    if (!mat) {
      snapshotRealDocumentoRef.current = null;
      if (onSnapshotPantalla) onSnapshotPantalla('');
      return;
    }

    const fullUrl = mat.url_pdf;
    const ext = (mat.extension_original || '').toLowerCase();

    // 1. Si el archivo es una imagen directa
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxW = 420;
          const ratio = Math.min(1, maxW / img.width);
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const b64 = canvas.toDataURL('image/jpeg', 0.85);
            snapshotRealDocumentoRef.current = b64;
            if (onSnapshotPantalla) onSnapshotPantalla(b64);
          }
        };
        img.src = fullUrl;
        return;
      } catch (err) {
        console.warn('Error cargando snapshot imagen real:', err);
      }
    }

    // 2. Si el archivo es un PDF (o convertido desde Word/PowerPoint a PDF)
    try {
      const pdfjs = (window as any).pdfjsLib;
      if (pdfjs) {
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const loadingTask = pdfjs.getDocument(fullUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        // Escala ~0.65 para una resolución clara de ~390x550px adecuada para el reporte
        const viewport = page.getViewport({ scale: 0.65 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;

          const b64 = canvas.toDataURL('image/jpeg', 0.82);
          snapshotRealDocumentoRef.current = b64;
          if (onSnapshotPantalla) onSnapshotPantalla(b64);
          return;
        }
      }
    } catch (e) {
      console.warn('[PDF.JS RENDER REAL]', e);
    }
  };

  // Re-emitir snapshot real periódicamente si ya fue renderizado
  const emitirSnapshotDocumento = () => {
    if (!onSnapshotPantalla) return;
    if (snapshotRealDocumentoRef.current) {
      onSnapshotPantalla(snapshotRealDocumentoRef.current);
    }
  };

  // Disparar renderizado real cada vez que cambia el material activo
  useEffect(() => {
    if (materialActivo) {
      renderizarDocumentoReal(materialActivo);
    } else {
      snapshotRealDocumentoRef.current = null;
      if (onSnapshotPantalla) onSnapshotPantalla('');
    }
  }, [materialActivo]);

  // Intervalo ligero de refresco para mantener el snapshot activo en el socket
  useEffect(() => {
    const intervalSnap = setInterval(emitirSnapshotDocumento, 3000);
    return () => clearInterval(intervalSnap);
  }, []);

  // Cronómetro de Estudio en Vivo
  useEffect(() => {
    let intervalo: any = null;
    if (camaraActiva) {
      intervalo = setInterval(() => {
        setTiempoEstudioSegundos((prev) => prev + 1);
      }, 1000);
    } else {
      setTiempoEstudioSegundos(0);
    }
    return () => {
      if (intervalo) clearInterval(intervalo);
    };
  }, [camaraActiva]);

  // Capturar interacción de lectura activa (Scroll, Teclas, Clics, Mouse) para descartar mirada perdida
  useEffect(() => {
    let ultimoTs = 0;
    let ultimoX = 0;
    let ultimoY = 0;

    const registrarInteraccion = () => {
      const ahora = Date.now();
      if (ahora - ultimoTs >= 500) {
        ultimoTs = ahora;
        if (onInteraccionLectura) onInteraccionLectura();
      }
    };

    const manejarMouseMove = (e: MouseEvent) => {
      const dist = Math.hypot(e.clientX - ultimoX, e.clientY - ultimoY);
      if (dist >= 40) { // Desplazamiento real del cursor (>40px), filtra vibraciones o reposo del mouse
        ultimoX = e.clientX;
        ultimoY = e.clientY;
        registrarInteraccion();
      }
    };

    window.addEventListener('scroll', registrarInteraccion, { passive: true });
    window.addEventListener('mousemove', manejarMouseMove, { passive: true });
    window.addEventListener('keydown', registrarInteraccion, { passive: true });
    window.addEventListener('click', registrarInteraccion, { passive: true });

    return () => {
      window.removeEventListener('scroll', registrarInteraccion);
      window.removeEventListener('mousemove', manejarMouseMove);
      window.removeEventListener('keydown', registrarInteraccion);
      window.removeEventListener('click', registrarInteraccion);
    };
  }, [onInteraccionLectura]);

  // Cargar lista de materiales disponibles del estudiante (Propios + Materiales Asignados por sus Docentes)
  const cargarMateriales = async () => {
    setCargandoLista(true);
    try {
      const resp = await apiCliente.get(`/materiales/estudiante-curso/${codigoEstudiante}`);
      if (resp.data) {
        const propios: MaterialEstudioItem[] = (resp.data.mis_documentos || []).map((m: any) => ({
          ...m,
          es_docente: false
        }));
        setMateriales(propios);

        const grupos: DocenteMaterialesGrupo[] = (resp.data.docentes || []).map((doc: any) => ({
          id_docente: doc.id_docente,
          nombre_docente: doc.nombre_docente,
          materiales: (doc.materiales || []).map((m: any) => ({
            ...m,
            es_docente: true,
            docente_nombre: doc.nombre_docente
          }))
        }));
        setDocentesGrupos(grupos);

        // Si no hay ninguno activo, seleccionar el primero disponible
        if (!materialActivo) {
          if (propios.length > 0) {
            setMaterialActivo(propios[0]);
            setSeccionMateriales('PROPIOS');
          } else if (grupos.length > 0 && grupos[0].materiales.length > 0) {
            setMaterialActivo(grupos[0].materiales[0]);
            setSeccionMateriales(grupos[0].id_docente);
          }
        }
      }
    } catch (err) {
      console.warn('[MODO ESTUDIO] Error cargando materiales por curso, usando fallback:', err);
      try {
        const resp2 = await apiCliente.get(`/materiales/estudiante/${codigoEstudiante}`);
        if (resp2.data && resp2.data.materiales) {
          setMateriales(resp2.data.materiales);
          if (!materialActivo && resp2.data.materiales.length > 0) {
            setMaterialActivo(resp2.data.materiales[0]);
          }
        }
      } catch (err2) {
        console.warn('[MODO ESTUDIO] Error en fallback de materiales:', err2);
      }
    } finally {
      setCargandoLista(false);
    }
  };

  useEffect(() => {
    if (codigoEstudiante) {
      cargarMateriales();
    }
  }, [codigoEstudiante]);

  // Subir y convertir archivo
  const manejarSubidaArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorSubida(null);
    setSubiendoArchivo(true);
    setMensajeEstado(`Procesando y adaptando "${file.name}" a formato de lectura PDF...`);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('codigo_estudiante', codigoEstudiante);

    try {
      const resp = await apiCliente.post('/materiales/subir', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (resp.data && resp.data.material) {
        const nuevoMat = resp.data.material;
        setMateriales((prev) => [nuevoMat, ...prev]);
        setMaterialActivo(nuevoMat);
        setMensajeEstado('✅ ¡Documento procesado con éxito!');
        setTimeout(() => setMensajeEstado(null), 3500);
      }
    } catch (err: any) {
      console.error('[SUBIDA ERROR]', err);
      const msg = err.response?.data?.detail || 'Ocurrió un error al procesar o convertir el documento.';
      setErrorSubida(msg);
    } finally {
      setSubiendoArchivo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Eliminar un archivo de la biblioteca
  const eliminarArchivo = async (nombrePdf: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Deseas eliminar el material "${nombrePdf}" de tu biblioteca de estudio?`)) return;

    try {
      await apiCliente.delete(`/materiales/${codigoEstudiante}/${nombrePdf}`);
      setMateriales((prev) => prev.filter((m) => m.nombre_pdf !== nombrePdf));
      if (materialActivo?.nombre_pdf === nombrePdf) {
        setMaterialActivo(null);
      }
    } catch (err) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Error al Eliminar',
        mensaje: 'No se pudo eliminar el material seleccionado de tu biblioteca de estudio.',
        textoBoton: 'Entendido'
      });
    }
  };

  // Formato mm:ss
  const formatearTiempo = (seg: number) => {
    const mins = Math.floor(seg / 60);
    const s = seg % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Alternar Pantalla Completa
  const togglePantallaCompleta = () => {
    if (!contenedorRef.current) return;
    if (!document.fullscreenElement) {
      contenedorRef.current.requestFullscreen().catch((err) => {
        console.warn('Error al activar pantalla completa:', err);
      });
      setModoPantallaCompleta(true);
    } else {
      document.exitFullscreen();
      setModoPantallaCompleta(false);
    }
  };

  // Obtener icono según el tipo de archivo original
  const getIconoTipo = (ext: string) => {
    switch (ext.toLowerCase()) {
      case 'docx':
        return <FileText className="w-4 h-4 text-sky-400" />;
      case 'pptx':
        return <FileCode className="w-4 h-4 text-amber-400" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
        return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      case 'pdf':
      default:
        return <BookOpen className="w-4 h-4 text-rose-400" />;
    }
  };

  return (
    <div
      ref={contenedorRef}
      className={`space-y-6 ${modoPantallaCompleta ? 'bg-slate-950 p-6 overflow-y-auto' : ''}`}
    >
      {/* Barra de Control de la Sesión de Estudio */}
      <div className="glass-panel p-5 rounded-3xl border border-slate-800 flex flex-col lg:flex-row items-center justify-between gap-4">
        
        {/* Información del Estado de Monitoreo */}
        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0 text-cyan-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold font-heading text-white">Modo Estudio Inmersivo</h2>
              {camaraActiva ? (
                <span className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  Monitoreo de Atención Activo (En Segundo Plano)
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-semibold">
                  Cámara en Espera
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Estudia tus temas escolares sin distracciones. La visión computacional analiza tu atención silenciosamente.
            </p>
          </div>
        </div>

        {/* Acciones y Temporizador */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-end flex-wrap">
          {camaraActiva && (
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono font-bold text-cyan-300">
              <Clock className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>Tiempo de Lectura: {formatearTiempo(tiempoEstudioSegundos)}</span>
            </div>
          )}

          {/* Toggle para mini-cámara PIP */}
          {camaraActiva && (
            <button
              onClick={() => setMostrarPipCamara(!mostrarPipCamara)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                mostrarPipCamara
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="Verificar que mi rostro está bien enfocado"
            >
              {mostrarPipCamara ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-cyan-400" />}
              <span>{mostrarPipCamara ? 'Ocultar Mi Cámara' : 'Verificar Mi Rostro'}</span>
            </button>
          )}

          {/* Botón Encender Cámara / Finalizar Sesión */}
          {!camaraActiva ? (
            <button
              onClick={onEncenderCamara}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" /> Iniciar Sesión de Estudio
            </button>
          ) : (
            <button
              onClick={onFinalizarSesion}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <CameraOff className="w-4 h-4" /> Finalizar y Guardar Sesión
            </button>
          )}

          {/* Botón Pantalla Completa */}
          <button
            onClick={togglePantallaCompleta}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer"
            title={modoPantallaCompleta ? 'Salir de pantalla completa' : 'Modo lectura pantalla completa'}
          >
            {modoPantallaCompleta ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

      </div>

      {/* Grid Principal: Selector / Biblioteca a la Izquierda y Visor al Centro */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Panel Izquierdo: Carga y Biblioteca de Documentos */}
        <div className="lg:col-span-1 space-y-4">
          
          {/* Zona de Carga de Documentos */}
          <div className="glass-panel p-5 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-400" /> Cargar Material Escolar
            </h3>
            
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Sube tu tarea, guía o diapositiva. El sistema lo convertirá a un PDF optimizado para lectura.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf, .docx, .pptx, .jpg, .jpeg, .png"
              onChange={manejarSubidaArchivo}
              className="hidden"
              id="input-subir-documento"
              disabled={subiendoArchivo}
            />

            <label
              htmlFor="input-subir-documento"
              className={`w-full flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition text-center ${
                subiendoArchivo
                  ? 'border-cyan-500 bg-cyan-500/10 cursor-wait'
                  : 'border-slate-700 hover:border-cyan-400 bg-slate-900/60 hover:bg-slate-900'
              }`}
            >
              {subiendoArchivo ? (
                <div className="space-y-2 flex flex-col items-center">
                  <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                  <span className="text-xs font-semibold text-cyan-300">Convirtiendo documento...</span>
                </div>
              ) : (
                <div className="space-y-2 flex flex-col items-center">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                    <Upload className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Seleccionar archivo</span>
                    <span className="text-[10px] text-slate-400">PDF, Word, PowerPoint o JPG</span>
                  </div>
                </div>
              )}
            </label>

            {/* Mensajes de Estado o Error */}
            {mensajeEstado && (
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-cyan-400" />
                <span>{mensajeEstado}</span>
              </div>
            )}

            {errorSubida && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorSubida}</span>
              </div>
            )}
          </div>

          {/* Biblioteca de Materiales del Estudiante y Docentes */}
          <div className="glass-panel p-5 rounded-3xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-emerald-400" /> Documentos de Estudio
              </h3>
              <button
                onClick={cargarMateriales}
                disabled={cargandoLista}
                className="text-[11px] text-slate-400 hover:text-cyan-400 transition cursor-pointer"
                title="Actualizar lista"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${cargandoLista ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Pestañas de Carpetas: Mis Documentos vs Docentes */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar border-b border-slate-800/80">
              <button
                type="button"
                onClick={() => setSeccionMateriales('PROPIOS')}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  seccionMateriales === 'PROPIOS'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mis Documentos ({materiales.length})</span>
              </button>

              {docentesGrupos.map((doc) => (
                <button
                  key={doc.id_docente}
                  type="button"
                  onClick={() => setSeccionMateriales(doc.id_docente)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    seccionMateriales === doc.id_docente
                      ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Prof. {doc.nombre_docente} ({doc.materiales.length})</span>
                </button>
              ))}
            </div>

            {/* Renderizado de Documentos según la Pestaña Seleccionada */}
            {seccionMateriales === 'PROPIOS' ? (
              materiales.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No tienes documentos personales cargados. Puedes subir un PDF, Word o diapositiva arriba.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {materiales.map((mat) => {
                    const activo = materialActivo?.nombre_pdf === mat.nombre_pdf;
                    return (
                      <div
                        key={mat.id || mat.nombre_pdf}
                        onClick={() => setMaterialActivo(mat)}
                        className={`p-3 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                          activo
                            ? 'bg-cyan-500/15 border-cyan-500/50 text-white shadow-md shadow-cyan-500/5'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="shrink-0">{getIconoTipo(mat.extension_original || 'pdf')}</div>
                          <div className="truncate text-left">
                            <p className="text-xs font-semibold truncate leading-tight">{mat.nombre_archivo}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {mat.tamano_kb} KB • {mat.fecha_subida}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => eliminarArchivo(mat.nombre_pdf, e)}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition shrink-0 cursor-pointer"
                          title="Eliminar este archivo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              // Vista de Materiales del Docente Seleccionado
              (() => {
                const grupoDoc = docentesGrupos.find((g) => g.id_docente === seccionMateriales);
                const matsDocente = grupoDoc?.materiales || [];
                if (matsDocente.length === 0) {
                  return (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      El Prof. {grupoDoc?.nombre_docente || 'Docente'} aún no ha subido tareas para tu curso.
                    </div>
                  );
                }
                return (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {matsDocente.map((mat) => {
                      const activo = materialActivo?.nombre_pdf === mat.nombre_pdf;
                      return (
                        <div
                          key={mat.id || mat.nombre_pdf}
                          onClick={() => setMaterialActivo(mat)}
                          className={`p-3 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                            activo
                              ? 'bg-indigo-600/20 border-indigo-500/50 text-white shadow-md shadow-indigo-600/10'
                              : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-900 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="shrink-0">
                              <BookOpen className="w-4 h-4 text-cyan-400" />
                            </div>
                            <div className="truncate text-left">
                              <p className="text-xs font-semibold truncate leading-tight">
                                {mat.titulo || mat.nombre_archivo}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                                  Tarea Docente
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {mat.tamano_kb} KB
                                </span>
                              </div>
                            </div>
                          </div>

                          {mat.descripcion_tarea && (
                            <span className="p-1 rounded bg-slate-800 text-indigo-400 shrink-0" title="Contiene instrucciones de tarea">
                              <FileText className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>

          {/* Consejo TDAH Adaptativo */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-cyan-500/10 border border-indigo-500/20 text-xs space-y-1.5">
            <span className="font-bold text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" /> Estrategia de Enfoque TDAH
            </span>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Lee a tu propio ritmo. Si notas que pierdes la concentración, haz una pausa de 20 segundos mirando un objeto lejano para descansar la vista.
            </p>
          </div>

        </div>

        {/* Panel Derecho (3 Columnas): El Visor de Documentos Inmersivo */}
        <div className="lg:col-span-3">
          <div className="glass-panel rounded-3xl border border-slate-800 overflow-hidden flex flex-col h-[750px]">
            
            {/* Header del Visor */}
            <div className="p-4 border-b border-slate-800/80 bg-slate-950/70 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-cyan-400 shrink-0" />
                <div className="truncate">
                  <h3 className="text-sm font-bold text-white truncate">
                    {materialActivo ? materialActivo.nombre_archivo : 'Sin documento seleccionado'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {materialActivo ? `Formato de lectura adaptativo: ${materialActivo.nombre_pdf}` : 'Selecciona o sube un documento a la izquierda'}
                  </p>
                </div>
              </div>

              {materialActivo && (
                <a
                  href={materialActivo.url_pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition text-xs font-semibold flex items-center gap-1.5 shrink-0"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-cyan-400" /> Abrir en Pestaña Externa
                </a>
              )}
            </div>

            {/* Banner Superior de Instrucciones / Descripción de la Tarea del Docente */}
            {materialActivo?.descripcion_tarea && (
              <div className="p-4 bg-gradient-to-r from-indigo-950/80 via-slate-900 to-indigo-950/60 border-b border-indigo-500/30 px-6 shrink-0 space-y-1.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span className="text-xs font-bold font-heading text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      Instrucciones de la Tarea {materialActivo.docente_nombre ? `— Prof. ${materialActivo.docente_nombre}` : ''}
                    </span>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                    Lectura Monitoreada
                  </span>
                </div>
                <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto pr-1 font-normal">
                  {materialActivo.descripcion_tarea}
                </p>
              </div>
            )}

            {/* Contenedor del PDF Embebido */}
            <div className="flex-1 bg-slate-900 relative">
              {materialActivo ? (
                <iframe
                  src={`${materialActivo.url_pdf}#toolbar=1&navpanes=0`}
                  title="Visor de Documentos de Estudio"
                  className="w-full h-full border-0 bg-slate-950"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-slate-800 flex items-center justify-center text-slate-400">
                    <BookOpen className="w-8 h-8 text-cyan-400" />
                  </div>
                  <div className="max-w-md space-y-1">
                    <h4 className="text-base font-bold text-white">Ningún documento en pantalla</h4>
                    <p className="text-xs text-slate-400">
                      Sube tu guía de estudio en PDF, Word (.docx), PowerPoint (.pptx) o una imagen de tu tarea para empezar la lectura.
                    </p>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>

      </div>

      {/* Mini-PIP Flotante Global (Aparece en la esquina inferior derecha de la pantalla) */}
      {mostrarPipCamara && (
        <div className="fixed bottom-6 right-6 z-50 w-64 rounded-3xl overflow-hidden shadow-2xl border-2 border-cyan-400 bg-slate-950/95 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="p-2.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between text-xs text-cyan-300 font-bold px-3">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Encuadre Rostro (En Vivo)
            </span>
            <button
              onClick={() => setMostrarPipCamara(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              title="Cerrar mini-cámara"
            >
              ✕
            </button>
          </div>
          <div className="w-full h-44 bg-black flex items-center justify-center overflow-hidden">
            {camaraActiva ? (
              childrenWebcamFeed || (
                <div className="text-xs text-slate-400 flex flex-col items-center gap-2 p-4">
                  <Eye className="w-6 h-6 text-cyan-400 animate-pulse" />
                  <span>Sincronizando encuadre...</span>
                </div>
              )
            ) : (
              <div className="text-xs text-slate-400 flex flex-col items-center gap-2 p-4 text-center">
                <CameraOff className="w-6 h-6 text-amber-400" />
                <span>La cámara aún está apagada. Pulsa "Iniciar Sesión de Estudio".</span>
              </div>
            )}
          </div>
          <div className="p-2 text-center bg-slate-900/80 text-[10px] text-slate-400">
            Mantén tu rostro centrado dentro del encuadre para un monitoreo óptimo.
          </div>
        </div>
      )}

      {/* Modal de Notificación */}
      <ModalNotificacion
        config={modalNotificacion}
        onCerrar={() => setModalNotificacion(prev => ({ ...prev, abierto: false }))}
      />

    </div>
  );
};

