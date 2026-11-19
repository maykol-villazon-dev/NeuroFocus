from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

from app.persistencia.config_db import get_db
from app.persistencia.modelos_orm import Usuario, Estudiante, RolUsuario, SubtipoTDAH
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


class RegistroUsuarioSchema(BaseModel):
    username: str
    password: str
    email: str
    rol: RolUsuario
    nombre_completo: str
    codigo_estudiante: Optional[str] = None
    grado_escolar: Optional[str] = None
    subtipo_tdah: Optional[SubtipoTDAH] = SubtipoTDAH.F90_2


class UsuarioMeSchema(BaseModel):
    id_usuario: str
    username: str
    email: str
    rol: str
    codigo_estudiante: Optional[str] = None


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
    query = select(Usuario).options(selectinload(Usuario.estudiante)).where(Usuario.username == username)
    result = await db.execute(query)
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
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

    # Obtenemos código de estudiante si aplica
    codigo_est = None
    if user.estudiante:
        codigo_est = user.estudiante.codigo_estudiante

    access_token = create_access_token(data={"sub": user.username, "rol": user.rol.value})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "rol": user.rol.value,
        "codigo_estudiante": codigo_est
    }


@router.post("/registro", status_code=201)
async def registrar_usuario(
    datos: RegistroUsuarioSchema,
    db: AsyncSession = Depends(get_db)
):
    """Registra nuevos usuarios con asignación de Rol (RBAC)."""
    # Verificar disponibilidad de username/email (limpieza de espacios y minúsculas para email)
    u_clean = datos.username.strip()
    e_clean = datos.email.strip().lower()
    query = select(Usuario).where((Usuario.username == u_clean) | (Usuario.email == e_clean))
    res = await db.execute(query)
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="El nombre de usuario o correo ya está registrado.")

    nuevo_usuario = Usuario(
        username=u_clean,
        password_hash=get_password_hash(datos.password),
        email=e_clean,
        rol=datos.rol
    )
    db.add(nuevo_usuario)
    await db.commit()
    await db.refresh(nuevo_usuario)

    # Si el rol es ESTUDIANTE, validar y crear perfil de estudiante
    cod_est_final = None
    if datos.rol == RolUsuario.ESTUDIANTE:
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

    return {
        "mensaje": f"Usuario '{datos.username}' creado exitosamente con rol {datos.rol.value}",
        "username": nuevo_usuario.username,
        "rol": nuevo_usuario.rol.value,
        "codigo_estudiante": cod_est_final
    }


@router.get("/me", response_model=UsuarioMeSchema)
async def obtener_perfil_actual(usuario_actual: Usuario = Depends(get_usuario_actual)):
    """Retorna los datos del usuario autenticado actualmente."""
    cod_est = usuario_actual.estudiante.codigo_estudiante if usuario_actual.estudiante else None
    return {
        "id_usuario": usuario_actual.id_usuario,
        "username": usuario_actual.username,
        "email": usuario_actual.email,
        "rol": usuario_actual.rol.value,
        "codigo_estudiante": cod_est
    }
