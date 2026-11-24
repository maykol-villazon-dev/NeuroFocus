import os
import shutil
import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete, text
from sqlalchemy.orm import selectinload

from app.persistencia.config_db import get_db
from app.persistencia.modelos_orm import (
    Usuario,
    Estudiante,
    Curso,
    AuditoriaConsentimiento,
    SesionMonitoreo,
    RolUsuario,
    SubtipoTDAH,
    ahora_bolivia,
    Rol,
    Permiso,
    RolPermiso,
    DocenteCurso,
    MaterialEstudio
)
from app.autenticacion_rbac.seguridad import get_password_hash
from app.servicios.rutas_websockets import manager

router = APIRouter(prefix="/superadmin", tags=["Superadministrador - Sistema & RBAC"])


# =========================================================================
# SCHEMAS PYDANTIC PARA VALIDACIÓN
# =========================================================================

class UsuarioCrearRequest(BaseModel):
    username: str
    email: str
    password: str
    rol: str = "DOCENTE"
    # Datos opcionales si el rol es ESTUDIANTE
    nombre_completo: Optional[str] = None
    codigo_estudiante: Optional[str] = None
    grado_escolar: Optional[str] = "1º de Secundaria"
    subtipo_tdah: Optional[SubtipoTDAH] = SubtipoTDAH.F90_2
    diagnostico_observacion: Optional[str] = None


class CambiarRolUsuarioRequest(BaseModel):
    nuevo_rol: str  # id_rol o nombre_rol


class ResetPasswordRequest(BaseModel):
    nueva_password: str


class CambiarEstadoRequest(BaseModel):
    activo: bool


class VincularTutorRequest(BaseModel):
    id_estudiante: str
    id_tutor: Optional[str] = None  # None o string vacío para desvincular


class CursoCrearRequest(BaseModel):
    nombre_curso: str
    nivel_academico: Optional[str] = "Secundaria"
    descripcion: Optional[str] = None


class AsignarCursosDocenteRequest(BaseModel):
    cursos_ids: list[str]


class CursoEstadoRequest(BaseModel):
    activo: bool


# =========================================================================
# 1. DASHBOARD GLOBAL: MÉTRICAS GENERALES Y DISTRIBUCIÓN
# =========================================================================

@router.get("/dashboard-stats")
async def obtener_metricas_dashboard(db: AsyncSession = Depends(get_db)):
    """Retorna métricas globales para el panel principal del Superadministrador."""
    # Conteo por rol
    roles_conteo = {
        "ESTUDIANTE": 0,
        "DOCENTE": 0,
        "TUTOR": 0,
        "PSICOLOGO": 0,
        "DIRECTOR": 0,
        "SUPERADMIN": 0
    }
    res_roles = await db.execute(select(Usuario.rol, func.count(Usuario.id_usuario)).group_by(Usuario.rol))
    for rol_val, count_val in res_roles.fetchall():
        clave = str(rol_val).split(".")[-1] if hasattr(rol_val, "name") else str(rol_val)
        if clave in roles_conteo:
            roles_conteo[clave] = count_val

    # Estudiantes por grado escolar
    res_grados = await db.execute(
        select(Estudiante.grado_escolar, func.count(Estudiante.id_estudiante))
        .group_by(Estudiante.grado_escolar)
    )
    estudiantes_por_curso = {}
    for grado, count_val in res_grados.fetchall():
        nom_grado = grado or "Sin Grado Asignado"
        estudiantes_por_curso[nom_grado] = count_val

    # Distribución por subtipo TDAH
    res_tdah = await db.execute(
        select(Estudiante.subtipo_tdah, func.count(Estudiante.id_estudiante))
        .group_by(Estudiante.subtipo_tdah)
    )
    distribucion_tdah = {
        "F90.0 (Inatento)": 0,
        "F90.1 (Hiperactivo)": 0,
        "F90.2 (Combinado)": 0,
        "Control / Sin TDAH": 0
    }
    for sub, count_val in res_tdah.fetchall():
        s_str = str(sub).lower()
        if "f90_0" in s_str or "inattentive" in s_str:
            distribucion_tdah["F90.0 (Inatento)"] += count_val
        elif "f90_1" in s_str or "hyperactive" in s_str:
            distribucion_tdah["F90.1 (Hiperactivo)"] += count_val
        elif "f90_2" in s_str or "combined" in s_str:
            distribucion_tdah["F90.2 (Combinado)"] += count_val
        else:
            distribucion_tdah["Control / Sin TDAH"] += count_val

    # Total sesiones registradas
    res_ses = await db.execute(select(func.count(SesionMonitoreo.id_sesion)))
    total_sesiones = res_ses.scalar() or 0

    # Sesiones de hoy
    hoy_inicio = ahora_bolivia().replace(hour=0, minute=0, second=0, microsecond=0)
    res_hoy = await db.execute(
        select(func.count(SesionMonitoreo.id_sesion)).where(SesionMonitoreo.fecha_hora_inicio >= hoy_inicio)
    )
    sesiones_hoy = res_hoy.scalar() or 0

    # Total consentimientos legales registrados
    res_cons = await db.execute(select(func.count(AuditoriaConsentimiento.id_consentimiento)))
    total_consentimientos = res_cons.scalar() or 0

    # Total usuarios pendientes de verificación
    res_pend = await db.execute(select(func.count(Usuario.id_usuario)).where(Usuario.verificado == False))
    total_pendientes = res_pend.scalar() or 0

    return {
        "usuarios_por_rol": roles_conteo,
        "total_usuarios": sum(roles_conteo.values()),
        "total_pendientes": total_pendientes,
        "estudiantes_por_curso": estudiantes_por_curso,
        "distribucion_tdah": distribucion_tdah,
        "total_sesiones": total_sesiones,
        "sesiones_hoy": sesiones_hoy,
        "total_consentimientos": total_consentimientos,
        "conexiones_activas": len(getattr(manager, "active_connections", {}))
    }


