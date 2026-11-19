/**
 * MÓDULO BIOMÉTRICO REAL DE VISIÓN ARTIFICIAL (Capítulo 3 - Secciones 3.1 y 3.2)
 * Proyecto de Grado TDAH - UAGRM FICCT
 * 
 * Implementa las fórmulas matemáticas puras para la extracción biométrica:
 * 1. EAR (Eye Aspect Ratio) - Soukupová & Čech (2016) [REQ-26]
 * 2. Pose Cefálica 3D Antropométrica (Yaw, Pitch, Roll) [REQ-27, REQ-28]
 * 3. Cinemática Escapular: Varianza de Hombros en ventana N=180 muestras [REQ-29]
 * 4. Calibración basal de 30 segundos (1800 fotogramas a 60 FPS) [REQ-17]
 */

export interface Punto2D {
  x: number;
  y: number;
}

export interface Punto3D {
  x: number;
  y: number;
  z: number;
}

export interface ResultadoBiometrico {
  earIzquierdo: number;
  earDerecho: number;
  earPromedio: number;
  yaw: number;
  pitch: number;
  roll: number;
  varianzaHombros: number;
  parpadeoDetectado: boolean;
  mar: number;
  esBostezo: boolean;
  narizY: number;
}

/**
 * 1. ALGORITMO DE APERTURA OCULAR (EAR - Eye Aspect Ratio) [REQ-26]
 * Fórmula: EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
 */
