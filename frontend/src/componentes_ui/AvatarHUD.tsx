import React, { useState, useEffect } from 'react';
import { Sparkles, HeartHandshake, ShieldCheck } from 'lucide-react';

interface AvatarHUDProps {
  estado: 1 | 2 | 3 | 4;
  iai: number;
}

/**
 * COMPONENTE AVATAR HUD (LEARNING BUDDY) [REQ-02, REQ-05, REQ-15, REQ-16 - Secciones 2.1.2 y 2.4.2]
 * Características psicopedagógicas:
 *   - Prótesis de Función Ejecutiva (Barkley): Zero carga cognitiva, sin modales bloqueantes.
 *   - Gamificación No Punitiva (REQ-16): P(t) = P(t-1) + alpha * dt * Phi(IAI). NUNCA RESTA PUNTOS (Delta P >= 0).
 *     Tasa: +10 pts/s (Est 1), +7.5 pts/s (Est 2), +2.5 pts/s (Est 3), 0 pts/s (Est 4).
 *   - Sugerencia de Brain Break (REQ-05): Pausa activa de 2-3 min tras >180s en fatiga (Est 3 o 4).
 */
export const AvatarHUD: React.FC<AvatarHUDProps> = ({ estado, iai }) => {
  const [puntos, setPuntos] = useState<number>(0);
  const [tiempoEnFatigaSegundos, setTiempoEnFatigaSegundos] = useState<number>(0);
  const [mostrarBrainBreak, setMostrarBrainBreak] = useState<boolean>(false);

  useEffect(() => {
    const interval = setInterval(() => {
      let tasaPorSegundo = 0.0;
      if (estado === 1) tasaPorSegundo = 10.0;
      else if (estado === 2) tasaPorSegundo = 7.5;
      else if (estado === 3) tasaPorSegundo = 2.5;
      else tasaPorSegundo = 0.0;

      // Garantía formal no punitiva: Delta P >= 0 siempre
      setPuntos((prev) => Math.round(prev + tasaPorSegundo));

      // Detector de fatiga continua (>180 segundos en Estado 3 o 4) [REQ-05]
      if (estado >= 3) {
        setTiempoEnFatigaSegundos((prev) => {
          const acumulado = prev + 1;
          if (acumulado >= 180) {
            setMostrarBrainBreak(true);
          }
          return acumulado;
        });
      } else {
        setTiempoEnFatigaSegundos(0);
        setMostrarBrainBreak(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [estado]);

  const avatarInfo = {
    1: { emoji: '🚀', label: '¡Hiperfoco!', color: 'border-cyan-400 text-cyan-300' },
    2: { emoji: '😊', label: '¡Buen ritmo!', color: 'border-emerald-400 text-emerald-300' },
    3: { emoji: '👀', label: '¡Mira al centro!', color: 'border-amber-400 text-amber-300' },
    4: { emoji: '🌱', label: '¡Tómalo con calma!', color: 'border-violet-500 text-violet-300' }
  }[estado];

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none">
      {/* Sugerencia de Brain Break (REQ-05) */}
      {mostrarBrainBreak && (
        <div className="glass-panel p-3.5 rounded-2xl border border-violet-500/50 bg-slate-950/95 text-white text-xs max-w-xs shadow-2xl animate-bounce pointer-events-auto">
          <div className="flex items-center gap-2 text-violet-400 font-bold">
            <HeartHandshake className="w-4 h-4 shrink-0" />
            <span>¡Pausa Activa Sugerida!</span>
          </div>
          <p className="text-slate-300 text-[11px] mt-1 leading-relaxed">
            Has estado en alta exigencia cognitiva por más de 3 minutos. Estira tus hombros y respira hondo 2 minutos.
          </p>
        </div>
      )}

      {/* Widget Avatar Learning Buddy (REQ-15) */}
      <div className={`glass-panel px-4 py-2.5 rounded-2xl border ${avatarInfo.color} bg-slate-950/90 flex items-center gap-3 shadow-2xl pointer-events-auto transition-all duration-300`}>
        <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700/80 flex items-center justify-center text-xl shadow-inner">
          {avatarInfo.emoji}
        </div>

        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">FocusBot</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-semibold">
              IAI {iai.toFixed(0)}%
            </span>
          </div>
          <div className="text-[11px] text-amber-400 font-mono font-bold flex items-center gap-1 mt-0.5">
            <Sparkles className="w-3 h-3" /> {puntos} Pts (+{estado === 1 ? '10' : estado === 2 ? '7.5' : estado === 3 ? '2.5' : '0'}/s)
          </div>
        </div>
      </div>
    </div>
  );
};