# =========================================================================
# 2. ESTUDIANTES Y VINCULACIÓN CON TUTORES
# =========================================================================

@router.get("/estudiantes-tutores")
async def obtener_estudiantes_con_tutores(db: AsyncSession = Depends(get_db)):
    """Lista todos los estudiantes con su tutor asignado y la lista de tutores disponibles."""
    # Consultar estudiantes
    res_est = await db.execute(select(Estudiante).order_by(Estudiante.nombre_completo.asc()))
    estudiantes = res_est.scalars().all()

    # Consultar todos los tutores/apoderados disponibles (rol TUTOR o roles con permiso VER_ESTUDIANTES_ASIGNADOS)
    subquery_tutor_roles = (
        select(RolPermiso.id_rol)
        .join(Permiso, Permiso.id_permiso == RolPermiso.id_permiso)
        .where(Permiso.codigo_permiso == "VER_ESTUDIANTES_ASIGNADOS")
    )
    res_tutores = await db.execute(
        select(Usuario).where(
            (Usuario.rol == RolUsuario.TUTOR) |
            (Usuario.rol.in_(["TUTOR", "APODERADO", "PADRE_FAMILIA"])) |
            (Usuario.id_rol.in_(subquery_tutor_roles))
        ).order_by(Usuario.username.asc())
    )
    tutores = res_tutores.scalars().all()
    tutores_dict = {t.id_usuario: t for t in tutores}

    lista_estudiantes = []
    for est in estudiantes:
        tutor_obj = tutores_dict.get(est.id_tutor) if est.id_tutor else None
        lista_estudiantes.append({
            "id_estudiante": est.id_estudiante,
            "codigo_estudiante": est.codigo_estudiante,
            "nombre_completo": est.nombre_completo,
            "grado_escolar": est.grado_escolar,
            "subtipo_tdah": est.subtipo_tdah.value if hasattr(est.subtipo_tdah, "value") else str(est.subtipo_tdah),
            "diagnostico_observacion": est.diagnostico_observacion,
            "protegido": est.protegido,
            "fecha_registro": est.fecha_registro.strftime("%Y-%m-%d %H:%M") if est.fecha_registro else None,
            "tiene_tutor": tutor_obj is not None,
            "id_tutor": est.id_tutor,
            "nombre_tutor": tutor_obj.username if tutor_obj else None,
            "email_tutor": tutor_obj.email if tutor_obj else None
        })

    lista_tutores_disponibles = [
        {
            "id_usuario": t.id_usuario,
            "username": t.username,
            "email": t.email
        }
        for t in tutores
    ]

    return {
        "estudiantes": lista_estudiantes,
        "tutores_disponibles": lista_tutores_disponibles
    }


@router.put("/vincular-tutor")
async def vincular_o_desvincular_tutor(
    payload: VincularTutorRequest,
    db: AsyncSession = Depends(get_db)
):
    """Asocia o desvincula un estudiante con un tutor específico."""
    res = await db.execute(select(Estudiante).where(Estudiante.id_estudiante == payload.id_estudiante))
    est = res.scalars().first()
    if not est:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado.")

    tutor_id_final = payload.id_tutor if payload.id_tutor and payload.id_tutor.strip() else None

    if tutor_id_final:
        # Validar que el tutor existe y tiene rol o capacidad de tutoría asignada
        subquery_tutor_roles = (
            select(RolPermiso.id_rol)
            .join(Permiso, Permiso.id_permiso == RolPermiso.id_permiso)
            .where(Permiso.codigo_permiso == "VER_ESTUDIANTES_ASIGNADOS")
        )
        res_tutor = await db.execute(
            select(Usuario).where(
                Usuario.id_usuario == tutor_id_final,
                (Usuario.rol == RolUsuario.TUTOR) |
                (Usuario.rol.in_(["TUTOR", "APODERADO", "PADRE_FAMILIA"])) |
                (Usuario.id_rol.in_(subquery_tutor_roles))
            )
        )
        if not res_tutor.scalars().first():
            raise HTTPException(status_code=400, detail="El ID proporcionado no pertenece a un Tutor o Apoderado válido.")

    est.id_tutor = tutor_id_final
    await db.commit()
    await db.refresh(est)

    return {
        "ok": True,
        "mensaje": "Vínculo de tutor actualizado exitosamente.",
        "id_estudiante": est.id_estudiante,
        "id_tutor": est.id_tutor
    }


# =========================================================================
# 3. GESTIÓN DE CUENTAS Y ACCESOS (RBAC CENTRALIZADO)
# =========================================================================

