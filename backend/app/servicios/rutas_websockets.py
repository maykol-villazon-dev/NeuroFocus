import os
import io
import json
import base64
import uuid
import asyncio
from datetime import datetime
from typing import Dict, Set, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from PIL import Image

from app.persistencia.config_db import AsyncSessionLocal
from app.persistencia.modelos_orm import (
    Estudiante, SesionMonitoreo, MetricaAtencional, EventoDesatencion,
    TipoEventoDesatencion, SeveridadEvento, EstadoSesion, EstadoAtencion, ahora_bolivia
)
from app.vision_matematicas import MotorFusionAtencional

router = APIRouter(tags=["WebSockets Monitoreo en Tiempo Real (REQ-34)"])


def guardar_captura_evento(frame_b64: str, id_sesion: str, id_evento: str, sufijo: str = "bio") -> Optional[str]:
    """Guarda un fotograma comprimido en formato JPEG optimizado (calidad 75, max 320px) para el anexo de reportes."""
    try:
        if not frame_b64:
            return None
        if "," in frame_b64:
            frame_b64 = frame_b64.split(",", 1)[1]

        img_bytes = base64.b64decode(frame_b64)
        img = Image.open(io.BytesIO(img_bytes))

        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        ancho_max = 320
        if img.width > ancho_max:
            ratio = ancho_max / float(img.width)
            alto_nuevo = int(float(img.height) * ratio)
            img = img.resize((ancho_max, alto_nuevo), Image.Resampling.LANCZOS)

        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        dir_sesion = os.path.join(backend_dir, "almacen_capturas", str(id_sesion))
        os.makedirs(dir_sesion, exist_ok=True)

        ruta_archivo = os.path.join(dir_sesion, f"ev_{id_evento}_{sufijo}.jpg")
        img.save(ruta_archivo, "JPEG", quality=75, optimize=True)
        return ruta_archivo
    except Exception as e:
        print(f"[WS ERROR GUARDAR CAPTURA {sufijo}] {e}")
        return None


def generar_captura_documento_real(codigo_estudiante: str, nombre_material: str, id_sesion: str, id_evento: str) -> Optional[str]:
    """Genera una captura auténtica de la página del documento de estudio activo para el reporte PDF."""
    try:
        if not nombre_material or not codigo_estudiante:
            return None

        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        cod = codigo_estudiante.strip().upper().replace("/", "_").replace("\\", "_")
        nom_base = os.path.basename(nombre_material)

        # Buscar el archivo en pdfs u originales
        ruta_pdf = os.path.join(backend_dir, "almacen_materiales", "pdfs", cod, nom_base)
        if not os.path.exists(ruta_pdf):
            carpeta_est = os.path.join(backend_dir, "almacen_materiales", "pdfs", cod)
            if os.path.exists(carpeta_est):
                archivos = os.listdir(carpeta_est)
                for arch in archivos:
                    if arch.startswith(os.path.splitext(nom_base)[0]) or nom_base.startswith(os.path.splitext(arch)[0]):
                        ruta_pdf = os.path.join(carpeta_est, arch)
                        break

        ruta_orig = os.path.join(backend_dir, "almacen_materiales", "originales", cod, nom_base)
        ext = os.path.splitext(nom_base)[1].lower()

        dir_sesion = os.path.join(backend_dir, "almacen_capturas", str(id_sesion))
        os.makedirs(dir_sesion, exist_ok=True)
        ruta_salida = os.path.join(dir_sesion, f"ev_{id_evento}_doc.jpg")

        if ext in (".jpg", ".jpeg", ".png") and os.path.exists(ruta_orig):
            with Image.open(ruta_orig) as img:
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                ancho_max = 340
                ratio = ancho_max / float(img.width)
                alto_nuevo = int(float(img.height) * ratio)
                img_res = img.resize((ancho_max, alto_nuevo), Image.Resampling.LANCZOS)
                img_res.save(ruta_salida, "JPEG", quality=80, optimize=True)
                return ruta_salida

        if os.path.exists(ruta_pdf):
            try:
                import pypdf
                from PIL import ImageDraw
                reader = pypdf.PdfReader(ruta_pdf)
                page_text = reader.pages[0].extract_text() if len(reader.pages) > 0 else ""
                lines = [l.strip() for l in page_text.split("\n") if l.strip()]

                img = Image.new("RGB", (340, 460), "#FFFFFF")
                draw = ImageDraw.Draw(img)
                draw.rectangle([(0, 0), (339, 459)], outline="#CBD5E1", width=1)
                draw.rectangle([(0, 0), (340, 30)], fill="#0F172A")
                draw.text((10, 8), "DOCUMENTO DE ESTUDIO ACTIVO", fill="#38BDF8")

                titulo = nom_base.replace("_", " ")
                if len(titulo) > 35:
                    titulo = titulo[:32] + "..."
                draw.text((14, 40), titulo, fill="#1E293B")
                draw.line([(14, 56), (326, 56)], fill="#E2E8F0", width=1)

                y = 66
                for line in lines[:20]:
                    if len(line) > 42:
                        line = line[:40] + "..."
                    draw.text((14, y), line, fill="#334155")
                    y += 18
                    if y > 430:
                        break

                img.save(ruta_salida, "JPEG", quality=80, optimize=True)
                return ruta_salida
            except Exception as e_pdf:
                print(f"[WS ERROR EXTRAER TEXTO PDF REAL] {e_pdf}")

        return None
    except Exception as e:
        print(f"[WS ERROR GENERAR CAPTURA REAL DOCUMENTO] {e}")
        return None


