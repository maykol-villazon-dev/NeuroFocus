import json
import asyncio
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.vision_matematicas import ExtractorBiometrico, MotorFusionAtencional

router = APIRouter(tags=["WebSockets Monitoreo en Tiempo Real"])


class ConnectionManager:
    """
    Administrador de Conexiones WebSockets Activas por Sala de Estudiante (HU-07, HU-10).
    Permite la retransmisión instantánea (<50ms) entre la cámara del estudiante y el dashboard docente.
    """

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.motores_fusion: Dict[str, MotorFusionAtencional] = {}

    async def connect(self, websocket: WebSocket, codigo_estudiante: str):
        await websocket.accept()
        if codigo_estudiante not in self.active_connections:
            self.active_connections[codigo_estudiante] = set()
            self.motores_fusion[codigo_estudiante] = MotorFusionAtencional()
        self.active_connections[codigo_estudiante].add(websocket)

    def disconnect(self, websocket: WebSocket, codigo_estudiante: str):
        if codigo_estudiante in self.active_connections:
            self.active_connections[codigo_estudiante].discard(websocket)
            if not self.active_connections[codigo_estudiante]:
                del self.active_connections[codigo_estudiante]
                if codigo_estudiante in self.motores_fusion:
                    del self.motores_fusion[codigo_estudiante]

    async def broadcast_to_student_room(self, codigo_estudiante: str, message: dict):
        if codigo_estudiante in self.active_connections:
            data = json.dumps(message)
            for connection in list(self.active_connections[codigo_estudiante]):
                try:
                    await connection.send_text(data)
                except Exception:
                    pass


manager = ConnectionManager()


@router.websocket("/ws/monitoreo/{codigo_estudiante}")
async def websocket_monitoreo_estudiante(websocket: WebSocket, codigo_estudiante: str):
    """
    Endpoint WebSocket de alta velocidad (<50ms) para transmisión bidireccional de telemetría biométrica.
    Recibe datos del fotograma del estudiante y transmite el IAI filtrado al portal del estudiante y al dashboard docente.
    """
    await manager.connect(websocket, codigo_estudiante)
    motor = manager.motores_fusion.get(codigo_estudiante, MotorFusionAtencional())

    try:
        while True:
            # Recibir payload JSON del cliente frontend
            raw_data = await websocket.receive_text()
            payload = json.loads(raw_data)

            # Extraer variables biométricas entrantes
            ear_actual = payload.get("ear", 0.28)
            ear_base = payload.get("ear_base", 0.28)
            yaw = payload.get("yaw", 0.0)
            pitch = payload.get("pitch", 0.0)
            varianza_hombros = payload.get("varianza_hombros", 0.02)

            # Procesar Fusión Multimodal con Filtro de Kalman 1D
            resultado_iai = motor.calcular_iai(
                ear_actual=ear_actual,
                ear_base=ear_base,
                yaw=yaw,
                pitch=pitch,
                varianza_hombros=varianza_hombros
            )

            # Preparar respuesta de telemetría procesada
            response_payload = {
                "codigo_estudiante": codigo_estudiante,
                "timestamp": payload.get("timestamp", None),
                "iai": resultado_iai["iai_filtrado"],
                "score_ocular": resultado_iai["score_ocular"],
                "score_postural": resultado_iai["score_postural"],
                "score_motriz": resultado_iai["score_motriz"],
                "alerta_reenganche": resultado_iai["iai_filtrado"] < 50.0
            }

            # Retransmitir a todos los clientes suscritos a la sala del estudiante (Estudiante + Dashboard Docente)
            await manager.broadcast_to_student_room(codigo_estudiante, response_payload)

    except WebSocketDisconnect:
        manager.disconnect(websocket, codigo_estudiante)
    except Exception as e:
        manager.disconnect(websocket, codigo_estudiante)
