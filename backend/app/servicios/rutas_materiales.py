"""
Rutas API para Gestión de Materiales de Estudio y Conversión Multi-formato
Proyecto: NEUROFOCUS AI - U.E. Luis Barrancos Álvarez (UAGRM)
Postulante: Maykol Jonnathan Villazon Flores
"""

import os
import shutil
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.servicios.conversor_documentos import procesar_archivo_a_pdf
from app.persistencia.config_db import get_db
from app.persistencia.modelos_orm import (
    Usuario,
    Estudiante,
    Curso,
    DocenteCurso,
    MaterialEstudio,
    ahora_bolivia,
    RolUsuario,
    RolPermiso,
    Permiso
)
from app.autenticacion_rbac.rutas_auth import get_usuario_actual, obtener_permisos_usuario

router = APIRouter(prefix="/materiales", tags=["Materiales de Estudio - Modo Estudio"])

# Directorios de Almacenamiento
CARPETA_BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "almacen_materiales")
CARPETA_ORIGINALES = os.path.join(CARPETA_BASE, "originales")
CARPETA_PDFS = os.path.join(CARPETA_BASE, "pdfs")
CARPETA_CURSOS = os.path.join(CARPETA_BASE, "cursos")

os.makedirs(CARPETA_ORIGINALES, exist_ok=True)
os.makedirs(CARPETA_PDFS, exist_ok=True)
os.makedirs(CARPETA_CURSOS, exist_ok=True)


# =========================================================================
# 1. GESTIÓN DE CURSOS ASIGNADOS AL DOCENTE
# =========================================================================

@router.get("/mis-cursos")
async def listar_mis_cursos_docente(
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """
    Retorna la lista de cursos asignados al docente autenticado.
    Si el usuario es SUPERADMIN o DIRECTOR, retorna todos los cursos institucionales.
    """
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)

    if rol_str in ("SUPERADMIN", "DIRECTOR"):
        res = await db.execute(
            select(Curso)
            .options(selectinload(Curso.materiales))
            .where(Curso.activo == True)
            .order_by(Curso.nombre_curso.asc())
        )
        cursos = res.scalars().all()
    else:
        res = await db.execute(
            select(Curso)
            .join(DocenteCurso, DocenteCurso.id_curso == Curso.id_curso)
            .options(selectinload(Curso.materiales))
            .where(DocenteCurso.id_docente == usuario_actual.id_usuario, Curso.activo == True)
            .order_by(Curso.nombre_curso.asc())
        )
        cursos = res.scalars().all()

    resultado = []
    for c in cursos:
        # Contar cuántos materiales están en este curso
        total_mats = len([m for m in c.materiales if m is not None])
        resultado.append({
            "id_curso": c.id_curso,
            "nombre_curso": c.nombre_curso,
            "nivel_academico": c.nivel_academico,
            "descripcion": c.descripcion,
            "total_materiales": total_mats
        })

    return {"cursos": resultado}


# =========================================================================
# 2. GESTIÓN DE MATERIALES POR CURSO (CARGA, EDICIÓN Y ELIMINACIÓN)
# =========================================================================

