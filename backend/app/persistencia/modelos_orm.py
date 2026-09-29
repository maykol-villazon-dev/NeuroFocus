import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, BigInteger, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from app.persistencia.config_db import Base


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


class EstadoSesion(str, enum.Enum):
    EN_CURSO = "EN_CURSO"
    FINALIZADA = "FINALIZADA"
    CANCELADA = "CANCELADA"


class EstadoAtencion(str, enum.Enum):
    ALTA = "ALTA"           # IAI >= 80%
    MEDIA = "MEDIA"         # 50% <= IAI < 80%
    BAJA = "BAJA"           # IAI < 50%
    DESCONECTADO = "DESCONECTADO" # Rostro no detectado


class TipoEventoDesatencion(str, enum.Enum):
    MIRADA_FUERA = "MIRADA_FUERA"       # Pose Cefálica PnP
    SOMNOLENCIA = "SOMNOLENCIA"         # Apertura Ocular EAR
    INQUIETUD_MOTRIZ = "INQUIETUD_MOTRIZ" # Varianza Hombros / Fidgeting


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
    fecha_creacion = Column(DateTime, default=datetime.utcnow)

    # Relationship
    estudiante = relationship("Estudiante", back_populates="usuario", uselist=False)


class Estudiante(Base):
    __tablename__ = "estudiantes"

    id_estudiante = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    codigo_estudiante = Column(String(20), unique=True, nullable=False, index=True) # Ej: EST-2026-001
    nombre_completo = Column(String(100), nullable=False)
    edad = Column(Integer, nullable=True)
    grado_escolar = Column(String(50), nullable=True)
    diagnostico_observacion = Column(Text, nullable=True)
    fecha_registro = Column(DateTime, default=datetime.utcnow)
    id_usuario = Column(String(36), ForeignKey("usuarios.id_usuario"), nullable=True)

    # Relationships
    usuario = relationship("Usuario", back_populates="estudiante")
    sesiones = relationship("SesionMonitoreo", back_populates="estudiante", cascade="all, delete-orphan")


class SesionMonitoreo(Base):
    __tablename__ = "sesiones_monitoreo"

    id_sesion = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_estudiante = Column(String(36), ForeignKey("estudiantes.id_estudiante"), nullable=False, index=True)
    fecha_hora_inicio = Column(DateTime, default=datetime.utcnow, nullable=False)
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
    fecha_calibracion = Column(DateTime, default=datetime.utcnow)

    # Relationship
    sesion = relationship("SesionMonitoreo", back_populates="calibracion")


class MetricaAtencional(Base):
    __tablename__ = "metricas_atencionales"

    id_metrica = Column(BigInteger, primary_key=True, autoincrement=True)
    id_sesion = Column(String(36), ForeignKey("sesiones_monitoreo.id_sesion"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
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
    timestamp_inicio = Column(DateTime, default=datetime.utcnow, nullable=False)
    timestamp_fin = Column(DateTime, nullable=True)
    duracion_segundos = Column(Float, default=0.0)

    # Relationships
    sesion = relationship("SesionMonitoreo", back_populates="eventos")
    alertas = relationship("AlertaAsistencia", back_populates="evento", cascade="all, delete-orphan")


class AlertaAsistencia(Base):
    __tablename__ = "alertas_asistencia"

    id_alerta = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_evento = Column(String(36), ForeignKey("eventos_desatencion.id_evento"), nullable=False, index=True)
    tipo_estimulo = Column(SQLEnum(TipoEstimulo), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    reenganche_exitoso = Column(Boolean, default=True)

    # Relationship
    evento = relationship("EventoDesatencion", back_populates="alertas")


class ReportePsicopedagogico(Base):
    __tablename__ = "reportes_psicopedagogicos"

    id_reporte = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    id_sesion = Column(String(36), ForeignKey("sesiones_monitoreo.id_sesion"), nullable=False, unique=True)
    fecha_generacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    porcentaje_atencion_alta = Column(Float, default=0.0)
    total_eventos_inquietud = Column(Integer, default=0)
    observaciones_psicopedagogicas = Column(Text, nullable=True)
    ruta_archivo_pdf = Column(String(255), nullable=True)

    # Relationship
    sesion = relationship("SesionMonitoreo", back_populates="reporte")