@router.get("/usuarios")
async def listar_todos_usuarios(
    busqueda: Optional[str] = Query(None),
    rol: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Lista todos los usuarios registrados con soporte para filtros."""
    query = select(Usuario).order_by(Usuario.fecha_creacion.desc())
    if rol and rol.strip():
        query = query.where(Usuario.rol == rol.strip().upper())
    if busqueda and busqueda.strip():
        termino = f"%{busqueda.strip()}%"
        query = query.where((Usuario.username.ilike(termino)) | (Usuario.email.ilike(termino)))

    res = await db.execute(query)
    usuarios = res.scalars().all()

    # Obtener perfiles de estudiantes vinculados para mostrar su nombre real
    res_est = await db.execute(select(Estudiante))
    mapa_est = {e.id_usuario: e for e in res_est.scalars().all()}

    lista = []
    for u in usuarios:
        est_perfil = mapa_est.get(u.id_usuario)
        lista.append({
            "id_usuario": u.id_usuario,
            "username": u.username,
            "email": u.email,
            "rol": u.rol.value if hasattr(u.rol, "value") else str(u.rol),
            "id_rol": u.id_rol,
            "verificado": u.verificado,
            "activo": bool(u.activo if hasattr(u, "activo") and u.activo is not None else True),
            "acepto_terminos": u.acepto_terminos,
            "fecha_aceptacion_terminos": u.fecha_aceptacion_terminos.strftime("%Y-%m-%d %H:%M") if u.fecha_aceptacion_terminos else None,
            "version_terminos": u.version_terminos,
            "fecha_creacion": u.fecha_creacion.strftime("%Y-%m-%d %H:%M") if u.fecha_creacion else None,
            "nombre_completo": est_perfil.nombre_completo if est_perfil else u.username,
            "codigo_estudiante": est_perfil.codigo_estudiante if est_perfil else None
        })

    return {"usuarios": lista, "total": len(lista)}


@router.post("/usuarios")
async def crear_usuario_administrativo(
    payload: UsuarioCrearRequest,
    db: AsyncSession = Depends(get_db)
):
    """Permite al Superadmin dar de alta cuentas de Docentes, Psicólogos, Tutores, Directores o Estudiantes."""
    # Verificar si el username o email ya existen
    res_u = await db.execute(select(Usuario).where((Usuario.username == payload.username) | (Usuario.email == payload.email)))
    if res_u.scalars().first():
        raise HTTPException(status_code=400, detail="El nombre de usuario o email ya está registrado.")

    # Buscar el rol en la tabla roles (por nombre o id)
    rol_clean = payload.rol.strip().upper()
    res_r = await db.execute(select(Rol).where((Rol.id_rol == payload.rol.strip()) | (Rol.nombre_rol == rol_clean)))
    rol_obj = res_r.scalars().first()
    id_rol_val = rol_obj.id_rol if rol_obj else None
    rol_str = rol_obj.nombre_rol if rol_obj else rol_clean

    nuevo_usuario = Usuario(
        id_usuario=str(uuid.uuid4()),
        username=payload.username.strip(),
        email=payload.email.strip().lower(),
        password_hash=get_password_hash(payload.password),
        rol=rol_str,
        id_rol=id_rol_val,
        verificado=True,
        activo=True,
        acepto_terminos=True,
        fecha_aceptacion_terminos=ahora_bolivia(),
        version_terminos="1.0-2026",
        fecha_creacion=ahora_bolivia()
    )
    db.add(nuevo_usuario)
    await db.flush()

    # Si es ESTUDIANTE, crear su Perfil Clínico/Escolar
    if rol_str == "ESTUDIANTE":
        cod_est = payload.codigo_estudiante or f"EST-2026-{uuid.uuid4().hex[:3].upper()}"
        nuevo_est = Estudiante(
            id_estudiante=str(uuid.uuid4()),
            codigo_estudiante=cod_est,
            nombre_completo=payload.nombre_completo or payload.username,
            grado_escolar=payload.grado_escolar or "1º de Secundaria",
            subtipo_tdah=payload.subtipo_tdah or SubtipoTDAH.F90_2,
            diagnostico_observacion=payload.diagnostico_observacion or "Alta administrativa realizada por Superadministrador",
            protegido=True,
            id_usuario=nuevo_usuario.id_usuario
        )
        db.add(nuevo_est)

    # Registrar el consentimiento administrativo en auditoria_consentimientos (Capítulo 5)
    registro_auditoria = AuditoriaConsentimiento(
        id_consentimiento=str(uuid.uuid4()),
        id_usuario=nuevo_usuario.id_usuario,
        rol_usuario=nuevo_usuario.rol,
        codigo_estudiante_asociado=payload.codigo_estudiante if rol_str == "ESTUDIANTE" else None,
        version_documento="1.0-2026",
        ip_registro="127.0.0.1 (Panel Superadmin)",
        user_agent="NeuroFocus AI - Alta Administrativa RBAC",
        fecha_hora=ahora_bolivia()
    )
    db.add(registro_auditoria)

    await db.commit()
    await db.refresh(nuevo_usuario)

    return {
        "ok": True,
        "mensaje": f"Usuario '{nuevo_usuario.username}' con rol {nuevo_usuario.rol} creado exitosamente.",
        "id_usuario": nuevo_usuario.id_usuario
    }


@router.put("/usuarios/{id_usuario}/rol")
async def cambiar_rol_usuario(
    id_usuario: str,
    payload: CambiarRolUsuarioRequest,
    db: AsyncSession = Depends(get_db)
):
    """Permite al Superadministrador reasignar el rol de cualquier usuario a cualquier rol (de sistema o personalizado)."""
    res = await db.execute(select(Usuario).where(Usuario.id_usuario == id_usuario))
    usuario = res.scalars().first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    # Buscar rol destino por id_rol o por nombre
    rol_clean = payload.nuevo_rol.strip().upper()
    res_r = await db.execute(select(Rol).where((Rol.id_rol == payload.nuevo_rol.strip()) | (Rol.nombre_rol == rol_clean)))
    rol_obj = res_r.scalars().first()
    if not rol_obj:
        raise HTTPException(status_code=404, detail=f"El rol '{payload.nuevo_rol}' no existe en el sistema.")

    # Prohibir degradar al único SUPERADMIN si es la cuenta principal
    rol_actual_str = usuario.rol.value if hasattr(usuario.rol, "value") else str(usuario.rol)
    if rol_actual_str == "SUPERADMIN" and rol_obj.nombre_rol != "SUPERADMIN":
        res_sup = await db.execute(select(func.count(Usuario.id_usuario)).where(Usuario.rol == "SUPERADMIN"))
        total_sup = res_sup.scalar() or 0
        if total_sup <= 1:
            raise HTTPException(status_code=400, detail="Operación denegada: No se puede cambiar el rol del único Superadministrador del sistema.")

    # Si pasa de otro rol a ESTUDIANTE y no tiene perfil de estudiante, crearlo
    if rol_obj.nombre_rol == "ESTUDIANTE":
        res_est = await db.execute(select(Estudiante).where(Estudiante.id_usuario == usuario.id_usuario))
        est = res_est.scalars().first()
        if not est:
            nuevo_est = Estudiante(
                id_estudiante=str(uuid.uuid4()),
                codigo_estudiante=f"EST-2026-{uuid.uuid4().hex[:3].upper()}",
                nombre_completo=usuario.username,
                grado_escolar="1º de Secundaria",
                subtipo_tdah=SubtipoTDAH.F90_2,
                diagnostico_observacion="Perfil generado por reasignación de rol",
                protegido=True,
                id_usuario=usuario.id_usuario
            )
            db.add(nuevo_est)

    usuario.id_rol = rol_obj.id_rol
    try:
        usuario.rol = RolUsuario[rol_obj.nombre_rol]
    except (KeyError, ValueError):
        usuario.rol = rol_obj.nombre_rol

    await db.commit()

    return {
        "ok": True,
        "mensaje": f"El rol del usuario '{usuario.username}' fue modificado a '{rol_obj.nombre_rol}' exitosamente.",
        "nuevo_rol": rol_obj.nombre_rol,
        "id_rol": rol_obj.id_rol
    }


@router.put("/usuarios/{id_usuario}/reset-password")
async def resetear_password_usuario(
    id_usuario: str,
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    """Permite al Superadmin reasignar la contraseña de cualquier usuario sin tocar scripts manuales."""
    res = await db.execute(select(Usuario).where(Usuario.id_usuario == id_usuario))
    usuario = res.scalars().first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if len(payload.nueva_password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres.")

    usuario.password_hash = get_password_hash(payload.nueva_password)
    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Contraseña actualizada exitosamente para el usuario '{usuario.username}'."
    }


@router.put("/usuarios/{id_usuario}/estado")
async def alternar_estado_usuario(
    id_usuario: str,
    payload: CambiarEstadoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Permite activar o desactivar una cuenta (impide o habilita el inicio de sesión)."""
    res = await db.execute(select(Usuario).where(Usuario.id_usuario == id_usuario))
    usuario = res.scalars().first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if usuario.rol == RolUsuario.SUPERADMIN and not payload.activo:
        raise HTTPException(status_code=400, detail="No se puede desactivar la cuenta principal de Superadministrador.")

    usuario.activo = payload.activo
    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Estado del usuario '{usuario.username}' modificado a: {'Activo' if payload.activo else 'Inactivo'}."
    }


