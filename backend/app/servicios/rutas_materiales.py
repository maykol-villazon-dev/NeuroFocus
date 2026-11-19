"""
Rutas API para Gestión de Materiales de Estudio y Conversión Multi-formato
Proyecto: NEUROFOCUS AI - U.E. Luis Barrancos Álvarez (UAGRM)
Postulante: Maykol Jonnathan Villazon Flores
"""

import os
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.servicios.conversor_documentos import procesar_archivo_a_pdf

router = APIRouter(prefix="/materiales", tags=["Materiales de Estudio - Modo Estudio"])

# Directorios de Almacenamiento
CARPETA_BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "almacen_materiales")
CARPETA_ORIGINALES = os.path.join(CARPETA_BASE, "originales")
CARPETA_PDFS = os.path.join(CARPETA_BASE, "pdfs")

os.makedirs(CARPETA_ORIGINALES, exist_ok=True)
os.makedirs(CARPETA_PDFS, exist_ok=True)


class MaterialInfo(BaseModel):
    id: str
    nombre_archivo: str
    nombre_pdf: str
    url_pdf: str
    extension_original: str
    tamano_kb: float
    fecha_subida: str


@router.post("/subir")
async def subir_material_estudio(
    file: UploadFile = File(...),
    codigo_estudiante: str = Form(...)
):
    """
    Recibe un archivo de estudio (.pdf, .docx, .pptx, .jpg, .png),
    lo almacena y lo estandariza automáticamente a PDF para lectura inmersiva.
    """
    codigo_seguro = codigo_estudiante.strip().upper().replace("/", "_").replace("\\", "_")
    if not codigo_seguro:
        raise HTTPException(status_code=400, detail="Código de estudiante requerido.")

    nombre_original = file.filename or "documento_estudio"
    nombre_limpio, ext = os.path.splitext(nombre_original)
    ext_limpia = ext.lower().lstrip(".")

    extensiones_validas = {"pdf", "docx", "pptx", "jpg", "jpeg", "png"}
    if ext_limpia not in extensiones_validas:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no permitido (. {ext_limpia}). Sube archivos PDF, Word (.docx), PowerPoint (.pptx) o Imágenes (.jpg, .png)."
        )

    # Carpetas por estudiante
    carpeta_est_orig = os.path.join(CARPETA_ORIGINALES, codigo_seguro)
    carpeta_est_pdf = os.path.join(CARPETA_PDFS, codigo_seguro)
    os.makedirs(carpeta_est_orig, exist_ok=True)
    os.makedirs(carpeta_est_pdf, exist_ok=True)

    # Timestamp para evitar colisiones de nombres
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nombre_guardado_orig = f"{nombre_limpio}_{timestamp}.{ext_limpia}"
    ruta_guardado_orig = os.path.join(carpeta_est_orig, nombre_guardado_orig)

    # 1. Guardar archivo original
    try:
        with open(ruta_guardado_orig, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando archivo original: {str(e)}")

    # 2. Procesar y convertir a PDF
    exito, nombre_pdf, mensaje = procesar_archivo_a_pdf(ruta_guardado_orig, carpeta_est_pdf)
    if not exito:
        raise HTTPException(status_code=422, detail=f"No se pudo procesar o convertir el documento: {mensaje}")

    tamano_bytes = os.path.getsize(os.path.join(carpeta_est_pdf, nombre_pdf))
    tamano_kb = round(tamano_bytes / 1024, 1)

    url_pdf = f"/api/v1/materiales/archivo/{codigo_seguro}/{nombre_pdf}"

    return {
        "exito": True,
        "mensaje": mensaje,
        "material": {
            "id": f"{codigo_seguro}_{timestamp}",
            "nombre_archivo": nombre_original,
            "nombre_pdf": nombre_pdf,
            "url_pdf": url_pdf,
            "extension_original": ext_limpia,
            "tamano_kb": tamano_kb,
            "fecha_subida": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    }


@router.get("/estudiante/{codigo_estudiante}")
async def listar_materiales_estudiante(codigo_estudiante: str):
    """
    Retorna la lista de todos los materiales en PDF disponibles
    para el estudiante indicado.
    """
    codigo_seguro = codigo_estudiante.strip().upper().replace("/", "_").replace("\\", "_")
    carpeta_est_pdf = os.path.join(CARPETA_PDFS, codigo_seguro)

    if not os.path.exists(carpeta_est_pdf):
        return {"materiales": []}

    lista = []
    for f in os.listdir(carpeta_est_pdf):
        if f.lower().endswith(".pdf"):
            ruta_completa = os.path.join(carpeta_est_pdf, f)
            stat = os.stat(ruta_completa)
            fecha_mod = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
            tamano_kb = round(stat.st_size / 1024, 1)
            lista.append({
                "id": f,
                "nombre_archivo": f,
                "nombre_pdf": f,
                "url_pdf": f"/api/v1/materiales/archivo/{codigo_seguro}/{f}",
                "extension_original": "pdf",
                "tamano_kb": tamano_kb,
                "fecha_subida": fecha_mod
            })

    # Ordenar por fecha más reciente primero
    lista.sort(key=lambda x: x["fecha_subida"], reverse=True)
    return {"materiales": lista}


@router.get("/archivo/{codigo_estudiante}/{nombre_pdf}")
async def obtener_archivo_pdf(codigo_estudiante: str, nombre_pdf: str):
    """
    Sirve el archivo PDF directamente con Content-Disposition: inline
    para que se visualice fluidamente dentro del visor iframe del navegador.
    """
    codigo_seguro = codigo_estudiante.strip().upper().replace("/", "_").replace("\\", "_")
    ruta_archivo = os.path.join(CARPETA_PDFS, codigo_seguro, nombre_pdf)

    if not os.path.exists(ruta_archivo):
        raise HTTPException(status_code=404, detail="El archivo solicitado no existe.")

    return FileResponse(
        path=ruta_archivo,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={nombre_pdf}"
        }
    )


@router.delete("/{codigo_estudiante}/{nombre_pdf}")
async def eliminar_material(codigo_estudiante: str, nombre_pdf: str):
    """Permite eliminar un material del repositorio de estudio del alumno."""
    codigo_seguro = codigo_estudiante.strip().upper().replace("/", "_").replace("\\", "_")
    ruta_pdf = os.path.join(CARPETA_PDFS, codigo_seguro, nombre_pdf)
    if os.path.exists(ruta_pdf):
        try:
            os.remove(ruta_pdf)
            return {"exito": True, "mensaje": "Archivo eliminado correctamente."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al eliminar archivo: {str(e)}")
    raise HTTPException(status_code=404, detail="Archivo no encontrado.")

