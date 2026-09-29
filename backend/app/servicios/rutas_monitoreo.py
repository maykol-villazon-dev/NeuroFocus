from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from app.persistencia.config_db import get_db
from app.persistencia.modelos_orm import SesionMonitoreo, ParametrosCalibracion, Estudiante, EstadoSesion

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
