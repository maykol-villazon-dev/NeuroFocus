from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from app.persistencia.config_db import engine, Base, AsyncSessionLocal
from app.persistencia.modelos_orm import (
    Usuario, Estudiante, Curso, RolUsuario, SubtipoTDAH, ahora_bolivia,
    Rol, Permiso, RolPermiso
)
from app.autenticacion_rbac.seguridad import get_password_hash


async def migrar_columnas_usuarios(conn):
    """Garantiza la migración segura y retrocompatible de columnas legales y roles en SQLite."""
    result = await conn.execute(text("PRAGMA table_info(usuarios);"))
    columnas_existentes = [row[1] for row in result.fetchall()]

    if "acepto_terminos" not in columnas_existentes:
        await conn.execute(text("ALTER TABLE usuarios ADD COLUMN acepto_terminos BOOLEAN DEFAULT 0 NOT NULL;"))
        # Marcar usuarios preexistentes como aceptados para no bloquear sesiones de prueba
        await conn.execute(text("UPDATE usuarios SET acepto_terminos = 1 WHERE acepto_terminos = 0;"))
        print("[MIGRACION BD] Columna 'acepto_terminos' agregada exitosamente a 'usuarios'.")

    if "fecha_aceptacion_terminos" not in columnas_existentes:
        await conn.execute(text("ALTER TABLE usuarios ADD COLUMN fecha_aceptacion_terminos DATETIME;"))
        fecha_str = ahora_bolivia().strftime("%Y-%m-%d %H:%M:%S")
        await conn.execute(text(f"UPDATE usuarios SET fecha_aceptacion_terminos = '{fecha_str}' WHERE fecha_aceptacion_terminos IS NULL;"))
        print("[MIGRACION BD] Columna 'fecha_aceptacion_terminos' agregada exitosamente.")

    if "version_terminos" not in columnas_existentes:
        await conn.execute(text("ALTER TABLE usuarios ADD COLUMN version_terminos VARCHAR(20) DEFAULT '1.0-2026';"))
        await conn.execute(text("UPDATE usuarios SET version_terminos = '1.0-2026' WHERE version_terminos IS NULL;"))
        print("[MIGRACION BD] Columna 'version_terminos' agregada exitosamente.")

    if "id_rol" not in columnas_existentes:
        await conn.execute(text("ALTER TABLE usuarios ADD COLUMN id_rol VARCHAR(36);"))
        print("[MIGRACION BD] Columna 'id_rol' agregada exitosamente a 'usuarios'.")

    if "verificado" not in columnas_existentes:
        await conn.execute(text("ALTER TABLE usuarios ADD COLUMN verificado BOOLEAN DEFAULT 0 NOT NULL;"))
        await conn.execute(text("UPDATE usuarios SET verificado = 1;"))
        print("[MIGRACION BD] Columna 'verificado' agregada exitosamente a 'usuarios' y registros previos verificados.")

    if "activo" not in columnas_existentes:
        await conn.execute(text("ALTER TABLE usuarios ADD COLUMN activo BOOLEAN DEFAULT 1 NOT NULL;"))
        await conn.execute(text("UPDATE usuarios SET activo = 1;"))
        # Si raul fue puesto en inactivo por prueba del usuario, reflejar activo = 0
        await conn.execute(text("UPDATE usuarios SET activo = 0 WHERE username = 'raul';"))
        print("[MIGRACION BD] Columna 'activo' agregada exitosamente a 'usuarios'.")

    # Restaurar legalmente acepto_terminos = 1 si quedó en 0 por suspensión administrativa previa
    await conn.execute(text("UPDATE usuarios SET acepto_terminos = 1 WHERE acepto_terminos = 0;"))

    # 👨‍👩‍👦 Migración de columna id_tutor en estudiantes
    res_est_cols = await conn.execute(text("PRAGMA table_info(estudiantes);"))
    columnas_est = [r[1] for r in res_est_cols.fetchall()]
    if "id_tutor" not in columnas_est:
        await conn.execute(text("ALTER TABLE estudiantes ADD COLUMN id_tutor VARCHAR(36);"))
        print("[MIGRACION BD] Columna 'id_tutor' agregada a tabla estudiantes exitosamente.")

    # 📜 Homologar Auditoría de Consentimientos para Usuarios Preexistentes
    res_faltantes = await conn.execute(text("""
        SELECT u.id_usuario, u.rol, u.fecha_creacion, e.codigo_estudiante
        FROM usuarios u
        LEFT JOIN estudiantes e ON u.id_usuario = e.id_usuario
        WHERE u.id_usuario NOT IN (SELECT id_usuario FROM auditoria_consentimientos);
    """))
    usuarios_sin_auditoria = res_faltantes.fetchall()

    if usuarios_sin_auditoria:
        import uuid
        for row in usuarios_sin_auditoria:
            id_cons = str(uuid.uuid4())
            id_usr = row[0]
            rol_usr = row[1]
            fecha_usr = row[2] or ahora_bolivia().strftime("%Y-%m-%d %H:%M:%S")
            cod_est = f"'{row[3]}'" if row[3] else "NULL"
            
            sql_insert = f"""
                INSERT INTO auditoria_consentimientos (
                    id_consentimiento, id_usuario, rol_usuario,
                    codigo_estudiante_asociado, version_documento,
                    ip_registro, user_agent, fecha_hora
                ) VALUES (
                    '{id_cons}', '{id_usr}', '{rol_usr}',
                    {cod_est}, '1.0-2026',
                    '127.0.0.1 (Migración Inicial)',
                    'NeuroFocus AI - Homologación de Consentimiento Preexistente',
                    '{fecha_usr}'
                );
            """
            await conn.execute(text(sql_insert))
        print(f"[MIGRACION BD] Se generaron {len(usuarios_sin_auditoria)} registros de auditoría legal para usuarios preexistentes.")


