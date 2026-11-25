import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Camera, CameraOff, Video, AlertTriangle, CheckCircle2, RefreshCw, Layers, Sparkles, Eye, UserCheck, Activity } from 'lucide-react';
import { procesarLandmarksMediaPipe, ResultadoBiometrico } from '../servicios_ws/calculo_biometrico';

export interface PrevisualizadorCamaraHandle {
  encenderCamara: () => Promise<void>;
  apagarCamara: () => void;
}

interface PrevisualizadorCamaraProps {
  onCamaraEstadoChange?: (activa: boolean) => void;
  onMetricasEnVivo?: (metricas: {
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
  }) => void;
  onFrameSnapshot?: (base64Frame: string) => void;
  segundosRestantes?: number;
  forzarEncendido?: boolean;
  timestampUltimaInteraccion?: number;
  modoProtegido?: boolean;
}

export const PrevisualizadorCamara = forwardRef<PrevisualizadorCamaraHandle, PrevisualizadorCamaraProps>(({
  onCamaraEstadoChange,
  onMetricasEnVivo,
  onFrameSnapshot,
  segundosRestantes = 7200,
  forzarEncendido = false,
  timestampUltimaInteraccion = 0,
  modoProtegido = true
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const canvasSimuladoRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ultimoSnapshotRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<any>(null);
  const enviandoFrameRef = useRef<boolean>(false);
  const handleMediaPipeResultsRef = useRef<(results: any) => void>(() => {});
  const animFrameIdRef = useRef<number | null>(null);

  // Referencia mutable reactiva para modoProtegido (Evita stale closures en MediaPipe y permite cambio instantáneo)
  const modoProtegidoRef = useRef<boolean>(modoProtegido);
  useEffect(() => {
    modoProtegidoRef.current = modoProtegido;
  }, [modoProtegido]);

  const [camaraActiva, setCamaraActiva] = useState<boolean>(false);
  const [cargandoPermiso, setCargandoPermiso] = useState<boolean>(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [dispositivosVideo, setDispositivosVideo] = useState<MediaDeviceInfo[]>([]);
  const [dispositivoSeleccionado, setDispositivoSeleccionado] = useState<string>('');
  const [resolucionActual, setResolucionActual] = useState<string>('720p (1280x720)');
  const [modoSimulado, setModoSimulado] = useState<boolean>(false);
  const [mostrarMallaFacial, setMostrarMallaFacial] = useState<boolean>(true);
  const [mallaCargada, setMallaCargada] = useState<boolean>(false);
  const [rostroDetectado, setRostroDetectado] = useState<boolean>(false);
  const [earActualVisual, setEarActualVisual] = useState<number>(0.28);
  const [marActualVisual, setMarActualVisual] = useState<number>(0.25);
  const [alertaVisualActiva, setAlertaVisualActiva] = useState<string | null>(null);

  const ojoCerradoPrevioRef = useRef<boolean>(false);
  const framesSinRostroRef = useRef<number>(0);
  const tiempoInicioBostezoRef = useRef<number>(0);
  const tiempoInicioInmovilRef = useRef<number>(performance.now());
  const poseAnclajeInmovilRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const ultimoParpadeoTsRef = useRef<number>(performance.now());
  const tiempoInicioOclusionRef = useRef<number>(0);
  const earVentanaRef = useRef<number[]>([]);
  const interaccionPreviaTsRef = useRef<number>(0);
  const narizYBaseRef = useRef<number>(0.5);
  const tiempoInicioSlumpingRef = useRef<number>(0);

  // Escuchar eventos de interacción de lectura (Scroll, Clicks, Teclas) para descartar mirada perdida
  useEffect(() => {
    if (timestampUltimaInteraccion && timestampUltimaInteraccion !== interaccionPreviaTsRef.current) {
      interaccionPreviaTsRef.current = timestampUltimaInteraccion;
      tiempoInicioInmovilRef.current = performance.now();
      ultimoParpadeoTsRef.current = performance.now();
    }
  }, [timestampUltimaInteraccion]);

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

  // 2. Inicializar Google MediaPipe Face Mesh con Reintentos Robustos (WASM CDN)
  useEffect(() => {
    let timerId: any = null;
    let intentos = 0;
    const maxIntentos = 40; // Reintentar durante ~12 segundos hasta que los scripts de jsdelivr terminen de cargar

    const initFaceMesh = () => {
      try {
        if ((window as any).FaceMesh) {
          const fm = new (window as any).FaceMesh({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
          });

          fm.setOptions({
            maxNumFaces: 3, // Detección de hasta 3 rostros simultáneos (Monitoreo de distractores en aula)
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
          });

          fm.onResults((res: any) => {
            setMallaCargada(true);
            if (handleMediaPipeResultsRef.current) {
              handleMediaPipeResultsRef.current(res);
            }
          });
          faceMeshRef.current = fm;
          console.log('[MEDIAPIPE] Google Face Mesh inicializado con éxito tras', intentos, 'intentos.');
          return true;
        } else {
          intentos++;
          if (intentos < maxIntentos) {
            timerId = setTimeout(initFaceMesh, 300);
          } else {
            console.warn('[MEDIAPIPE] FaceMesh CDN no disponible tras tiempo límite de espera.');
          }
        }
      } catch (err) {
        console.warn('[MEDIAPIPE INIT ERROR]:', err);
      }
      return false;
    };

    initFaceMesh();

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  // 3. Manejador de Resultados de MediaPipe en Tiempo Real
  const handleMediaPipeResults = useCallback((results: any) => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sincronizar dimensiones intrínsecas 1:1 con la resolución real de la webcam
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      if (canvas.width !== videoRef.current.videoWidth || canvas.height !== videoRef.current.videoHeight) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const numRostros = results.multiFaceLandmarks?.length || 0;
    const distractorExterno = numRostros > 1;

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      framesSinRostroRef.current = 0;
      setRostroDetectado(true);

      // Procesar matemáticas de visión artificial
      const metricas = procesarLandmarksMediaPipe(landmarks);
      setEarActualVisual(metricas.earPromedio);
      setMarActualVisual(metricas.mar);

      const ahora = performance.now();

      // Ventana móvil de EAR de los últimos ~30 fotogramas (calibración adaptativa en vivo)
      if (metricas.earPromedio > 0.12) {
        earVentanaRef.current.push(metricas.earPromedio);
        if (earVentanaRef.current.length > 30) {
          earVentanaRef.current.shift();
        }
      }
      const earMediaMovil = earVentanaRef.current.length > 5
        ? earVentanaRef.current.reduce((a, b) => a + b, 0) / earVentanaRef.current.length
        : 0.28;

      // Detección adaptativa de parpadeo y evaluación de Somnolencia / Párpados Cansados (PERCLOS)
      const umbralParpadeoAdaptativo = Math.max(0.18, earMediaMovil * 0.80);
      const esOjoCerradoInstante = metricas.earPromedio <= umbralParpadeoAdaptativo;

      let parpadeoOcurrido = false;
      let esSomnolenciaConfirmada = false;

      if (esOjoCerradoInstante) {
        if (!ojoCerradoPrevioRef.current) {
          parpadeoOcurrido = true;
          ojoCerradoPrevioRef.current = true;
          ultimoParpadeoTsRef.current = ahora;
          tiempoInicioInmovilRef.current = ahora;
          tiempoInicioOclusionRef.current = ahora;
        } else {
          // El ojo continúa cerrado o con párpados pesados/caídos (Somnolencia o Micro-sueño)
          const duracionOclusionSeg = (ahora - tiempoInicioOclusionRef.current) / 1000;
          if (duracionOclusionSeg >= 1.2) {
            esSomnolenciaConfirmada = true;
          }
        }
      } else {
        ojoCerradoPrevioRef.current = false;
        tiempoInicioOclusionRef.current = 0;
      }

      // Evaluación de Bostezo sostenido (MAR >= 0.65 por >= 1.8 segundos continuos)
      if (metricas.esBostezo) {
        if (tiempoInicioBostezoRef.current === 0) {
          tiempoInicioBostezoRef.current = ahora;
        }
      } else {
        tiempoInicioBostezoRef.current = 0;
      }
      const esBostezoConfirmado =
        tiempoInicioBostezoRef.current > 0 &&
        (ahora - tiempoInicioBostezoRef.current) / 1000 >= 1.8;

      // Evaluación de Staring / Mirada Perdida (Criterio Clínico TDAH):
      // 1. Zona ergonómica de pantalla (visión directa sobre el documento escolar):
      const enZonaLecturaPantalla =
        Math.abs(metricas.yaw) <= 22.0 &&
        metricas.pitch >= -25.0 &&
        metricas.pitch <= 15.0;

      // 2. Micro-desvíos cefálicos: Solo un giro real de cabeza (> 4.0°) resetea el anclaje
      //    (evita que el ruido natural de la webcam de 1-2° o respiración reseteen el timer)
      const desvioYawAnclaje = Math.abs(metricas.yaw - poseAnclajeInmovilRef.current.yaw);
      const desvioPitchAnclaje = Math.abs(metricas.pitch - poseAnclajeInmovilRef.current.pitch);

      if (desvioYawAnclaje > 4.0 || desvioPitchAnclaje > 4.0) {
        poseAnclajeInmovilRef.current = { yaw: metricas.yaw, pitch: metricas.pitch };
        tiempoInicioInmovilRef.current = ahora;
      }

      const tiempoInmovilSegundos = (ahora - tiempoInicioInmovilRef.current) / 1000;
      const tiempoSinParpadeoSegundos = (ahora - ultimoParpadeoTsRef.current) / 1000;

      // Criterio Clínico TDAH:
      // - Si está en zona de pantalla: 8.0 segundos continuos rígido y sin parpadear
      // - Si está mirando fuera de la pantalla (pared/techo): 5.0 segundos continuos
      const umbralStaringSegundos = enZonaLecturaPantalla ? 8.0 : 5.0;
      const esStaringConfirmado =
        tiempoInmovilSegundos >= umbralStaringSegundos &&
        tiempoSinParpadeoSegundos >= umbralStaringSegundos;

      // Calibración adaptativa y evaluación de Slumping (Hundimiento Postural por >= 3.0s)
      if (narizYBaseRef.current === 0.5 && metricas.narizY > 0.1) {
        narizYBaseRef.current = metricas.narizY;
      }
      if (metricas.narizY - narizYBaseRef.current > 0.15) {
        if (tiempoInicioSlumpingRef.current === 0) {
          tiempoInicioSlumpingRef.current = ahora;
        }
      } else {
        tiempoInicioSlumpingRef.current = 0;
      }
      const esSlumpingConfirmado =
        tiempoInicioSlumpingRef.current > 0 &&
        (ahora - tiempoInicioSlumpingRef.current) / 1000 >= 3.0;

      // Alerta visual contextual para previsualización
      if (esSomnolenciaConfirmada) setAlertaVisualActiva('Párpados Cansados / Somnolencia');
      else if (esBostezoConfirmado) setAlertaVisualActiva('Bostezo Detectado');
      else if (distractorExterno) setAlertaVisualActiva('Distractor Externo');
      else if (esStaringConfirmado) setAlertaVisualActiva('Mirada Perdida (Staring)');
      else if (esSlumpingConfirmado) setAlertaVisualActiva('Hundimiento Postural');
      else setAlertaVisualActiva(null);

      // Notificar al componente padre (PortalEstudiante)
      if (onMetricasEnVivo) {
        onMetricasEnVivo({
          ear: metricas.earPromedio,
          yaw: metricas.yaw,
          pitch: metricas.pitch,
          roll: metricas.roll,
          parpadeo: parpadeoOcurrido,
          rostroDetectado: true,
          ausenciaEstudiante: false,
          mar: metricas.mar,
          esBostezo: esBostezoConfirmado,
          distractorExterno: distractorExterno,
          numRostros: numRostros,
          esStaring: esStaringConfirmado,
          esSlumping: esSlumpingConfirmado,
          esSomnolencia: esSomnolenciaConfirmada
        });
      }

      // Dibujar Malla Facial, Vector 3D de Mirada y Cinturón Escapular en Canvas Overlay
      if (mostrarMallaFacial) {
        const w = canvas.width;
        const h = canvas.height;

        // Invertir horizontalmente para efecto espejo sincronizado con video scaleX(-1)
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);

        // 0. Malla 3D Canónica (Óvalo Facial y Cejas Anatómicas)
        const ovaloFacialIdx = [
          10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
          397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
          172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10
        ];
        ctx.strokeStyle = modoProtegidoRef.current ? 'rgba(56, 189, 248, 0.45)' : 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = modoProtegidoRef.current ? 2.0 : 1.2;
        ctx.beginPath();
        ovaloFacialIdx.forEach((idx, i) => {
          const pt = landmarks[idx];
          if (pt) {
            if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
            else ctx.lineTo(pt.x * w, pt.y * h);
          }
        });
        ctx.stroke();

        // Cejas anatómicas
        const cejaIzqIdx = [70, 63, 105, 66, 107];
        const cejaDerIdx = [336, 296, 334, 293, 300];
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        cejaIzqIdx.forEach((idx, i) => {
          const pt = landmarks[idx];
          if (pt) {
            if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
            else ctx.lineTo(pt.x * w, pt.y * h);
          }
        });
        ctx.stroke();

        ctx.beginPath();
        cejaDerIdx.forEach((idx, i) => {
          const pt = landmarks[idx];
          if (pt) {
            if (i === 0) ctx.moveTo(pt.x * w, pt.y * h);
            else ctx.lineTo(pt.x * w, pt.y * h);
          }
        });
        ctx.stroke();

        // 1. Contorno de Ojo Izquierdo
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

        // 2. Contorno de Ojo Derecho
        const ojoDerIdx = [362, 385, 387, 263, 373, 380];
        ctx.strokeStyle = metricas.earPromedio < 0.20 ? '#F43F5E' : '#06B6D4';
        ctx.lineWidth = 2.5;
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

        // Puntos de Iris / Pupilas
        const ptIrisIzq = landmarks[468] || landmarks[159] || landmarks[33];
        const ptIrisDer = landmarks[473] || landmarks[386] || landmarks[362];
        ctx.fillStyle = metricas.earPromedio < 0.20 ? '#F43F5E' : '#10B981';
        if (ptIrisIzq) {
          ctx.beginPath();
          ctx.arc(ptIrisIzq.x * w, ptIrisIzq.y * h, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if (ptIrisDer) {
          ctx.beginPath();
          ctx.arc(ptIrisDer.x * w, ptIrisDer.y * h, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3. Nariz y Vector Tridimensional de Orientación Cefálica (SolvePnP)
        const ptNariz = landmarks[1];
        if (ptNariz) {
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.arc(ptNariz.x * w, ptNariz.y * h, 4.5, 0, Math.PI * 2);
          ctx.fill();

          // Vector de mirada proyectado
          const largoGaze = 50;
          const radYaw = (metricas.yaw * Math.PI) / 180;
          const radPitch = (metricas.pitch * Math.PI) / 180;
          const gazeEndX = ptNariz.x * w - Math.sin(radYaw) * largoGaze;
          const gazeEndY = ptNariz.y * h - Math.sin(radPitch) * largoGaze;

          const enCono = Math.abs(metricas.yaw) <= 25 && Math.abs(metricas.pitch) <= 20;
          ctx.strokeStyle = enCono ? '#10B981' : '#F59E0B';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ptNariz.x * w, ptNariz.y * h);
          ctx.lineTo(gazeEndX, gazeEndY);
          ctx.stroke();

          ctx.fillStyle = enCono ? '#10B981' : '#F59E0B';
          ctx.beginPath();
          ctx.arc(gazeEndX, gazeEndY, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // 4. Cinturón Escapular y Hombros (Línea de Postura y Detección de Fidgeting)
        const ptMenton = landmarks[152];
        const ptFrente = landmarks[10];
        if (ptMenton && ptFrente) {
          const altoRostro = Math.sqrt(
            Math.pow((ptMenton.x - ptFrente.x) * w, 2) + 
            Math.pow((ptMenton.y - ptFrente.y) * h, 2)
          );

          // Proyección anatómica de la barra de hombros bajo el mentón
          const centroTorsoX = ptMenton.x * w;
          const hombrosBaseY = Math.min(h - 14, ptMenton.y * h + altoRostro * 0.45);
          const anchoHombros = altoRostro * 1.35;
          const inclinacionRad = (metricas.roll * Math.PI) / 180;

          const hIzqX = centroTorsoX - anchoHombros * Math.cos(inclinacionRad);
          const hIzqY = hombrosBaseY - anchoHombros * Math.sin(inclinacionRad) * 0.35;
          const hDerX = centroTorsoX + anchoHombros * Math.cos(inclinacionRad);
          const hDerY = hombrosBaseY + anchoHombros * Math.sin(inclinacionRad) * 0.35;

          const posturaEstable = Math.abs(metricas.roll) <= 12;
          const colorPostura = posturaEstable ? '#10B981' : '#F59E0B';

          // Eje cervical (cuello) punteado
          ctx.strokeStyle = colorPostura;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(ptMenton.x * w, ptMenton.y * h);
          ctx.lineTo(centroTorsoX, hombrosBaseY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Barra escapular continua (hombro a hombro)
          ctx.strokeStyle = colorPostura;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(hIzqX, hIzqY);
          ctx.lineTo(hDerX, hDerY);
          ctx.stroke();

          // Articulaciones acromioclaviculares (puntos de hombro)
          ctx.fillStyle = colorPostura;
          ctx.beginPath();
          ctx.arc(hIzqX, hIzqY, 6, 0, Math.PI * 2);
          ctx.arc(hDerX, hDerY, 6, 0, Math.PI * 2);
          ctx.fill();
        }

        // 5. Contorno de Boca (Apertura MAR y Bostezos)
        const ptBocaSup = landmarks[13];
        const ptBocaInf = landmarks[14];
        const ptBocaIzq = landmarks[78];
        const ptBocaDer = landmarks[308];
        if (ptBocaSup && ptBocaInf && ptBocaIzq && ptBocaDer) {
          ctx.strokeStyle = esBostezoConfirmado ? '#F43F5E' : (metricas.mar > 0.45 ? '#F59E0B' : '#06B6D4');
          ctx.lineWidth = esBostezoConfirmado ? 3.5 : 2;
          ctx.beginPath();
          ctx.moveTo(ptBocaIzq.x * w, ptBocaIzq.y * h);
          ctx.lineTo(ptBocaSup.x * w, ptBocaSup.y * h);
          ctx.lineTo(ptBocaDer.x * w, ptBocaDer.y * h);
          ctx.lineTo(ptBocaInf.x * w, ptBocaInf.y * h);
          ctx.closePath();
          ctx.stroke();
        }

        // 6. Resaltado de Distractores Externos (Múltiples rostros en aula)
        if (results.multiFaceLandmarks.length > 1) {
          for (let f = 1; f < results.multiFaceLandmarks.length; f++) {
            const secLandmarks = results.multiFaceLandmarks[f];
            const secNariz = secLandmarks[1];
            if (secNariz) {
              ctx.strokeStyle = '#F43F5E';
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(secNariz.x * w, secNariz.y * h, 38, 0, Math.PI * 2);
              ctx.stroke();
              ctx.fillStyle = '#F43F5E';
              ctx.font = 'bold 12px Inter, sans-serif';
              ctx.fillText('Distractor', secNariz.x * w - 28, secNariz.y * h - 44);
            }
          }
        }

        ctx.restore();
      }
    } else {
      framesSinRostroRef.current += 1;
      const esAusente = framesSinRostroRef.current >= 10;
      if (esAusente) {
        setRostroDetectado(false);
        setAlertaVisualActiva('Estudiante Fuera de Cámara');
        const w = canvas.width;
        const h = canvas.height;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.fillRect(16, 16, w - 32, 42);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ ESTUDIANTE FUERA DE ENCUADRE / AUSENTE', w / 2, 42);
      }
      if (onMetricasEnVivo) {
        onMetricasEnVivo({
          ear: 0.0,
          yaw: 0.0,
          pitch: 0.0,
          roll: 0.0,
          parpadeo: false,
          rostroDetectado: !esAusente,
          ausenciaEstudiante: esAusente,
          mar: 0.0,
          esBostezo: false,
          distractorExterno: false,
          numRostros: 0,
          esStaring: false,
          esSlumping: false,
          esSomnolencia: false
        });
      }
    }
  }, [mostrarMallaFacial, onMetricasEnVivo]);

  handleMediaPipeResultsRef.current = handleMediaPipeResults;

  // 4. Bucle de Procesamiento continuo y Transmisión de Streaming en Vivo
  useEffect(() => {
    let activo = true;

    const procesarFrame = async () => {
      if (!activo) return;

      if (camaraActiva && !modoSimulado && videoRef.current && videoRef.current.readyState >= 2) {
        const ahora = performance.now();

        // 1. TRANSMISIÓN GARANTIZADA DE FOTOGRAMAS AL MONITOR CADA 160ms (~6 FPS):
        // Se ejecuta SIEMPRE que la webcam física esté encendida, garantizando que el psicólogo
        // vea al estudiante sin importar si MediaPipe está compilando, procesando o con lag.
        if (onFrameSnapshot && ahora - ultimoSnapshotRef.current >= 160) {
          ultimoSnapshotRef.current = ahora;
          try {
            if (!offscreenCanvasRef.current) {
              offscreenCanvasRef.current = document.createElement('canvas');
            }
            const snap = offscreenCanvasRef.current;
            const vw = videoRef.current.videoWidth || 640;
            const vh = videoRef.current.videoHeight || 480;
            // Transmisión optimizada a 480p adaptativo para eliminar desfase y latencia (< 150ms)
            const targetW = Math.min(480, vw);
            const targetH = Math.round((vh / vw) * targetW) || 360;

            if (snap.width !== targetW || snap.height !== targetH) {
              snap.width = targetW;
              snap.height = targetH;
            }
            const sCtx = snap.getContext('2d');
            if (sCtx) {
              sCtx.imageSmoothingEnabled = true;
              sCtx.imageSmoothingQuality = 'high';

              if (modoProtegidoRef.current) {
                // Modo protegido / anonimizado
                sCtx.fillStyle = '#0B1120';
                sCtx.fillRect(0, 0, targetW, targetH);
                if (canvasOverlayRef.current) {
                  sCtx.drawImage(canvasOverlayRef.current, 0, 0, targetW, targetH);
                }
                sCtx.fillStyle = 'rgba(15, 23, 42, 0.75)';
                sCtx.fillRect(12, 12, targetW - 24, 28);
                sCtx.fillStyle = '#38BDF8';
                sCtx.font = 'bold 11px Inter, sans-serif';
                sCtx.textAlign = 'center';
                sCtx.fillText('🛡️ MALLA FACIAL 3D ANONIMIZADA (PRIVACY BY DESIGN)', targetW / 2, 30);
              } else {
                // Video real de la cámara web (modo auditado)
                sCtx.save();
                sCtx.translate(targetW, 0);
                sCtx.scale(-1, 1);
                sCtx.drawImage(videoRef.current, 0, 0, targetW, targetH);
                sCtx.restore();

                // Si MediaPipe ya dibujó la malla facial en canvasOverlay, superponerla en caliente
                if (canvasOverlayRef.current) {
                  sCtx.drawImage(canvasOverlayRef.current, 0, 0, targetW, targetH);
                }
              }

              // Compresión ultraligera al 60% (~16 KB por frame) para transmisión fluida sin congestión TCP
              const base64 = snap.toDataURL('image/jpeg', 0.60);
              onFrameSnapshot(base64);
            }
          } catch (e) {
            console.warn('[FRAME SNAPSHOT ERROR]:', e);
          }
        }

        // 2. ENVIAR FOTOGRAMA A MEDIAPIPE (Con semáforo para no saturar WebAssembly ni WebGL):
        if (faceMeshRef.current && !enviandoFrameRef.current) {
          enviandoFrameRef.current = true;
          try {
            await faceMeshRef.current.send({ image: videoRef.current });
          } catch (e) {
            console.warn('[MEDIAPIPE FRAME ERROR]:', e);
          } finally {
            enviandoFrameRef.current = false;
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
  }, [camaraActiva, modoSimulado, onFrameSnapshot]);

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

  // Encendido automático si se solicita externamente (p. ej., desde Modo Estudio)
  useEffect(() => {
    if (forzarEncendido && !camaraActiva && !cargandoPermiso) {
      encenderCamara();
    }
  }, [forzarEncendido]);

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

        if (onFrameSnapshot && performance.now() - ultimoSnapshotRef.current >= 160) {
          ultimoSnapshotRef.current = performance.now();
          try {
            const base64 = canvasSimuladoRef.current?.toDataURL('image/jpeg', 0.82);
            if (base64) onFrameSnapshot(base64);
          } catch (e) {}
        }

        animId = requestAnimationFrame(render);
      };
      render();
    }
    return () => cancelAnimationFrame(animId);
  }, [modoSimulado, onFrameSnapshot]);

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
    if (onFrameSnapshot) onFrameSnapshot('');
  };

  // Exponer métodos para control directo desde otros componentes (p. ej. Modo Estudio)
  useImperativeHandle(ref, () => ({
    encenderCamara: async () => {
      await encenderCamara();
    },
    apagarCamara: () => {
      apagarCamara();
    }
  }));

  return (
    <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-6">
      
      {/* Header y Selector de Cámara */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-heading text-white flex items-center gap-2">
            <Video className="w-5 h-5 text-emerald-400" /> Previsualización de Cámara HD (720p)
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

      {/* Barra de Estado Exterior Fija (Sin saltos de línea ni parpadeo) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs items-center">
        {/* Columna Izquierda: Badges de Estado */}
        <div className="flex flex-wrap items-center gap-2">
          {camaraActiva ? (
            <>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold whitespace-nowrap">
                <CheckCircle2 className="w-4 h-4 animate-pulse" /> {modoSimulado ? '🟢 Cámara Simulada Demo' : 'Cámara Web Conectada'} ({resolucionActual})
              </span>
              {!modoSimulado && (
                <>
                  <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold whitespace-nowrap transition-colors duration-200 ${
                    mallaCargada
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                  }`}>
                    <Activity className="w-3.5 h-3.5" />
                    {mallaCargada ? 'Malla 3D IA' : 'Cargando IA Facial...'}
                  </span>
                  <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold whitespace-nowrap transition-colors duration-200 ${
                    rostroDetectado
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}>
                    <UserCheck className="w-3.5 h-3.5" />
                    {rostroDetectado ? `Rostro (EAR: ${earActualVisual.toFixed(3)} | MAR: ${marActualVisual.toFixed(2)})` : 'Buscando Rostro...'}
                  </span>
                  {alertaVisualActiva && (
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold animate-pulse whitespace-nowrap">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      {alertaVisualActiva}
                    </span>
                  )}
                </>
              )}
            </>
          ) : errorCamara ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold max-w-full">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {errorCamara}
            </span>
          ) : cargandoPermiso ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold">
              <RefreshCw className="w-4 h-4 animate-spin" /> Intentando Conectar Cámara...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
              <CameraOff className="w-4 h-4" /> Cámara Apagada (OFF-LINE)
            </span>
          )}
        </div>

        {/* Columna Derecha: Botón Toggle Malla Facial siempre alineado a la derecha */}
        <div className="flex justify-start md:justify-end">
          {camaraActiva && !modoSimulado && (
            <button
              onClick={() => setMostrarMallaFacial(!mostrarMallaFacial)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold border transition flex items-center gap-1.5 whitespace-nowrap ${
                mostrarMallaFacial
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              {mostrarMallaFacial ? 'Biomarcadores y Postura Activos' : 'Biomarcadores Ocultos'}
            </button>
          )}
        </div>
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
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            camaraActiva && !modoSimulado
              ? modoProtegido
                ? 'opacity-0 pointer-events-none'
                : 'block opacity-100 z-10'
              : 'hidden opacity-0'
          }`}
        />

        {/* Canvas Overlay 1:1 sincronizado pixel a pixel con el video */}
        <canvas
          ref={canvasOverlayRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none z-20 ${camaraActiva && !modoSimulado ? 'block' : 'hidden'}`}
        />

        {/* Canvas para el modo simulado demo */}
        <canvas
          ref={canvasSimuladoRef}
          width={640}
          height={360}
          className={`w-full h-full object-cover ${modoSimulado ? 'block z-10' : 'hidden'}`}
        />

        {/* Indicador reactivo de Privacidad activo en vivo */}
        {camaraActiva && (
          <div className="absolute top-3 left-3 z-30 px-3 py-1.5 rounded-xl backdrop-blur-md border text-[10px] font-bold flex items-center gap-2 shadow-xl bg-slate-950/85">
            {modoProtegido ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-emerald-300">🛡️ Privacidad: Malla 3D Anonimizada</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span className="text-amber-300">📷 Privacidad: Rostro Real Auditado</span>
              </>
            )}
          </div>
        )}

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
});

PrevisualizadorCamara.displayName = 'PrevisualizadorCamara';

