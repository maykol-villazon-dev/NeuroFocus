from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from collections import Counter
import uuid
import math

from app.persistencia.config_db import get_db
from app.persistencia.modelos_orm import (
    Usuario, SesionMonitoreo, ParametrosCalibracion, Estudiante, EstadoSesion, SubtipoTDAH,
    MetricaAtencional, EventoDesatencion, RolUsuario, ahora_bolivia
)
from app.autenticacion_rbac.rutas_auth import get_usuario_actual, obtener_permisos_usuario

router = APIRouter(prefix="/monitoreo", tags=["Monitoreo & Calibración (HU-03)"])


class CalibracionSchema(BaseModel):
    codigo_estudiante: str
    ear_base: float = 0.28
    pitch_neutral: float = 0.0
    yaw_neutral: float = 0.0
    roll_neutral: float = 0.0
    varianza_hombros_base: float = 0.05


@router.post("/calibracion", status_code=201)
async def registrar_calibracion(
    datos: CalibracionSchema,
    db: AsyncSession = Depends(get_db)
):
    """Registra o actualiza la rutina de calibración inicial de 30 segundos del estudiante (HU-03)."""
    # 1. Buscar el perfil de estudiante por código
    st_res = await db.execute(select(Estudiante).where(Estudiante.codigo_estudiante == datos.codigo_estudiante))
    student = st_res.scalars().first()
    if not student:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado con ese código")

    # 2. Buscar o crear la sesión de monitoreo activa
    ses_res = await db.execute(
        select(SesionMonitoreo)
        .options(selectinload(SesionMonitoreo.calibracion))
        .where(
            (SesionMonitoreo.id_estudiante == student.id_estudiante) & 
            (SesionMonitoreo.estado_sesion == EstadoSesion.EN_CURSO)
        )
    )
    sesion = ses_res.scalars().first()

    if not sesion:
        # Crear nueva sesión activa de 2 horas
        sesion = SesionMonitoreo(
            id_estudiante=student.id_estudiante,
            estado_sesion=EstadoSesion.EN_CURSO
        )
        db.add(sesion)
        await db.commit()
        await db.refresh(sesion)

    # 3. Registrar o actualizar parámetros de calibración
    cal_res = await db.execute(
        select(ParametrosCalibracion).where(ParametrosCalibracion.id_sesion == sesion.id_sesion)
    )
    calibracion = cal_res.scalars().first()

    if calibracion:
        calibracion.ear_base = datos.ear_base
        calibracion.pitch_neutral = datos.pitch_neutral
        calibracion.yaw_neutral = datos.yaw_neutral
        calibracion.roll_neutral = datos.roll_neutral
        calibracion.varianza_hombros_base = datos.varianza_hombros_base
        calibracion.fecha_calibracion = datetime.utcnow()
    else:
        calibracion = ParametrosCalibracion(
            id_sesion=sesion.id_sesion,
            ear_base=datos.ear_base,
            pitch_neutral=datos.pitch_neutral,
            yaw_neutral=datos.yaw_neutral,
            roll_neutral=datos.roll_neutral,
            varianza_hombros_base=datos.varianza_hombros_base
        )
        db.add(calibracion)

    await db.commit()
    return {
        "status": "success",
        "mensaje": "Calibración inicial de 30 segundos (HU-03) registrada correctamente.",
        "id_sesion": sesion.id_sesion,
        "parametros": {
            "ear_base": datos.ear_base,
            "pose_neutra": {"pitch": datos.pitch_neutral, "yaw": datos.yaw_neutral, "roll": datos.roll_neutral},
            "varianza_hombros": datos.varianza_hombros_base
        }
    }