@router.delete("/usuarios/{id_usuario}")
async def eliminar_usuario(
    id_usuario: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Elimina permanentemente una cuenta de usuario con limpieza en cascada.
    Desvincula tutores, limpia perfiles escolares y libera el cupo del curso.
    """
    res = await db.execute(select(Usuario).where(Usuario.id_usuario == id_usuario))
    usuario = res.scalars().first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if usuario.rol == RolUsuario.SUPERADMIN:
        raise HTTPException(
            status_code=400,
            detail="Operación denegada: No se puede eliminar la cuenta principal de Superadministrador."
        )

    # 1. Si es un TUTOR, desvincular a los estudiantes que lo tengan asignado
    await db.execute(
        update(Estudiante)
        .where(Estudiante.id_tutor == id_usuario)
        .values(id_tutor=None)
    )

    # 2. Si es un ESTUDIANTE (o tiene perfil asociado), eliminar perfil y archivos
    res_est = await db.execute(select(Estudiante).where(Estudiante.id_usuario == id_usuario))
    est = res_est.scalars().first()
    if est:
        # Limpieza de archivos en disco si existen
        backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        if est.codigo_estudiante:
            cod_limpio = est.codigo_estudiante.strip().upper().replace("/", "_").replace("\\", "_")
            dir_mat = os.path.join(backend_dir, "almacen_materiales", "pdfs", cod_limpio)
            if os.path.exists(dir_mat):
                shutil.rmtree(dir_mat, ignore_errors=True)
            dir_mat_orig = os.path.join(backend_dir, "almacen_materiales", "originales", cod_limpio)
            if os.path.exists(dir_mat_orig):
                shutil.rmtree(dir_mat_orig, ignore_errors=True)

        await db.delete(est)

    # 3. Eliminar consentimientos legales de este usuario
    await db.execute(
        delete(AuditoriaConsentimiento).where(AuditoriaConsentimiento.id_usuario == id_usuario)
    )

    # 4. Eliminar el usuario de la tabla principal
    nombre_borrado = usuario.username
    rol_borrado = usuario.rol.value if hasattr(usuario.rol, "value") else str(usuario.rol)
    await db.delete(usuario)
    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Usuario '{nombre_borrado}' ({rol_borrado}) y sus registros asociados fueron eliminados correctamente."
    }


# =========================================================================
# 3.1 GESTIÓN DE USUARIOS PENDIENTES DE VALIDACIÓN INSTITUCIONAL
# =========================================================================

class AprobarUsuarioRequest(BaseModel):
    nuevo_rol: Optional[str] = None


@router.get("/usuarios/pendientes")
async def listar_usuarios_pendientes(db: AsyncSession = Depends(get_db)):
    """
    Retorna la lista de usuarios que solicitaron cuenta con roles institucionales
    y se encuentran a la espera de validación y activación por el Superadministrador.
    """
    query = select(Usuario).where(Usuario.verificado == False).order_by(Usuario.fecha_creacion.desc())
    res = await db.execute(query)
    usuarios = res.scalars().all()

    # Perfiles de estudiante si hubiese
    res_est = await db.execute(select(Estudiante))
    mapa_est = {e.id_usuario: e for e in res_est.scalars().all()}

    # Auditorías de consentimiento para obtener IP y User-Agent de la solicitud
    res_aud = await db.execute(select(AuditoriaConsentimiento).order_by(AuditoriaConsentimiento.fecha_hora.desc()))
    mapa_aud = {}
    for a in res_aud.scalars().all():
        if a.id_usuario not in mapa_aud:
            mapa_aud[a.id_usuario] = a

    lista = []
    for u in usuarios:
        est_perfil = mapa_est.get(u.id_usuario)
        aud = mapa_aud.get(u.id_usuario)
        lista.append({
            "id_usuario": u.id_usuario,
            "username": u.username,
            "email": u.email,
            "rol": u.rol.value if hasattr(u.rol, "value") else str(u.rol),
            "id_rol": u.id_rol,
            "verificado": u.verificado,
            "nombre_completo": est_perfil.nombre_completo if est_perfil else u.username,
            "codigo_estudiante": est_perfil.codigo_estudiante if est_perfil else None,
            "fecha_solicitud": u.fecha_creacion.strftime("%Y-%m-%d %H:%M:%S") if u.fecha_creacion else None,
            "ip_registro": aud.ip_registro if aud else "127.0.0.1",
            "user_agent": aud.user_agent if aud else "Desconocido"
        })

    return {
        "total_pendientes": len(lista),
        "solicitudes": lista
    }


@router.put("/usuarios/{id_usuario}/aprobar")
async def aprobar_usuario_pendiente(
    id_usuario: str,
    payload: Optional[AprobarUsuarioRequest] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Aprueba y activa una cuenta pendiente, permitiéndole iniciar sesión.
    Si se especifica nuevo_rol, se actualiza su asignación (ideal para solicitudes con 'SIN_ROL').
    """
    res = await db.execute(select(Usuario).where(Usuario.id_usuario == id_usuario))
    usuario = res.scalars().first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    # Marcar como verificado y activo
    usuario.verificado = True
    usuario.acepto_terminos = True

    # Si se solicitó asignar o cambiar rol al aprobar
    if payload and payload.nuevo_rol and payload.nuevo_rol.strip():
        rol_clean = payload.nuevo_rol.strip().upper()
        res_r = await db.execute(select(Rol).where((Rol.id_rol == payload.nuevo_rol.strip()) | (Rol.nombre_rol == rol_clean)))
        rol_obj = res_r.scalars().first()
        if rol_obj:
            usuario.id_rol = rol_obj.id_rol
            try:
                usuario.rol = RolUsuario[rol_obj.nombre_rol]
            except (KeyError, ValueError):
                usuario.rol = rol_obj.nombre_rol

    await db.commit()

    rol_final = usuario.rol.value if hasattr(usuario.rol, "value") else str(usuario.rol)
    return {
        "ok": True,
        "mensaje": f"La cuenta de '{usuario.username}' fue aprobada exitosamente con el rol '{rol_final}'. Ya puede iniciar sesión.",
        "id_usuario": usuario.id_usuario,
        "rol": rol_final,
        "verificado": True
    }


@router.delete("/usuarios/{id_usuario}/rechazar")
async def rechazar_usuario_pendiente(
    id_usuario: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Rechaza y elimina definitivamente una solicitud de cuenta no verificada.
    """
    res = await db.execute(select(Usuario).where(Usuario.id_usuario == id_usuario))
    usuario = res.scalars().first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if usuario.rol == RolUsuario.SUPERADMIN:
        raise HTTPException(status_code=400, detail="Operación denegada: No se puede rechazar al Superadministrador.")

    nombre_rechazado = usuario.username
    rol_rechazado = usuario.rol.value if hasattr(usuario.rol, "value") else str(usuario.rol)

    # Eliminar consentimientos asociados
    await db.execute(delete(AuditoriaConsentimiento).where(AuditoriaConsentimiento.id_usuario == id_usuario))

    # Eliminar perfil escolar si hubiera
    await db.execute(delete(Estudiante).where(Estudiante.id_usuario == id_usuario))

    await db.delete(usuario)
    await db.commit()

    return {
        "ok": True,
        "mensaje": f"La solicitud de cuenta de '{nombre_rechazado}' ({rol_rechazado}) fue rechazada y eliminada del sistema."
    }


# =========================================================================
# 4. OFICIAL DE PROTECCIÓN DE DATOS Y PRIVACIDAD (CAPÍTULO 5)
# =========================================================================

@router.get("/auditoria-legal")
async def obtener_bitacora_consentimientos(
    rol: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Retorna la bitácora probatoria inmutable de consentimientos informados según Ley 548 y RGPD."""
    query = select(AuditoriaConsentimiento, Usuario.username, Usuario.email)\
        .join(Usuario, AuditoriaConsentimiento.id_usuario == Usuario.id_usuario)\
        .order_by(AuditoriaConsentimiento.fecha_hora.desc())

    if rol and rol.strip():
        query = query.where(AuditoriaConsentimiento.rol_usuario == rol.strip().upper())

    res = await db.execute(query)
    registros = res.fetchall()

    resultado = []
    for cons, uname, uemail in registros:
        resultado.append({
            "id_consentimiento": cons.id_consentimiento,
            "id_usuario": cons.id_usuario,
            "username": uname,
            "email": uemail,
            "rol_usuario": cons.rol_usuario.value if hasattr(cons.rol_usuario, "value") else str(cons.rol_usuario),
            "codigo_estudiante_asociado": cons.codigo_estudiante_asociado,
            "version_documento": cons.version_documento,
            "ip_registro": cons.ip_registro or "Desconocida",
            "user_agent": cons.user_agent or "Desconocido",
            "fecha_hora": cons.fecha_hora.strftime("%Y-%m-%d %H:%M:%S") if cons.fecha_hora else None
        })

    return {
        "total_registros": len(resultado),
        "registros": resultado
    }


# =========================================================================
# 5. MANTENIMIENTO DEL SERVIDOR, ARCHIVOS Y RESPALDOS
# =========================================================================

def _calcular_tamano_carpeta(ruta_carpeta: str) -> tuple[float, int]:
    """Retorna (tamaño_mb, cantidad_archivos)."""
    if not os.path.exists(ruta_carpeta):
        return 0.0, 0
    total_bytes = 0
    num_archivos = 0
    for root, _, files in os.walk(ruta_carpeta):
        for f in files:
            fp = os.path.join(root, f)
            if not os.path.islink(fp):
                total_bytes += os.path.getsize(fp)
                num_archivos += 1
    return round(total_bytes / (1024 * 1024), 2), num_archivos


@router.get("/servidor-salud")
async def obtener_salud_servidor():
    """Métricas operativas del servidor, almacenamiento de PDFs y base de datos."""
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

    # Archivo de base de datos SQLite
    ruta_db = os.path.join(backend_dir, "monitoreo_tdah.db")
    tamano_db_mb = round(os.path.getsize(ruta_db) / (1024 * 1024), 2) if os.path.exists(ruta_db) else 0.0

    # Almacén de materiales (PDFs)
    ruta_materiales = os.path.join(backend_dir, "almacen_materiales")
    tamano_mat_mb, total_materiales = _calcular_tamano_carpeta(ruta_materiales)

    # Almacén de capturas de eventos
    ruta_capturas = os.path.join(backend_dir, "almacen_capturas")
    tamano_cap_mb, total_capturas = _calcular_tamano_carpeta(ruta_capturas)

    # Conexiones WebSocket concurrentes
    conexiones_ws = len(getattr(manager, "active_connections", {}))

    return {
        "estado": "OPERATIVO",
        "motor_bd": "SQLite 3 (Async SQLAlchemy 2.0)",
        "tamano_db_mb": tamano_db_mb,
        "materiales_almacenados_mb": tamano_mat_mb,
        "total_archivos_materiales": total_materiales,
        "capturas_eventos_mb": tamano_cap_mb,
        "total_archivos_capturas": total_capturas,
        "almacenamiento_total_mb": round(tamano_db_mb + tamano_mat_mb + tamano_cap_mb, 2),
        "conexiones_ws_activas": conexiones_ws,
        "version_api": "1.0.0",
        "timestamp": ahora_bolivia().strftime("%Y-%m-%d %H:%M:%S")
    }


@router.get("/descargar-backup-db")
async def descargar_backup_base_datos():
    """Genera una copia en caliente de la base de datos SQLite y la envía como archivo descargable."""
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ruta_db = os.path.join(backend_dir, "monitoreo_tdah.db")

    if not os.path.exists(ruta_db):
        raise HTTPException(status_code=404, detail="El archivo de base de datos no existe.")

    timestamp = ahora_bolivia().strftime("%Y%m%d_%H%M%S")
    nombre_archivo = f"backup_monitoreo_tdah_{timestamp}.db"

    return FileResponse(
        path=ruta_db,
        filename=nombre_archivo,
        media_type="application/octet-stream"
    )


# =========================================================================
# 6. GESTIÓN DINÁMICA DE CURSOS Y NIVELES ACADÉMICOS
# =========================================================================

@router.get("/cursos")
async def listar_todos_cursos(db: AsyncSession = Depends(get_db)):
    """Lista todos los cursos y grados con el conteo de estudiantes en cada uno."""
    res_cursos = await db.execute(select(Curso).order_by(Curso.nivel_academico.asc(), Curso.nombre_curso.asc()))
    cursos = res_cursos.scalars().all()

    # Contar estudiantes matriculados por nombre_curso
    res_conteo = await db.execute(
        select(Estudiante.grado_escolar, func.count(Estudiante.id_estudiante))
        .group_by(Estudiante.grado_escolar)
    )
    estudiantes_por_curso = dict(res_conteo.fetchall())

    lista = []
    for c in cursos:
        lista.append({
            "id_curso": c.id_curso,
            "nombre_curso": c.nombre_curso,
            "nivel_academico": c.nivel_academico,
            "descripcion": c.descripcion,
            "activo": c.activo,
            "fecha_creacion": c.fecha_creacion.strftime("%Y-%m-%d %H:%M") if c.fecha_creacion else None,
            "total_estudiantes": estudiantes_por_curso.get(c.nombre_curso, 0)
        })

    return {"cursos": lista, "total": len(lista)}


@router.post("/cursos")
async def crear_nuevo_curso(
    payload: CursoCrearRequest,
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo curso en el sistema (ej: 'Universitario', '1º de Secundaria', etc.)."""
    nombre_limpio = payload.nombre_curso.strip()
    if not nombre_limpio:
        raise HTTPException(status_code=400, detail="El nombre del curso no puede estar vacío.")

    # Verificar unicidad
    res_existente = await db.execute(select(Curso).where(Curso.nombre_curso.ilike(nombre_limpio)))
    if res_existente.scalars().first():
        raise HTTPException(status_code=400, detail=f"El curso '{nombre_limpio}' ya existe en el sistema.")

    nuevo_curso = Curso(
        id_curso=str(uuid.uuid4()),
        nombre_curso=nombre_limpio,
        nivel_academico=(payload.nivel_academico or "Secundaria").strip(),
        descripcion=(payload.descripcion or "").strip() or None,
        activo=True,
        fecha_creacion=ahora_bolivia()
    )
    db.add(nuevo_curso)
    await db.commit()
    await db.refresh(nuevo_curso)

    return {
        "ok": True,
        "mensaje": f"Curso '{nuevo_curso.nombre_curso}' registrado exitosamente.",
        "curso": {
            "id_curso": nuevo_curso.id_curso,
            "nombre_curso": nuevo_curso.nombre_curso,
            "nivel_academico": nuevo_curso.nivel_academico,
            "descripcion": nuevo_curso.descripcion,
            "activo": nuevo_curso.activo
        }
    }


@router.put("/cursos/{id_curso}/estado")
async def alternar_estado_curso(
    id_curso: str,
    payload: CursoEstadoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Activa o desactiva un curso para su selección en formularios."""
    res = await db.execute(select(Curso).where(Curso.id_curso == id_curso))
    curso = res.scalars().first()
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")

    curso.activo = payload.activo
    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Estado del curso '{curso.nombre_curso}' actualizado a: {'Activo' if payload.activo else 'Inactivo'}."
    }


@router.delete("/cursos/{id_curso}")
async def eliminar_curso(
    id_curso: str,
    db: AsyncSession = Depends(get_db)
):
    """Elimina un curso si no tiene estudiantes matriculados en él."""
    res = await db.execute(select(Curso).where(Curso.id_curso == id_curso))
    curso = res.scalars().first()
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")

    # Verificar si hay estudiantes en este curso
    res_est = await db.execute(select(func.count(Estudiante.id_estudiante)).where(Estudiante.grado_escolar == curso.nombre_curso))
    cant_est = res_est.scalar() or 0
    if cant_est > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar el curso '{curso.nombre_curso}' porque tiene {cant_est} estudiantes matriculados. Puede desactivarlo en su lugar."
        )

    await db.delete(curso)
    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Curso '{curso.nombre_curso}' eliminado exitosamente."
    }


