"""
Módulo de Conversión de Documentos para Modo Estudio de NEUROFOCUS AI
Proyecto: U.E. Luis Barrancos Álvarez - FICCT UAGRM
Postulante: Maykol Jonnathan Villazon Flores

Convierte archivos Word (.docx), PowerPoint (.pptx) e Imágenes (.jpg, .jpeg, .png)
a formato PDF estándar mediante librerías pure-python (Pillow, python-docx, python-pptx, ReportLab),
garantizando compatibilidad universal en cualquier PC sin necesidad de tener instalado Microsoft Office.
"""

import os
import shutil
from typing import Tuple
from PIL import Image

from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether
)
from reportlab.pdfgen import canvas

import docx
from pptx import Presentation


class NumeradorPaginas(canvas.Canvas):
    """
    Canvas personalizado de ReportLab de 2 pasadas para numerar páginas
    y añadir membrete de la U.E. Luis Barrancos Álvarez.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_paginas = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.dibujar_pie_y_encabezado(num_paginas)
            super().showPage()
        super().save()

    def dibujar_pie_y_encabezado(self, total_paginas: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Encabezado sutil
        self.drawString(54, self._pagesize[1] - 36, "NEUROFOCUS AI • Material de Estudio Adaptativo (TDAH)")
        self.drawRightString(self._pagesize[0] - 54, self._pagesize[1] - 36, "U.E. Luis Barrancos Álvarez")
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(54, self._pagesize[1] - 42, self._pagesize[0] - 54, self._pagesize[1] - 42)

        # Pie de página con numeración
        texto_pagina = f"Página {self._pageNumber} de {total_paginas}"
        self.drawRightString(self._pagesize[0] - 54, 32, texto_pagina)
        self.line(54, 44, self._pagesize[0] - 54, 44)
        self.restoreState()


def convertir_imagen_a_pdf(ruta_imagen: str, ruta_salida_pdf: str) -> bool:
    """Convierte un archivo JPG, JPEG o PNG a PDF de alta resolución."""
    try:
        with Image.open(ruta_imagen) as img:
            # Convertir a RGB (eliminando transparencia alfa si es PNG con fondo blanco)
            if img.mode in ("RGBA", "LA", "P"):
                fondo = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                fondo.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
                fondo.save(ruta_salida_pdf, "PDF", resolution=150.0)
            else:
                img.convert("RGB").save(ruta_salida_pdf, "PDF", resolution=150.0)
        return True
    except Exception as e:
        print(f"[CONVERSOR ERROR] Error convirtiendo imagen {ruta_imagen} a PDF:", e)
        return False


def convertir_docx_a_pdf(ruta_docx: str, ruta_salida_pdf: str) -> bool:
    """
    Convierte un documento Word (.docx) a PDF estructurado y estilizado
    utilizando python-docx y ReportLab Platypus.
    """
    try:
        doc = docx.Document(ruta_docx)
        doc_pdf = SimpleDocTemplate(
            ruta_salida_pdf,
            pagesize=letter,
            leftMargin=54,
            rightMargin=54,
            topMargin=54,
            bottomMargin=54
        )

        estilos = getSampleStyleSheet()

        # Estilos personalizados para legibilidad amigable con TDAH
        estilo_titulo = ParagraphStyle(
            'TituloDocx',
            parent=estilos['Title'],
            fontName='Helvetica-Bold',
            fontSize=20,
            leading=24,
            textColor=colors.HexColor('#0f172a'),
            spaceAfter=14
        )
        estilo_h1 = ParagraphStyle(
            'H1Docx',
            parent=estilos['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=15,
            leading=18,
            textColor=colors.HexColor('#0284c7'),
            spaceBefore=12,
            spaceAfter=8
        )
        estilo_h2 = ParagraphStyle(
            'H2Docx',
            parent=estilos['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=15,
            textColor=colors.HexColor('#334155'),
            spaceBefore=10,
            spaceAfter=6
        )
        estilo_cuerpo = ParagraphStyle(
            'CuerpoDocx',
            parent=estilos['Normal'],
            fontName='Helvetica',
            fontSize=10.5,
            leading=15,
            textColor=colors.HexColor('#1e293b'),
            spaceAfter=8
        )
        estilo_lista = ParagraphStyle(
            'ListaDocx',
            parent=estilos['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=14,
            textColor=colors.HexColor('#1e293b'),
            leftIndent=20,
            spaceAfter=4
        )

        historia = []

        # Título principal del documento si el primer párrafo lo amerita
        primer_parrafo = True
        for p in doc.paragraphs:
            texto = p.text.strip()
            if not texto:
                continue

            # Detectar estilo original en Word
            nombre_estilo = p.style.name.lower() if p.style else ""
            if "title" in nombre_estilo or primer_parrafo and len(texto) < 90:
                historia.append(Paragraph(texto, estilo_titulo))
                primer_parrafo = False
            elif "heading 1" in nombre_estilo or "encabezado 1" in nombre_estilo:
                historia.append(Paragraph(texto, estilo_h1))
            elif "heading 2" in nombre_estilo or "encabezado 2" in nombre_estilo:
                historia.append(Paragraph(texto, estilo_h2))
            elif "list" in nombre_estilo or texto.startswith(("-", "•", "*")):
                texto_limpio = texto.lstrip("-•* ")
                historia.append(Paragraph(f"• {texto_limpio}", estilo_lista))
            else:
                historia.append(Paragraph(texto, estilo_cuerpo))

            primer_parrafo = False

        # Si el documento tiene tablas, formatearlas
        for tabla in doc.tables:
            datos_tabla = []
            for fila in tabla.rows:
                fila_texto = [Paragraph(celda.text.strip() or "-", estilo_cuerpo) for celda in fila.cells]
                datos_tabla.append(fila_texto)

            if datos_tabla:
                t = Table(datos_tabla, colWidths=[(504 / max(1, len(datos_tabla[0])))] * len(datos_tabla[0]))
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 6),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ]))
                historia.append(Spacer(1, 10))
                historia.append(t)
                historia.append(Spacer(1, 10))

        if not historia:
            historia.append(Paragraph("Documento de estudio sin contenido legible de texto.", estilo_cuerpo))

        doc_pdf.build(historia, canvasmaker=NumeradorPaginas)
        return True
    except Exception as e:
        print(f"[CONVERSOR ERROR] Error convirtiendo Word (.docx) {ruta_docx} a PDF:", e)
        return False


def convertir_pptx_a_pdf(ruta_pptx: str, ruta_salida_pdf: str) -> bool:
    """
    Convierte una presentación de PowerPoint (.pptx) a PDF apaisado (Landscape),
    formateando cada diapositiva como una tarjeta de lectura visual.
    """
    try:
        prs = Presentation(ruta_pptx)
        # Modo apaisado para asemejar a una pantalla de diapositivas (11 x 8.5 pulgadas)
        doc_pdf = SimpleDocTemplate(
            ruta_salida_pdf,
            pagesize=landscape(letter),
            leftMargin=40,
            rightMargin=40,
            topMargin=40,
            bottomMargin=40
        )

        estilos = getSampleStyleSheet()

        estilo_slide_header = ParagraphStyle(
            'SlideHeader',
            fontName='Helvetica-Bold',
            fontSize=18,
            leading=22,
            textColor=colors.HexColor('#0284c7'),
            spaceAfter=12
        )
        estilo_slide_bullet = ParagraphStyle(
            'SlideBullet',
            fontName='Helvetica',
            fontSize=13,
            leading=18,
            textColor=colors.HexColor('#1e293b'),
            leftIndent=16,
            spaceAfter=8
        )
        estilo_numero_slide = ParagraphStyle(
            'NumeroSlide',
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            textColor=colors.HexColor('#94a3b8'),
            alignment=2 # Derecha
        )

        historia = []

        total_slides = len(prs.slides)
        for idx, slide in enumerate(prs.slides):
            elementos_slide = []

            # Encabezado de la diapositiva
            elementos_slide.append(
                Paragraph(f"DIAPOSITIVA {idx + 1} DE {total_slides}", estilo_numero_slide)
            )

            # Extraer textos y títulos de las figuras
            titulo_slide = None
            textos_slide = []

            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                for p in shape.text_frame.paragraphs:
                    linea = p.text.strip()
                    if not linea:
                        continue
                    if titulo_slide is None:
                        titulo_slide = linea
                    else:
                        textos_slide.append(linea)

            if titulo_slide:
                elementos_slide.append(Paragraph(titulo_slide, estilo_slide_header))
            else:
                elementos_slide.append(Paragraph(f"Diapositiva #{idx + 1}", estilo_slide_header))

            elementos_slide.append(Spacer(1, 10))

            if textos_slide:
                for t in textos_slide:
                    elementos_slide.append(Paragraph(f"• {t}", estilo_slide_bullet))
            else:
                elementos_slide.append(Paragraph("<i>(Diapositiva gráfica / sin texto explicativo)</i>", estilo_slide_bullet))

            # Envolver el contenido en una tarjeta visual
            contenido_tarjeta = [
                Table(
                    [[item] for item in elementos_slide],
                    colWidths=[712],
                    style=[
                        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
                        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
                        ('PADDING', (0, 0), (-1, -1), 20),
                        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ]
                )
            ]

            historia.extend(contenido_tarjeta)

            # Salto de página para la siguiente diapositiva (excepto en la última)
            if idx < total_slides - 1:
                historia.append(PageBreak())

        if not historia:
            historia.append(Paragraph("Presentación sin diapositivas legibles.", estilo_slide_header))

        doc_pdf.build(historia, canvasmaker=NumeradorPaginas)
        return True
    except Exception as e:
        print(f"[CONVERSOR ERROR] Error convirtiendo PowerPoint (.pptx) {ruta_pptx} a PDF:", e)
        return False


def procesar_archivo_a_pdf(ruta_origen: str, carpeta_salida: str) -> Tuple[bool, str, str]:
    """
    Función orquestadora. Toma un archivo subido, detecta su extensión
    y lo almacena/convierte en un PDF dentro de la carpeta_salida.
    
    Retorna: (exito: bool, nombre_pdf_resultante: str, mensaje_error: str)
    """
    os.makedirs(carpeta_salida, exist_ok=True)
    nombre_base = os.path.basename(ruta_origen)
    nombre_sin_ext, ext = os.path.splitext(nombre_base)
    ext_limpia = ext.lower().lstrip(".")

    nombre_pdf_salida = f"{nombre_sin_ext}.pdf"
    ruta_salida_pdf = os.path.join(carpeta_salida, nombre_pdf_salida)

    # 1. Si ya es PDF, simplemente copiar directamente
    if ext_limpia == "pdf":
        try:
            if os.path.abspath(ruta_origen) != os.path.abspath(ruta_salida_pdf):
                shutil.copy2(ruta_origen, ruta_salida_pdf)
            return True, nombre_pdf_salida, "Archivo PDF listo."
        except Exception as e:
            return False, "", f"Error copiando PDF: {str(e)}"

    # 2. Si es Imagen (JPG, JPEG, PNG)
    elif ext_limpia in ("jpg", "jpeg", "png"):
        ok = convertir_imagen_a_pdf(ruta_origen, ruta_salida_pdf)
        if ok:
            return True, nombre_pdf_salida, "Imagen convertida a PDF con éxito."
        return False, "", "Error al convertir imagen a PDF."

    # 3. Si es Word (.docx)
    elif ext_limpia == "docx":
        ok = convertir_docx_a_pdf(ruta_origen, ruta_salida_pdf)
        if ok:
            return True, nombre_pdf_salida, "Documento Word convertido a PDF con éxito."
        return False, "", "Error al convertir documento Word (.docx) a PDF."

    # 4. Si es PowerPoint (.pptx)
    elif ext_limpia == "pptx":
        ok = convertir_pptx_a_pdf(ruta_origen, ruta_salida_pdf)
        if ok:
            return True, nombre_pdf_salida, "Presentación PowerPoint convertida a PDF con éxito."
        return False, "", "Error al convertir diapositivas (.pptx) a PDF."

    else:
        return False, "", f"Formato no soportado: .{ext_limpia}. Sube archivos PDF, DOCX, PPTX o JPG/PNG."