@router.get("/estudiantes")
async def listar_estudiantes(
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """Retorna la lista de estudiantes filtrada estrictamente por los permisos RBAC del usuario solicitante."""
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)

    # Sincronización preventiva / Autocuración: asegurar que usuarios con rol ESTUDIANTE tengan su fila en 'estudiantes'
    try:
        res_u_est = await db.execute(
            select(Usuario).where(
                (Usuario.rol == "ESTUDIANTE") | (Usuario.rol == RolUsuario.ESTUDIANTE),
                Usuario.verificado == True
            )
        )
        usuarios_estudiantes = res_u_est.scalars().all()
        if usuarios_estudiantes:
            res_ids = await db.execute(select(Estudiante.id_usuario))
            ids_con_estudiante = set(r for r in res_ids.scalars().all() if r)

            hubo_curacion = False
            for u in usuarios_estudiantes:
                if u.id_usuario not in ids_con_estudiante:
                    cod_auto = f"EST-2026-{uuid.uuid4().hex[:3].upper()}"
                    nuevo_est = Estudiante(
                        id_estudiante=str(uuid.uuid4()),
                        codigo_estudiante=cod_auto,
                        nombre_completo=u.username,
                        edad=14,
                        grado_escolar="1º de Secundaria",
                        subtipo_tdah=SubtipoTDAH.F90_2,
                        diagnostico_observacion="Autocuración por rol verificado de Estudiante",
                        protegido=True,
                        id_usuario=u.id_usuario
                    )
                    db.add(nuevo_est)
                    hubo_curacion = True
            if hubo_curacion:
                await db.commit()
    except Exception as e:
        print(f"[WARN] Error en sincronización preventiva de estudiantes: {e}")

    query = (
        select(Estudiante)
        .options(selectinload(Estudiante.sesiones))
        .order_by(Estudiante.fecha_registro.desc())
    )

    if rol_str == "SUPERADMIN" or "VER_TODOS_ESTUDIANTES" in permisos:
        # Autorizado para supervisar a todos los estudiantes de la institución
        pass
    elif "VER_ESTUDIANTES_ASIGNADOS" in permisos:
        # Restricción tutelar / docente: solo alumnos formalmente vinculados
        query = query.where(Estudiante.id_tutor == usuario_actual.id_usuario)
    else:
        # Rol sin privilegios de visualización de estudiantes
        return []

    result = await db.execute(query)
    estudiantes = result.scalars().all()
    
    lista = []
    hubo_limpieza = False
    for est in estudiantes:
        cod_key = est.codigo_estudiante.strip().upper()
        # Verificar si realmente está conectado por WebSocket ahora mismo
        esta_en_linea = False
        try:
            from app.servicios.rutas_websockets import manager
            esta_en_linea = cod_key in manager.active_connections and len(manager.active_connections[cod_key]) > 0
        except Exception:
            pass

        # Si hay sesiones EN_CURSO pero NO está en línea en WebSocket, sanear en SQLite marcando FINALIZADA
        sesiones_en_curso = [s for s in est.sesiones if s.estado_sesion == EstadoSesion.EN_CURSO]
        if sesiones_en_curso and not esta_en_linea:
            for s in sesiones_en_curso:
                s.estado_sesion = EstadoSesion.FINALIZADA
                if not s.fecha_hora_fin:
                    s.fecha_hora_fin = ahora_bolivia()
            hubo_limpieza = True

        sesiones_con_datos = [s for s in est.sesiones if s.promedio_iai is not None]
        ultima_sesion = sorted(sesiones_con_datos, key=lambda s: str(s.fecha_hora_inicio or ''), reverse=True)[0] if sesiones_con_datos else None
        subtipo_str = est.subtipo_tdah.value if hasattr(est.subtipo_tdah, 'value') else str(est.subtipo_tdah)
        
        lista.append({
            "id_estudiante": est.id_estudiante,
            "codigo_estudiante": est.codigo_estudiante,
            "nombre_completo": est.nombre_completo,
            "edad": est.edad or 14,
            "grado_escolar": est.grado_escolar or "3º de Secundaria",
            "subtipo_tdah": subtipo_str,
            "diagnostico_observacion": est.diagnostico_observacion or "Seguimiento psicopedagógico institucional",
            "protegido": getattr(est, "protegido", True) if getattr(est, "protegido", None) is not None else True,
            "fecha_registro": est.fecha_registro.strftime("%Y-%m-%d %H:%M") if est.fecha_registro else None,
            "sesion_activa": esta_en_linea,
            "total_sesiones": len(sesiones_con_datos),
            "ultimo_iai": round(ultima_sesion.promedio_iai, 1) if (ultima_sesion and ultima_sesion.promedio_iai is not None) else None,
            "duracion_ultima_sesion": ultima_sesion.duracion_segundos if ultima_sesion else 0
        })

    if hubo_limpieza:
        try:
            await db.commit()
        except Exception:
            pass

    return lista


