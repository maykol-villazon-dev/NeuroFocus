import React, { useEffect, useRef } from 'react';

interface BorderGlowProps {
  estado: 1 | 2 | 3 | 4;
  activo: boolean;
}

/**
 * COMPONENTE BORDER GLOW (REQ-12, REQ-14, REQ-35 - Secciones 2.4.1 y 3.4.3)
 * Resplandor perimetral sutil que estimula los bastones retinianos periféricos sin forzar reflows.
 * Propiedades de ingeniería:
 *   - Aceleración por hardware GPU: transform: translateZ(0) y will-change: transform, opacity.
 *   - Paleta de 4 Estados: #00F5D4 (Cian), #2EC4B6 (Verde), #FFB703 (Ámbar), #7209B7 (Violeta).
 *   - Suavizado exponencial del canal alfa: lambda = 0.12 (transición ~250 ms sin parpadeos).
 *   - Ausencia total de alarmas sonoras (REQ-13).
 */
export const BorderGlow: React.FC<BorderGlowProps> = ({ estado, activo }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const alphaRef = useRef<number>(0.0);
  const animFrameRef = useRef<number>(0);

  // Paleta oficial de 4 estados del Capítulo 2 (Sección 2.4.1) [REQ-14]
  const coloresHex: Record<1 | 2 | 3 | 4, string> = {
    1: '#00F5D4', // Estado 1: Hiperfoco / Atención Plena (Cian brillante)
    2: '#2EC4B6', // Estado 2: Atención Sostenida / Óptima (Esmeralda suave)
    3: '#FFB703', // Estado 3: Desatención Leve (Ámbar cálido)
    4: '#7209B7', // Estado 4: Desconexión Crítica / Fatiga (Violeta profundo)
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajustar resolución del canvas al viewport
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const render = () => {
      // Suavizado exponencial: alpha(t) = alpha(t-1) + lambda * (target - alpha(t-1)) con lambda = 0.12 [REQ-35]
      const targetAlpha = activo ? 0.85 : 0.0;
      alphaRef.current = alphaRef.current + 0.12 * (targetAlpha - alphaRef.current);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (alphaRef.current > 0.01) {
        ctx.save();
        const color = coloresHex[estado];
        ctx.strokeStyle = color;
        ctx.lineWidth = 16;
        ctx.globalAlpha = alphaRef.current;
        ctx.shadowColor = color;
        ctx.shadowBlur = 36;
        // Inset perimetral para que el resplandor ilumine nítidamente el marco visible de la pantalla
        const inset = 8;
        ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [estado, activo]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-50"
      style={{
        transform: 'translateZ(0)', // Aislamiento en capa de composición GPU (REQ-35)
        willChange: 'transform, opacity',
      }}
    />
  );
};

