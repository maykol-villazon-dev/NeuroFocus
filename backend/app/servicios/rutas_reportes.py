import os
import uuid
import math
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.persistencia.config_db import get_db
from app.persistencia.modelos_orm import (
    Usuario, Estudiante, SesionMonitoreo, MetricaAtencional, EventoDesatencion,
    ReportePsicopedagogico, SubtipoTDAH
)
from app.autenticacion_rbac.rutas_auth import get_usuario_actual, obtener_permisos_usuario
from app.servicios.generador_reportes import generar_pdf_reporte_psicopedagogico

router = APIRouter(prefix="/reportes", tags=["Reportes Psicopedagógicos PDF (REQ-21, REQ-36)"])


async def compilar_pdf_reporte(sesion: Optional[SesionMonitoreo], estudiante: Estudiante, db: AsyncSession, resumido: bool = False) -> Response:
    """Función unificada para compilar el PDF de una sesión específica o de la más reciente con ReportLab Platypus."""
    nombre_completo = estudiante.nombre_completo
    grado = estudiante.grado_escolar or "3º de Secundaria"
    cod_est = estudiante.codigo_estudiante

    if estudiante.subtipo_tdah == SubtipoTDAH.F90_0:
        subtipo_texto = "F90.0 (Predominio Déficit de Atención)"
    elif estudiante.subtipo_tdah == SubtipoTDAH.F90_1:
        subtipo_texto = "F90.1 (Predominio Hiperactividad/Impulsividad)"
    elif estudiante.subtipo_tdah in (SubtipoTDAH.CONTROL, SubtipoTDAH.SIN_TDAH):
        subtipo_texto = "Sin diagnóstico previo (Grupo Control / Neurotípico)"
    else:
        subtipo_texto = "F90.2 (Presentación Combinada)"

    duracion_segundos = 0
    id_sesion_str = str(uuid.uuid4())
    iai_promedio = None
    desviacion_iai = None
    t1_seg = 0
    t2_seg = 0
    t3_seg = 0
    t4_seg = 0
    total_inquietud = 0
    score_ocular = None
    score_postural = None
    score_motriz = None
    eventos_lista = []

    if sesion:
        id_sesion_str = sesion.id_sesion
        if sesion.duracion_segundos and sesion.duracion_segundos > 0:
            duracion_segundos = sesion.duracion_segundos

        if sesion.metricas and len(sesion.metricas) > 0:
            iais = [float(m.indice_iai) for m in sesion.metricas]
            total_frames = len(iais)
            iai_promedio = sum(iais) / total_frames

            # Varianza y desviación típica (REQ-21)
            varianza = sum((x - iai_promedio) ** 2 for x in iais) / max(1, total_frames - 1)
            desviacion_iai = math.sqrt(varianza)

            # Clasificación formal de los 4 estados
            n1 = sum(1 for x in iais if x >= 80.0)
            n2 = sum(1 for x in iais if 60.0 <= x < 80.0)
            n3 = sum(1 for x in iais if 40.0 <= x < 60.0)
            n4 = sum(1 for x in iais if x < 40.0)

            # Tiempos en segundos Tk = Nk / 60 (REQ-21)
            factor_escala = (duracion_segundos / total_frames) if duracion_segundos > 0 else (1.0 / 60.0)
            t1_seg = int(round(n1 * factor_escala))
            t2_seg = int(round(n2 * factor_escala))
            t3_seg = int(round(n3 * factor_escala))
            t4_seg = int(round(n4 * factor_escala))

            # Scores reales promedio calculados con las fórmulas formales del Cap. 3
            ears = [float(m.valor_ear) for m in sesion.metricas]
            score_ocular = min(100.0, max(0.0, (sum(ears) / max(1, len(ears))) / 0.28 * 100.0))

            scores_p = []
            scores_m = []
            for m in sesion.metricas:
                exp_cef = -((float(m.angulo_yaw) ** 2) / (2.0 * (25.0 ** 2)) + (float(m.angulo_pitch) ** 2) / (2.0 * (20.0 ** 2)))
                scores_p.append(min(100.0, max(0.0, 100.0 * math.exp(exp_cef))))
                delta_v = max(0.0, float(m.varianza_cinematica) - 0.02)
                scores_m.append(min(100.0, max(0.0, 100.0 * math.exp(-(delta_v / (2.0 * (0.05 ** 2)))))))

            score_postural = round(sum(scores_p) / max(1, len(scores_p)), 1)
            score_motriz = round(sum(scores_m) / max(1, len(scores_m)), 1)

        if sesion.eventos and len(sesion.eventos) > 0:
            nombres_ev_pdf = {
                "SOMNOLENCIA": "Somnolencia / Oclusión",
                "MIRADA_FUERA": "Desvío Cefálico (SolvePnP)",
                "INQUIETUD_MOTRIZ": "Inquietud Motriz (Fidgeting)",
                "ABANDONO_PUESTO": "Abandono de Puesto (Fuga)",
                "BOSTEZO_FATIGA": "Bostezo / Fatiga Cognitiva",
                "DISTRACTOR_EXTERNO": "Distractor Externo (Terceros)",
                "MIRADA_PERDIDA": "Mirada Perdida (Staring F90.0)",
                "HUNDIMIENTO_POSTURAL": "Hundimiento Postural (Slumping)"
            }
            for ev in sesion.eventos:
                val_ev = ev.tipo_evento.value if hasattr(ev.tipo_evento, 'value') else str(ev.tipo_evento)
                if val_ev == "INQUIETUD_MOTRIZ":
                    total_inquietud += 1
                eventos_lista.append({
                    "tipo": nombres_ev_pdf.get(val_ev, val_ev),
                    "tipo_raw": val_ev,
                    "duracion": f"{ev.duracion_segundos:.1f} seg",
                    "severidad": ev.severidad.value if hasattr(ev.severidad, 'value') else str(ev.severidad),
                    "estimulo": "Avatar FocusBot / Reenganche",
                    "exito": "Sí",
                    "minuto_relativo": getattr(ev, "minuto_relativo", None) or "Min 00:00",
                    "descripcion_automatica": getattr(ev, "descripcion_automatica", None) or f"Evento de {nombres_ev_pdf.get(val_ev, val_ev)} registrado en el sistema.",
                    "ruta_captura": getattr(ev, "ruta_captura", None),
                    "ruta_captura_pantalla": getattr(ev, "ruta_captura_pantalla", None)
                })

    estudiante_info = {
        "codigo_estudiante": cod_est,
        "nombre_completo": nombre_completo,
        "grado_escolar": grado,
        "subtipo_tdah": subtipo_texto
    }

    sesion_info = {
        "id_sesion": id_sesion_str,
        "duracion_segundos": duracion_segundos
    }

    metricas_resumen = {
        "iai_promedio": iai_promedio,
        "desviacion_iai": desviacion_iai,
        "t1_segundos": t1_seg,
        "t2_segundos": t2_seg,
        "t3_segundos": t3_seg,
        "t4_segundos": t4_seg,
        "score_ocular_ear": score_ocular,
        "score_postura_pnp": score_postural,
        "score_fidgeting": score_motriz
    }

    # Generación en RAM volátil del PDF firmado con SHA-256 y QR (REQ-36)
    pdf_bytes = generar_pdf_reporte_psicopedagogico(
        estudiante_info=estudiante_info,
        sesion_info=sesion_info,
        metricas_resumen=metricas_resumen,
        eventos_lista=eventos_lista,
        modo_resumido=resumido
    )

    # Actualizar registro del reporte en BD si existe sesión
    if sesion:
        try:
            rep_res = await db.execute(
                select(ReportePsicopedagogico).where(ReportePsicopedagogico.id_sesion == sesion.id_sesion)
            )
            rep = rep_res.scalars().first()
            if not rep:
                rep = ReportePsicopedagogico(
                    id_sesion=sesion.id_sesion,
                    porcentaje_atencion_alta=((t1_seg + t2_seg) / max(1, duracion_segundos)) * 100.0,
                    total_eventos_inquietud=total_inquietud,
                    observaciones_psicopedagogicas="Generado exitosamente vía ReportLab Platypus con firma SHA-256.",
                    ruta_archivo_pdf=f"reportes/{cod_est}_{datetime.now().strftime('%Y%m%d')}.pdf"
                )
                db.add(rep)
                await db.commit()
        except Exception:
            pass

    fecha_nom = sesion.fecha_hora_inicio.strftime("%Y%m%d_%H%M") if (sesion and sesion.fecha_hora_inicio) else datetime.now().strftime("%Y%m%d")
    tipo_reporte_slug = "Resumen_Top8" if resumido else "Completo"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Reporte_{tipo_reporte_slug}_{cod_est}_{fecha_nom}.pdf"'
        }
    )