async def init_db_and_seed():
    """Crea las tablas en la BD, migra esquemas y genera roles, permisos y usuarios semilla."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await migrar_columnas_usuarios(conn)
    
    async with AsyncSessionLocal() as session:
        # -------------------------------------------------------------------------
        # Seed A: Catálogo de Permisos Granulares (12 permisos atómicos)
        # -------------------------------------------------------------------------
        permisos_catalogo = [
            ("EDITAR_CLASIFICACION_CLINICA", "Editar Clasificación Clínica DSM-5-TR", "Permite asignar o modificar CONTROL, F90.0, F90.1 o F90.2", "CLINICO"),
            ("GESTIONAR_PRIVACIDAD_ESTUDIANTE", "Control de Privacidad y Anonimización", "Permite alternar entre máscara 3D y rostro real del estudiante", "PRIVACIDAD"),
            ("DESCARGAR_REPORTE_COMPLETO", "Descargar Reporte Clínico Completo", "Permite emitir el PDF integral de ReportLab con curvas de atención", "REPORTES"),
            ("DESCARGAR_REPORTE_RESUMEN", "Descargar Reporte Ejecutivo Resumen", "Permite descargar la ficha ejecutiva sintética de 1 página", "REPORTES"),
            ("VER_HISTORIAL_REPORTES", "Ver Historial y Auditoría de Reportes", "Permite consultar la bitácora de reportes emitidos históricamente", "REPORTES"),
            ("VER_TODOS_ESTUDIANTES", "Ver Todos los Estudiantes", "Permite listar y consultar a cualquier estudiante de la institución", "ESTUDIANTES"),
            ("VER_ESTUDIANTES_ASIGNADOS", "Ver Estudiantes Asignados / Hijos", "Permite consultar únicamente a los alumnos a su cargo o tutorados", "ESTUDIANTES"),
            ("MONITOREAR_TIEMPO_REAL", "Monitoreo Atencional en Vivo", "Ver telemetría MediaPipe (EAR, MAR, IAI) en tiempo real", "MONITOREO"),
            ("GESTIONAR_MATERIALES_CLASE", "Gestionar Materiales de Estudio", "Subir y eliminar lecturas y PDFs de clase interactiva", "MATERIALES"),
            ("EDITAR_PERFIL_ESTUDIANTE", "Modificar Perfil de Estudiante", "Cambiar nombre, grado escolar y código del alumno", "ESTUDIANTES"),
            ("VINCULAR_TUTOR_ESTUDIANTE", "Vincular Estudiantes con Tutores", "Asociar formalmente qué apoderado es responsable de qué estudiante", "GESTION"),
            ("VER_METRICAS_INSTITUCIONALES", "Ver Dashboard Institucional", "Acceder al panel macro y estadísticas consolidadas del centro", "DASHBOARD"),
            ("ACCESO_PORTAL_ESTUDIANTE", "Acceso al Portal del Estudiante", "Permite ingresar al entorno interactivo de lectura y sensor frontal", "ACCESO"),
            ("ACCESO_PANEL_SUPERADMIN", "Acceso al Panel de Superadministrador", "Permite ingresar al panel de infraestructura, TI y control RBAC", "ACCESO"),
            ("ACCESO_DASHBOARD_AUTORIDADES", "Acceso al Dashboard de Autoridades", "Permite ingresar al centro de mando docente/clínico institucional", "ACCESO"),
        ]
        permisos_dict = {}
        for cod, nom, desc, mod in permisos_catalogo:
            res_p = await session.execute(select(Permiso).where(Permiso.codigo_permiso == cod))
            permiso_obj = res_p.scalars().first()
            if not permiso_obj:
                permiso_obj = Permiso(
                    codigo_permiso=cod,
                    nombre_permiso=nom,
                    descripcion=desc,
                    modulo=mod,
                    fecha_creacion=ahora_bolivia()
                )
                session.add(permiso_obj)
                await session.flush()
            permisos_dict[cod] = permiso_obj

        # -------------------------------------------------------------------------
        # Seed B: Catálogo de Roles Base del Sistema (6 roles del sistema)
        # -------------------------------------------------------------------------
        roles_catalogo = [
            ("SUPERADMIN", "Superadministrador / Desarrollador", "Control total de TI, mantenimiento y seguridad"),
            ("DIRECTOR", "Director de Unidad Educativa", "Gestión directiva, auditoría y métricas institucionales"),
            ("PSICOLOGO", "Gabinete Psicopedagógico", "Evaluación clínica DSM-5-TR y reportes longitudinales"),
            ("DOCENTE", "Docente de Aula", "Monitoreo de clase, materiales de estudio y reporte resumen"),
            ("TUTOR", "Tutor / Padre de Familia", "Seguimiento exclusivo de hijos asignados y reportes resumen"),
            ("ESTUDIANTE", "Estudiante", "Portal de lectura inmersiva y calibración postural neutral"),
            ("SIN_ROL", "Sin Rol Asignado", "Personal institucional en espera de asignación de cargo por el Superadministrador"),
        ]
        roles_dict = {}
        for nom_r, desc_r, _ in roles_catalogo:
            res_r = await session.execute(select(Rol).where(Rol.nombre_rol == nom_r))
            rol_obj = res_r.scalars().first()
            if not rol_obj:
                rol_obj = Rol(
                    nombre_rol=nom_r,
                    descripcion=desc_r,
                    es_sistema=True,
                    fecha_creacion=ahora_bolivia()
                )
                session.add(rol_obj)
                await session.flush()
            roles_dict[nom_r] = rol_obj

        # -------------------------------------------------------------------------
        # Seed C: Matriz Inicial de Asignación Roles-Permisos
        # -------------------------------------------------------------------------
        matriz_inicial = {
            "SUPERADMIN": list(permisos_dict.keys()),
            "DIRECTOR": [
                "ACCESO_DASHBOARD_AUTORIDADES", "GESTIONAR_PRIVACIDAD_ESTUDIANTE", "DESCARGAR_REPORTE_COMPLETO", "DESCARGAR_REPORTE_RESUMEN",
                "VER_HISTORIAL_REPORTES", "VER_TODOS_ESTUDIANTES", "VER_ESTUDIANTES_ASIGNADOS",
                "MONITOREAR_TIEMPO_REAL", "GESTIONAR_MATERIALES_CLASE", "EDITAR_PERFIL_ESTUDIANTE",
                "VINCULAR_TUTOR_ESTUDIANTE", "VER_METRICAS_INSTITUCIONALES"
            ],
            "PSICOLOGO": [
                "ACCESO_DASHBOARD_AUTORIDADES", "EDITAR_CLASIFICACION_CLINICA", "GESTIONAR_PRIVACIDAD_ESTUDIANTE", "DESCARGAR_REPORTE_COMPLETO",
                "DESCARGAR_REPORTE_RESUMEN", "VER_HISTORIAL_REPORTES", "VER_TODOS_ESTUDIANTES",
                "VER_ESTUDIANTES_ASIGNADOS", "MONITOREAR_TIEMPO_REAL", "EDITAR_PERFIL_ESTUDIANTE",
                "VINCULAR_TUTOR_ESTUDIANTE", "VER_METRICAS_INSTITUCIONALES"
            ],
            "DOCENTE": [
                "ACCESO_DASHBOARD_AUTORIDADES", "DESCARGAR_REPORTE_RESUMEN", "VER_ESTUDIANTES_ASIGNADOS", "MONITOREAR_TIEMPO_REAL",
                "GESTIONAR_MATERIALES_CLASE"
            ],
            "TUTOR": [
                "ACCESO_DASHBOARD_AUTORIDADES", "DESCARGAR_REPORTE_RESUMEN", "VER_ESTUDIANTES_ASIGNADOS", "MONITOREAR_TIEMPO_REAL"
            ],
            "ESTUDIANTE": ["ACCESO_PORTAL_ESTUDIANTE"],
            "SIN_ROL": []
        }

        for nom_r, lista_codigos in matriz_inicial.items():
            rol_act = roles_dict.get(nom_r)
            if not rol_act:
                continue
            for cod_p in lista_codigos:
                perm_act = permisos_dict.get(cod_p)
                if not perm_act:
                    continue
                res_rp = await session.execute(
                    select(RolPermiso).where(
                        RolPermiso.id_rol == rol_act.id_rol,
                        RolPermiso.id_permiso == perm_act.id_permiso
                    )
                )
                if not res_rp.scalars().first():
                    session.add(RolPermiso(
                        id_rol=rol_act.id_rol,
                        id_permiso=perm_act.id_permiso,
                        fecha_asignacion=ahora_bolivia()
                    ))

        # Homologar id_rol en usuarios existentes
        for nom_r, rol_obj in roles_dict.items():
            await session.execute(
                text(f"UPDATE usuarios SET id_rol = '{rol_obj.id_rol}' WHERE (id_rol IS NULL OR id_rol = '') AND rol = '{nom_r}';")
            )

        # Seed 0: Superadministrador del Sistema (TI / Oficial de Seguridad)
        res_admin = await session.execute(select(Usuario).where(Usuario.username == "superadmin"))
        if not res_admin.scalars().first():
            user_admin = Usuario(
                username="superadmin",
                password_hash=get_password_hash("Admin2026!"),
                email="admin@neurofocus.ai",
                rol=RolUsuario.SUPERADMIN,
                id_rol=roles_dict.get("SUPERADMIN").id_rol if roles_dict.get("SUPERADMIN") else None,
                acepto_terminos=True,
                fecha_aceptacion_terminos=ahora_bolivia(),
                version_terminos="1.0-2026"
            )
            session.add(user_admin)

        # Seed 1: Admin / Docente Semilla
        res = await session.execute(select(Usuario).where(Usuario.username == "docente_demo"))
        if not res.scalars().first():
            user_docente = Usuario(
                username="docente_demo",
                password_hash=get_password_hash("Docente2026!"),
                email="docente@barrancos.edu.bo",
                rol=RolUsuario.DOCENTE,
                id_rol=roles_dict.get("DOCENTE").id_rol if roles_dict.get("DOCENTE") else None,
                acepto_terminos=True,
                fecha_aceptacion_terminos=ahora_bolivia(),
                version_terminos="1.0-2026"
            )
            session.add(user_docente)

        # Seed 2: Psicólogo Semilla
        res_psico = await session.execute(select(Usuario).where(Usuario.username == "psicologo_demo"))
        if not res_psico.scalars().first():
            user_psico = Usuario(
                username="psicologo_demo",
                password_hash=get_password_hash("Psicologo2026!"),
                email="psicopedagogia@barrancos.edu.bo",
                rol=RolUsuario.PSICOLOGO,
                id_rol=roles_dict.get("PSICOLOGO").id_rol if roles_dict.get("PSICOLOGO") else None,
                acepto_terminos=True,
                fecha_aceptacion_terminos=ahora_bolivia(),
                version_terminos="1.0-2026"
            )
            session.add(user_psico)

        # Seed 3: Estudiante Semilla con Código EST-2026-001
        res_est = await session.execute(select(Estudiante).where(Estudiante.codigo_estudiante == "EST-2026-001"))
        if not res_est.scalars().first():
            user_est = Usuario(
                username="mateo_estudiante",
                password_hash=get_password_hash("Estudiante2026!"),
                email="mateo.morales@barrancos.edu.bo",
                rol=RolUsuario.ESTUDIANTE,
                acepto_terminos=True,
                fecha_aceptacion_terminos=ahora_bolivia(),
                version_terminos="1.0-2026"
            )
            session.add(user_est)
            await session.flush()

            estudiante_profile = Estudiante(
                codigo_estudiante="EST-2026-001",
                nombre_completo="Mateo Morales Villalobos",
                edad=14,
                grado_escolar="3º de Secundaria",
                subtipo_tdah=SubtipoTDAH.F90_2,
                diagnostico_observacion="Estudiante con TDAH leve - Evaluación de atención en laboratorio de computación",
                id_usuario=user_est.id_usuario
            )
            session.add(estudiante_profile)

        # Seed 4: Catálogo Inicial de Cursos y Niveles Académicos
        cursos_base = [
            ("1º de Secundaria", "Secundaria", "Primer año de educación secundaria comunitaria productiva"),
            ("2º de Secundaria", "Secundaria", "Segundo año de educación secundaria comunitaria productiva"),
            ("3º de Secundaria", "Secundaria", "Tercer año de educación secundaria comunitaria productiva"),
            ("4º de Secundaria", "Secundaria", "Cuarto año de educación secundaria comunitaria productiva"),
            ("5º de Secundaria", "Secundaria", "Quinto año de educación secundaria comunitaria productiva"),
            ("6º de Secundaria", "Secundaria", "Sexto año de educación secundaria comunitaria productiva (Bachillerato)"),
            ("Universitario - Pregrado", "Universidad", "Estudiantes de nivel universitario para validación experimental de la tesis"),
            ("UAGRM - Taller de Grado I", "Universidad", "Grupo experimental de validación académica FICCT - UAGRM"),
        ]
        for nombre, nivel, desc in cursos_base:
            res_c = await session.execute(select(Curso).where(Curso.nombre_curso == nombre))
            if not res_c.scalars().first():
                nuevo_curso = Curso(
                    nombre_curso=nombre,
                    nivel_academico=nivel,
                    descripcion=desc,
                    activo=True,
                    fecha_creacion=ahora_bolivia()
                )
                session.add(nuevo_curso)

        await session.commit()
