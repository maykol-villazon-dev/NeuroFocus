import enum
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, BigInteger, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.persistencia.config_db import Base

# Zona Horaria Oficial del Estado Plurinacional de Bolivia: UTC-4 (America/La_Paz)
TZ_BOLIVIA = timezone(timedelta(hours=-4))

def ahora_bolivia() -> datetime:
    """Retorna la fecha y hora oficial de Bolivia (UTC-4) sin zona horaria para compatibilidad SQLite."""
    return datetime.now(TZ_BOLIVIA).replace(tzinfo=None)


# ==========================================
# ENUMERACIONES (ENUMS) DEL SISTEMA
# ==========================================

class RolUsuario(str, enum.Enum):
    ESTUDIANTE = "ESTUDIANTE"
    DOCENTE = "DOCENTE"
    TUTOR = "TUTOR"
    DIRECTOR = "DIRECTOR"
    PSICOLOGO = "PSICOLOGO"
    SUPERADMIN = "SUPERADMIN"


class SubtipoTDAH(str, enum.Enum):
    """Clasificación clínica formal DSM-5-TR (REQ-01 - Sección 2.1.1)."""
    CONTROL = "CONTROL"  # Grupo Control / Neurotípico (Sin diagnóstico de TDAH)
    SIN_TDAH = "SIN_TDAH" # Alias Grupo Control
    F90_0 = "F90_0"      # F90.0: Predominio Déficit de Atención (inattentive)
    F90_1 = "F90_1"      # F90.1: Predominio Hiperactividad/Impulsividad (hyperactive)
    F90_2 = "F90_2"      # F90.2: Presentación Combinada (combined)
    # Alias compatibles por si se consulta por nombre clínico
    inattentive = "inattentive"
    hyperactive = "hyperactive"
    combined = "combined"


class EstadoSesion(str, enum.Enum):
    EN_CURSO = "EN_CURSO"
    FINALIZADA = "FINALIZADA"
    CANCELADA = "CANCELADA"


class EstadoAtencion(str, enum.Enum):
    """
    Taxonomía Cuantitativa de los 4 Estados Atencionales (REQ-20 - Secciones 2.5.1 y 3.3.3).
    Mantiene compatibilidad retrospectiva con ALTA, MEDIA, BAJA y DESCONECTADO.
    """
    ESTADO_1 = "ESTADO_1"   # 80.0% - 100.0% (Hiperfoco / Atención Plena) -> #00F5D4
    ESTADO_2 = "ESTADO_2"   # 60.0% - 79.9% (Atención Sostenida / Óptima) -> #2EC4B6
    ESTADO_3 = "ESTADO_3"   # 40.0% - 59.9% (Desatención Leve / Desvío) -> #FFB703
    ESTADO_4 = "ESTADO_4"   # 0.0% - 39.9% (Desconexión Crítica / Fatiga) -> #7209B7
    # Legado
    ALTA = "ALTA"
    MEDIA = "MEDIA"
    BAJA = "BAJA"
    DESCONECTADO = "DESCONECTADO"


class TipoEventoDesatencion(str, enum.Enum):
    MIRADA_FUERA = "MIRADA_FUERA"       # Pose Cefálica PnP fuera de cono
    SOMNOLENCIA = "SOMNOLENCIA"         # Apertura Ocular EAR / Oclusión prolongada
    INQUIETUD_MOTRIZ = "INQUIETUD_MOTRIZ" # Varianza Hombros / Fidgeting
    ABANDONO_PUESTO = "ABANDONO_PUESTO"   # Criterio DSM-5: Ausencia de rostro / Se levanta de su asiento
    BOSTEZO_FATIGA = "BOSTEZO_FATIGA"     # Apertura Bucal MAR > 0.65 sostenida
    DISTRACTOR_EXTERNO = "DISTRACTOR_EXTERNO" # Detección simultánea de múltiples rostros en encuadre
    MIRADA_PERDIDA = "MIRADA_PERDIDA"     # Ensoñación pasiva / Staring sin parpadeo (F90.0 Inatento)
    HUNDIMIENTO_POSTURAL = "HUNDIMIENTO_POSTURAL" # Slumping / Colapso vertical de tono muscular


class SeveridadEvento(str, enum.Enum):
    LEVE = "LEVE"           # Duración < 3s
    MODERADA = "MODERADA"   # Duración 3s - 10s
    CRITICA = "CRITICA"     # Duración > 10s


class TipoEstimulo(str, enum.Enum):
    AVATAR_REACTIVO = "AVATAR_REACTIVO"
    BORDER_GLOW = "BORDER_GLOW"


# ==========================================
# ENTIDADES / TABLAS ORM (8 CLASES)
# ==========================================

class Usuario(Base):
    __tablename__ = "usuarios"

    id_usuario = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    rol = Column(SQLEnum(RolUsuario), nullable=False, default=RolUsuario.ESTUDIANTE)
    fecha_creacion = Column(DateTime, default=ahora_bolivia)

    # Relationship
    estudiante = relationship("Estudiante", back_populates="usuario", uselist=False)


class Estudiante(Base):
    __tablename__ = "estudiantes"

    id_estudiante = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    codigo_estudiante = Column(String(20), unique=True, nullable=False, index=True) # Ej: EST-2026-001
    nombre_completo = Column(String(100), nullable=False)
    edad = Column(Integer, nullable=True)
    grado_escolar = Column(String(50), nullable=True)
    subtipo_tdah = Column(SQLEnum(SubtipoTDAH), nullable=False, default=SubtipoTDAH.F90_2)
    diagnostico_observacion = Column(Text, nullable=True)
    protegido = Column(Boolean, default=True, nullable=False) # Privacy by Design: True = Malla Facial 3D Anonimizada, False = Rostro Real
    fecha_registro = Column(DateTime, default=ahora_bolivia)
    id_usuario = Column(String(36), ForeignKey("usuarios.id_usuario"), nullable=True)

    # Relationships
    usuario = relationship("Usuario", back_populates="estudiante")
    sesiones = relationship("SesionMonitoreo", back_populates="estudiante", cascade="all, delete-orphan")


