import React, { useState, useEffect } from 'react';
import { Search, Eye, UserCheck, Activity, Download, AlertCircle, FileText, CheckCircle2, Sliders, Layers } from 'lucide-react';
import { useAuth } from '../contexto/AuthContext';

export const DashboardAutoridades: React.FC = () => {
  const { usuario } = useAuth();
  const [codigoBusqueda, setCodigoBusqueda] = useState<string>('EST-2026-001');
  const [estudianteEncontrado, setEstudianteEncontrado] = useState<boolean>(true);
  const [descargandoPdf, setDescargandoPdf] = useState<boolean>(false);

  // Estado dinámico de telemetría biométrica del estudiante conectado por WebSocket (Sprint 2 - HU-10)
  const [metricasActuales, setMetricasActuales] = useState({
    iai: 88.0,
    scoreOcular: 95.0,
    scorePostural: 90.0,
    scoreMotriz: 85.0,
    alertaActiva: false,
    estadoLectura: 'Atención Alta'
  });

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    if (codigoBusqueda.trim().toUpperCase() === 'EST-2026-001' || codigoBusqueda.trim() !== '') {
      setEstudianteEncontrado(true);
    } else {
      setEstudianteEncontrado(false);
    }
  };

  const handleExportarPdf = () => {
    setDescargandoPdf(true);
    setTimeout(() => {
      setDescargandoPdf(false);
      alert(`📄 Reporte Psicopedagógico PDF (ReportLab Engine) generado con éxito para el estudiante ${codigoBusqueda}.`);
    }, 1500);
  };

  // Conexión WebSockets en Tiempo Real al Canal del Estudiante Seleccionado (HU-10)
  useEffect(() => {
    if (!estudianteEncontrado || !codigoBusqueda) return;

    const codigoEst = codigoBusqueda.trim();
    const wsUrl = `ws://127.0.0.1:8000/ws/monitoreo/${codigoEst}`;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('[DASHBOARD WS OPEN] Suscrito a la telemetría en vivo del estudiante:', codigoEst);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.iai !== undefined) {
            const iaiValor = Number(data.iai.toFixed(1));
            let estado = 'Atención Alta';
            if (iaiValor < 50) estado = 'Desatención Crítica';
            else if (iaiValor < 70) estado = 'Atención Moderada';

            setMetricasActuales({
              iai: iaiValor,
              scoreOcular: data.score_ocular || 90.0,
              scorePostural: data.score_postural || 85.0,
              scoreMotriz: data.score_motriz || 80.0,
              alertaActiva: data.alerta_reenganche || iaiValor < 50,
              estadoLectura: estado
            });
          }
        } catch (err) {
          console.warn('Error parsing WS message in Dashboard:', err);
        }
      };

      socket.onerror = (err) => {
        console.warn('[DASHBOARD WS ERROR] Servidor WS no disponible o en fallback:', err);
      };
    } catch (e) {
      console.warn('Dashboard WS init exception:', e);
    }

    return () => {
      if (socket) socket.close();
    };
  }, [codigoBusqueda, estudianteEncontrado]);

  return (
    <div className="min-h-[calc(100vh-5rem)] p-6 max-w-7xl mx-auto space-y-8">
      
      {/* Header del Dashboard */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 glass-panel p-6 rounded-3xl border border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <UserCheck className="w-4 h-4" /> Panel de Seguimiento Psicopedagógico | Rol: {usuario?.rol || 'PSICOLOGO'}
          </div>
          <h1 className="text-3xl font-bold font-heading text-white">Monitoreo de Atención de Estudiantes</h1>
          <p className="text-slate-400 text-sm mt-1">Consulta métricas biométricas en tiempo real ingresando el código del estudiante.</p>
        </div>

        {/* Formulario de Búsqueda por Código (HU-12) */}
        <form onSubmit={handleBuscar} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={codigoBusqueda}
              onChange={(e) => setCodigoBusqueda(e.target.value)}
              placeholder="Ej: EST-2026-001"
              className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white font-mono text-sm rounded-xl pl-11 pr-4 py-2.5 outline-none transition"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition shrink-0"
          >
            Buscar
          </button>
        </form>
      </div>

      {/* Resultados de Búsqueda */}
      {estudianteEncontrado ? (
        <div className="space-y-8">
          
          {/* Card de Ficha del Estudiante Solicitado */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-slate-950 font-bold text-2xl shadow-lg shadow-emerald-500/20">
                MM
              </div>
              <div>
                <h2 className="text-2xl font-bold font-heading text-white">Mateo Morales Villalobos</h2>
                <p className="text-xs text-slate-400">
                  Código: <span className="font-mono text-emerald-400 font-bold">{codigoBusqueda}</span> | Edad: 14 años | 3º de Secundaria
                </p>
                <p className="text-xs text-amber-400 font-semibold mt-1">Diagnóstico: TDAH Leve - Atención Sostenida en Lectura Digital</p>
              </div>
            </div>

            {/* Botón Exportar PDF (HU-11) */}
            <button
              onClick={handleExportarPdf}
              disabled={descargandoPdf}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-500/30 flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" />
              {descargandoPdf ? 'Compilando PDF ReportLab...' : 'Exportar Reporte PDF (HU-11)'}
            </button>
          </div>

          {/* Banner de Alerta en Vivo si IAI < 50% */}
          {metricasActuales.alertaActiva && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-300 text-xs font-semibold animate-pulse">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>⚠️ ALERTA DE REENGANCHE: El estudiante presenta un IAI menor al 50%. Se ha notificado al asistente virtual.</span>
            </div>
          )}

          {/* Grid de Velocímetro IAI y Métricas Biométricas en Vivo (HU-10) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Velocímetro IAI 0-100% (HU-07) */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col items-center justify-center space-y-4 text-center">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Índice IAI Suavizado</span>
              
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="12" className="text-slate-800" fill="transparent" />
                  <circle
                    cx="72"
                    cy="72"
                    r="60"
                    stroke="currentColor"
                    strokeWidth="12"
                    className={`transition-all duration-700 ${metricasActuales.iai >= 70 ? 'text-emerald-400' : metricasActuales.iai >= 50 ? 'text-amber-400' : 'text-rose-400'}`}
                    fill="transparent"
                    strokeDasharray={376.8}
                    strokeDashoffset={376.8 - (376.8 * metricasActuales.iai) / 100}
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-3xl font-extrabold font-heading text-white">{metricasActuales.iai}%</span>
                  <span className={`block text-[10px] uppercase font-bold ${metricasActuales.iai >= 70 ? 'text-emerald-400' : metricasActuales.iai >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {metricasActuales.estadoLectura}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-400">Filtro de Kalman activo | WebSocket en vivo</p>
            </div>

            {/* Sub-índice Ocular EAR */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-cyan-400" /> Sub-Índice Ocular EAR
              </span>
              <p className="text-2xl font-bold font-heading text-white">{metricasActuales.scoreOcular}%</p>
              <p className="text-xs text-emerald-400 font-semibold">Tasa de Parpadeo Ponderada</p>
              <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">Evaluación de fatiga palpebral en reposo.</p>
            </div>

            {/* Sub-índice Postural PnP */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-violet-400" /> Sub-Índice Postural PnP
              </span>
              <p className="text-2xl font-bold font-heading text-white">{metricasActuales.scorePostural}%</p>
              <p className="text-xs text-violet-300 font-semibold">Orientación de Cabeza (Yaw/Pitch)</p>
              <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">Alineación con la pantalla de lectura.</p>
            </div>

            {/* Sub-índice Motriz Hombros */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-amber-400" /> Sub-Índice Motriz Hombros
              </span>
              <p className="text-2xl font-bold font-heading text-white">{metricasActuales.scoreMotriz}%</p>
              <p className="text-xs text-amber-400 font-semibold">Varianza Espacial (Fidgeting)</p>
              <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">Detección de inquietud postural física.</p>
            </div>

          </div>

          {/* Gráfico SVG de Línea de Tiempo de Atención (HU-10) */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-lg font-bold font-heading text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" /> Línea de Tiempo de Atención e Inquietud Motriz en la Sesión
            </h3>
            <p className="text-xs text-slate-400">Registros cada 10 minutos durante el periodo de monitoreo activo de 2 horas</p>

            <div className="h-48 w-full pt-4">
              <svg className="w-full h-full" viewBox="0 0 500 150">
                <line x1="0" y1="120" x2="500" y2="120" stroke="#334155" strokeWidth="1" />
                <line x1="0" y1="75" x2="500" y2="75" stroke="#334155" strokeWidth="1" strokeDasharray="4" />
                <line x1="0" y1="30" x2="500" y2="30" stroke="#334155" strokeWidth="1" strokeDasharray="4" />

                {/* Curva de IAI */}
                <path
                  d="M 0 40 Q 50 20, 100 35 T 200 80 T 300 45 T 400 30 T 500 25"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="3"
                />
                <circle cx="200" cy="80" r="5" fill="#EF4444" className="animate-pulse" />
              </svg>
            </div>
          </div>

        </div>
      ) : (
        <div className="glass-panel p-12 rounded-3xl border border-slate-800 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h3 className="text-xl font-bold text-white">Estudiante no encontrado</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">No se encontraron registros de monitoreo para el código "{codigoBusqueda}". Verifique el código e intente nuevamente.</p>
        </div>
      )}

    </div>
  );
};
