import sqlite3
import os
from pathlib import Path

# Rutas dentro del contenedor
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "monitoreo_tdah.db"
SQL_PATH = BASE_DIR / "dump_local.sql"

print(f"Ruta BD: {DB_PATH}")
print(f"Ruta SQL: {SQL_PATH}")

if not SQL_PATH.exists():
    print(f"ERROR: No se encuentra {SQL_PATH}")
    exit(1)

con = sqlite3.connect(DB_PATH)
cur = con.cursor()

# 1. Desactivar llaves foráneas
cur.execute("PRAGMA foreign_keys = OFF;")

# 2. Leer script
with open(SQL_PATH, "r", encoding="utf-8") as f:
    sql_script = f.read()

# 3. Limpiar tablas existentes
tablas = [
    'eventos_desatencion', 'metricas_atencionales', 'reportes_psicopedagogicos', 
    'sesiones_monitoreo', 'estudiantes', 'usuarios', 'cursos', 'materiales_estudio',
    'docente_cursos', 'roles_permisos', 'permisos', 'roles', 'auditoria_consentimientos',
    'parametros_calibracion'
]

for t in tablas:
    try:
        cur.execute(f"DELETE FROM {t};")
    except Exception:
        pass

# 4. Ejecutar el dump
cur.executescript(sql_script)

# 5. Asegurar que TODOS los usuarios (incluido superadmin) estén activos y verificados
cur.execute("UPDATE usuarios SET verificado = 1, activo = 1;")
con.commit()

# 6. Conteo
u = cur.execute("SELECT count(*) FROM usuarios").fetchone()[0]
e = cur.execute("SELECT count(*) FROM estudiantes").fetchone()[0]
s = cur.execute("SELECT count(*) FROM sesiones_monitoreo").fetchone()[0]
m = cur.execute("SELECT count(*) FROM metricas_atencionales").fetchone()[0]
con.close()

print("==================================================")
print(">>> RESTAURACION EXITOSA:")
print(f">>> Total Usuarios: {u}")
print(f">>> Total Estudiantes: {e}")
print(f">>> Total Sesiones: {s}")
print(f">>> Metricas Atencionales: {m}")
print("==================================================")