@router.get("/sesion/{id_sesion}/descargar")
async def descargar_reporte_pdf_por_sesion(
    id_sesion: str,
    resumido: bool = Query(False, description="True para reporte resumido con Top 8 evidencias críticas"),
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """
    Genera y descarga el Reporte Psicopedagógico formal en formato PDF correspondiente a una sesión específica
    identificada por su UUID. Permite consultar cualquier evaluación histórica de la bitácora escolar (REQ-21, REQ-36).
    """
    ses_res = await db.execute(
        select(SesionMonitoreo)
        .options(
            selectinload(SesionMonitoreo.metricas),
            selectinload(SesionMonitoreo.eventos),
            selectinload(SesionMonitoreo.estudiante)
        )
        .where(SesionMonitoreo.id_sesion == id_sesion.strip())
    )
    sesion = ses_res.scalars().first()
    if not sesion or not sesion.estudiante:
        raise HTTPException(status_code=404, detail=f"Sesión con ID {id_sesion} no encontrada en la base de datos.")

    # Control de Permisos RBAC
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)

    if resumido:
        if rol_str != "SUPERADMIN" and "DESCARGAR_REPORTE_RESUMEN" not in permisos:
            raise HTTPException(status_code=403, detail="Acceso denegado: No posee el permiso DESCARGAR_REPORTE_RESUMEN para descargar reportes ejecutivos.")
    else:
        if rol_str != "SUPERADMIN" and "DESCARGAR_REPORTE_COMPLETO" not in permisos:
            raise HTTPException(status_code=403, detail="Acceso denegado: No posee el permiso DESCARGAR_REPORTE_COMPLETO para descargar el informe clínico integral.")

    if rol_str != "SUPERADMIN" and "VER_TODOS_ESTUDIANTES" not in permisos and "VER_ESTUDIANTES_ASIGNADOS" in permisos:
        if sesion.estudiante.id_tutor != usuario_actual.id_usuario:
            raise HTTPException(status_code=403, detail="Acceso denegado: Solo puede descargar reportes de sus estudiantes asignados.")

    return await compilar_pdf_reporte(sesion, sesion.estudiante, db, resumido=resumido)