@router.get("/estudiantes/{codigo_estudiante}")
async def obtener_estudiante_por_codigo(
    codigo_estudiante: str,
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """Retorna los datos específicos de un estudiante por su código institucional."""
    cod_key = codigo_estudiante.strip().upper()
    query = (
        select(Estudiante)
        .options(selectinload(Estudiante.sesiones).selectinload(SesionMonitoreo.calibracion))
        .where(Estudiante.codigo_estudiante == cod_key)
    )
    result = await db.execute(query)
    est = result.scalars().first()
    if not est:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado.")

    # Control de acceso: Si no puede ver todos, verificar si es su tutorado
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)
    if rol_str != "SUPERADMIN" and "VER_TODOS_ESTUDIANTES" not in permisos:
        if "VER_ESTUDIANTES_ASIGNADOS" in permisos:
            if est.id_tutor != usuario_actual.id_usuario:
                raise HTTPException(status_code=403, detail="Acceso denegado: No tiene autorización para consultar los datos de este estudiante.")
        else:
            raise HTTPException(status_code=403, detail="Acceso denegado: No cuenta con permisos para ver estudiantes.")

    # Verificar si está realmente en línea en WebSockets
    esta_en_linea = False
    try:
        from app.servicios.rutas_websockets import manager
        esta_en_linea = cod_key in manager.active_connections and len(manager.active_connections[cod_key]) > 0
    except Exception:
        pass

    # Saneamiento de sesiones huérfanas en SQLite
    sesiones_en_curso = [s for s in est.sesiones if s.estado_sesion == EstadoSesion.EN_CURSO]
    if sesiones_en_curso and not esta_en_linea:
        for s in sesiones_en_curso:
            s.estado_sesion = EstadoSesion.FINALIZADA
            if not s.fecha_hora_fin:
                s.fecha_hora_fin = ahora_bolivia()
        try:
            await db.commit()
        except Exception:
            pass

    subtipo_str = est.subtipo_tdah.value if hasattr(est.subtipo_tdah, 'value') else str(est.subtipo_tdah)
    sesion_activa = next((s for s in est.sesiones if s.estado_sesion == EstadoSesion.EN_CURSO), None)
    sesiones_con_datos = [s for s in est.sesiones if s.promedio_iai is not None]
    ultima_sesion = sorted(sesiones_con_datos, key=lambda s: str(s.fecha_hora_inicio or ''), reverse=True)[0] if sesiones_con_datos else None

    return {
        "id_estudiante": est.id_estudiante,
        "codigo_estudiante": est.codigo_estudiante,
        "nombre_completo": est.nombre_completo,
        "edad": est.edad or 14,
        "grado_escolar": est.grado_escolar or "3º de Secundaria",
        "subtipo_tdah": subtipo_str,
        "diagnostico_observacion": est.diagnostico_observacion or "Seguimiento psicopedagógico institucional",
        "protegido": getattr(est, "protegido", True) if getattr(est, "protegido", None) is not None else True,
        "fecha_registro": est.fecha_registro.strftime("%Y-%m-%d %H:%M") if est.fecha_registro else None,
        "sesion_activa": esta_en_linea,
        "total_sesiones": len(sesiones_con_datos),
        "ultimo_iai": round(ultima_sesion.promedio_iai, 1) if (ultima_sesion and ultima_sesion.promedio_iai is not None) else None,
        "duracion_ultima_sesion": ultima_sesion.duracion_segundos if ultima_sesion else 0,
        "calibrado": (sesion_activa.calibracion is not None) if sesion_activa else False
    }


class PrivacidadEstudianteSchema(BaseModel):
    protegido: bool


