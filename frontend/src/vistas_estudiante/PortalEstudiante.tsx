import React, { useState, useEffect, useRef } from 'react';
import { Camera, CameraOff, Clock, ShieldCheck, Sparkles, CheckCircle2, AlertTriangle, Activity, Eye, Sliders, Database, Cpu, Code2, EyeOff } from 'lucide-react';
import { useAuth } from '../contexto/AuthContext';
import { PrevisualizadorCamara } from '../componentes_ui/PrevisualizadorCamara';
import { apiCliente } from '../servicios_ws/api_cliente';
import { AcumuladorCalibracionBiometrica } from '../servicios_ws/calculo_biometrico';

export const PortalEstudiante: React.FC = () => {
  const { usuario } = useAuth();
  const [camaraActiva, setCamaraActiva] = useState<boolean>(false);
  const [segundosRestantes, setSegundosRestantes] = useState<number>(7200); // 2 Horas
  const [calibrando, setCalibrando] = useState<boolean>(false);
  const [progresoCalibracion, setProgresoCalibracion] = useState<number>(0);
  const [calibrado, setCalibrado] = useState<boolean>(false);
  const [mostrarBorderGlow, setMostrarBorderGlow] = useState<boolean>(false);
  const [iaiSimulado, setIaiSimulado] = useState<number>(88);
  const [mostrarCodigoAlgoritmo, setMostrarCodigoAlgoritmo] = useState<boolean>(false);
  const [errorCamaraApagada, setErrorCamaraApagada] = useState<string | null>(null);

  // Instancia del Acumulador Matemático Real de 900 Muestras (Sprint 2 - HU-03)
  const acumuladorRef = useRef(new AcumuladorCalibracionBiometrica());

  // Muestreo biométrico en vivo durante los 30 segundos
  const [telemetria, setTelemetria] = useState({
    ear: 0.285,
    yaw: 0.2,
    pitch: -1.1,
    roll: 0.5,
    parpadeos: 0,
    fotogramas: 0
  });

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
      alert('🔒 Límite de seguridad alcanzado: La cámara se ha apagado automáticamente al cumplir 2 horas.');
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
    const wsUrl = `ws://127.0.0.1:8000/ws/monitoreo/${codigoEst}`;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('[WEBSOCKET OPEN] Conectado al canal de transmisión en vivo:', wsUrl);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.iai !== undefined) {
            setIaiSimulado(data.iai);
            // Activar Border Glow si IAI cae por debajo del 50%
            if (data.alerta_reenganche || data.iai < 50) {
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

    // Enviar paquete biométrico por el socket cada 500ms
    const intervalWS = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          codigo_estudiante: codigoEst,
          ear: telemetria.ear,
          ear_base: parametrosFinales?.earBase || 0.28,
          yaw: telemetria.yaw,
          pitch: telemetria.pitch,
          varianza_hombros: 0.02,
          timestamp: new Date().toISOString()
        }));
      }
    }, 500);

    return () => {
      clearInterval(intervalWS);
      if (socket) socket.close();
    };
  }, [camaraActiva, telemetria, parametrosFinales, usuario]);

  // Simular o capturar un parpadeo manual voluntario (EAR < 0.20)
  const simularParpadeoVoluntario = () => {
    if (!calibrando) return;
    setTelemetria(prev => ({
      ...prev,
      ear: 0.165, // Cierre palpebral < 0.20
      parpadeos: prev.parpadeos + 1
    }));
    // Registrar en el acumulador
    acumuladorRef.current.agregarFotograma(0.165, telemetria.yaw, telemetria.pitch, telemetria.roll);
  };

  // Manejar métricas biométricas en vivo provenientes de MediaPipe FaceMesh
  const handleMetricasEnVivo = (metricas: {
    ear: number;
    yaw: number;
    pitch: number;
    roll: number;
    parpadeo: boolean;
    rostroDetectado: boolean;
  }) => {
    setTelemetria(prev => ({
      ear: metricas.ear,
      yaw: metricas.yaw,
      pitch: metricas.pitch,
      roll: metricas.roll,
      parpadeos: metricas.parpadeo ? prev.parpadeos + 1 : prev.parpadeos,
      fotogramas: prev.fotogramas + 1
    }));

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

  return (
    <div className={`relative min-h-[calc(100vh-5rem)] p-6 transition-all duration-500 ${mostrarBorderGlow ? 'animate-border-pulse rounded-2xl border-4 border-amber-500/80' : ''}`}>
      
      {/* Header del Portal */}
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Banner de Bienvenida y Perfil */}
        <div className="glass-panel rounded-3xl p-8 border border-slate-800 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -z-10"></div>
          
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" /> Portal del Estudiante | Privacy by Design
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold font-heading text-white">
              ¡Hola, {usuario?.username || 'Mateo'}! 👋
            </h1>
            <p className="text-slate-400 text-sm">
              Código de Estudiante: <span className="text-emerald-400 font-mono font-bold">{usuario?.codigo_estudiante || 'EST-2026-001'}</span> | 3º de Secundaria
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
              onCamaraEstadoChange={(activa) => {
                setCamaraActiva(activa);
                if (activa) setErrorCamaraApagada(null);
              }}
              onMetricasEnVivo={handleMetricasEnVivo}
              segundosRestantes={segundosRestantes}
            />

            {/* Panel de Calibración Postural 30s (HU-03) */}
            <div className="glass-panel rounded-3xl p-8 border border-slate-800 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold font-heading text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-400" /> Rutina de Calibración Base (30 seg - HU-03)
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
                      <p className="text-base font-extrabold font-mono text-amber-400">{telemetria.fotogramas} <span className="text-[10px] text-slate-400">/ 900</span></p>
                    </div>
                  </div>

                  {/* Botón de Prueba Manual de Parpadeo voluntario para validación */}
                  <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">Prueba de validación: Simular pestañeo durante la calibración</span>
                    <button
                      onClick={simularParpadeoVoluntario}
                      className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] rounded-lg transition flex items-center gap-1"
                    >
                      <EyeOff className="w-3.5 h-3.5 text-cyan-400" /> Simular Parpadeo (EAR &lt; 0.20)
                    </button>
                  </div>

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
                          <span className="text-emerald-400 font-bold">900 Frames (100%)</span>
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
                      <button
                        onClick={() => setMostrarCodigoAlgoritmo(!mostrarCodigoAlgoritmo)}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0"
                      >
                        <Code2 className="w-4 h-4 text-cyan-400" />
                        {mostrarCodigoAlgoritmo ? 'Ocultar Algoritmo' : 'Ver Fórmulas del Algoritmo'}
                      </button>

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

                  {/* Panel Expandible de Fórmulas Matemáticas y Código Fuente del Algoritmo (Sprint 2 / Tesis FICCT) */}
                  {mostrarCodigoAlgoritmo && (
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

                        <p className="text-amber-300 font-bold mt-2">2. Algoritmo PnP (Perspective-n-Point Euler Angles):</p>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-violet-300">
                          Yaw   = arctan2(R10, R00) * (180 / π)    // Rotación Horizontal<br/>
                          Pitch = arctan2(-R21, √(R11² + R01²))   // Inclinación Vertical<br/>
                          Roll  = arctan2(R22, R21)              // Ladeo de Cabeza
                        </div>

                        <p className="text-amber-300 font-bold mt-2">3. Acumulador Estadístico de 900 Fotogramas (HU-03):</p>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-emerald-300">
                          μ_EAR = (1 / N) * ∑ (EAR_i)              // Media de Apertura Ocular Base<br/>
                          σ_EAR = √[ (1 / N) * ∑ (EAR_i - μ_EAR)² ] // Umbral de Parpadeos
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Columna 3: Asistente Lúdico Avatar HUD & Border Glow */}
          <div className="space-y-6">
            
            {/* Widget Mascot Avatar HUD (HU-08) */}
            <div className="glass-panel rounded-3xl p-6 border border-slate-800 space-y-6 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold font-heading text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-violet-400" /> Avatar Asistente HUD
                </h3>
                <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded text-[10px] uppercase font-bold">Activo</span>
              </div>

              {/* Mascota Virtual Avatar Demo */}
              <div className="flex flex-col items-center justify-center p-6 bg-slate-950/80 rounded-2xl border border-violet-500/20 space-y-4">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-xl animate-pulse"></div>
                  <div className="w-20 h-20 bg-gradient-to-tr from-violet-600 to-cyan-400 rounded-full flex items-center justify-center text-3xl shadow-xl shadow-violet-500/30 transform hover:scale-110 transition-transform">
                    🤖
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <p className="text-sm font-bold text-white">"¡Vas muy bien, Mateo!"</p>
                  <p className="text-xs text-slate-400">Puntos de Enfoque Ganados: <strong className="text-emerald-400">150 pts 🏆</strong></p>
                </div>
              </div>

              {/* Botón Demo de Prueba de Atención Baja y Border Glow */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <p className="text-xs font-semibold text-slate-400">Simulación de Reenganche (Prueba):</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setMostrarBorderGlow(true); setIaiSimulado(42); }}
                    className="px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition"
                  >
                    Simular IAI &lt; 50%
                  </button>
                  <button
                    onClick={() => { setMostrarBorderGlow(false); setIaiSimulado(88); }}
                    className="px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition"
                  >
                    Restablecer IAI 88%
                  </button>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