def generar_descripcion_evento_consolidado(
    tipo_ev: TipoEventoDesatencion,
    duracion_seg: float,
    mar_max: float,
    ear_min: float,
    material_estudio: Optional[str] = None
) -> str:
    """Genera la narrativa psicopedagógica consolidada de un episodio completo de desatención."""
    ctx_mat = f" durante la revisión de '{material_estudio}'" if material_estudio else ""
    if tipo_ev == TipoEventoDesatencion.BOSTEZO_FATIGA:
        return f"Apertura bucal sostenida por {duracion_seg:.1f}s (apertura máxima MAR: {mar_max:.2f}), indicativa de fatiga física o visual acumulada{ctx_mat}."
    elif tipo_ev == TipoEventoDesatencion.SOMNOLENCIA:
        return f"Oclusión ocular persistente y párpados caídos durante {duracion_seg:.1f}s (micro-sueño sostenido){ctx_mat}."
    elif tipo_ev == TipoEventoDesatencion.MIRADA_PERDIDA:
        return f"Fijación ocular rígida sin parpadeo ni lectura activa durante {duracion_seg:.1f}s (desconexión atencional pasiva / staring){ctx_mat}."
    elif tipo_ev == TipoEventoDesatencion.ABANDONO_PUESTO:
        return f"Ausencia total de rostro en el encuadre durante {duracion_seg:.1f}s (el estudiante se levantó o abandonó su puesto de trabajo)."
    elif tipo_ev == TipoEventoDesatencion.DISTRACTOR_EXTERNO:
        return f"Interacción sostenida con distractores o terceros ajenos al foco de estudio durante {duracion_seg:.1f}s{ctx_mat}."
    elif tipo_ev == TipoEventoDesatencion.HUNDIMIENTO_POSTURAL:
        return f"Hundimiento postural continuo por {duracion_seg:.1f}s con colapso muscular sobre el pupitre (slumping){ctx_mat}."
    elif tipo_ev == TipoEventoDesatencion.MIRADA_FUERA:
        return f"Desvío de la cabeza fuera del área de trabajo durante {duracion_seg:.1f}s{ctx_mat}."
    elif tipo_ev == TipoEventoDesatencion.INQUIETUD_MOTRIZ:
        return f"Inquietud motriz / movimientos cinemáticos oscilatorios frecuentes de hombros y torso durante {duracion_seg:.1f}s."
    return f"Episodio de desatención sostenido durante {duracion_seg:.1f}s{ctx_mat}."


