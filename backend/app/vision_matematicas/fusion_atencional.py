import math
import numpy as np
from typing import Dict, Any, Optional
from collections import deque


class FiltroKalman1D:
    """
    Filtro de Kalman Lineal 1D estocástico óptimo de mínima varianza (Capítulo 3, Sección 3.3.2).
    Constantes biométricas formalizadas en Tesis UAGRM (REQ-31), adaptadas a la tasa WebSocket (4 Hz):
      - Q (Ruido del proceso cognitivo escalado a dt=0.25s): 2e-3 (2 * 10^-3)
      - R (Ruido de medición sensorial webcam): 1e-2 (10^-2)
      - P_0 (Covarianza inicial del error): 1.0
    """
    def __init__(self, q: float = 2e-3, r: float = 1e-2, valor_inicial: float = 100.0):
        self.q = q
        self.r = r
        self.x = valor_inicial
        self.p = 1.0

    def ciclo_estimacion(self, z_t: float) -> float:
        # 1. Fase de Predicción a Priori (Time Update)
        x_priori = self.x
        p_priori = self.p + self.q

        # 2. Ganancia Óptima de Kalman (K_t)
        k_t = p_priori / (p_priori + self.r)

        # 3. Residuo o Innovación de Medición
        y_tilde = z_t - x_priori

        # 4. Fase de Corrección a Posteriori (Measurement Update)
        self.x = x_priori + (k_t * y_tilde)
        self.p = (1.0 - k_t) * p_priori

        # Confinamiento porcentual estricto [0.0, 100.0] (REQ-19)
        return float(np.clip(self.x, 0.0, 100.0))

    def actualizar(self, medicion: float) -> float:
        """Alias compatible con llamadas previas."""
        return round(self.ciclo_estimacion(medicion), 1)


class MaquinaEstadosAtencional:
    """
    Clasificador de 4 Estados con Histéresis Temporal Anti-Chattering (REQ-20 y REQ-32 - Sección 3.3.3):
      - Estado 1: Hiperfoco / Atención Plena (80.0% - 100.0%) -> Hex: #00F5D4
      - Estado 2: Atención Sostenida / Óptima (60.0% - 79.9%) -> Hex: #2EC4B6
      - Estado 3: Desatención Leve / Desvío (40.0% - 59.9%) -> Hex: #FFB703
      - Estado 4: Desconexión Crítica / Fatiga (0.0% - 39.9%) -> Hex: #7209B7
    Persistencia requerida:
      - Transición descendente (degradación): 90 frames consecutivos (1.50 s a 60 FPS)
      - Transición ascendente (recuperación): 60 frames consecutivos (1.00 s a 60 FPS)
    """
    def __init__(self):
        self.estado_actual: int = 1
        self.candidato_estado: int = 1
        self.contador_persistencia: int = 0
        self.historial_estados = deque(maxlen=3600)  # Memoria de 1 minuto a 60 FPS

    def clasificar_instantaneo(self, iai: float) -> int:
        if iai >= 80.0:
            return 1
        elif iai >= 60.0:
            return 2
        elif iai >= 40.0:
            return 3
        else:
            return 4

    def actualizar(self, iai: float) -> Dict[str, Any]:
        estado_crudo = self.clasificar_instantaneo(iai)

        if estado_crudo != self.estado_actual:
            if estado_crudo == self.candidato_estado:
                self.contador_persistencia += 1
                # Regla de histéresis temporal diferenciada (REQ-32 adaptada a tasa WebSocket 4 Hz)
                # 5 frames (1.25s) para degradar a desatención/fatiga; 4 frames (1.0s) para recuperar
                umbral_requerido = 5 if estado_crudo > self.estado_actual else 4
                if self.contador_persistencia >= umbral_requerido:
                    self.estado_actual = estado_crudo
                    self.contador_persistencia = 0
            else:
                self.candidato_estado = estado_crudo
                self.contador_persistencia = 1
        else:
            self.candidato_estado = self.estado_actual
            self.contador_persistencia = 0

        self.historial_estados.append(self.estado_actual)

        paleta_colores = {
            1: "#00F5D4",
            2: "#2EC4B6",
            3: "#FFB703",
            4: "#7209B7"
        }

        nombres_estado = {
            1: "Estado 1: Hiperfoco / Atencion Plena",
            2: "Estado 2: Atencion Sostenida / Optima",
            3: "Estado 3: Desatencion Leve / Desvio",
            4: "Estado 4: Desconexion Critica / Fatiga"
        }

        puntos_map = {
            1: 10.0,
            2: 7.5,
            3: 2.5,
            4: 0.0
        }

        return {
            "estado": self.estado_actual,
            "nombre": nombres_estado[self.estado_actual],
            "color_hex": paleta_colores[self.estado_actual],
            "puntos_por_segundo": puntos_map[self.estado_actual]
        }


