import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CameraOff, Video, AlertTriangle, CheckCircle2, RefreshCw, Layers, Sparkles, Eye, UserCheck } from 'lucide-react';
import { procesarLandmarksMediaPipe, ResultadoBiometrico } from '../servicios_ws/calculo_biometrico';

interface PrevisualizadorCamaraProps {
  onCamaraEstadoChange?: (activa: boolean) => void;
  onMetricasEnVivo?: (metricas: {
    ear: number;
    yaw: number;
    pitch: number;
    roll: number;
    parpadeo: boolean;
    rostroDetectado: boolean;
  }) => void;
  segundosRestantes?: number;
}

export const PrevisualizadorCamara: React.FC<PrevisualizadorCamaraProps> = ({
  onCamaraEstadoChange,
  onMetricasEnVivo,
  segundosRestantes = 7200
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const canvasSimuladoRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<any>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const [camaraActiva, setCamaraActiva] = useState<boolean>(false);
  const [cargandoPermiso, setCargandoPermiso] = useState<boolean>(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [dispositivosVideo, setDispositivosVideo] = useState<MediaDeviceInfo[]>([]);
  const [dispositivoSeleccionado, setDispositivoSeleccionado] = useState<string>('');
  const [resolucionActual, setResolucionActual] = useState<string>('720p (1280x720)');
  const [modoSimulado, setModoSimulado] = useState<boolean>(false);
  const [mostrarMallaFacial, setMostrarMallaFacial] = useState<boolean>(true);
  const [rostroDetectado, setRostroDetectado] = useState<boolean>(false);
  const [earActualVisual, setEarActualVisual] = useState<number>(0.28);

  const ojoCerradoPrevioRef = useRef<boolean>(false);

  // 1. Enumerar dispositivos de video disponibles
  const obtenerDispositivos = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput' && device.deviceId !== '');
      setDispositivosVideo(videoDevices);
      if (videoDevices.length > 0 && !dispositivoSeleccionado) {
        setDispositivoSeleccionado(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.warn('Error enumerando dispositivos de video:', err);
    }
  };

  useEffect(() => {
    obtenerDispositivos();
  }, []);

  // 2. Inicializar Google MediaPipe Face Mesh
  useEffect(() => {
    const initFaceMesh = () => {
      try {
        if ((window as any).FaceMesh) {
          const fm = new (window as any).FaceMesh({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
          });

          fm.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });

          fm.onResults(handleMediaPipeResults);
          faceMeshRef.current = fm;
          console.log('[MEDIAPIPE] Google Face Mesh inicializado con éxito.');
        } else {
          console.warn('[MEDIAPIPE] FaceMesh CDN aún no disponible en window.');
        }
      } catch (err) {
        console.warn('[MEDIAPIPE INIT ERROR]:', err);
      }
    };

    initFaceMesh();
  }, []);

  // 3. Manejador de Resultados de MediaPipe en Tiempo Real
  const handleMediaPipeResults = useCallback((results: any) => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      setRostroDetectado(true);

      // Procesar matemáticas de visión artificial
      const metricas = procesarLandmarksMediaPipe(landmarks);
      setEarActualVisual(metricas.earPromedio);

      // Detección de flanco de parpadeo
      let parpadeoOcurrido = false;
      if (metricas.earPromedio < 0.20 && !ojoCerradoPrevioRef.current) {
        parpadeoOcurrido = true;
        ojoCerradoPrevioRef.current = true;
      } else if (metricas.earPromedio >= 0.20) {
        ojoCerradoPrevioRef.current = false;
      }

      // Notificar al componente padre (PortalEstudiante)
      if (onMetricasEnVivo) {
        onMetricasEnVivo({
          ear: metricas.earPromedio,
          yaw: metricas.yaw,
          pitch: metricas.pitch,
          roll: metricas.roll,
          parpadeo: parpadeoOcurrido,
          rostroDetectado: true
        });
      }

      // Dibujar Malla Facial en Canvas Overlay (si está activo)
      if (mostrarMallaFacial) {
        const w = canvas.width;
        const h = canvas.height;

        // Invertir horizontalmente para efecto espejo
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);

        // Dibujar contorno de ojos (Ojo Izquierdo: 33, 160, 158, 133, 153, 144)
        const ojoIzqIdx = [33, 160, 158, 133, 153, 144];
        ctx.strokeStyle = metricas.earPromedio < 0.20 ? '#F43F5E' : '#06B6D4';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ojoIzqIdx.forEach((idx, i) => {
          const pt = landmarks[idx];
          if (pt) {
            if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
            else ctx.lineTo(pt.x * w, pt.y * h);
          }
        });
        ctx.closePath();
        ctx.stroke();

        // Dibujar contorno de ojos (Ojo Derecho: 362, 385, 387, 263, 373, 380)
        const ojoDerIdx = [362, 385, 387, 263, 373, 380];
        ctx.beginPath();
        ojoDerIdx.forEach((idx, i) => {
          const pt = landmarks[idx];
          if (pt) {
            if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
            else ctx.lineTo(pt.x * w, pt.y * h);
          }
        });
        ctx.closePath();
        ctx.stroke();

        // Dibujar puntos faciales clave (Nariz: 1, Barbilla: 152)
        const ptNariz = landmarks[1];
        if (ptNariz) {
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.arc(ptNariz.x * w, ptNariz.y * h, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    } else {
      setRostroDetectado(false);
      if (onMetricasEnVivo) {
        onMetricasEnVivo({
          ear: 0.28,
          yaw: 0.0,
          pitch: 0.0,
          roll: 0.0,
          parpadeo: false,
          rostroDetectado: false
        });
      }
    }
  }, [mostrarMallaFacial, onMetricasEnVivo]);

  // 4. Bucle de Procesamiento continuo de fotogramas
  useEffect(() => {
    let activo = true;

    const procesarFrame = async () => {
      if (!activo) return;

      if (camaraActiva && !modoSimulado && videoRef.current && faceMeshRef.current) {
        if (videoRef.current.readyState >= 2) {
          try {
            await faceMeshRef.current.send({ image: videoRef.current });
          } catch (e) {
            // Manejo de excepciones de fotograma
          }
        }
      }

      if (camaraActiva && !modoSimulado) {
        animFrameIdRef.current = requestAnimationFrame(procesarFrame);
      }
    };

    if (camaraActiva && !modoSimulado) {
      animFrameIdRef.current = requestAnimationFrame(procesarFrame);
    }

    return () => {
      activo = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [camaraActiva, modoSimulado]);

  // Vinculación reactiva del stream al elemento HTML5 <video>
  useEffect(() => {
    if (camaraActiva && !modoSimulado && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(err => {
        console.warn('Auto-play prevenido o interrumpido:', err);
      });
    }
  }, [camaraActiva, modoSimulado]);

  // 5. Encender Cámara HTML5 con Estrategia de Fallback en Cascada
  const encenderCamara = async () => {
    setCargandoPermiso(true);
    setErrorCamara(null);
    setModoSimulado(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    let stream: MediaStream | null = null;
    let ultimoError: any = null;

    try {
      const constraints1: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(dispositivoSeleccionado ? { deviceId: { ideal: dispositivoSeleccionado } } : {})
        }
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints1);
    } catch (err1) {
      console.warn('Estrategia 1 (720p Ideal) falló, intentando Estrategia 2:', err1);
      ultimoError = err1;
    }

    if (!stream && dispositivoSeleccionado) {
      try {
        const constraints2: MediaStreamConstraints = {
          video: { deviceId: { ideal: dispositivoSeleccionado } }
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints2);
      } catch (err2) {
        console.warn('Estrategia 2 (Device Ideal) falló, intentando Estrategia 3:', err2);
        ultimoError = err2;
      }
    }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (err3) {
        console.error('Estrategia 3 (Básica) falló:', err3);
        ultimoError = err3;
      }
    }

    if (stream) {
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const width = settings.width || 1280;
      const height = settings.height || 720;
      const fps = settings.frameRate ? Math.round(settings.frameRate) : 30;
      setResolucionActual(`${width}x${height} @ ${fps} FPS`);

      track.onended = () => {
        setCamaraActiva(false);
        setErrorCamara('⚠️ Alerta: La cámara web se ha desconectado físicamente del equipo.');
        if (onCamaraEstadoChange) onCamaraEstadoChange(false);
      };

      setCamaraActiva(true);
      setCargandoPermiso(false);
      if (onCamaraEstadoChange) onCamaraEstadoChange(true);
      obtenerDispositivos();
    } else {
      setCargandoPermiso(false);
      setCamaraActiva(false);
      if (onCamaraEstadoChange) onCamaraEstadoChange(false);

      if (ultimoError?.name === 'NotAllowedError' || ultimoError?.name === 'PermissionDeniedError') {
        setErrorCamara('Permiso denegado: Por favor haz clic en el icono 📹 en la barra de direcciones de tu navegador para permitir el acceso.');
      } else if (ultimoError?.name === 'NotFoundError' || ultimoError?.name === 'DevicesNotFoundError') {
        setErrorCamara('No se detectó cámara física. Puedes probar con el botón "Usar Cámara Simulada Demo".');
      } else if (ultimoError?.message?.includes('Timeout starting video source') || ultimoError?.name === 'NotReadableError') {
        setErrorCamara('La cámara está ocupada por otra app (Zoom, Teams o Cámara de Windows) o la resolución no es compatible. Cierra otras apps o usa la Cámara Simulada.');
      } else {
        setErrorCamara(`No se pudo acceder a la cámara: ${ultimoError?.message || 'Error de hardware/controlador'}`);
      }
    }
  };

  // 6. Modo Cámara Simulada Demo
  const activarCamaraSimulada = () => {
    apagarCamara();
    setModoSimulado(true);
    setCamaraActiva(true);
    setResolucionActual('720p (Simulador Demo 60 FPS)');
    setErrorCamara(null);
    if (onCamaraEstadoChange) onCamaraEstadoChange(true);
  };

  useEffect(() => {
    let animId: number;
    if (modoSimulado && canvasSimuladoRef.current) {
      const ctx = canvasSimuladoRef.current.getContext('2d');
      let angle = 0;
      const render = () => {
        if (!ctx) return;
        angle += 0.05;
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, 640, 360);

        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(320, 180 + Math.sin(angle) * 5, 80, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#06B6D4';
        ctx.beginPath();
        ctx.arc(290, 160 + Math.sin(angle) * 5, 8, 0, Math.PI * 2);
        ctx.arc(350, 160 + Math.sin(angle) * 5, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#8B5CF6';
        ctx.font = '12px Inter';
        ctx.fillText('MediaPipe Holistic Landmark Mesh Active (60 FPS)', 180, 330);

        animId = requestAnimationFrame(render);
      };
      render();
    }
    return () => cancelAnimationFrame(animId);
  }, [modoSimulado]);

  // 7. Apagar Cámara
  const apagarCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasOverlayRef.current) {
      const ctx = canvasOverlayRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasOverlayRef.current.width, canvasOverlayRef.current.height);
    }
    setModoSimulado(false);
    setCamaraActiva(false);
    setRostroDetectado(false);
    if (onCamaraEstadoChange) onCamaraEstadoChange(false);
  };

  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-6">
      
      {/* Header y Selector de Cámara */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-heading text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-emerald-400" /> Previsualización de Cámara 720p (HU-01)
          </h2>
          <p className="text-xs text-slate-400 mt-1">Valida el encuadre y el acceso a la webcam antes de iniciar la clase</p>
        </div>

        {/* Selector de Dispositivo */}
        {dispositivosVideo.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
            <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
            <select
              value={dispositivoSeleccionado}
              onChange={(e) => setDispositivoSeleccionado(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 outline-none cursor-pointer max-w-[200px] truncate"
            >
              {dispositivosVideo.map((dev, idx) => (
                <option key={dev.deviceId || idx} value={dev.deviceId} className="bg-slate-900 text-white">
                  {dev.label || `Cámara ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Badges de Estado Visual */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {camaraActiva ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
              <CheckCircle2 className="w-4 h-4 animate-pulse" /> {modoSimulado ? '🟢 Cámara Simulada Demo' : 'Cámara Web Conectada'} ({resolucionActual})
            </span>
            {!modoSimulado && (
              <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold ${
                rostroDetectado
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                <UserCheck className="w-3.5 h-3.5" /> {rostroDetectado ? `Rostro Detectado (EAR: ${earActualVisual})` : 'Buscando Rostro...'}
              </span>
            )}
          </div>
        ) : errorCamara ? (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold max-w-full">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {errorCamara}
          </span>
        ) : cargandoPermiso ? (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold">
            <RefreshCw className="w-4 h-4 animate-spin" /> Intentando Conectar Cámara... (Probando resolución)
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
            <CameraOff className="w-4 h-4" /> Cámara Apagada (OFF-LINE)
          </span>
        )}

        {/* Toggle Malla Facial */}
        {camaraActiva && !modoSimulado && (
          <button
            onClick={() => setMostrarMallaFacial(!mostrarMallaFacial)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition flex items-center gap-1.5 ${
              mostrarMallaFacial
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            {mostrarMallaFacial ? 'Malla Facial Ojos Activa' : 'Malla Facial Oculta'}
          </button>
        )}
      </div>

      {/* Recuadro de Previsualización HTML5 <video> / <canvas> */}
      <div className="relative w-full aspect-video bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center shadow-2xl">
        
        {/* Elemento Video para la Webcam */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ transform: 'scaleX(-1)' }}
          className={`w-full h-full object-cover transition-opacity duration-300 ${camaraActiva && !modoSimulado ? 'block opacity-100 z-10' : 'hidden opacity-0'}`}
        />

        {/* Canvas Overlay para superponer los landmarks MediaPipe en vivo */}
        <canvas
          ref={canvasOverlayRef}
          width={640}
          height={360}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none z-20 ${camaraActiva && !modoSimulado ? 'block' : 'hidden'}`}
        />

        {/* Canvas para el modo simulado demo */}
        <canvas
          ref={canvasSimuladoRef}
          width={640}
          height={360}
          className={`w-full h-full object-cover ${modoSimulado ? 'block z-10' : 'hidden'}`}
        />

        {!camaraActiva && (
          <div className="text-center space-y-3 p-6 z-0">
            <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
              <Camera className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-300">Previsualización Desactivada</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">Haz clic en el botón para encender tu webcam o probar la cámara simulada.</p>
          </div>
        )}
      </div>

      {/* Botones de Acción */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          onClick={camaraActiva ? apagarCamara : encenderCamara}
          disabled={cargandoPermiso}
          className={`px-6 py-3 font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2 ${
            camaraActiva
              ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
          }`}
        >
          {camaraActiva ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          {camaraActiva ? 'Apagar Cámara' : 'Encender Cámara Web Real (720p)'}
        </button>

        {!camaraActiva && (
          <button
            onClick={activarCamaraSimulada}
            className="px-5 py-3 bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 border border-violet-500/30 font-bold text-xs rounded-xl transition flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-violet-400" /> Usar Cámara Simulada Demo
          </button>
        )}
      </div>

    </div>
  );
};