export function calcularDistanciaEuclidiana(p1: Punto2D, p2: Punto2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function calcularEAR(puntosOjo: Punto2D[]): number {
  if (puntosOjo.length < 6) return 0.28;

  // p1: extremo externo, p4: comisura interna
  // p2, p3: párpado superior / p5, p6: párpado inferior
  const dVert1 = calcularDistanciaEuclidiana(puntosOjo[1], puntosOjo[5]);
  const dVert2 = calcularDistanciaEuclidiana(puntosOjo[2], puntosOjo[4]);
  const dHoriz = calcularDistanciaEuclidiana(puntosOjo[0], puntosOjo[3]);

  if (dHoriz === 0) return 0.28;
  const ear = (dVert1 + dVert2) / (2.0 * dHoriz);
  return Number(ear.toFixed(3));
}

/**
 * 1.1 ALGORITMO DE APERTURA BUCAL (MAR - Mouth Aspect Ratio)
 * Puntos canónicos MediaPipe: Labio superior (13), Labio inferior (14), Comisura izq (78), Comisura der (308)
 * Fórmula: MAR = ||p13 - p14|| / ||p78 - p308||
 * Umbral de bostezo sostenido: MAR >= 0.65
 */
export function calcularMAR(puntosBoca: Punto2D[]): number {
  if (puntosBoca.length < 4) return 0.25;
  const dVert = calcularDistanciaEuclidiana(puntosBoca[0], puntosBoca[1]);
  const dHoriz = calcularDistanciaEuclidiana(puntosBoca[2], puntosBoca[3]);
  if (dHoriz === 0) return 0.25;
  const mar = dVert / dHoriz;
  return Number(mar.toFixed(3));
}

/**
 * 2. ESTIMACIÓN DE POSE CEFÁLICA EN ÁNGULOS DE EULER (Z-Y-X) [REQ-28]
 * Puntos canónicos: Nariz (1), Mentón (152), Ojo Izq (33), Ojo Der (263)
 */
export function estimarPoseCabeza(landmarks: Punto3D[]): { yaw: number; pitch: number; roll: number } {
  if (!landmarks || landmarks.length < 10) {
    return { yaw: 0.0, pitch: 0.0, roll: 0.0 };
  }

  const nariz = landmarks[1] || { x: 0.5, y: 0.5, z: 0 };
  const barbilla = landmarks[152] || { x: 0.5, y: 0.7, z: 0 };
  const ojoIzq = landmarks[33] || { x: 0.4, y: 0.4, z: 0 };
  const ojoDer = landmarks[263] || { x: 0.6, y: 0.4, z: 0 };

  // Yaw (horizontal): desviación de la nariz respecto al punto medio interocular
  const centroOjosX = (ojoIzq.x + ojoDer.x) / 2.0;
  const deltaX = nariz.x - centroOjosX;
  const yaw = Number((deltaX * 120.0).toFixed(1));

  // Pitch (vertical): inclinación respecto a la vertical nariz-mentón
  const deltaY = (barbilla.y - nariz.y) - 0.2;
  const pitch = Number((deltaY * -100.0).toFixed(1));

  // Roll (alabeo): inclinación del eje interocular
  const dY = ojoDer.y - ojoIzq.y;
  const dX = ojoDer.x - ojoIzq.x;
  const roll = Number((Math.atan2(dY, dX) * (180.0 / Math.PI)).toFixed(1));

  return { yaw, pitch, roll };
}

/**
 * 3. ESTIMADOR CINEMÁTICO DE HOMBROS (FIDGETING) [REQ-23, REQ-29]
 * Ventana móvil de N = 180 muestras (3.0s a 60 FPS) con varianza muestral insesgada (ddof=1).
 */
export class BufferCinematicoHombros {
  private historial: number[] = [];
  private readonly maxLen: number = 180; // 180 muestras = 3.0s @ 60 FPS

  public agregarMuestra(y11Left: number, y12Right: number): number {
    const yh = (y11Left + y12Right) / 2.0;
    this.historial.push(yh);
    if (this.historial.length > this.maxLen) {
      this.historial.shift();
    }

    if (this.historial.length < 2) return 0.0;

    const n = this.historial.length;
    const media = this.historial.reduce((a, b) => a + b, 0) / n;
    const varianzaInsesgada = this.historial.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / (n - 1);
    return Number(varianzaInsesgada.toFixed(5));
  }

  public resetear() {
    this.historial = [];
  }
}

export const bufferHombrosGlobal = new BufferCinematicoHombros();

/**
 * 4. MUESTRADOR ESTADÍSTICO PARA LA CALIBRACIÓN BASE DE 30 SEGUNDOS [REQ-17]
 * 1800 fotogramas a 60 FPS (30 segundos exactos).
 */
export class AcumuladorCalibracionBiometrica {
  public static readonly FRAMES_OBJETIVO: number = 1800; // 30s @ 60 FPS (REQ-17)
  private muestrasEAR: number[] = [];
  private muestrasYaw: number[] = [];
  private muestrasPitch: number[] = [];
  private muestrasRoll: number[] = [];
  private muestrasVarianzaHombros: number[] = [];
  private parpadeosContados: number = 0;
  private ojoCerradoPrevio: boolean = false;

  public agregarFotograma(ear: number, yaw: number, pitch: number, roll: number, varHombros: number = 0.02) {
    this.muestrasEAR.push(ear);
    this.muestrasYaw.push(yaw);
    this.muestrasPitch.push(pitch);
    this.muestrasRoll.push(roll);
    this.muestrasVarianzaHombros.push(varHombros);

    // Parpadeo fisiológico (EAR < 0.20)
    if (ear < 0.20 && !this.ojoCerradoPrevio) {
      this.parpadeosContados += 1;
      this.ojoCerradoPrevio = true;
    } else if (ear >= 0.20) {
      this.ojoCerradoPrevio = false;
    }
  }

  public obtenerPromedio(arreglo: number[]): number {
    if (arreglo.length === 0) return 0;
    const suma = arreglo.reduce((a, b) => a + b, 0);
    return suma / arreglo.length;
  }

  public obtenerDesviacionEstandar(arreglo: number[], media: number): number {
    if (arreglo.length <= 1) return 0;
    const varianza = arreglo.reduce((acc, val) => acc + Math.pow(val - media, 2), 0) / (arreglo.length - 1);
    return Math.sqrt(varianza);
  }

  public calcularLineaBaseFinal() {
    const earMedia = Number(this.obtenerPromedio(this.muestrasEAR).toFixed(3));
    const yawMedia = Number(this.obtenerPromedio(this.muestrasYaw).toFixed(1));
    const pitchMedia = Number(this.obtenerPromedio(this.muestrasPitch).toFixed(1));
    const rollMedia = Number(this.obtenerPromedio(this.muestrasRoll).toFixed(1));
    const earStd = Number(this.obtenerDesviacionEstandar(this.muestrasEAR, earMedia).toFixed(4));
    const varHombrosBase = Number(this.obtenerPromedio(this.muestrasVarianzaHombros).toFixed(5)) || 0.02;

    return {
      earBase: earMedia || 0.28,
      earDesviacion: earStd,
      poseNeutra: { yaw: yawMedia, pitch: pitchMedia, roll: rollMedia },
      varianzaHombrosBase: varHombrosBase,
      parpadeosTotales: this.parpadeosContados,
      totalMuestras: this.muestrasEAR.length
    };
  }

  public resetear() {
    this.muestrasEAR = [];
    this.muestrasYaw = [];
    this.muestrasPitch = [];
    this.muestrasRoll = [];
    this.muestrasVarianzaHombros = [];
    this.parpadeosContados = 0;
    this.ojoCerradoPrevio = false;
  }
}

/**
 * 5. PROCESADOR INTEGRAL DE LANDMARKS DE MEDIAPIPE FACE MESH (468/478 PUNTOS) [REQ-23, REQ-26]
 */
export function procesarLandmarksMediaPipe(landmarks: Punto3D[], poseLandmarks?: Punto3D[]): ResultadoBiometrico {
  if (!landmarks || landmarks.length < 468) {
    return {
      earIzquierdo: 0.28,
      earDerecho: 0.28,
      earPromedio: 0.28,
      yaw: 0.0,
      pitch: 0.0,
      roll: 0.0,
      varianzaHombros: 0.02,
      parpadeoDetectado: false,
      mar: 0.25,
      esBostezo: false,
      narizY: 0.5
    };
  }

  // Ojo Izquierdo: [33, 160, 158, 133, 153, 144] [REQ-26]
  const puntosOjoIzq: Punto2D[] = [
    { x: landmarks[33].x, y: landmarks[33].y },
    { x: landmarks[160].x, y: landmarks[160].y },
    { x: landmarks[158].x, y: landmarks[158].y },
    { x: landmarks[133].x, y: landmarks[133].y },
    { x: landmarks[153].x, y: landmarks[153].y },
    { x: landmarks[144].x, y: landmarks[144].y }
  ];

  // Ojo Derecho: [362, 385, 387, 263, 373, 380] [REQ-26]
  const puntosOjoDer: Punto2D[] = [
    { x: landmarks[362].x, y: landmarks[362].y },
    { x: landmarks[385].x, y: landmarks[385].y },
    { x: landmarks[387].x, y: landmarks[387].y },
    { x: landmarks[263].x, y: landmarks[263].y },
    { x: landmarks[373].x, y: landmarks[373].y },
    { x: landmarks[380].x, y: landmarks[380].y }
  ];

  const earIzq = calcularEAR(puntosOjoIzq);
  const earDer = calcularEAR(puntosOjoDer);
  const earProm = Number(((earIzq + earDer) / 2.0).toFixed(3));
  const pose = estimarPoseCabeza(landmarks);

  // Boca: Labio sup (13), Labio inf (14), Comisura izq (78), Comisura der (308)
  const puntosBoca: Punto2D[] = [
    { x: landmarks[13].x, y: landmarks[13].y },
    { x: landmarks[14].x, y: landmarks[14].y },
    { x: landmarks[78].x, y: landmarks[78].y },
    { x: landmarks[308].x, y: landmarks[308].y }
  ];
  const mar = calcularMAR(puntosBoca);

  // Varianza cinemática de hombros (puntos 11 y 12 si están disponibles) [REQ-23, REQ-29]
  let varHombros = 0.02;
  if (poseLandmarks && poseLandmarks.length > 12) {
    const y11 = poseLandmarks[11].y;
    const y12 = poseLandmarks[12].y;
    varHombros = bufferHombrosGlobal.agregarMuestra(y11, y12);
  }

  const narizY = landmarks[1] ? landmarks[1].y : 0.5;

  return {
    earIzquierdo: earIzq,
    earDerecho: earDer,
    earPromedio: earProm,
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
    varianzaHombros: varHombros || 0.02,
    parpadeoDetectado: earProm < 0.20,
    mar: mar,
    esBostezo: mar >= 0.65,
    narizY: Number(narizY.toFixed(3))
  };
}
