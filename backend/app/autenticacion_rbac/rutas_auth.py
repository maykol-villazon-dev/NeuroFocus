from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

from app.persistencia.config_db import get_db
from app.persistencia.modelos_orm import Usuario, Estudiante, RolUsuario
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
    query = select(Usuario).where(Usuario.username == username)
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
    # Permitir login por username o por código de estudiante (para los estudiantes)
    query = select(Usuario).options(selectinload(Usuario.estudiante)).where(
        (Usuario.username == form_data.username) | (Usuario.email == form_data.username)
    )
    result = await db.execute(query)
    user = result.scalars().first()

    # Si no se encontró por username, buscar si form_data.username es un codigo_estudiante
    if not user:
        st_query = select(Estudiante).options(selectinload(Estudiante.usuario).selectinload(Usuario.estudiante)).where(Estudiante.codigo_estudiante == form_data.username)
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
    # Verificar disponibilidad de username/email
    query = select(Usuario).where((Usuario.username == datos.username) | (Usuario.email == datos.email))
    res = await db.execute(query)
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="El nombre de usuario o correo ya está registrado.")

    nuevo_usuario = Usuario(
        username=datos.username,
        password_hash=get_password_hash(datos.password),
        email=datos.email,
        rol=datos.rol
    )
    db.add(nuevo_usuario)
    await db.commit()
    await db.refresh(nuevo_usuario)

    # Si el rol es ESTUDIANTE, crear perfil de estudiante
    if datos.rol == RolUsuario.ESTUDIANTE:
        cod_est = datos.codigo_estudiante or f"EST-2026-{nuevo_usuario.id_usuario[:4].upper()}"
        nuevo_estudiante = Estudiante(
            codigo_estudiante=cod_est,
            nombre_completo=datos.nombre_completo,
            grado_escolar=datos.grado_escolar or "Secundaria",
            id_usuario=nuevo_usuario.id_usuario
        )
        db.add(nuevo_estudiante)
        await db.commit()

    return {"mensaje": f"Usuario '{datos.username}' creado exitosamente con rol {datos.rol.value}"}


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