# =========================================================================
# SECCIÓN 6: GESTIÓN DE ROLES Y MATRIZ DE PERMISOS GRANULARES (RBAC)
# =========================================================================

class AsignarPermisosRolRequest(BaseModel):
    permisos: List[str]


class CrearRolRequest(BaseModel):
    nombre_rol: str
    descripcion: Optional[str] = None
    permisos: Optional[List[str]] = []


@router.get("/roles-permisos")
async def obtener_roles_y_matriz_permisos(db: AsyncSession = Depends(get_db)):
    """
    Retorna la lista de roles, catálogo de permisos agrupados y la matriz de asignación actual.
    """
    # 1. Obtener todos los roles y contar cuántos usuarios tienen asignado cada rol
    res_roles = await db.execute(select(Rol).order_by(Rol.es_sistema.desc(), Rol.nombre_rol.asc()))
    roles_db = res_roles.scalars().all()

    roles_list = []
    matriz = {}
    for r in roles_db:
        # Contar usuarios
        res_cnt = await db.execute(
            select(func.count(Usuario.id_usuario)).where(
                (Usuario.id_rol == r.id_rol) | (Usuario.rol == r.nombre_rol)
            )
        )
        total_usr = res_cnt.scalar() or 0

        roles_list.append({
            "id_rol": r.id_rol,
            "nombre_rol": r.nombre_rol,
            "descripcion": r.descripcion,
            "es_sistema": r.es_sistema,
            "total_usuarios": total_usr,
            "fecha_creacion": r.fecha_creacion.strftime("%Y-%m-%d %H:%M") if r.fecha_creacion else None
        })

        # Permisos activos para este rol
        codigos_rol = [p.codigo_permiso for p in r.permisos] if r.permisos else []
        matriz[r.id_rol] = codigos_rol

    # 2. Obtener todos los permisos ordenados por módulo
    res_permisos = await db.execute(select(Permiso).order_by(Permiso.modulo.asc(), Permiso.codigo_permiso.asc()))
    permisos_db = res_permisos.scalars().all()

    permisos_list = [{
        "id_permiso": p.id_permiso,
        "codigo_permiso": p.codigo_permiso,
        "nombre_permiso": p.nombre_permiso,
        "descripcion": p.descripcion,
        "modulo": p.modulo
    } for p in permisos_db]

    return {
        "roles": roles_list,
        "permisos": permisos_list,
        "matriz": matriz
    }