class SesionMonitoreo(Base):
    __tablename__ = "sesiones_monitoreo"

    id_sesion = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_estudiante = Column(String(36), ForeignKey("estudiantes.id_estudiante"), nullable=False, index=True)
    fecha_hora_inicio = Column(DateTime, default=ahora_bolivia, nullable=False)
    fecha_hora_fin = Column(DateTime, nullable=True)
    duracion_segundos = Column(Integer, default=0)
    limite_tiempo_segundos = Column(Integer, default=7200) # Cierre automático a las 2 horas
    auto_cerrada = Column(Boolean, default=False)
    estado_sesion = Column(SQLEnum(EstadoSesion), default=EstadoSesion.EN_CURSO)
    promedio_iai = Column(Float, nullable=True)

    # Relationships
    estudiante = relationship("Estudiante", back_populates="sesiones")
    calibracion = relationship("ParametrosCalibracion", back_populates="sesion", uselist=False, cascade="all, delete-orphan")
    metricas = relationship("MetricaAtencional", back_populates="sesion", cascade="all, delete-orphan")
    eventos = relationship("EventoDesatencion", back_populates="sesion", cascade="all, delete-orphan")
    reporte = relationship("ReportePsicopedagogico", back_populates="sesion", uselist=False, cascade="all, delete-orphan")


class ParametrosCalibracion(Base):
    __tablename__ = "parametros_calibracion"

    id_calibracion = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_sesion = Column(String(36), ForeignKey("sesiones_monitoreo.id_sesion"), nullable=False, unique=True)
    ear_base = Column(Float, nullable=False)
    pitch_neutral = Column(Float, nullable=False)
    yaw_neutral = Column(Float, nullable=False)
    roll_neutral = Column(Float, nullable=False)
    varianza_hombros_base = Column(Float, nullable=False)
    fecha_calibracion = Column(DateTime, default=ahora_bolivia)

    # Relationship
    sesion = relationship("SesionMonitoreo", back_populates="calibracion")


class MetricaAtencional(Base):
    __tablename__ = "metricas_atencionales"

    id_metrica = Column(Integer, primary_key=True, autoincrement=True)
    id_sesion = Column(String(36), ForeignKey("sesiones_monitoreo.id_sesion"), nullable=False, index=True)
    timestamp = Column(DateTime, default=ahora_bolivia, nullable=False, index=True)
    valor_ear = Column(Float, nullable=False)
    angulo_yaw = Column(Float, nullable=False)
    angulo_pitch = Column(Float, nullable=False)
    varianza_cinematica = Column(Float, nullable=False)
    indice_iai = Column(Float, nullable=False)
    estado_atencion = Column(SQLEnum(EstadoAtencion), nullable=False)

    # Relationship
    sesion = relationship("SesionMonitoreo", back_populates="metricas")


class EventoDesatencion(Base):
    __tablename__ = "eventos_desatencion"

    id_evento = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_sesion = Column(String(36), ForeignKey("sesiones_monitoreo.id_sesion"), nullable=False, index=True)
    tipo_evento = Column(SQLEnum(TipoEventoDesatencion), nullable=False)
    severidad = Column(SQLEnum(SeveridadEvento), nullable=False)
    timestamp_inicio = Column(DateTime, default=ahora_bolivia, nullable=False)
    timestamp_fin = Column(DateTime, nullable=True)
    duracion_segundos = Column(Float, default=0.0)
    ruta_captura = Column(String(300), nullable=True) # Fotograma biométrico o Malla 3D anonimizada
    ruta_captura_pantalla = Column(String(300), nullable=True) # Screenshot del documento escolar en Modo Estudio
    minuto_relativo = Column(String(20), nullable=True)
    descripcion_automatica = Column(String(300), nullable=True)

    # Relationships
    sesion = relationship("SesionMonitoreo", back_populates="eventos")
    alertas = relationship("AlertaAsistencia", back_populates="evento", cascade="all, delete-orphan")


class AlertaAsistencia(Base):
    __tablename__ = "alertas_asistencia"

    id_alerta = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_evento = Column(String(36), ForeignKey("eventos_desatencion.id_evento"), nullable=False, index=True)
    tipo_estimulo = Column(SQLEnum(TipoEstimulo), nullable=False)
    timestamp = Column(DateTime, default=ahora_bolivia, nullable=False)
    reenganche_exitoso = Column(Boolean, default=True)

    # Relationship
    evento = relationship("EventoDesatencion", back_populates="alertas")


class ReportePsicopedagogico(Base):
    __tablename__ = "reportes_psicopedagogicos"

    id_reporte = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_sesion = Column(String(36), ForeignKey("sesiones_monitoreo.id_sesion"), nullable=False, unique=True)
    fecha_generacion = Column(DateTime, default=ahora_bolivia, nullable=False)
    porcentaje_atencion_alta = Column(Float, default=0.0)
    total_eventos_inquietud = Column(Integer, default=0)
    observaciones_psicopedagogicas = Column(Text, nullable=True)
    ruta_archivo_pdf = Column(String(255), nullable=True)

    # Relationship
    sesion = relationship("SesionMonitoreo", back_populates="reporte")
