from typing import Dict


class FiltroKalman1D:
    """
    Filtro de Kalman escalar 1D para suavizado del Índice de Atención e Inquietud (IAI).
    Elimina ruido blanco de parpadeo fisiológico y micro-movimientos.
    """

    def __init__(self, q: float = 0.05, r: float = 0.5, valor_inicial: float = 100.0):
        self.q = q  # Varianza del proceso (ruido del modelo)
        self.r = r  # Varianza de la medición (ruido del sensor)
        self.x = valor_inicial  # Estado estimado (IAI)
        self.p = 1.0            # Error de estimación inicial

    def actualizar(self, medicion: float) -> float:
        # 1. Predicción
        self.p = self.p + self.q

        # 2. Ganancia de Kalman (K)
        k = self.p / (self.p + self.r)

        # 3. Corrección del Estado
        self.x = self.x + k * (medicion - self.x)

        # 4. Actualización del Error
        self.p = (1.0 - k) * self.p

        return round(float(self.x), 1)


class MotorFusionAtencional:
    """
    Motor de Fusión Multimodal para el cálculo del IAI (Índice de Atención e Inquietud Motriz) (HU-07).
    Entradas:
      - ear_actual: Apertura ocular (0.0 a 0.4)
      - ear_base: Línea base del estudiante calibrada en HU-03 (ej. 0.28)
      - yaw, pitch: Ángulos de inclinación de cabeza
      - varianza_hombros: Indicador de movimiento hiperactivo de hombros
    """

    def __init__(self):
        self.filtro_kalman = FiltroKalman1D(q=0.08, r=0.4, valor_inicial=90.0)

    def calcular_iai(
        self,
        ear_actual: float,
        ear_base: float,
        yaw: float,
        pitch: float,
        varianza_hombros: float
    ) -> Dict[str, float]:
        """
        Calcula el IAI fusionando la sub-métrica ocular, postural y de motricidad.
        Retorna un diccionario con las métricas desglosadas y el IAI filtrado (0-100%).
        """
        # 1. Sub-índice Ocular (0 a 100)
        fatiga_ocular = max(0.0, min(1.0, (ear_base - ear_actual) / ear_base)) if ear_base > 0 else 0.0
        score_ocular = 100.0 * (1.0 - fatiga_ocular)

        # 2. Sub-índice Postural PnP (0 a 100)
        desviacion_postura = min(1.0, (abs(yaw) + abs(pitch)) / 60.0)
        score_postural = 100.0 * (1.0 - desviacion_postura)

        # 3. Sub-índice de Inquietud Motriz Hombros (0 a 100)
        inquietud_hombros = min(1.0, varianza_hombros / 0.10)
        score_motriz = 100.0 * (1.0 - inquietud_hombros)

        # Fusión Multimodal Ponderada (Ocular 40%, Postural 40%, Motriz 20%)
        iai_raw = (0.40 * score_ocular) + (0.40 * score_postural) + (0.20 * score_motriz)
        iai_raw = max(0.0, min(100.0, iai_raw))

        # Suavizado dinámico mediante Filtro de Kalman 1D
        iai_filtrado = self.filtro_kalman.actualizar(iai_raw)

        return {
          "iai_filtrado": iai_filtrado,
          "score_ocular": round(score_ocular, 1),
          "score_postural": round(score_postural, 1),
          "score_motriz": round(score_motriz, 1),
          "fatiga_ocular": round(fatiga_ocular, 2)
        }
