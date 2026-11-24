from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

from app.persistencia.config_db import get_db
from app.persistencia.modelos_orm import (
    Usuario, Estudiante, Curso, RolUsuario, SubtipoTDAH, AuditoriaConsentimiento, ahora_bolivia,
    Rol, Permiso, RolPermiso
)
from app.autenticacion_rbac.seguridad import verify_password, get_password_hash, create_access_token, decode_access_token

router = APIRouter(prefix="/auth", tags=["Autenticación & Usuarios (RBAC)"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# --- Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str
    username: str
    rol: str
    codigo_estudiante: Optional[str] = None
    permisos: list[str] = []


class RegistroUsuarioSchema(BaseModel):
    username: str
    password: str
    email: str
    rol: str
    nombre_completo: str
    codigo_estudiante: Optional[str] = None
    grado_escolar: Optional[str] = None
    subtipo_tdah: Optional[SubtipoTDAH] = SubtipoTDAH.F90_2
    acepto_terminos: bool = False


class UsuarioMeSchema(BaseModel):
    id_usuario: str
    username: str
    email: str
    rol: str
    verificado: bool = True
    activo: bool = True
    codigo_estudiante: Optional[str] = None
    permisos: list[str] = []


# --- Helper para Obtener Permisos de un Usuario ---
async def obtener_permisos_usuario(user: Usuario, db: AsyncSession) -> list[str]:
    """Obtiene los códigos de permisos asociados al rol del usuario."""
    rol_str = user.rol.value if hasattr(user.rol, "value") else str(user.rol)
    # 1. Si el rol es SUPERADMIN, tiene todos los permisos activos
    if rol_str == "SUPERADMIN":
        res_todos = await db.execute(select(Permiso.codigo_permiso))
        return [r[0] for r in res_todos.fetchall()]

    # 2. Si tiene id_rol o por nombre de rol
    query = select(Rol).options(selectinload(Rol.permisos)).where(
        (Rol.id_rol == user.id_rol) | (Rol.nombre_rol == rol_str)
    )
    res = await db.execute(query)
    rol_obj = res.scalars().first()
    if rol_obj and rol_obj.permisos:
        return [p.codigo_permiso for p in rol_obj.permisos]
    return []


# --- Helper Dependency for Current User ---
async def get_usuario_actual(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Usuario:
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username: str = payload.get("sub")
    query = select(Usuario).options(
        selectinload(Usuario.estudiante),
        selectinload(Usuario.rol_obj)
    ).where(Usuario.username == username)
    result = await db.execute(query)
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # 🛡️ Control de Suspensión Administrativa en Tiempo Real
    if getattr(user, "activo", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CUENTA_SUSPENDIDA: Su cuenta se encuentra temporalmente desactivada o suspendida por la administración institucional.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 🛡️ Control de Aprobación Institucional en Tiempo Real
    if getattr(user, "verificado", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CUENTA_NO_VERIFICADA: Su cuenta aún no ha sido aprobada por la administración institucional.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


# --- Endpoints ---

@router.post("/login", response_model=Token)
async def login_para_obtener_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Autentica usuarios (Estudiante, Docente, Psicólogo, Tutor, Director, Admin) y emite un Token JWT."""
    # Permitir login por username o por correo o por código de estudiante
    u_login = form_data.username.strip()
    query = select(Usuario).options(selectinload(Usuario.estudiante)).where(
        (Usuario.username == u_login) | (Usuario.email == u_login.lower())
    )
    result = await db.execute(query)
    user = result.scalars().first()

    # Si no se encontró por username o email, buscar si form_data.username es un codigo_estudiante
    if not user:
        st_query = select(Estudiante).options(selectinload(Estudiante.usuario).selectinload(Usuario.estudiante)).where(
            Estudiante.codigo_estudiante == u_login.upper()
        )
        st_res = await db.execute(st_query)
        student = st_res.scalars().first()
        if student and student.usuario:
            user = student.usuario

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas. Verifique usuario/código y contraseña.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 🛡️ Control de Suspensión Administrativa (Activo/Inactivo)
    if getattr(user, "activo", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta suspendida: Su cuenta se encuentra temporalmente desactivada o suspendida por la administración institucional. Comuníquese con el administrador.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 🛡️ Control de Aceptación Legal (Capítulo 5)
    if getattr(user, "acepto_terminos", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido: No ha aceptado los Términos y Condiciones y la Política de Privacidad Biométrica.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 🛡️ Control de Aprobación Institucional de Cuentas (Superadmin)
    if getattr(user, "verificado", True) is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta en espera de aprobación institucional: Un Superadministrador debe validar y activar su usuario antes de poder iniciar sesión.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Obtenemos código de estudiante si aplica
    codigo_est = None
    if user.estudiante:
        codigo_est = user.estudiante.codigo_estudiante

    # Permisos granulares asociados al rol del usuario
    lista_permisos = await obtener_permisos_usuario(user, db)
    rol_str = user.rol.value if hasattr(user.rol, "value") else str(user.rol)

    access_token = create_access_token(data={"sub": user.username, "rol": rol_str, "permisos": lista_permisos})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "rol": rol_str,
        "codigo_estudiante": codigo_est,
        "permisos": lista_permisos
    }


@router.post("/registro", status_code=201)
async def registrar_usuario(
    datos: RegistroUsuarioSchema,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Registra nuevos usuarios con verificación obligatoria de consentimiento informado (Capítulo 5)."""
    # 🛡️ Validación Estricta de Términos y Condiciones (Capítulo 5 - Ley 548 y Ley 164)
    if not datos.acepto_terminos:
        raise HTTPException(
            status_code=400,
            detail="Debe aceptar los Términos y Condiciones y la Política de Privacidad Biométrica correspondiente a su rol para crear una cuenta."
        )

    # Verificar disponibilidad de username/email (limpieza de espacios y minúsculas para email)
    u_clean = datos.username.strip()
    e_clean = datos.email.strip().lower()
    query = select(Usuario).where((Usuario.username == u_clean) | (Usuario.email == e_clean))
    res = await db.execute(query)
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="El nombre de usuario o correo ya está registrado.")

    # Normalizar rol y determinar si requiere aprobación
    rol_solicitado = datos.rol.value if hasattr(datos.rol, "value") else str(datos.rol).strip().upper()
    es_estudiante = (rol_solicitado == "ESTUDIANTE")
    es_verificado = es_estudiante

    # Obtener el id_rol correspondiente al rol solicitado
    res_rol = await db.execute(select(Rol).where(Rol.nombre_rol == rol_solicitado))
    rol_obj = res_rol.scalars().first()
    id_rol_val = rol_obj.id_rol if rol_obj else None

    ts_ahora = ahora_bolivia()
    nuevo_usuario = Usuario(
        username=u_clean,
        password_hash=get_password_hash(datos.password),
        email=e_clean,
        rol=rol_solicitado,
        id_rol=id_rol_val,
        verificado=es_verificado,
        activo=True,
        acepto_terminos=True,
        fecha_aceptacion_terminos=ts_ahora,
        version_terminos="1.0-2026"
    )
    db.add(nuevo_usuario)
    await db.commit()
    await db.refresh(nuevo_usuario)

    # Si el rol es ESTUDIANTE, validar y crear perfil de estudiante
    cod_est_final = None
    if es_estudiante:
        if datos.codigo_estudiante:
            # Validar que el código personalizado no esté ya registrado
            check_cod = await db.execute(select(Estudiante).where(Estudiante.codigo_estudiante == datos.codigo_estudiante.strip().upper()))
            if check_cod.scalars().first():
                raise HTTPException(status_code=400, detail=f"El código de estudiante '{datos.codigo_estudiante}' ya está registrado.")
            cod_est_final = datos.codigo_estudiante.strip().upper()
        else:
            cod_est_final = f"EST-2026-{nuevo_usuario.id_usuario[:4].upper()}"

        nuevo_estudiante = Estudiante(
            codigo_estudiante=cod_est_final,
            nombre_completo=datos.nombre_completo.strip(),
            grado_escolar=datos.grado_escolar or "1º de Secundaria",
            subtipo_tdah=datos.subtipo_tdah or SubtipoTDAH.F90_2,
            id_usuario=nuevo_usuario.id_usuario
        )
        db.add(nuevo_estudiante)
        await db.commit()

    # 📜 Registro inmutable en tabla de Auditoría de Consentimientos (Trazabilidad Jurídica)
    try:
        ip_cliente = request.client.host if request.client else "127.0.0.1"
        user_agent_str = request.headers.get("user-agent", "Desconocido")[:250]
        registro_auditoria = AuditoriaConsentimiento(
            id_usuario=nuevo_usuario.id_usuario,
            rol_usuario=nuevo_usuario.rol,
            codigo_estudiante_asociado=cod_est_final,
            version_documento="1.0-2026",
            ip_registro=ip_cliente,
            user_agent=user_agent_str,
            fecha_hora=ts_ahora
        )
        db.add(registro_auditoria)
        await db.commit()
    except Exception as e:
        print(f"[AUDITORIA CONSENTIMIENTO ERROR] {e}")

    return {
        "mensaje": f"Usuario '{datos.username}' registrado exitosamente con rol {rol_solicitado}.",
        "username": nuevo_usuario.username,
        "rol": rol_solicitado,
        "codigo_estudiante": cod_est_final,
        "verificado": es_verificado,
        "requiere_aprobacion": not es_verificado,
        "acepto_terminos": True,
        "version_terminos": "1.0-2026"
    }


@router.get("/me", response_model=UsuarioMeSchema)
async def obtener_perfil_actual(
    usuario_actual: Usuario = Depends(get_usuario_actual),
    db: AsyncSession = Depends(get_db)
):
    """Retorna los datos del usuario autenticado actualmente junto a sus permisos granulares."""
    cod_est = usuario_actual.estudiante.codigo_estudiante if usuario_actual.estudiante else None
    lista_permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)
    return {
        "id_usuario": usuario_actual.id_usuario,
        "username": usuario_actual.username,
        "email": usuario_actual.email,
        "rol": rol_str,
        "verificado": getattr(usuario_actual, "verificado", True),
        "activo": getattr(usuario_actual, "activo", True),
        "codigo_estudiante": cod_est,
        "permisos": lista_permisos
    }


@router.get("/cursos-activos")
async def obtener_cursos_activos(db: AsyncSession = Depends(get_db)):
    """Retorna los nombres de todos los cursos y niveles académicos activos para los formularios."""
    res = await db.execute(
        select(Curso.nombre_curso)
        .where(Curso.activo == True)
        .order_by(Curso.nivel_academico.asc(), Curso.nombre_curso.asc())
    )
    cursos = [r[0] for r in res.fetchall()]
    if not cursos:
        return [
            "1º de Secundaria", "2º de Secundaria", "3º de Secundaria",
            "4º de Secundaria", "5º de Secundaria", "6º de Secundaria",
            "Universitario - Pregrado"
        ]
    return cursos