@router.get("/descargar/{codigo_estudiante}")
async def descargar_reporte_pdf(
    codigo_estudiante: str,
    id_sesion: Optional[str] = Query(None, description="ID opcional de sesión específica para descargar su reporte individual"),
    resumido: bool = Query(False, description="True para reporte resumido con Top 8 evidencias críticas"),
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """
    Genera y descarga en tiempo real el Reporte Psicopedagógico formal en formato PDF (REQ-21 y REQ-36).
    Si se proporciona id_sesion, compila esa sesión puntual; de lo contrario toma la última con evaluación.
    """
    st_res = await db.execute(
        select(Estudiante).where(Estudiante.codigo_estudiante == codigo_estudiante.strip().upper())
    )
    estudiante = st_res.scalars().first()

    if not estudiante:
        raise HTTPException(status_code=404, detail=f"Estudiante con código {codigo_estudiante} no encontrado en la base de datos.")

    # Control de Permisos RBAC
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)

    if resumido:
        if rol_str != "SUPERADMIN" and "DESCARGAR_REPORTE_RESUMEN" not in permisos:
            raise HTTPException(status_code=403, detail="Acceso denegado: No posee el permiso DESCARGAR_REPORTE_RESUMEN para descargar reportes ejecutivos.")
    else:
        if rol_str != "SUPERADMIN" and "DESCARGAR_REPORTE_COMPLETO" not in permisos:
            raise HTTPException(status_code=403, detail="Acceso denegado: No posee el permiso DESCARGAR_REPORTE_COMPLETO para descargar el informe clínico integral.")

    if rol_str != "SUPERADMIN" and "VER_TODOS_ESTUDIANTES" not in permisos and "VER_ESTUDIANTES_ASIGNADOS" in permisos:
        if estudiante.id_tutor != usuario_actual.id_usuario:
            raise HTTPException(status_code=403, detail="Acceso denegado: Solo puede descargar reportes de sus estudiantes asignados.")

    if id_sesion and isinstance(id_sesion, str):
        ses_res = await db.execute(
            select(SesionMonitoreo)
            .options(
                selectinload(SesionMonitoreo.metricas),
                selectinload(SesionMonitoreo.eventos)
            )
            .where((SesionMonitoreo.id_sesion == id_sesion.strip()) & (SesionMonitoreo.id_estudiante == estudiante.id_estudiante))
        )
        sesion = ses_res.scalars().first()
    else:
        ses_res = await db.execute(
            select(SesionMonitoreo)
            .options(
                selectinload(SesionMonitoreo.metricas),
                selectinload(SesionMonitoreo.eventos)
            )
            .where(SesionMonitoreo.id_estudiante == estudiante.id_estudiante)
            .order_by(SesionMonitoreo.fecha_hora_inicio.desc())
        )
        sesiones = ses_res.scalars().all()
        sesion = next((s for s in sesiones if s.metricas and len(s.metricas) > 0), None)
        if not sesion and sesiones:
            sesion = sesiones[0]

    return await compilar_pdf_reporte(sesion, estudiante, db, resumido=resumido)