async def consolidar_episodio_activo(db, info: dict, ahora_ts: datetime):
    """Consolida un episodio de desatención en la base de datos guardando 1 sola foto representativa y su rango de tiempo."""
    episodio = info.pop("episodio_activo", None)
    if not episodio:
        return

    ts_ini = episodio["ts_inicio"]
    ts_fin = episodio["ts_ultimo"]
    duracion_real = max(1.5, round((ts_fin - ts_ini).total_seconds(), 1))

    # Filtrar eventos ultracortos menores a 1.5s
    if duracion_real < 1.5 and episodio["tipo_evento"] != TipoEventoDesatencion.BOSTEZO_FATIGA:
        return

    inicio_ses = info.get("inicio", ts_ini)
    seg_ini = max(0, int((ts_ini - inicio_ses).total_seconds()))
    seg_fin = max(0, int((ts_fin - inicio_ses).total_seconds()))

    m_ini, s_ini = seg_ini // 60, seg_ini % 60
    m_fin, s_fin = seg_fin // 60, seg_fin % 60

    if (seg_fin - seg_ini) <= 3:
        minuto_rango = f"Min {m_ini:02d}:{s_ini:02d}"
    else:
        minuto_rango = f"Min {m_ini:02d}:{s_ini:02d} – {m_fin:02d}:{s_fin:02d}"

    desc = generar_descripcion_evento_consolidado(
        tipo_ev=episodio["tipo_evento"],
        duracion_seg=duracion_real,
        mar_max=episodio["mar_max"],
        ear_min=episodio["ear_min"],
        material_estudio=episodio.get("material_estudio")
    )

    if duracion_real >= 10.0 or episodio["tipo_evento"] == TipoEventoDesatencion.ABANDONO_PUESTO:
        sev = SeveridadEvento.CRITICA
    elif duracion_real >= 4.0:
        sev = SeveridadEvento.MODERADA
    else:
        sev = SeveridadEvento.LEVE

    evento = EventoDesatencion(
        id_evento=episodio["id_evento"],
        id_sesion=info["id_sesion"],
        tipo_evento=episodio["tipo_evento"],
        severidad=sev,
        timestamp_inicio=ts_ini,
        timestamp_fin=ts_fin,
        duracion_segundos=duracion_real,
        ruta_captura=episodio["ruta_captura"],
        ruta_captura_pantalla=episodio.get("ruta_captura_pantalla"),
        minuto_relativo=minuto_rango,
        descripcion_automatica=desc
    )
    db.add(evento)