@router.patch("/estudiantes/{codigo_estudiante}/privacidad")
async def actualizar_privacidad_estudiante(
    codigo_estudiante: str,
    datos: PrivacidadEstudianteSchema,
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """Actualiza la política de anonimización facial del estudiante (True = Malla 3D, False = Rostro Real)."""
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)
    if rol_str != "SUPERADMIN" and "GESTIONAR_PRIVACIDAD_ESTUDIANTE" not in permisos:
        raise HTTPException(status_code=403, detail="Acceso denegado: No posee el permiso GESTIONAR_PRIVACIDAD_ESTUDIANTE para alternar la máscara 3D.")

    cod_key = codigo_estudiante.strip().upper()
    st_res = await db.execute(select(Estudiante).where(Estudiante.codigo_estudiante == cod_key))
    student = st_res.scalars().first()
    if not student:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado con ese código.")

    student.protegido = datos.protegido
    await db.commit()
    await db.refresh(student)

    # Notificar inmediatamente en tiempo real a las salas activas de WebSocket
    try:
        from app.servicios.rutas_websockets import manager
        await manager.broadcast_to_room(student.codigo_estudiante, {
            "tipo": "CAMBIO_PRIVACIDAD",
            "protegido": student.protegido
        })
    except Exception as e:
        print(f"[WS PRIVACY NOTIFY ERROR] {e}")

    return {
        "status": "success",
        "codigo_estudiante": student.codigo_estudiante,
        "protegido": student.protegido,
        "mensaje": f"Modo de privacidad actualizado a: {'Anonimizado (Malla 3D)' if student.protegido else 'Rostro Real (Auditado)'}."
    }


class ActualizarEstudianteSchema(BaseModel):
    nombre_completo: Optional[str] = None
    grado_escolar: Optional[str] = None
    subtipo_tdah: Optional[str] = None
    diagnostico_observacion: Optional[str] = None
    edad: Optional[int] = None


@router.put("/estudiantes/{codigo_estudiante}")
async def actualizar_estudiante(
    codigo_estudiante: str,
    datos: ActualizarEstudianteSchema,
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """Permite actualizar el diagnóstico, subtipo, grado o notas clínicas de un estudiante."""
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)

    if datos.subtipo_tdah is not None and rol_str != "SUPERADMIN" and "EDITAR_CLASIFICACION_CLINICA" not in permisos:
        raise HTTPException(status_code=403, detail="Acceso denegado: La asignación o modificación de la clasificación DSM-5-TR es exclusiva del Gabinete Psicopedagógico.")

    if rol_str != "SUPERADMIN" and "EDITAR_PERFIL_ESTUDIANTE" not in permisos and "EDITAR_CLASIFICACION_CLINICA" not in permisos:
        raise HTTPException(status_code=403, detail="Acceso denegado: No posee permisos para modificar la ficha del estudiante.")

    query = select(Estudiante).where(Estudiante.codigo_estudiante == codigo_estudiante.strip().upper())
    result = await db.execute(query)
    est = result.scalars().first()
    if not est:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado.")

    if datos.nombre_completo is not None:
        est.nombre_completo = datos.nombre_completo
    if datos.grado_escolar is not None:
        est.grado_escolar = datos.grado_escolar
    if datos.edad is not None:
        est.edad = datos.edad
    if datos.diagnostico_observacion is not None:
        est.diagnostico_observacion = datos.diagnostico_observacion
    if datos.subtipo_tdah is not None:
        try:
            # Aceptar tanto F90_0, F90_1, F90_2, CONTROL, etc.
            est.subtipo_tdah = SubtipoTDAH(datos.subtipo_tdah)
        except ValueError:
            est.subtipo_tdah = SubtipoTDAH.CONTROL

    await db.commit()
    await db.refresh(est)

    subtipo_str = est.subtipo_tdah.value if hasattr(est.subtipo_tdah, 'value') else str(est.subtipo_tdah)
    return {
        "status": "success",
        "mensaje": "Datos del estudiante actualizados correctamente en la base de datos.",
        "estudiante": {
            "codigo_estudiante": est.codigo_estudiante,
            "nombre_completo": est.nombre_completo,
            "grado_escolar": est.grado_escolar,
            "subtipo_tdah": subtipo_str,
            "diagnostico_observacion": est.diagnostico_observacion
        }
    }