class EvaluadorFatigaSesion:
    """
    Evaluador de Dinámica Temporal y Fatiga Escolar (REQ-03 y REQ-05 - Secciones 2.1.3 y 2.2.2):
      - Inflexión crítica de fatiga a los 12-15 minutos (720-900 segundos).
      - Monitoreo de pendiente d(IAI)/dt.
      - Gatillado de sugerencia de Brain Break (pausa activa de 2-3 min) si permanece >180s en Estado 3 o 4.
    """
    FATIGUE_INFLECTION_MIN_SEC = 12 * 60  # 720 s (12 minutos)
    FATIGUE_CRITICAL_MIN_SEC = 15 * 60    # 900 s (15 minutos)
    BRAIN_BREAK_THRESHOLD_SEC = 180       # 180 s continuos (3 minutos en Estado 3/4)

    def __init__(self):
        self.segundos_sesion_activa: float = 0.0
        self.segundos_desatencion_continua: float = 0.0
        self.historial_iai_reciente = deque(maxlen=60)

    def evaluar(self, iai_actual: float, estado_actual: int, dt: float = 1.0 / 60.0) -> Dict[str, Any]:
        self.segundos_sesion_activa += dt
        self.historial_iai_reciente.append(iai_actual)

        # Pendiente d(IAI)/dt
        pendiente_iai = 0.0
        if len(self.historial_iai_reciente) >= 2:
            pendiente_iai = (self.historial_iai_reciente[-1] - self.historial_iai_reciente[0]) / len(self.historial_iai_reciente)

        # Acumulador para sugerencia de Brain Break
        if estado_actual in (3, 4):
            self.segundos_desatencion_continua += dt
        else:
            self.segundos_desatencion_continua = 0.0

        en_ventana_12_15m = self.FATIGUE_INFLECTION_MIN_SEC <= self.segundos_sesion_activa <= self.FATIGUE_CRITICAL_MIN_SEC
        fatiga_detectada = (self.segundos_sesion_activa >= self.FATIGUE_INFLECTION_MIN_SEC) and (pendiente_iai < -0.15 or iai_actual < 60.0)
        sugerir_brain_break = self.segundos_desatencion_continua >= self.BRAIN_BREAK_THRESHOLD_SEC

        return {
            "segundos_sesion": round(self.segundos_sesion_activa, 1),
            "en_ventana_12_15m": en_ventana_12_15m,
            "fatiga_detectada": fatiga_detectada,
            "pendiente_iai": round(pendiente_iai, 4),
            "sugerir_brain_break": sugerir_brain_break
        }


