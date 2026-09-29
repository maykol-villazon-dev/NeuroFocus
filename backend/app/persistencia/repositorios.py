from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.persistencia.config_db import engine, Base, AsyncSessionLocal
from app.persistencia.modelos_orm import Usuario, Estudiante, RolUsuario
from app.autenticacion_rbac.seguridad import get_password_hash


async def init_db_and_seed():
    """Crea las tablas en la BD y genera usuarios semilla si no existen."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with AsyncSessionLocal() as session:
        # Seed 1: Admin / Docente Semilla
        res = await session.execute(select(Usuario).where(Usuario.username == "docente_demo"))
        if not res.scalars().first():
            user_docente = Usuario(
                username="docente_demo",
                password_hash=get_password_hash("Docente2026!"),
                email="docente@barrancos.edu.bo",
                rol=RolUsuario.DOCENTE
            )
            session.add(user_docente)

        # Seed 2: Psicólogo Semilla
        res_psico = await session.execute(select(Usuario).where(Usuario.username == "psicologo_demo"))
        if not res_psico.scalars().first():
            user_psico = Usuario(
                username="psicologo_demo",
                password_hash=get_password_hash("Psicologo2026!"),
                email="psicopedagogia@barrancos.edu.bo",
                rol=RolUsuario.PSICOLOGO
            )
            session.add(user_psico)

        # Seed 3: Estudiante Semilla con Código EST-2026-001
        res_est = await session.execute(select(Estudiante).where(Estudiante.codigo_estudiante == "EST-2026-001"))
        if not res_est.scalars().first():
            user_est = Usuario(
                username="mateo_estudiante",
                password_hash=get_password_hash("Estudiante2026!"),
                email="mateo.morales@barrancos.edu.bo",
                rol=RolUsuario.ESTUDIANTE
            )
            session.add(user_est)
            await session.flush()

            estudiante_profile = Estudiante(
                codigo_estudiante="EST-2026-001",
                nombre_completo="Mateo Morales Villalobos",
                edad=14,
                grado_escolar="3º de Secundaria",
                diagnostico_observacion="Estudiante con TDAH leve - Evaluación de atención en laboratorio de computación",
                id_usuario=user_est.id_usuario
            )
            session.add(estudiante_profile)

        await session.commit()