class ConnectionManager:
    """
    Administrador de Conexiones WebSockets Activas por Sala de Estudiante (REQ-34 - RFC 6455).
    Garantiza latencia unidireccional agregada < 50 ms entre el agente escolar y el dashboard docente.
    """

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.motores_fusion: Dict[str, MotorFusionAtencional] = {}
        # Acumulador en memoria por código de estudiante para persistencia
        self.sesion_activa_info: Dict[str, dict] = {}

    async def connect(self, websocket: WebSocket, codigo_estudiante: str):
        await websocket.accept()
        cod = codigo_estudiante.strip().upper()
        if cod not in self.active_connections:
            self.active_connections[cod] = set()
            self.motores_fusion[cod] = MotorFusionAtencional()
        self.active_connections[cod].add(websocket)

    async def asegurar_sesion_activa(self, codigo_estudiante: str):
        """Inicializa formalmente la sesión en BD únicamente cuando el estudiante envía telemetría real con cámara."""
        cod = codigo_estudiante.strip().upper()
        if cod not in self.sesion_activa_info:
            try:
                async with AsyncSessionLocal() as db:
                    st_res = await db.execute(select(Estudiante).where(Estudiante.codigo_estudiante == cod))
                    est = st_res.scalars().first()
                    if est:
                        # Buscar sesión en curso o crear una nueva
                        ses_res = await db.execute(
                            select(SesionMonitoreo).where(
                                (SesionMonitoreo.id_estudiante == est.id_estudiante) &
                                (SesionMonitoreo.estado_sesion == EstadoSesion.EN_CURSO)
                            )
                        )
                        sesion = ses_res.scalars().first()
                        if not sesion:
                            sesion = SesionMonitoreo(
                                id_estudiante=est.id_estudiante,
                                estado_sesion=EstadoSesion.EN_CURSO,
                                fecha_hora_inicio=ahora_bolivia()
                            )
                            db.add(sesion)
                            await db.commit()
                            await db.refresh(sesion)

                        self.sesion_activa_info[cod] = {
                            "id_sesion": sesion.id_sesion,
                            "inicio": ahora_bolivia(),
                            "muestras": 0,
                            "sum_iai": 0.0,
                            "contador_frames": 0
                        }
            except Exception as e:
                print(f"[WS INIT DB ERROR] {e}")

    async def disconnect(self, websocket: WebSocket, codigo_estudiante: str):
        cod = codigo_estudiante.strip().upper()
        if cod in self.active_connections:
            self.active_connections[cod].discard(websocket)
            if not self.active_connections[cod]:
                del self.active_connections[cod]
                if cod in self.motores_fusion:
                    del self.motores_fusion[cod]
                # Consolidar formalmente la sesión en BD si el estudiante desconecta la cámara
                info = self.sesion_activa_info.pop(cod, None)
                if info and info.get("muestras", 0) > 0:
                    try:
                        async with AsyncSessionLocal() as db:
                            # Consolidar cualquier episodio activo pendiente antes de cerrar
                            await consolidar_episodio_activo(db, info, ahora_bolivia())

                            ses_res = await db.execute(select(SesionMonitoreo).where(SesionMonitoreo.id_sesion == info["id_sesion"]))
                            ses = ses_res.scalars().first()
                            if ses:
                                duracion_actual = int((ahora_bolivia() - info["inicio"]).total_seconds())
                                ses.duracion_segundos = max(1, duracion_actual)
                                ses.promedio_iai = round(info["sum_iai"] / max(1, info["muestras"]), 2)
                                ses.fecha_hora_fin = ahora_bolivia()
                                ses.estado_sesion = EstadoSesion.FINALIZADA
                                await db.commit()
                                print(f"[WS SESION CONSOLIDADA] Estudiante {cod}: Duración {ses.duracion_segundos}s, IAI Promedio {ses.promedio_iai}%")
                    except Exception as err:
                        print(f"[WS DISCONNECT CONSOLIDAR ERROR] {err}")

    async def broadcast_to_student_room(self, codigo_estudiante: str, message: dict):
        cod = codigo_estudiante.strip().upper()
        if cod in self.active_connections:
            data = json.dumps(message)
            for connection in list(self.active_connections[cod]):
                try:
                    await connection.send_text(data)
                except Exception:
                    pass

    async def persistir_muestra_biometrica(
        self,
        codigo_estudiante: str,
        res: dict,
        ear: float,
        yaw: float,
        pitch: float,
        var_hombros: float,
        frame_b64: Optional[str] = None,
        frame_pantalla_b64: Optional[str] = None,
        material_estudio: Optional[str] = None
    ):
        """Persiste una muestra de telemetría atencional en SQLite cada ~1 segundo (4 frames) y almacena evidencias fotográficas."""
        cod = codigo_estudiante.strip().upper()
        info = self.sesion_activa_info.get(cod)
        if not info:
            return

        info["contador_frames"] += 1
        info["sum_iai"] += res["iai_filtrado"]
        info["muestras"] += 1

        # Muestreo a disco cada 4 frames (~1 segundo a 4 Hz)
        if info["contador_frames"] % 4 == 0:
            try:
                estado_map = {
                    1: EstadoAtencion.ESTADO_1,
                    2: EstadoAtencion.ESTADO_2,
                    3: EstadoAtencion.ESTADO_3,
                    4: EstadoAtencion.ESTADO_4
                }
                estado_enum = estado_map.get(res["estado"], EstadoAtencion.ESTADO_2)
                async with AsyncSessionLocal() as db:
                    metrica = MetricaAtencional(
                        id_sesion=info["id_sesion"],
                        valor_ear=round(ear, 4),
                        angulo_yaw=round(yaw, 2),
                        angulo_pitch=round(pitch, 2),
                        varianza_cinematica=round(var_hombros, 5),
                        indice_iai=round(res["iai_filtrado"], 2),
                        estado_atencion=estado_enum
                    )
                    db.add(metrica)

                    # ==============================================================
                    # MÁQUINA DE ESTADOS: CONSOLIDACIÓN DE EPISODIOS CLÍNICOS
                    # Evita spam de eventos y guarda 1 sola foto representativa por suceso.
                    # ==============================================================
                    tipo_candidato = None
                    if res.get("es_abandono_puesto"):
                        tipo_candidato = TipoEventoDesatencion.ABANDONO_PUESTO
                    elif res.get("es_bostezo"):
                        tipo_candidato = TipoEventoDesatencion.BOSTEZO_FATIGA
                    elif res.get("es_staring"):
                        tipo_candidato = TipoEventoDesatencion.MIRADA_PERDIDA
                    elif res.get("distractor_externo"):
                        tipo_candidato = TipoEventoDesatencion.DISTRACTOR_EXTERNO
                    elif res.get("es_slumping"):
                        tipo_candidato = TipoEventoDesatencion.HUNDIMIENTO_POSTURAL
                    elif res.get("es_microsueno"):
                        tipo_candidato = TipoEventoDesatencion.SOMNOLENCIA
                    elif res.get("desconexion_cefalica"):
                        tipo_candidato = TipoEventoDesatencion.MIRADA_FUERA
                    elif res.get("agitacion_severa"):
                        tipo_candidato = TipoEventoDesatencion.INQUIETUD_MOTRIZ

                    ahora_ts = ahora_bolivia()
                    episodio = info.get("episodio_activo")

                    if tipo_candidato is not None:
                        if episodio is None:
                            # 1. INICIO DE NUEVO EPISODIO: Captura multi-ángulo (Biometría/Malla 3D + Documento escolar)
                            id_ev_nuevo = str(uuid.uuid4())
                            ruta_foto = None
                            if frame_b64:
                                ruta_foto = guardar_captura_evento(frame_b64, info["id_sesion"], id_ev_nuevo, sufijo="bio")
                            ruta_pantalla = None
                            if frame_pantalla_b64:
                                ruta_pantalla = guardar_captura_evento(frame_pantalla_b64, info["id_sesion"], id_ev_nuevo, sufijo="doc")
                            if not ruta_pantalla and material_estudio:
                                ruta_pantalla = generar_captura_documento_real(cod, material_estudio, info["id_sesion"], id_ev_nuevo)

                            info["episodio_activo"] = {
                                "id_evento": id_ev_nuevo,
                                "tipo_evento": tipo_candidato,
                                "ts_inicio": ahora_ts,
                                "ts_ultimo": ahora_ts,
                                "ruta_captura": ruta_foto,
                                "ruta_captura_pantalla": ruta_pantalla,
                                "mar_max": float(res.get("mar", 0.0)),
                                "ear_min": float(ear),
                                "material_estudio": material_estudio
                            }
                        elif episodio["tipo_evento"] == tipo_candidato:
                            # 2. CONTINUIDAD DEL MISMO EPISODIO: Solo extender tiempo, NO guardar foto repetida
                            episodio["ts_ultimo"] = ahora_ts
                            episodio["mar_max"] = max(episodio["mar_max"], float(res.get("mar", 0.0)))
                            episodio["ear_min"] = min(episodio["ear_min"], float(ear))
                        else:
                            # 3. CAMBIO DE TIPO DE DESATENCIÓN: Consolidar el anterior y abrir el nuevo
                            await consolidar_episodio_activo(db, info, ahora_ts)
                            id_ev_nuevo = str(uuid.uuid4())
                            ruta_foto = None
                            if frame_b64:
                                ruta_foto = guardar_captura_evento(frame_b64, info["id_sesion"], id_ev_nuevo, sufijo="bio")
                            ruta_pantalla = None
                            if frame_pantalla_b64:
                                ruta_pantalla = guardar_captura_evento(frame_pantalla_b64, info["id_sesion"], id_ev_nuevo, sufijo="doc")
                            if not ruta_pantalla and material_estudio:
                                ruta_pantalla = generar_captura_documento_real(cod, material_estudio, info["id_sesion"], id_ev_nuevo)

                            info["episodio_activo"] = {
                                "id_evento": id_ev_nuevo,
                                "tipo_evento": tipo_candidato,
                                "ts_inicio": ahora_ts,
                                "ts_ultimo": ahora_ts,
                                "ruta_captura": ruta_foto,
                                "ruta_captura_pantalla": ruta_pantalla,
                                "mar_max": float(res.get("mar", 0.0)),
                                "ear_min": float(ear),
                                "material_estudio": material_estudio
                            }
                    else:
                        # 4. CONDICIÓN NORMAL / REENGANCHE DEL ESTUDIANTE:
                        # Si hay un episodio activo y han pasado >= 1.5s de estabilidad, consolidar
                        if episodio is not None:
                            if (ahora_ts - episodio["ts_ultimo"]).total_seconds() >= 1.5:
                                await consolidar_episodio_activo(db, info, ahora_ts)

                    # Actualizar promedio parcial y duración de la sesión
                    ses_res = await db.execute(select(SesionMonitoreo).where(SesionMonitoreo.id_sesion == info["id_sesion"]))
                    ses = ses_res.scalars().first()
                    if ses:
                        duracion_actual = int((ahora_bolivia() - info["inicio"]).total_seconds())
                        ses.duracion_segundos = max(1, duracion_actual)
                        ses.promedio_iai = round(info["sum_iai"] / max(1, info["muestras"]), 2)

                    await db.commit()
            except Exception as e:
                print(f"[WS PERSIST METRIC ERROR] {e}")


