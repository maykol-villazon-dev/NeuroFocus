import sqlite3
from pathlib import Path

DB_PATH = Path("/app/monitoreo_tdah.db")
if not DB_PATH.exists():
    DB_PATH = Path("monitoreo_tdah.db")

print(f"Examinando base de datos: {DB_PATH.resolve()}")

con = sqlite3.connect(DB_PATH)
cur = con.cursor()

# 1. Asegurar que todos los usuarios tengan verificado = 1, activo = 1 y acepto_terminos = 1
cur.execute("UPDATE usuarios SET verificado = 1, activo = 1, acepto_terminos = 1;")
con.commit()

# 2. Consultar usuarios existentes
cur.execute("SELECT id_usuario, username, email, rol, verificado, activo, acepto_terminos FROM usuarios;")
filas = cur.fetchall()

print(f"\nTotal usuarios en base de datos: {len(filas)}")
print("-" * 80)
print(f"{'Username':<20} | {'Rol':<15} | {'Verificado':<10} | {'Activo':<8} | {'Aceptó':<8}")
print("-" * 80)
for f in filas:
    print(f"{f[1]:<20} | {f[3]:<15} | {str(f[4]):<10} | {str(f[5]):<8} | {str(f[6]):<8}")
print("-" * 80)

con.close()
print("\n¡Todos los usuarios han sido verificados y activados exitosamente!")
