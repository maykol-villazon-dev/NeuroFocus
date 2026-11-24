import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  X,
  FileText,
  Sparkles,
  BookOpen,
  HeartPulse,
  Building2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { TERMINOS_POR_ROL } from '../constantes/terminos_legales';

interface ModalTerminosCondicionesProps {
  isOpen: boolean;
  onClose: () => void;
  onAceptar: () => void;
  rolSeleccionado: string;
}

export const ModalTerminosCondiciones: React.FC<ModalTerminosCondicionesProps> = ({
  isOpen,
  onClose,
  onAceptar,
  rolSeleccionado
}) => {
  const [rolActivo, setRolActivo] = useState<string>(rolSeleccionado || 'ESTUDIANTE');

  useEffect(() => {
    if (rolSeleccionado && TERMINOS_POR_ROL[rolSeleccionado]) {
      setRolActivo(rolSeleccionado);
    }
  }, [rolSeleccionado, isOpen]);

  if (!isOpen) return null;

  const datosRol = TERMINOS_POR_ROL[rolActivo] || TERMINOS_POR_ROL.ESTUDIANTE;

  const renderIconoRol = (rol: string) => {
    switch (rol) {
      case 'ESTUDIANTE':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case 'TUTOR':
        return <ShieldCheck className="w-4 h-4 text-amber-400" />;
      case 'DOCENTE':
        return <BookOpen className="w-4 h-4 text-cyan-400" />;
      case 'PSICOLOGO':
        return <HeartPulse className="w-4 h-4 text-purple-400" />;
      case 'DIRECTOR':
        return <Building2 className="w-4 h-4 text-blue-400" />;
      default:
        return <FileText className="w-4 h-4 text-slate-400" />;
    }
  };

  const getEtiquetaRol = (rol: string) => {
    switch (rol) {
      case 'ESTUDIANTE': return 'Estudiante';
      case 'TUTOR': return 'Tutor / Padre';
      case 'DOCENTE': return 'Docente';
      case 'PSICOLOGO': return 'Psicólogo';
      case 'DIRECTOR': return 'Director';
      default: return rol;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div
        className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                  Capítulo 5 • Marco Legal y Bioético
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Versión 1.0-2026</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1">
                Términos y Condiciones & Consentimiento Informado
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de Pestañas por Rol (RBAC) */}
        <div className="px-5 pt-3 pb-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {Object.keys(TERMINOS_POR_ROL).map((rKey) => {
            const esActivo = rolActivo === rKey;
            const esRolSugerido = rolSeleccionado === rKey;
            return (
              <button
                key={rKey}
                onClick={() => setRolActivo(rKey)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer border ${
                  esActivo
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {renderIconoRol(rKey)}
                <span>{getEtiquetaRol(rKey)}</span>
                {esRolSugerido && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" title="Tu rol seleccionado"></span>
                )}
              </button>
            );
          })}
        </div>

        {/* Cuerpo del Documento Legal con Scroll */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-300 leading-relaxed max-h-[58vh]">
          {/* Tarjeta de Título del Rol */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              {renderIconoRol(rolActivo)}
              {datosRol.titulo}
            </h4>
            <p className="text-xs text-cyan-400 font-medium">{datosRol.subtitulo}</p>
            <p className="text-[11px] text-slate-400 pt-1 flex items-center gap-1.5">
              <span className="font-semibold text-slate-300">Marco Legal:</span> {datosRol.normativa}
            </p>
          </div>

          {/* Cláusulas Específicas */}
          <div className="space-y-4">
            {datosRol.secciones.map((sec, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1.5">
                <h5 className="font-semibold text-white text-xs uppercase tracking-wide text-cyan-300">
                  {sec.encabezado}
                </h5>
                <p className="text-xs text-slate-300 text-justify leading-relaxed">
                  {sec.texto}
                </p>
              </div>
            ))}
          </div>

          {/* Declaración Jurada Final */}
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <span className="font-bold text-emerald-300 uppercase tracking-wide">
                Declaración de Asentimiento / Consentimiento Pleno:
              </span>
              <p className="text-emerald-100/90 text-justify leading-relaxed">
                "{datosRol.declaracion_aceptacion}"
              </p>
            </div>
          </div>
        </div>

        {/* Pie del Modal con Acciones */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Al aceptar, se registrará la fecha y tu rol en la base de datos inmutable.</span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onAceptar();
                onClose();
              }}
              className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 shadow-lg shadow-cyan-400/20 flex items-center gap-1.5 transition cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              He leído y Acepto los Términos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