@router.put("/roles/{id_rol}/permisos")
async def actualizar_permisos_rol(
    id_rol: str,
    payload: AsignarPermisosRolRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Actualiza la lista de permisos asociados a un rol específico en la matriz RBAC.
    """
    res_rol = await db.execute(select(Rol).where(Rol.id_rol == id_rol))
    rol = res_rol.scalars().first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")

    # 1. Limpiar permisos existentes del rol
    await db.execute(delete(RolPermiso).where(RolPermiso.id_rol == id_rol))

    # 2. Buscar IDs de los permisos solicitados
    if payload.permisos:
        res_perms = await db.execute(
            select(Permiso).where(Permiso.codigo_permiso.in_(payload.permisos))
        )
        perms_encontrados = res_perms.scalars().all()

        for p in perms_encontrados:
            db.add(RolPermiso(
                id_rol=id_rol,
                id_permiso=p.id_permiso,
                fecha_asignacion=ahora_bolivia()
            ))

    nombre_rol_retorno = rol.nombre_rol
    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Permisos para el rol '{nombre_rol_retorno}' actualizados correctamente ({len(payload.permisos)} permisos activos)."
    }


@router.post("/roles")
async def crear_rol_personalizado(
    payload: CrearRolRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Crea un nuevo rol institucional derivado (ej. 'Director Secundario', 'Docente Guía').
    """
    nombre_limpio = payload.nombre_rol.strip().upper()
    if not nombre_limpio:
        raise HTTPException(status_code=400, detail="El nombre del rol es requerido.")

    # Verificar disponibilidad
    res_exist = await db.execute(select(Rol).where(Rol.nombre_rol == nombre_limpio))
    if res_exist.scalars().first():
        raise HTTPException(status_code=400, detail=f"Ya existe un rol con el nombre '{nombre_limpio}'.")

    nuevo_rol = Rol(
        nombre_rol=nombre_limpio,
        descripcion=payload.descripcion.strip() if payload.descripcion else None,
        es_sistema=False,
        fecha_creacion=ahora_bolivia()
    )
    db.add(nuevo_rol)
    await db.flush()

    # Asignar permisos iniciales si fueron provistos
    if payload.permisos:
        res_perms = await db.execute(select(Permiso).where(Permiso.codigo_permiso.in_(payload.permisos)))
        perms_encontrados = res_perms.scalars().all()
        for p in perms_encontrados:
            db.add(RolPermiso(
                id_rol=nuevo_rol.id_rol,
                id_permiso=p.id_permiso,
                fecha_asignacion=ahora_bolivia()
            ))

    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Rol '{nombre_limpio}' creado exitosamente.",
        "id_rol": nuevo_rol.id_rol
    }