@router.post("/curso/{id_curso}/subir")
async def subir_material_curso(
    id_curso: str,
    file: UploadFile = File(...),
    titulo: str = Form(...),
    descripcion_tarea: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """
    Permite a un docente subir un material o tarea (.pdf, .docx, .pptx, .jpg, .png)
    para un curso específico con indicaciones personalizadas.
    """
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)

    if rol_str != "SUPERADMIN" and "GESTIONAR_MATERIALES_CLASE" not in permisos:
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: No posee el permiso GESTIONAR_MATERIALES_CLASE para subir documentos a cursos."
        )

    # Verificar que el curso existe
    res_c = await db.execute(select(Curso).where(Curso.id_curso == id_curso))
    curso = res_c.scalars().first()
    if not curso:
        raise HTTPException(status_code=404, detail="El curso especificado no existe.")

    nombre_original = file.filename or "material_curso"
    nombre_limpio, ext = os.path.splitext(nombre_original)
    ext_limpia = ext.lower().lstrip(".")

    extensiones_validas = {"pdf", "docx", "pptx", "jpg", "jpeg", "png"}
    if ext_limpia not in extensiones_validas:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no permitido (. {ext_limpia}). Sube archivos PDF, Word (.docx), PowerPoint (.pptx) o Imágenes (.jpg, .png)."
        )

    # Carpeta por curso
    carpeta_curso_orig = os.path.join(CARPETA_CURSOS, id_curso, "originales")
    carpeta_curso_pdf = os.path.join(CARPETA_CURSOS, id_curso, "pdfs")
    os.makedirs(carpeta_curso_orig, exist_ok=True)
    os.makedirs(carpeta_curso_pdf, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nombre_guardado_orig = f"{nombre_limpio}_{timestamp}.{ext_limpia}"
    ruta_guardado_orig = os.path.join(carpeta_curso_orig, nombre_guardado_orig)

    # 1. Guardar archivo original
    try:
        with open(ruta_guardado_orig, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando archivo original: {str(e)}")

    # 2. Procesar y convertir a PDF
    exito, nombre_pdf, mensaje = procesar_archivo_a_pdf(ruta_guardado_orig, carpeta_curso_pdf)
    if not exito:
        raise HTTPException(status_code=422, detail=f"No se pudo procesar o convertir el documento: {mensaje}")

    tamano_bytes = os.path.getsize(os.path.join(carpeta_curso_pdf, nombre_pdf))
    tamano_kb = round(tamano_bytes / 1024, 1)
    url_pdf = f"/api/v1/materiales/archivo-curso/{id_curso}/{nombre_pdf}"

    # 3. Guardar en Base de Datos
    nuevo_mat = MaterialEstudio(
        titulo=titulo.strip(),
        descripcion_tarea=descripcion_tarea.strip() if descripcion_tarea else None,
        id_curso=id_curso,
        id_docente=usuario_actual.id_usuario,
        nombre_archivo_original=nombre_original,
        nombre_pdf=nombre_pdf,
        url_pdf=url_pdf,
        extension_original=ext_limpia,
        tamano_kb=tamano_kb,
        fecha_subida=ahora_bolivia()
    )
    db.add(nuevo_mat)
    await db.commit()
    await db.refresh(nuevo_mat)

    return {
        "ok": True,
        "mensaje": "Material publicado exitosamente.",
        "material": {
            "id_material": nuevo_mat.id_material,
            "titulo": nuevo_mat.titulo,
            "descripcion_tarea": nuevo_mat.descripcion_tarea,
            "nombre_archivo_original": nuevo_mat.nombre_archivo_original,
            "nombre_pdf": nuevo_mat.nombre_pdf,
            "url_pdf": nuevo_mat.url_pdf,
            "tamano_kb": nuevo_mat.tamano_kb,
            "fecha_subida": nuevo_mat.fecha_subida.strftime("%Y-%m-%d %H:%M:%S")
        }
    }


@router.get("/curso/{id_curso}")
async def listar_materiales_de_curso(
    id_curso: str,
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """Retorna la lista de todos los materiales publicados en un curso específico."""
    res_c = await db.execute(select(Curso).where(Curso.id_curso == id_curso))
    curso = res_c.scalars().first()
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado.")

    res_m = await db.execute(
        select(MaterialEstudio)
        .options(selectinload(MaterialEstudio.docente))
        .where(MaterialEstudio.id_curso == id_curso)
        .order_by(MaterialEstudio.fecha_subida.desc())
    )
    materiales = res_m.scalars().all()

    lista = []
    for m in materiales:
        nombre_docente = m.docente.username if m.docente else "Docente Institucional"
        lista.append({
            "id_material": m.id_material,
            "titulo": m.titulo,
            "descripcion_tarea": m.descripcion_tarea,
            "nombre_archivo_original": m.nombre_archivo_original,
            "nombre_pdf": m.nombre_pdf,
            "url_pdf": m.url_pdf,
            "extension_original": m.extension_original,
            "tamano_kb": m.tamano_kb,
            "fecha_subida": m.fecha_subida.strftime("%Y-%m-%d %H:%M") if m.fecha_subida else None,
            "id_docente": m.id_docente,
            "nombre_docente": nombre_docente,
            "es_propietario": (m.id_docente == usuario_actual.id_usuario or usuario_actual.rol == "SUPERADMIN")
        })

    return {
        "id_curso": curso.id_curso,
        "nombre_curso": curso.nombre_curso,
        "materiales": lista
    }


@router.patch("/curso/{id_material}")
async def editar_material_curso(
    id_material: str,
    titulo: Optional[str] = Form(None),
    descripcion_tarea: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """
    Permite al docente modificar el título, la descripción/indicación de una tarea
    o reemplazar el archivo previamente cargado.
    """
    res_m = await db.execute(select(MaterialEstudio).where(MaterialEstudio.id_material == id_material))
    mat = res_m.scalars().first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material no encontrado.")

    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)
    if rol_str != "SUPERADMIN" and mat.id_docente != usuario_actual.id_usuario:
        raise HTTPException(status_code=403, detail="No tiene autorización para editar un material publicado por otro docente.")

    if titulo is not None and titulo.strip():
        mat.titulo = titulo.strip()

    if descripcion_tarea is not None:
        mat.descripcion_tarea = descripcion_tarea.strip() if descripcion_tarea.strip() else None

    # Si subió un nuevo archivo para reemplazar el anterior
    if file and file.filename:
        nombre_original = file.filename
        nombre_limpio, ext = os.path.splitext(nombre_original)
        ext_limpia = ext.lower().lstrip(".")

        extensiones_validas = {"pdf", "docx", "pptx", "jpg", "jpeg", "png"}
        if ext_limpia not in extensiones_validas:
            raise HTTPException(
                status_code=400,
                detail=f"Formato no permitido (. {ext_limpia}). Sube archivos PDF, Word (.docx), PowerPoint (.pptx) o Imágenes (.jpg, .png)."
            )

        carpeta_curso_orig = os.path.join(CARPETA_CURSOS, mat.id_curso, "originales")
        carpeta_curso_pdf = os.path.join(CARPETA_CURSOS, mat.id_curso, "pdfs")
        os.makedirs(carpeta_curso_orig, exist_ok=True)
        os.makedirs(carpeta_curso_pdf, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        nombre_guardado_orig = f"{nombre_limpio}_{timestamp}.{ext_limpia}"
        ruta_guardado_orig = os.path.join(carpeta_curso_orig, nombre_guardado_orig)

        with open(ruta_guardado_orig, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        exito, nombre_pdf, mensaje = procesar_archivo_a_pdf(ruta_guardado_orig, carpeta_curso_pdf)
        if not exito:
            raise HTTPException(status_code=422, detail=f"No se pudo procesar el nuevo archivo: {mensaje}")

        tamano_bytes = os.path.getsize(os.path.join(carpeta_curso_pdf, nombre_pdf))
        mat.tamano_kb = round(tamano_bytes / 1024, 1)
        mat.nombre_archivo_original = nombre_original
        mat.nombre_pdf = nombre_pdf
        mat.extension_original = ext_limpia
        mat.url_pdf = f"/api/v1/materiales/archivo-curso/{mat.id_curso}/{nombre_pdf}"

    await db.commit()
    await db.refresh(mat)

    return {
        "ok": True,
        "mensaje": "Material y descripción de tarea actualizados correctamente.",
        "material": {
            "id_material": mat.id_material,
            "titulo": mat.titulo,
            "descripcion_tarea": mat.descripcion_tarea,
            "nombre_archivo_original": mat.nombre_archivo_original,
            "nombre_pdf": mat.nombre_pdf,
            "url_pdf": mat.url_pdf,
            "tamano_kb": mat.tamano_kb
        }
    }


@router.delete("/curso/{id_material}")
async def eliminar_material_curso(
    id_material: str,
    db: AsyncSession = Depends(get_db),
    usuario_actual: Usuario = Depends(get_usuario_actual)
):
    """Elimina un material publicado en un curso."""
    res_m = await db.execute(select(MaterialEstudio).where(MaterialEstudio.id_material == id_material))
    mat = res_m.scalars().first()
    if not mat:
        raise HTTPException(status_code=404, detail="Material no encontrado.")

    rol_str = usuario_actual.rol.value if hasattr(usuario_actual.rol, "value") else str(usuario_actual.rol)
    permisos = await obtener_permisos_usuario(usuario_actual, db)
    es_autor = (mat.id_docente == usuario_actual.id_usuario)
    es_admin = (rol_str in ["SUPERADMIN", "DIRECTOR"])
    tiene_permiso = ("GESTIONAR_MATERIALES_CLASE" in permisos)

    if not (es_autor or es_admin or tiene_permiso):
        raise HTTPException(status_code=403, detail="No tiene autorización para eliminar este material.")

    # Eliminar archivo PDF del disco si existe
    if mat.id_curso and mat.nombre_pdf:
        ruta_pdf = os.path.join(CARPETA_CURSOS, mat.id_curso, "pdfs", mat.nombre_pdf)
        if os.path.exists(ruta_pdf):
            try:
                os.remove(ruta_pdf)
            except Exception as e:
                print(f"[ERROR BORRADO ARCHIVO] {e}")

    await db.delete(mat)
    await db.commit()

    return {"ok": True, "mensaje": "Material eliminado exitosamente."}


@router.get("/archivo-curso/{id_curso}/{nombre_pdf}")
async def obtener_archivo_pdf_curso(id_curso: str, nombre_pdf: str):
    """Sirve el archivo PDF publicado para un curso con Content-Disposition: inline."""
    ruta_archivo = os.path.join(CARPETA_CURSOS, id_curso, "pdfs", nombre_pdf)
    if not os.path.exists(ruta_archivo):
        raise HTTPException(status_code=404, detail="El archivo solicitado no existe.")

    return FileResponse(
        path=ruta_archivo,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={nombre_pdf}"
        }
    )


# =========================================================================
# 3. MODO ESTUDIO: DISTRIBUCIÓN POR DOCENTES Y MATERIALES PROPIOS
# =========================================================================

@router.get("/estudiante-curso/{codigo_estudiante}")
async def listar_materiales_estudiante_con_docentes(
    codigo_estudiante: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Retorna los materiales organizados para el Modo Estudio del estudiante:
    1. Materiales propios que el alumno ha subido.
    2. Materiales publicados por cada docente asignado a su curso/grado escolar,
       agrupados por profesor, incluyendo la descripción o indicación de tarea.
    """
    codigo_seguro = codigo_estudiante.strip().upper().replace("/", "_").replace("\\", "_")

    # 1. Buscar estudiante y su grado escolar
    res_est = await db.execute(select(Estudiante).where(Estudiante.codigo_estudiante == codigo_seguro))
    estudiante = res_est.scalars().first()
    grado_escolar = estudiante.grado_escolar if estudiante else "3º de Secundaria"

    # 2. Materiales propios del estudiante (del almacenamiento personal)
    carpeta_est_pdf = os.path.join(CARPETA_PDFS, codigo_seguro)
    materiales_propios = []
    if os.path.exists(carpeta_est_pdf):
        for f in os.listdir(carpeta_est_pdf):
            if f.lower().endswith(".pdf"):
                ruta_completa = os.path.join(carpeta_est_pdf, f)
                stat = os.stat(ruta_completa)
                fecha_mod = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
                tamano_kb = round(stat.st_size / 1024, 1)
                materiales_propios.append({
                    "id_material": f"propio_{f}",
                    "titulo": f,
                    "descripcion_tarea": "Documento personal para sesión de estudio autónomo.",
                    "nombre_pdf": f,
                    "url_pdf": f"/api/v1/materiales/archivo/{codigo_seguro}/{f}",
                    "tamano_kb": tamano_kb,
                    "fecha_subida": fecha_mod,
                    "es_propio": True
                })
        materiales_propios.sort(key=lambda x: x["fecha_subida"], reverse=True)

    # 3. Buscar cursos que coincidan con el grado escolar del estudiante (adaptativo a '1º', '1ro', '1°')
    res_cursos = await db.execute(select(Curso).where(Curso.activo == True))
    todos_los_cursos = res_cursos.scalars().all()

    def normalizar_texto_curso(txt: str) -> str:
        if not txt:
            return ""
        # Reemplazar símbolos comunes de ordinal
        t = txt.lower().replace("º", "o").replace("°", "o").replace("ro", "o").replace("do", "o").replace("to", "o")
        return "".join(c for c in t if c.isalnum())

    grado_norm = normalizar_texto_curso(grado_escolar)
    cursos_alumno = [
        c for c in todos_los_cursos
        if normalizar_texto_curso(c.nombre_curso) == grado_norm
        or normalizar_texto_curso(c.nombre_curso) in grado_norm
        or grado_norm in normalizar_texto_curso(c.nombre_curso)
    ]
    if not cursos_alumno and todos_los_cursos:
        palabras_grado = [p for p in grado_escolar.lower().split() if len(p) > 2]
        cursos_alumno = [
            c for c in todos_los_cursos
            if any(p in c.nombre_curso.lower() for p in palabras_grado)
        ]

    cursos_ids = [c.id_curso for c in cursos_alumno]

    docentes_map = {}
    if cursos_ids:
        res_mats = await db.execute(
            select(MaterialEstudio)
            .options(selectinload(MaterialEstudio.docente), selectinload(MaterialEstudio.curso))
            .where(MaterialEstudio.id_curso.in_(cursos_ids))
            .order_by(MaterialEstudio.fecha_subida.desc())
        )
        materiales_curso = res_mats.scalars().all()

        for m in materiales_curso:
            id_doc = m.id_docente or "institucional"
            nombre_doc = m.docente.username if m.docente else "Docente Institucional"
            nombre_curso = m.curso.nombre_curso if m.curso else grado_escolar

            if id_doc not in docentes_map:
                docentes_map[id_doc] = {
                    "id_docente": id_doc,
                    "nombre_docente": nombre_doc,
                    "nombre_curso": nombre_curso,
                    "materiales": []
                }

            docentes_map[id_doc]["materiales"].append({
                "id": m.id_material,
                "id_material": m.id_material,
                "titulo": m.titulo,
                "descripcion_tarea": m.descripcion_tarea or "Sin indicaciones específicas del docente.",
                "nombre_archivo_original": m.nombre_archivo_original,
                "nombre_archivo": m.nombre_archivo_original,
                "nombre_pdf": m.nombre_pdf,
                "url_pdf": m.url_pdf,
                "tamano_kb": m.tamano_kb,
                "fecha_subida": m.fecha_subida.strftime("%Y-%m-%d %H:%M") if m.fecha_subida else None,
                "nombre_curso": nombre_curso,
                "nombre_docente": nombre_doc,
                "es_propio": False
            })

    return {
        "codigo_estudiante": codigo_seguro,
        "grado_escolar": grado_escolar,
        "materiales_propios": materiales_propios,
        "mis_documentos": materiales_propios,
        "docentes_con_materiales": list(docentes_map.values()),
        "docentes": list(docentes_map.values())
    }


# =========================================================================
# 4. COMPATIBILIDAD CON SUBIDAS PERSONALES PREVIAS DEL ALUMNO
# =========================================================================

@router.post("/subir")
async def subir_material_estudio(
    file: UploadFile = File(...),
    codigo_estudiante: str = Form(...)
):
    """Recibe un archivo personal del alumno y lo almacena para lectura inmersiva."""
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

    carpeta_est_orig = os.path.join(CARPETA_ORIGINALES, codigo_seguro)
    carpeta_est_pdf = os.path.join(CARPETA_PDFS, codigo_seguro)
    os.makedirs(carpeta_est_orig, exist_ok=True)
    os.makedirs(carpeta_est_pdf, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    nombre_guardado_orig = f"{nombre_limpio}_{timestamp}.{ext_limpia}"
    ruta_guardado_orig = os.path.join(carpeta_est_orig, nombre_guardado_orig)

    try:
        with open(ruta_guardado_orig, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando archivo original: {str(e)}")

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
    """Retorna la lista de todos los materiales personales en PDF del estudiante."""
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

    lista.sort(key=lambda x: x["fecha_subida"], reverse=True)
    return {"materiales": lista}


@router.get("/archivo/{codigo_estudiante}/{nombre_pdf}")
async def obtener_archivo_pdf(codigo_estudiante: str, nombre_pdf: str):
    """Sirve el archivo PDF personal del alumno."""
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
    """Permite eliminar un material personal del alumno."""
    codigo_seguro = codigo_estudiante.strip().upper().replace("/", "_").replace("\\", "_")
    ruta_pdf = os.path.join(CARPETA_PDFS, codigo_seguro, nombre_pdf)
    if os.path.exists(ruta_pdf):
        try:
            os.remove(ruta_pdf)
            return {"exito": True, "mensaje": "Archivo eliminado correctamente."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error al eliminar archivo: {str(e)}")
    raise HTTPException(status_code=404, detail="Archivo no encontrado.")