@router.get("/historial")
async def listar_historial_reportes(
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """Retorna el historial completo de reportes y sesiones de estudiantes para descarga."""
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)

    if rol_str != "SUPERADMIN" and "VER_HISTORIAL_REPORTES" not in permisos:
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: No cuenta con autorización para auditar el historial de reportes emitidos."
        )

    query = (
        select(Estudiante)
        .options(
            selectinload(Estudiante.sesiones).selectinload(SesionMonitoreo.reporte)
        )
    )

    if rol_str != "SUPERADMIN" and "VER_TODOS_ESTUDIANTES" not in permisos:
        if "VER_ESTUDIANTES_ASIGNADOS" in permisos:
            query = query.where(Estudiante.id_tutor == usuario_actual.id_usuario)
        else:
            return []

    query = query.order_by(Estudiante.fecha_registro.desc())
    res = await db.execute(query)
    estudiantes = res.scalars().all()
    
    historial = []
    mapa_subtipos = {
        "CONTROL": "Grupo Control (Neurotípico)",
        "SIN_TDAH": "Grupo Control (Neurotípico)",
        "F90_0": "F90.0 (Déficit de Atención)",
        "INATTENTIVE": "F90.0 (Déficit de Atención)",
        "F90_1": "F90.1 (Hiperactividad/Impulsividad)",
        "HYPERACTIVE": "F90.1 (Hiperactividad/Impulsividad)",
        "F90_2": "F90.2 (Presentación Combinada)",
        "COMBINED": "F90.2 (Presentación Combinada)",
    }

    for est in estudiantes:
        subtipo_raw = est.subtipo_tdah.value if hasattr(est.subtipo_tdah, 'value') else str(est.subtipo_tdah)
        subtipo_desc = mapa_subtipos.get(str(subtipo_raw).upper(), str(subtipo_raw))
        sesiones_con_datos = [s for s in est.sesiones if s.promedio_iai is not None or (s.duracion_segundos and s.duracion_segundos > 0)]

        if sesiones_con_datos:
            for s in sorted(sesiones_con_datos, key=lambda x: x.fecha_hora_inicio, reverse=True):
                dur_min = (s.duracion_segundos // 60) if s.duracion_segundos else 0
                iai_val = round(s.promedio_iai, 1) if s.promedio_iai is not None else None
                if iai_val is not None:
                    estado_txt = "Atención Óptima" if iai_val >= 70 else ("Atención Moderada" if iai_val >= 50 else "Desatención")
                else:
                    estado_txt = "En Monitoreo"

                historial.append({
                    "id_sesion": s.id_sesion,
                    "codigo_estudiante": est.codigo_estudiante,
                    "nombre_completo": est.nombre_completo,
                    "grado_escolar": est.grado_escolar or "3º de Secundaria",
                    "subtipo_tdah": subtipo_desc,
                    "fecha": (s.fecha_hora_inicio.strftime("%d/%m/%Y %H:%M") if hasattr(s.fecha_hora_inicio, 'strftime') else str(s.fecha_hora_inicio)[:16]),
                    "duracion_minutos": dur_min,
                    "iai_promedio": iai_val,
                    "estado_lectura": estado_txt,
                    "url_descarga": f"/api/v1/reportes/sesion/{s.id_sesion}/descargar"
                })
        else:
            # Estudiante registrado pero sin evaluaciones aún
            historial.append({
                "id_sesion": f"pending-{est.codigo_estudiante}",
                "codigo_estudiante": est.codigo_estudiante,
                "nombre_completo": est.nombre_completo,
                "grado_escolar": est.grado_escolar or "3º de Secundaria",
                "subtipo_tdah": subtipo_desc,
                "fecha": est.fecha_registro.strftime("%Y-%m-%d %H:%M") if est.fecha_registro else datetime.now().strftime("%Y-%m-%d %H:%M"),
                "duracion_minutos": 0,
                "iai_promedio": None,
                "estado_lectura": "Sin Evaluaciones",
                "url_descarga": f"/api/v1/reportes/descargar/{est.codigo_estudiante}"
            })

    return historial