@router.post("/finalizar-sesion/{codigo_estudiante}")
async def finalizar_sesion_monitoreo(
    codigo_estudiante: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Finaliza formalmente la sesión de monitoreo activa de un estudiante,
    calcula la duración real transcurrida, promedia el IAI real y consolida la sesión.
    """
    st_res = await db.execute(
        select(Estudiante).where(Estudiante.codigo_estudiante == codigo_estudiante.strip().upper())
    )
    est = st_res.scalars().first()
    if not est:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado.")

    ses_res = await db.execute(
        select(SesionMonitoreo)
        .options(
            selectinload(SesionMonitoreo.metricas),
            selectinload(SesionMonitoreo.eventos)
        )
        .where(
            (SesionMonitoreo.id_estudiante == est.id_estudiante) &
            (SesionMonitoreo.estado_sesion == EstadoSesion.EN_CURSO)
        )
    )
    sesion = ses_res.scalars().first()
    if not sesion:
        return {"status": "ok", "mensaje": "No hay sesión en curso para finalizar."}

    ahora = datetime.utcnow()
    sesion.fecha_hora_fin = ahora
    duracion = int((ahora - sesion.fecha_hora_inicio).total_seconds())
    sesion.duracion_segundos = max(1, duracion)
    sesion.estado_sesion = EstadoSesion.FINALIZADA

    if sesion.metricas and len(sesion.metricas) > 0:
        promedio = sum(float(m.indice_iai) for m in sesion.metricas) / len(sesion.metricas)
        sesion.promedio_iai = round(promedio, 2)
    elif sesion.promedio_iai is None:
        try:
            from app.servicios.rutas_websockets import manager
            cod_key = codigo_estudiante.strip().upper()
            info = manager.sesion_activa_info.get(cod_key)
            if info and info.get("muestras", 0) > 0:
                sesion.promedio_iai = round(info["sum_iai"] / max(1, info["muestras"]), 2)
        except Exception:
            pass

    await db.commit()
    await db.refresh(sesion)

    return {
        "status": "success",
        "mensaje": "Sesión finalizada exitosamente.",
        "id_sesion": sesion.id_sesion,
        "duracion_segundos": sesion.duracion_segundos,
        "promedio_iai": sesion.promedio_iai
    }


@router.get("/estudiantes/{codigo_estudiante}/sesiones")
async def listar_sesiones_estudiante(
    codigo_estudiante: str,
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """
    Retorna la bitácora histórica completa de sesiones de un estudiante específico (HU-11 / Tesis Longitudinal).
    Permite visualizar la evolución cronológica y descargar el PDF individual de cada sesión.
    """
    st_res = await db.execute(
        select(Estudiante)
        .options(
            selectinload(Estudiante.sesiones).selectinload(SesionMonitoreo.metricas),
            selectinload(Estudiante.sesiones).selectinload(SesionMonitoreo.eventos)
        )
        .where(Estudiante.codigo_estudiante == codigo_estudiante.strip().upper())
    )
    est = st_res.scalars().first()
    if not est:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado.")

    # Control de acceso por estudiante
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)
    if rol_str != "SUPERADMIN" and "VER_TODOS_ESTUDIANTES" not in permisos:
        if "VER_ESTUDIANTES_ASIGNADOS" in permisos:
            if est.id_tutor != usuario_actual.id_usuario:
                raise HTTPException(status_code=403, detail="Acceso denegado: No tiene autorización para consultar las sesiones de este estudiante.")
        else:
            raise HTTPException(status_code=403, detail="Acceso denegado: No cuenta con permisos para ver estudiantes.")

    # Filtrar sesiones con datos reales (al menos 2 métricas o duración >= 10s con IAI)
    sesiones_validas = [
        s for s in est.sesiones
        if (s.metricas and len(s.metricas) >= 2) or (s.duracion_segundos and s.duracion_segundos >= 10 and s.promedio_iai is not None)
    ]

    # Ordenar cronológicamente (Sesión 1 -> Sesión 2 -> ...)
    sesiones_ordenadas = sorted(sesiones_validas, key=lambda s: str(s.fecha_hora_inicio or ''))

    nombres_eventos = {
        "SOMNOLENCIA": "Somnolencia",
        "MIRADA_FUERA": "Mirada Fuera",
        "INQUIETUD_MOTRIZ": "Inquietud Motriz",
        "FATIGA_PALPEBRAL": "Fatiga Palpebral",
        "ABANDONO_PUESTO": "Abandono de Puesto",
        "BOSTEZO_FATIGA": "Bostezo / Fatiga",
        "DISTRACTOR_EXTERNO": "Distractor Externo",
        "MIRADA_PERDIDA": "Mirada Perdida (Staring)",
        "HUNDIMIENTO_POSTURAL": "Hundimiento Postural"
    }

    def fmt_dt(val):
        if not val:
            return "--"
        if isinstance(val, str):
            try:
                partes = val.replace("T", " ").split(" ")
                if len(partes) >= 2:
                    d_parts = partes[0].split("-")
                    if len(d_parts) == 3:
                        return f"{d_parts[2]}/{d_parts[1]}/{d_parts[0]} {partes[1][:5]}"
                return val[:16].replace("T", " ")
            except Exception:
                return val[:16].replace("T", " ")
        try:
            return val.strftime("%d/%m/%Y %H:%M")
        except Exception:
            return str(val)[:16]

    resultado = []
    for idx, s in enumerate(sesiones_ordenadas, start=1):
        # Duración formateada
        dur = s.duracion_segundos or (len(s.metricas) // 4 if s.metricas else 0)
        minutos = dur // 60
        segundos = dur % 60
        dur_str = f"{minutos}m {segundos}s" if minutos > 0 else f"{segundos}s"

        # IAI Promedio
        if s.promedio_iai is not None:
            iai_prom = round(float(s.promedio_iai), 1)
        elif s.metricas and len(s.metricas) > 0:
            iai_prom = round(sum(float(m.indice_iai) for m in s.metricas) / len(s.metricas), 1)
        else:
            iai_prom = 0.0

        # Sub-scores biométricos calculados con fórmulas reales de tesis
        if s.metricas and len(s.metricas) > 0:
            ears = [float(m.valor_ear) for m in s.metricas]
            sc_oc = round(min(100.0, max(0.0, (sum(ears) / max(1, len(ears))) / 0.28 * 100.0)), 1)
            scores_p = []
            scores_m = []
            for m in s.metricas:
                exp_cef = -((float(m.angulo_yaw) ** 2) / (2.0 * (25.0 ** 2)) + (float(m.angulo_pitch) ** 2) / (2.0 * (20.0 ** 2)))
                scores_p.append(min(100.0, max(0.0, 100.0 * math.exp(exp_cef))))
                delta_v = max(0.0, float(m.varianza_cinematica) - 0.02)
                scores_m.append(min(100.0, max(0.0, 100.0 * math.exp(-(delta_v / (2.0 * (0.05 ** 2)))))))
            sc_pos = round(sum(scores_p) / max(1, len(scores_p)), 1)
            sc_mot = round(sum(scores_m) / max(1, len(scores_m)), 1)
        else:
            sc_oc, sc_pos, sc_mot = 0.0, 0.0, 0.0

        # Resumen de eventos
        if s.eventos and len(s.eventos) > 0:
            conteo = Counter(e.tipo_evento.value if hasattr(e.tipo_evento, 'value') else str(e.tipo_evento) for e in s.eventos)
            resumen_ev = [f"{cnt} {nombres_eventos.get(t, t)}" for t, cnt in conteo.items()]
        else:
            resumen_ev = ["Atención Continua (Sin incidentes)"]

        estado_lectura = "Atención Alta" if iai_prom >= 70 else ("Atención Moderada" if iai_prom >= 50 else "Desatención Crítica")

        resultado.append({
            "numero_sesion": idx,
            "id_sesion": s.id_sesion,
            "fecha_inicio": fmt_dt(s.fecha_hora_inicio),
            "fecha_fin": fmt_dt(s.fecha_hora_fin),
            "duracion_segundos": dur,
            "duracion_formateada": dur_str,
            "promedio_iai": iai_prom,
            "estado_sesion": s.estado_sesion.value if hasattr(s.estado_sesion, 'value') else str(s.estado_sesion),
            "estado_lectura": estado_lectura,
            "total_metricas": len(s.metricas) if s.metricas else 0,
            "total_desatenciones": len(s.eventos) if s.eventos else 0,
            "eventos_resumen": resumen_ev,
            "score_ocular": sc_oc,
            "score_postural": sc_pos,
            "score_motriz": sc_mot,
            "url_pdf": f"/api/v1/reportes/sesion/{s.id_sesion}/descargar"
        })

    return resultado

