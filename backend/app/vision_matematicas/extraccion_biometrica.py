import math
import numpy as np
from typing import Dict, List, Tuple, Optional


class ExtractorBiometrico:
    """
    Motor Biométrico de Visión Artificial para Monitoreo de Atentividad e Inquietud (HU-02, HU-04, HU-05, HU-06).
    Procesa exclusivamente vectores numéricos de puntos faciales y posturales en memoria RAM (Privacy by Design).
    """

    def __init__(self, ear_umbral_parpadeo: float = 0.20):
        self.ear_umbral_parpadeo = ear_umbral_parpadeo
        self.historial_hombros: List[float] = []
        self.max_historial_hombros = 90  # 3 segundos @ 30 FPS
        self.ojo_cerrado_previo = False

    @staticmethod
    def calcular_distancia_euclidiana(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Calcula la distancia euclidiana entre dos puntos 2D."""
        return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)

    def calcular_ear(self, puntos_ojo: List[Tuple[float, float]]) -> float:
        """
        Calcula la relación de aspecto del ojo (EAR - Eye Aspect Ratio) según Soukupová & Čech (2016).
        puntos_ojo: Lista de 6 puntos [(p1_x, p1_y), ..., (p6_x, p6_y)]
        """
        if len(puntos_ojo) < 6:
            return 0.28

        # Distancias verticales entre párpados
        d_vert1 = self.calcular_distancia_euclidiana(puntos_ojo[1], puntos_ojo[5])
        d_vert2 = self.calcular_distancia_euclidiana(puntos_ojo[2], puntos_ojo[4])
        # Distancia horizontal entre extremos del ojo
        d_horiz = self.calcular_distancia_euclidiana(puntos_ojo[0], puntos_ojo[3])

        if d_horiz == 0:
            return 0.28

        ear = (d_vert1 + d_vert2) / (2.0 * d_horiz)
        return round(ear, 3)

    def estimar_pose_cabeza_pnp(self, landmarks_3d: Dict[int, Tuple[float, float, float]]) -> Dict[str, float]:
        """
        Estima la pose tridimensional de la cabeza (Yaw, Pitch, Roll) utilizando puntos de referencia clave.
        """
        if not landmarks_3d or 1 not in landmarks_3d:
            return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}

        nariz = landmarks_3d[1]       # Punta de la nariz
        barbilla = landmarks_3d[152]  # Barbilla
        ojo_izq = landmarks_3d[33]    # Canto externo ojo izquierdo
        ojo_der = landmarks_3d[263]   # Canto externo ojo derecho

        # Yaw: Desplazamiento lateral de la nariz respecto al punto medio de los ojos
        centro_ojos_x = (ojo_izq[0] + ojo_der[0]) / 2.0
        delta_x = nariz[0] - centro_ojos_x
        yaw = round(delta_x * 120.0, 1)  # Ángulo aproximado en grados (-45° a +45°)

        # Pitch: Inclinación vertical respecto a la barbilla
        delta_y = (barbilla[1] - nariz[1]) - 0.20
        pitch = round(delta_y * -100.0, 1)

        # Roll: Ángulo entre la línea de los ojos y la horizontal
        d_y = ojo_der[1] - ojo_izq[1]
        d_x = ojo_der[0] - ojo_izq[0]
        roll = round(math.degrees(math.atan2(d_y, d_x)), 1)

        return {"yaw": yaw, "pitch": pitch, "roll": roll}

    def calcular_varianza_hombros(self, y_hombro_izq: float, y_hombro_der: float) -> float:
        """
        Calcula la varianza espacial del movimiento de hombros en una ventana móvil de 3 segundos (HU-06).
        """
        y_promedio = (y_hombro_izq + y_hombro_der) / 2.0
        self.historial_hombros.append(y_promedio)

        if len(self.historial_hombros) > self.max_historial_hombros:
            self.historial_hombros.pop(0)

        if len(self.historial_hombros) < 2:
            return 0.0

        varianza = float(np.var(self.historial_hombros))
        return round(varianza, 4)
