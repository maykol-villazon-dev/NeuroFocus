import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type TipoNotificacion = 'EXITO' | 'ADVERTENCIA' | 'ERROR' | 'INFO';

export interface ModalNotificacionConfig {
  abierto: boolean;
  tipo?: TipoNotificacion;
  titulo: string;
  mensaje: string;
  detalles?: string;
  textoBoton?: string;
  onConfirmar?: () => void;
}

interface ModalNotificacionProps {
  config: ModalNotificacionConfig;
  onCerrar: () => void;
}

export const ModalNotificacion: React.FC<ModalNotificacionProps> = ({ config, onCerrar }) => {
  if (!config.abierto) return null;

  const tipo = config.tipo || 'EXITO';

  const renderIcono = () => {
    switch (tipo) {
      case 'EXITO':
        return (
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-in zoom-in-75 duration-300" />
          </div>
        );
      case 'ADVERTENCIA':
        return (
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
            <AlertTriangle className="w-8 h-8 text-amber-400 animate-in zoom-in-75 duration-300" />
          </div>
        );
      case 'ERROR':
        return (
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/20">
            <AlertCircle className="w-8 h-8 text-rose-400 animate-in zoom-in-75 duration-300" />
          </div>
        );
      case 'INFO':
      default:
        return (
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
            <Info className="w-8 h-8 text-cyan-400 animate-in zoom-in-75 duration-300" />
          </div>
        );
    }
  };

  const getBotonGradient = () => {
    switch (tipo) {
      case 'EXITO':
        return 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/25';
      case 'ADVERTENCIA':
        return 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white shadow-amber-500/25';
      case 'ERROR':
        return 'bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-400 hover:to-red-500 text-white shadow-rose-500/25';
      case 'INFO':
      default:
        return 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25';
    }
  };

  const handleBotonClick = () => {
    if (config.onConfirmar) {
      config.onConfirmar();
    }
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 text-center transform transition-all duration-300 animate-in zoom-in-95"
        role="dialog"
        aria-modal="true"
      >
        {/* Botón cerrar X */}
        <button
          onClick={onCerrar}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Ícono de Estado */}
        {renderIcono()}

        {/* Título y Mensaje */}
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white tracking-tight">
            {config.titulo}
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed font-normal">
            {config.mensaje}
          </p>
        </div>

        {/* Detalles Opcionales */}
        {config.detalles && (
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs text-slate-400 font-mono text-center">
            {config.detalles}
          </div>
        )}

        {/* Botón de Acción */}
        <div className="pt-2">
          <button
            onClick={handleBotonClick}
            className={`w-full py-3 px-5 rounded-2xl font-bold text-sm tracking-wide transition shadow-lg cursor-pointer ${getBotonGradient()}`}
          >
            {config.textoBoton || 'Aceptar y Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
};