@router.delete("/roles/{id_rol}")
async def eliminar_rol_personalizado(
    id_rol: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Elimina un rol personalizado siempre que no sea un rol base del sistema ni tenga usuarios activos asignados.
    """
    res_rol = await db.execute(select(Rol).where(Rol.id_rol == id_rol))
    rol = res_rol.scalars().first()
    if not rol:
        raise HTTPException(status_code=404, detail="Rol no encontrado.")

    if rol.es_sistema:
        raise HTTPException(
            status_code=400,
            detail=f"Operación denegada: El rol '{rol.nombre_rol}' es un rol base del sistema y no puede ser eliminado."
        )

    # Verificar si hay usuarios con este rol
    res_usr = await db.execute(
        select(func.count(Usuario.id_usuario)).where(
            (Usuario.id_rol == id_rol) | (Usuario.rol == rol.nombre_rol)
        )
    )
    cant_usr = res_usr.scalar() or 0
    if cant_usr > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar el rol '{rol.nombre_rol}' porque tiene {cant_usr} usuarios asignados. Reasigne esos usuarios primero."
        )

    # Limpiar asociaciones en roles_permisos y eliminar rol
    await db.execute(delete(RolPermiso).where(RolPermiso.id_rol == id_rol))
    await db.delete(rol)
    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Rol '{rol.nombre_rol}' eliminado exitosamente."
    }


# =========================================================================
# 7. ASIGNACIÓN ACADÉMICA DOCENTE - CURSOS (GESTIÓN PEDAGÓGICA)
# =========================================================================

@router.get("/docentes-cursos")
async def listar_docentes_con_cursos(db: AsyncSession = Depends(get_db)):
    """Lista todos los docentes institucionales junto a los cursos que tienen asignados."""
    # Buscar usuarios cuyo rol sea DOCENTE (por campo rol o por catálogo de roles)
    res_doc = await db.execute(
        select(Usuario)
        .options(selectinload(Usuario.docente_cursos).selectinload(DocenteCurso.curso))
        .outerjoin(Rol, Rol.id_rol == Usuario.id_rol)
        .where(
            (Usuario.rol == "DOCENTE") |
            (Usuario.rol == RolUsuario.DOCENTE) |
            (Rol.nombre_rol.ilike("%DOCENTE%"))
        )
        .order_by(Usuario.username.asc())
    )
    docentes = res_doc.scalars().unique().all()

    # Todos los cursos activos
    res_c = await db.execute(select(Curso).where(Curso.activo == True).order_by(Curso.nombre_curso.asc()))
    cursos = res_c.scalars().all()

    lista_docentes = []
    for d in docentes:
        cursos_asignados = [
            {
                "id_curso": dc.curso.id_curso,
                "nombre_curso": dc.curso.nombre_curso,
                "nivel_academico": dc.curso.nivel_academico
            }
            for dc in d.docente_cursos if dc.curso and dc.curso.activo
        ]
        lista_docentes.append({
            "id_usuario": d.id_usuario,
            "username": d.username,
            "email": d.email,
            "rol": d.rol.value if hasattr(d.rol, "value") else str(d.rol),
            "cursos_asignados": cursos_asignados,
            "total_cursos": len(cursos_asignados)
        })

    cursos_disponibles = [
        {
            "id_curso": c.id_curso,
            "nombre_curso": c.nombre_curso,
            "nivel_academico": c.nivel_academico
        }
        for c in cursos
    ]

    return {
        "docentes": lista_docentes,
        "cursos_disponibles": cursos_disponibles
    }


@router.put("/docentes/{id_docente}/cursos")
async def actualizar_cursos_docente(
    id_docente: str,
    payload: AsignarCursosDocenteRequest,
    db: AsyncSession = Depends(get_db)
):
    """Asigna o actualiza la lista de cursos para un docente específico."""
    res_doc = await db.execute(select(Usuario).where(Usuario.id_usuario == id_docente))
    docente = res_doc.scalars().first()
    if not docente:
        raise HTTPException(status_code=404, detail="Docente no encontrado.")

    # 1. Limpiar asignaciones previas
    await db.execute(delete(DocenteCurso).where(DocenteCurso.id_docente == id_docente))

    # 2. Asignar nuevos cursos
    if payload.cursos_ids:
        res_c = await db.execute(select(Curso).where(Curso.id_curso.in_(payload.cursos_ids)))
        cursos_validos = res_c.scalars().all()
        for c in cursos_validos:
            db.add(DocenteCurso(
                id_docente=id_docente,
                id_curso=c.id_curso,
                fecha_asignacion=ahora_bolivia()
            ))

    await db.commit()

    return {
        "ok": True,
        "mensaje": f"Se han asignado {len(payload.cursos_ids)} cursos al docente '{docente.username}' exitosamente."
    }