class MotorFusionAtencional:
    """
    Motor de Fusión Multimodal Convexa (Capítulo 3, Sección 3.3.2):
      w1 = 0.45 (Canal Ocular)
      w2 = 0.35 (Canal Cefálico Gaussiano PnP 3D)
      w3 = 0.20 (Canal Corporal Cinturón Escapular)
    Constantes de cono y corte:
      - Yaw +/- 25.0 deg (sigma_psi = 25.0)
      - Pitch +/- 20.0 deg (sigma_theta = 20.0)
      - Corte de agitación severa: 2.50 * varianza_base
      - Inmunidad de parpadeo normal (100 - 400 ms)
      - Detección de microsueño (EAR < 75% base por >= 1.50s / 90 frames)
    """
    BLINK_MAX_FRAMES = 2        # 500 ms @ 4 Hz (parpadeo fisiológico normal <= 500ms - REQ-07)
    MICROSLEEP_FRAMES = 5       # 1.25 s @ 4 Hz (fatiga / microsueño >= 1.25s - REQ-06)
    HEAD_DISCONNECT_FRAMES = 6  # 1.50 s @ 4 Hz (desconexión cefálica >= 1.5s - REQ-09)

    def __init__(self):
        self.filtro_kalman = FiltroKalman1D(q=2e-3, r=1e-2, valor_inicial=100.0) # REQ-31 adaptado a 4 Hz
        self.maquina_estados = MaquinaEstadosAtencional()                          # REQ-20, REQ-32
        self.evaluador_fatiga = EvaluadorFatigaSesion()                            # REQ-03, REQ-05

        self.SIGMA_YAW = 25.0       # REQ-08
        self.SIGMA_PITCH = 20.0     # REQ-08
        self.SIGMA_FIDGET = 0.05

        self.conteo_frames_fuera_cono: int = 0
        self.conteo_frames_oclusion: int = 0

    def calcular_iai(
        self,
        ear_actual: float,
        ear_base: float = 0.28,
        yaw: float = 0.0,
        pitch: float = 0.0,
        yaw_base: float = 0.0,
        pitch_base: float = 0.0,
        varianza_hombros: float = 0.02,
        varianza_base: float = 0.02,
        ausencia_estudiante: bool = False,
        mar: float = 0.25,
        es_bostezo: bool = False,
        distractor_externo: bool = False,
        es_staring: bool = False,
        es_slumping: bool = False
    ) -> Dict[str, Any]:
        """
        Calcula el IAI con la formulación matemática exacta de los Capítulos 2 y 3,
        incorporando los biomarcadores clínicos de abandono de puesto, bostezos MAR,
        distractores externos, mirada perdida (staring) y hundimiento postural (slumping).
        """
        # 0. CASO CRÍTICO: ABANDONO DE PUESTO ESCOLAR (Criterio DSM-5 de Hiperactividad)
        if ausencia_estudiante:
            self.conteo_frames_fuera_cono = 0
            self.conteo_frames_oclusion = 0
            z_t = 0.0
            score_ocular = 0.0
            score_cefalico = 0.0
            score_corporal = 0.0
            iai_filtrado = self.filtro_kalman.ciclo_estimacion(z_t)
            info_estado = self.maquina_estados.actualizar(iai_filtrado)
            info_fatiga = self.evaluador_fatiga.evaluar(iai_filtrado, info_estado["estado"])
            return {
                "iai_filtrado": round(iai_filtrado, 1),
                "score_ocular": 0.0,
                "score_postural": 0.0,
                "score_motriz": 0.0,
                "fatiga_ocular": 1.0,
                "estado": 4,
                "estado_nombre": "Estado 4: Desconexión Crítica / Ausente",
                "color_hex": "#EF4444",
                "puntos_por_segundo": 0,
                "es_microsueno": False,
                "desconexion_cefalica": False,
                "agitacion_severa": False,
                "es_abandono_puesto": True,
                "mar": round(mar, 3),
                "es_bostezo": False,
                "distractor_externo": False,
                "es_staring": False,
                "es_slumping": False,
                "en_ventana_12_15m": info_fatiga["en_ventana_12_15m"],
                "fatiga_detectada": True,
                "sugerir_brain_break": True
            }

        # 1. CANAL OCULAR: w1 = 0.45 (REQ-30)
        ear_ref = max(0.10, ear_base)
        es_microsueno = False

        if ear_actual < (0.75 * ear_ref):
            self.conteo_frames_oclusion += 1
            if self.conteo_frames_oclusion <= self.BLINK_MAX_FRAMES:
                # REQ-07: Inmunidad de parpadeo fisiológico (100 a 400 ms): no degrada la atención
                ear_computado = ear_ref
            else:
                ear_computado = ear_actual
            if self.conteo_frames_oclusion >= self.MICROSLEEP_FRAMES:
                # REQ-06: Oclusión sostenida >= 1.25s es microsueño / fatiga clínica
                es_microsueno = True
        else:
            self.conteo_frames_oclusion = 0
            ear_computado = ear_actual

        score_ocular = float(np.clip((ear_computado / ear_ref) * 100.0, 0.0, 100.0))
        if es_microsueno:
            score_ocular = min(score_ocular, 20.0)

        # Penalización por Bostezo Prolongado (MAR >= 0.65)
        if es_bostezo:
            score_ocular = min(score_ocular, 25.0)

        # Penalización por Mirada Perdida / Ensoñación Pasiva (Staring / Mind-Wandering F90.0)
        if es_staring:
            score_ocular = min(score_ocular, 35.0)

        # 2. CANAL CEFÁLICO: w2 = 0.35 (Cono ergonómico +/-25° / +/-20° - REQ-08, REQ-30)
        delta_yaw = yaw - yaw_base
        delta_pitch = pitch - pitch_base
        fuera_de_cono = (abs(delta_yaw) > 25.0) or (abs(delta_pitch) > 20.0)

        desconexion_cefalica = False
        if fuera_de_cono:
            self.conteo_frames_fuera_cono += 1
            if self.conteo_frames_fuera_cono >= self.HEAD_DISCONNECT_FRAMES:
                # REQ-09: Desvío sostenido por >= 2.0s (120 frames) degrada estado
                desconexion_cefalica = True
        else:
            self.conteo_frames_fuera_cono = 0

        # Función gaussiana centrada en el cono ergonómico
        exponente_cefalico = -((delta_yaw ** 2) / (2.0 * (self.SIGMA_YAW ** 2)) + (delta_pitch ** 2) / (2.0 * (self.SIGMA_PITCH ** 2)))
        score_cefalico = float(100.0 * math.exp(exponente_cefalico))

        # Penalización por Hundimiento Postural (Slumping)
        if es_slumping:
            score_cefalico = min(score_cefalico, 30.0)

        # 3. CANAL CORPORAL: w3 = 0.20 (Varianza escapular - REQ-10, REQ-11, REQ-30)
        var_ref = max(0.001, varianza_base)
        agitacion_severa = varianza_hombros > (2.50 * var_ref) # REQ-11: Umbral 2.50x
        delta_var = max(0.0, varianza_hombros - var_ref)       # REQ-10: Tolera varianza <= basal
        score_corporal = float(100.0 * math.exp(-delta_var / (2.0 * (self.SIGMA_FIDGET ** 2))))

        if es_slumping:
            score_corporal = min(score_corporal, 30.0)

        # FUSIÓN CONVEXA COMPUESTA (REQ-30): w1=0.45, w2=0.35, w3=0.20
        z_t = (0.45 * score_ocular) + (0.35 * score_cefalico) + (0.20 * score_corporal)

        # Penalización por Distractor Externo (Terceros en el campo visual)
        if distractor_externo:
            z_t *= 0.70

        z_t = float(np.clip(z_t, 0.0, 100.0)) # REQ-19

        # ESTIMACIÓN ESTOCÁSTICA FILTRO DE KALMAN 1D (REQ-31)
        iai_filtrado = self.filtro_kalman.ciclo_estimacion(z_t)

        # CLASIFICACIÓN DE ESTADO CON HISTÉRESIS ANTI-CHATTERING (REQ-20, REQ-32)
        info_estado = self.maquina_estados.actualizar(iai_filtrado)

        # EVALUACIÓN DE FATIGA CONTINUA Y BRAIN BREAK (REQ-03, REQ-05)
        info_fatiga = self.evaluador_fatiga.evaluar(iai_filtrado, info_estado["estado"])

        return {
            "iai_filtrado": round(iai_filtrado, 1),
            "score_ocular": round(score_ocular, 1),
            "score_postural": round(score_cefalico, 1),
            "score_motriz": round(score_corporal, 1),
            "fatiga_ocular": round(1.0 - (score_ocular / 100.0), 2),
            "estado": info_estado["estado"],
            "estado_nombre": info_estado["nombre"],
            "color_hex": info_estado["color_hex"],
            "puntos_por_segundo": info_estado["puntos_por_segundo"],
            "es_microsueno": es_microsueno,
            "desconexion_cefalica": desconexion_cefalica,
            "agitacion_severa": agitacion_severa,
            "es_abandono_puesto": False,
            "mar": round(mar, 3),
            "es_bostezo": es_bostezo,
            "distractor_externo": distractor_externo,
            "es_staring": es_staring,
            "es_slumping": es_slumping,
            "en_ventana_12_15m": info_fatiga["en_ventana_12_15m"],
            "fatiga_detectada": info_fatiga["fatiga_detectada"],
            "sugerir_brain_break": info_fatiga["sugerir_brain_break"]
        }