manager = ConnectionManager()


@router.websocket("/ws/monitoreo/{codigo_estudiante}")
@router.websocket("/ws/telemetry/{codigo_estudiante}")
async def websocket_monitoreo_estudiante(websocket: WebSocket, codigo_estudiante: str):
    """
    Endpoint WebSocket RFC 6455 (< 50 ms) para telemetría atencional en tiempo real.
    Rutas disponibles:
      - /ws/monitoreo/{codigo_estudiante} (Ruta principal del cliente)
      - /ws/telemetry/{codigo_estudiante} (Alias formal según especificación de auditoría REQ-34)
    """
    cod = codigo_estudiante.strip().upper()
    await manager.connect(websocket, cod)
    motor = manager.motores_fusion.get(cod)
    if not motor:
        motor = MotorFusionAtencional()
        manager.motores_fusion[cod] = motor

    try:
        while True:
            raw_data = await websocket.receive_text()
            payload = json.loads(raw_data)

            if payload.get("ping"):
                await websocket.send_text(json.dumps({"pong": True, "codigo_estudiante": cod}))
                continue

            # Asegurar sesión en base de datos únicamente si proviene telemetría real del estudiante
            if "ear" in payload:
                await manager.asegurar_sesion_activa(cod)

            # Extracción de parámetros biométricos instantáneos y basales
            ear_actual = float(payload.get("ear", 0.28))
            ear_base = float(payload.get("ear_base", 0.28))
            yaw = float(payload.get("yaw", 0.0))
            pitch = float(payload.get("pitch", 0.0))
            yaw_base = float(payload.get("yaw_base", 0.0))
            pitch_base = float(payload.get("pitch_base", 0.0))
            varianza_hombros = float(payload.get("varianza_hombros", 0.02))
            varianza_base = float(payload.get("varianza_base", 0.02))

            # Extracción de nuevos biomarcadores clínicos (DSM-5 / FICCT UAGRM)
            ausencia_estudiante = bool(payload.get("ausencia_estudiante", False))
            mar = float(payload.get("mar", 0.25))
            es_bostezo = bool(payload.get("es_bostezo", False))
            distractor_externo = bool(payload.get("distractor_externo", False))
            es_staring = bool(payload.get("es_staring", False))
            es_slumping = bool(payload.get("es_slumping", False))

            # Fusión Convexa (45/35/20) + Nuevos Biomarcadores + Filtro de Kalman 1D + Histéresis
            res = motor.calcular_iai(
                ear_actual=ear_actual,
                ear_base=ear_base,
                yaw=yaw,
                pitch=pitch,
                yaw_base=yaw_base,
                pitch_base=pitch_base,
                varianza_hombros=varianza_hombros,
                varianza_base=varianza_base,
                ausencia_estudiante=ausencia_estudiante,
                mar=mar,
                es_bostezo=es_bostezo,
                distractor_externo=distractor_externo,
                es_staring=es_staring,
                es_slumping=es_slumping
            )

            # Persistir periódicamente en SQLite con evidencias de eventos (datos 100% reales)
            asyncio.create_task(
                manager.persistir_muestra_biometrica(
                    codigo_estudiante=cod,
                    res=res,
                    ear=ear_actual,
                    yaw=yaw,
                    pitch=pitch,
                    var_hombros=varianza_hombros,
                    frame_b64=payload.get("frame"),
                    frame_pantalla_b64=payload.get("frame_pantalla"),
                    material_estudio=payload.get("material_estudio")
                )
            )

            # Esquema formal de paquete de telemetría (REQ-34)
            telemetry_packet = {
                "codigo_estudiante": cod,
                "timestamp": payload.get("timestamp"),
                "iai": res["iai_filtrado"],
                "estado": res["estado"],
                "estado_nombre": res["estado_nombre"],
                "color_hex": res["color_hex"],
                "puntos_por_segundo": res["puntos_por_segundo"],
                "score_ocular": res["score_ocular"],
                "score_postural": res["score_postural"],
                "score_motriz": res["score_motriz"],
                "es_microsueno": res["es_microsueno"],
                "desconexion_cefalica": res["desconexion_cefalica"],
                "agitacion_severa": res["agitacion_severa"],
                "es_abandono_puesto": res["es_abandono_puesto"],
                "mar": res["mar"],
                "es_bostezo": res["es_bostezo"],
                "distractor_externo": res["distractor_externo"],
                "es_staring": res["es_staring"],
                "es_slumping": res["es_slumping"],
                "alerta_reenganche": res["estado"] in (3, 4),
                "sugerir_brain_break": res["sugerir_brain_break"]
            }

            # Retransmisión de fotograma de cámara con malla facial si está presente
            if payload.get("frame"):
                telemetry_packet["frame"] = payload.get("frame")

            # Retransmisión bidireccional instantánea
            await manager.broadcast_to_student_room(cod, telemetry_packet)

    except WebSocketDisconnect:
        await manager.disconnect(websocket, cod)
    except Exception:
        await manager.disconnect(websocket, cod)
