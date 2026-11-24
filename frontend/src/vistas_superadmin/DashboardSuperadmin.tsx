import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  ShieldCheck,
  Server,
  Database,
  Lock,
  Download,
  KeyRound,
  UserPlus,
  RefreshCw,
  LogOut,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  Activity,
  FileText,
  ChevronRight,
  Filter,
  UserX,
  ExternalLink,
  Sparkles,
  Link as LinkIcon,
  Unlink,
  Eye,
  ShieldAlert,
  BookOpen,
  GraduationCap,
  Plus,
  Trash2,
  Globe,
  CheckSquare,
  Square,
  Edit3,
  X,
  Save
} from 'lucide-react';
import { useAuth } from '../contexto/AuthContext';
import { apiCliente } from '../servicios_ws/api_cliente';
import { ModalNotificacion, ModalNotificacionConfig } from '../componentes_ui/ModalNotificacion';

type SeccionSuperadmin = 'DASHBOARD' | 'ESTUDIANTES_TUTORES' | 'GESTION_CUENTAS' | 'USUARIOS_PENDIENTES' | 'ROLES_PERMISOS' | 'PRIVACIDAD_CAP5' | 'MANTENIMIENTO_SERVIDOR' | 'CURSOS';

export interface RolItem {
  id_rol: string;
  nombre_rol: string;
  descripcion: string | null;
  es_sistema: boolean;
  total_usuarios: number;
  fecha_creacion: string | null;
}

export interface PermisoItem {
  id_permiso: string;
  codigo_permiso: string;
  nombre_permiso: string;
  descripcion: string | null;
  modulo: string;
}

export interface CursoItem {
  id_curso: string;
  nombre_curso: string;
  nivel_academico: string;
  descripcion: string | null;
  activo: boolean;
  fecha_creacion: string | null;
  total_estudiantes: number;
}

interface DashboardStats {
  usuarios_por_rol: Record<string, number>;
  total_usuarios: number;
  estudiantes_por_curso: Record<string, number>;
  distribucion_tdah: Record<string, number>;
  total_sesiones: number;
  sesiones_hoy: number;
  total_consentimientos: number;
  conexiones_activas: number;
  total_pendientes?: number;
}

interface EstudianteTutorItem {
  id_estudiante: string;
  id_usuario?: string | null;
  codigo_estudiante: string;
  nombre_completo: string;
  grado_escolar: string;
  subtipo_tdah: string;
  diagnostico_observacion: string;
  protegido: boolean;
  fecha_registro: string;
  tiene_tutor: boolean;
  id_tutor: string | null;
  nombre_tutor: string | null;
  email_tutor: string | null;
}

interface TutorDisponible {
  id_usuario: string;
  username: string;
  email: string;
}

interface UsuarioItem {
  id_usuario: string;
  username: string;
  email: string;
  rol: string;
  acepto_terminos: boolean;
  activo?: boolean;
  verificado?: boolean;
  fecha_aceptacion_terminos: string | null;
  version_terminos: string;
  fecha_creacion: string | null;
  nombre_completo: string;
  codigo_estudiante: string | null;
  ip_registro?: string | null;
}

export interface DocenteCursosItem {
  id_usuario: string;
  username: string;
  email: string;
  rol: string;
  cursos_asignados: { id_curso: string; nombre_curso: string; nivel_academico: string }[];
  total_cursos: number;
}

export interface UsuarioPendienteItem {
  id_usuario: string;
  username: string;
  email: string;
  rol: string;
  id_rol?: string | null;
  verificado: boolean;
  nombre_completo: string;
  codigo_estudiante?: string | null;
  fecha_solicitud: string | null;
  ip_registro: string;
  user_agent: string;
}

interface RegistroAuditoria {
  id_consentimiento: string;
  id_usuario: string;
  username: string;
  email: string;
  rol_usuario: string;
  codigo_estudiante_asociado: string | null;
  version_documento: string;
  ip_registro: string;
  user_agent: string;
  fecha_hora: string;
}

interface SaludServidor {
  estado: string;
  motor_bd: string;
  tamano_db_mb: number;
  materiales_almacenados_mb: number;
  total_archivos_materiales: number;
  capturas_eventos_mb: number;
  total_archivos_capturas: number;
  almacenamiento_total_mb: number;
  conexiones_ws_activas: number;
  version_api: string;
  timestamp: string;
}

export const DashboardSuperadmin: React.FC = () => {
  const { usuario, logout } = useAuth();
  const [seccionActiva, setSeccionActiva] = useState<SeccionSuperadmin>('DASHBOARD');
  const [cargando, setCargando] = useState<boolean>(false);

  // Estados de datos
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [estudiantes, setEstudiantes] = useState<EstudianteTutorItem[]>([]);
  const [tutoresDisponibles, setTutoresDisponibles] = useState<TutorDisponible[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [auditorias, setAuditorias] = useState<RegistroAuditoria[]>([]);
  const [salud, setSalud] = useState<SaludServidor | null>(null);
  const [cursos, setCursos] = useState<CursoItem[]>([]);

  // Estados de Roles y Permisos Granulares (RBAC)
  const [rolesList, setRolesList] = useState<RolItem[]>([]);
  const [permisosList, setPermisosList] = useState<PermisoItem[]>([]);
  const [matrizPermisos, setMatrizPermisos] = useState<Record<string, string[]>>({});
  const [rolSeleccionadoMatriz, setRolSeleccionadoMatriz] = useState<string>('');
  const [guardandoPermisos, setGuardandoPermisos] = useState<boolean>(false);
  const [modalCrearRol, setModalCrearRol] = useState<boolean>(false);
  const [formNuevoRol, setFormNuevoRol] = useState({ nombre_rol: '', descripcion: '' });

  // Filtros de búsqueda
  const [busquedaUsuario, setBusquedaUsuario] = useState<string>('');
  const [filtroRolUsuario, setFiltroRolUsuario] = useState<string>('');
  const [busquedaEstudiante, setBusquedaEstudiante] = useState<string>('');
  const [filtroTutorEstudiante, setFiltroTutorEstudiante] = useState<'TODOS' | 'CON_TUTOR' | 'SIN_TUTOR'>('TODOS');
  const [filtroRolAuditoria, setFiltroRolAuditoria] = useState<string>('');

  // Modales
  const [modalCrearUsuario, setModalCrearUsuario] = useState<boolean>(false);
  const [modalResetPass, setModalResetPass] = useState<{ abierto: boolean; usuario: UsuarioItem | null; nuevaPass: string }>({
    abierto: false,
    usuario: null,
    nuevaPass: ''
  });
  const [modalCrearCurso, setModalCrearCurso] = useState<boolean>(false);
  const [formNuevoCurso, setFormNuevoCurso] = useState({
    nombre_curso: '',
    nivel_academico: 'Universidad',
    descripcion: ''
  });
  const [modalVincularTutor, setModalVincularTutor] = useState<{ abierto: boolean; estudiante: EstudianteTutorItem | null; tutorSeleccionado: string }>({
    abierto: false,
    estudiante: null,
    tutorSeleccionado: ''
  });
  const [modalEliminarUsuario, setModalEliminarUsuario] = useState<{
    abierto: boolean;
    id_usuario: string;
    username: string;
    rol: string;
    nombre_completo?: string;
  }>({
    abierto: false,
    id_usuario: '',
    username: '',
    rol: ''
  });

  const [modalEliminarRol, setModalEliminarRol] = useState<{
    abierto: boolean;
    id_rol: string;
    nombre_rol: string;
    total_usuarios: number;
  }>({
    abierto: false,
    id_rol: '',
    nombre_rol: '',
    total_usuarios: 0
  });

  // Usuarios Pendientes de Validación
  const [usuariosPendientes, setUsuariosPendientes] = useState<UsuarioPendienteItem[]>([]);
  const [modalAprobarUsuario, setModalAprobarUsuario] = useState<{
    abierto: boolean;
    usuario: UsuarioPendienteItem | null;
    rolAsignar: string;
  }>({
    abierto: false,
    usuario: null,
    rolAsignar: ''
  });
  const [modalRechazarUsuario, setModalRechazarUsuario] = useState<{
    abierto: boolean;
    usuario: UsuarioPendienteItem | null;
  }>({
    abierto: false,
    usuario: null
  });

  const [modalCambiarRol, setModalCambiarRol] = useState<{
    abierto: boolean;
    usuario: UsuarioItem | null;
    nuevoRol: string;
  }>({
    abierto: false,
    usuario: null,
    nuevoRol: ''
  });

  // Estados para Asignación Docente - Cursos
  const [subtabCursos, setSubtabCursos] = useState<'CATALOGO' | 'ASIGNACION_DOCENTES'>('CATALOGO');
  const [docentesCursosList, setDocentesCursosList] = useState<DocenteCursosItem[]>([]);
  const [cargandoDocentesCursos, setCargandoDocentesCursos] = useState<boolean>(false);
  const [modalAsignarCursosDocente, setModalAsignarCursosDocente] = useState<{
    abierto: boolean;
    docente: DocenteCursosItem | null;
    cursosSeleccionados: string[];
  }>({
    abierto: false,
    docente: null,
    cursosSeleccionados: []
  });

  // Modal de notificación general
  const [modalNotificacion, setModalNotificacion] = useState<ModalNotificacionConfig>({
    abierto: false,
    titulo: '',
    mensaje: ''
  });

  // Formulario nuevo usuario
  const [formNuevoUsuario, setFormNuevoUsuario] = useState({
    username: '',
    email: '',
    password: '',
    rol: 'DOCENTE',
    nombre_completo: '',
    codigo_estudiante: '',
    grado_escolar: '1º de Secundaria',
    subtipo_tdah: 'F90_2',
    diagnostico_observacion: ''
  });

  // Carga de datos según sección
  const cargarDashboard = async () => {
    setCargando(true);
    try {
      const resp = await apiCliente.get('/superadmin/dashboard-stats');
      setStats(resp.data);
    } catch (err) {
      console.warn('Error cargando stats de dashboard:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarEstudiantesTutores = async () => {
    setCargando(true);
    try {
      const resp = await apiCliente.get('/superadmin/estudiantes-tutores');
      setEstudiantes(resp.data.estudiantes);
      setTutoresDisponibles(resp.data.tutores_disponibles);
    } catch (err) {
      console.warn('Error cargando estudiantes y tutores:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarUsuarios = async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (busquedaUsuario.trim()) params.append('busqueda', busquedaUsuario.trim());
      if (filtroRolUsuario.trim()) params.append('rol', filtroRolUsuario.trim());
      const resp = await apiCliente.get(`/superadmin/usuarios?${params.toString()}`);
      setUsuarios(resp.data.usuarios);
    } catch (err) {
      console.warn('Error cargando usuarios:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarUsuariosPendientes = async () => {
    setCargando(true);
    try {
      const resp = await apiCliente.get('/superadmin/usuarios/pendientes');
      setUsuariosPendientes(resp.data.solicitudes || []);
      if (rolesList.length === 0) {
        cargarRolesYPermisos();
      }
    } catch (err) {
      console.warn('Error cargando usuarios pendientes:', err);
    } finally {
      setCargando(false);
    }
  };

  const handleConfirmarAprobarUsuario = async () => {
    if (!modalAprobarUsuario.usuario) return;
    try {
      const resp = await apiCliente.put(`/superadmin/usuarios/${modalAprobarUsuario.usuario.id_usuario}/aprobar`, {
        nuevo_rol: modalAprobarUsuario.rolAsignar || undefined
      });
      const usuarioAprobado = modalAprobarUsuario.usuario.username;
      setModalAprobarUsuario({ abierto: false, usuario: null, rolAsignar: '' });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Usuario Aprobado y Activado',
        mensaje: resp.data?.mensaje || `El usuario '${usuarioAprobado}' ha sido activado correctamente.`
      });
      cargarUsuariosPendientes();
      cargarDashboard();
      cargarUsuarios();
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Error al Aprobar',
        mensaje: err.response?.data?.detail || 'No se pudo aprobar la solicitud del usuario.'
      });
    }
  };

  const handleConfirmarRechazarUsuario = async () => {
    if (!modalRechazarUsuario.usuario) return;
    try {
      const resp = await apiCliente.delete(`/superadmin/usuarios/${modalRechazarUsuario.usuario.id_usuario}/rechazar`);
      const usuarioRechazado = modalRechazarUsuario.usuario.username;
      setModalRechazarUsuario({ abierto: false, usuario: null });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Solicitud Rechazada',
        mensaje: resp.data?.mensaje || `La solicitud de '${usuarioRechazado}' fue descartada.`
      });
      cargarUsuariosPendientes();
      cargarDashboard();
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Error al Rechazar',
        mensaje: err.response?.data?.detail || 'No se pudo rechazar la solicitud.'
      });
    }
  };

  const cargarAuditoriaLegal = async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (filtroRolAuditoria.trim()) params.append('rol', filtroRolAuditoria.trim());
      const resp = await apiCliente.get(`/superadmin/auditoria-legal?${params.toString()}`);
      setAuditorias(resp.data.registros);
    } catch (err) {
      console.warn('Error cargando auditoría legal:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarSaludServidor = async () => {
    setCargando(true);
    try {
      const resp = await apiCliente.get('/superadmin/servidor-salud');
      setSalud(resp.data);
    } catch (err) {
      console.warn('Error cargando salud del servidor:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarCursos = async () => {
    setCargando(true);
    try {
      const resp = await apiCliente.get('/superadmin/cursos');
      setCursos(resp.data.cursos);
    } catch (err) {
      console.warn('Error cargando cursos:', err);
    } finally {
      setCargando(false);
    }
  };

  const cargarRolesYPermisos = async () => {
    setCargando(true);
    try {
      const resp = await apiCliente.get('/superadmin/roles-permisos');
      setRolesList(resp.data.roles);
      setPermisosList(resp.data.permisos);
      setMatrizPermisos(resp.data.matriz);
      if (resp.data.roles && resp.data.roles.length > 0) {
        setRolSeleccionadoMatriz(prev => prev || resp.data.roles[0].id_rol);
      }
    } catch (err) {
      console.warn('Error cargando roles y permisos:', err);
    } finally {
      setCargando(false);
    }
  };

  const togglePermisoRol = (id_rol: string, codigo_permiso: string) => {
    setMatrizPermisos(prev => {
      const actuales = prev[id_rol] || [];
      const yaTiene = actuales.includes(codigo_permiso);
      const nuevos = yaTiene
        ? actuales.filter(p => p !== codigo_permiso)
        : [...actuales, codigo_permiso];
      return { ...prev, [id_rol]: nuevos };
    });
  };

  const handleGuardarPermisosRol = async (id_rol: string) => {
    const rolObj = rolesList.find(r => r.id_rol === id_rol);
    const nombreRol = rolObj?.nombre_rol || 'Rol';
    setGuardandoPermisos(true);
    try {
      const perms = matrizPermisos[id_rol] || [];
      await apiCliente.put(`/superadmin/roles/${id_rol}/permisos`, { permisos: perms });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Permisos Actualizados',
        mensaje: `La configuración de permisos para el rol '${nombreRol}' fue guardada exitosamente (${perms.length} permisos activos).`
      });
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Fallo al Guardar',
        mensaje: err.response?.data?.detail || 'No se pudieron actualizar los permisos del rol.'
      });
    } finally {
      setGuardandoPermisos(false);
    }
  };

  const handleCrearNuevoRol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNuevoRol.nombre_rol.trim()) return;
    try {
      const resp = await apiCliente.post('/superadmin/roles', {
        nombre_rol: formNuevoRol.nombre_rol.trim(),
        descripcion: formNuevoRol.descripcion.trim() || undefined
      });
      setModalCrearRol(false);
      setFormNuevoRol({ nombre_rol: '', descripcion: '' });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Rol Creado',
        mensaje: resp.data.mensaje || 'El nuevo rol fue creado exitosamente.'
      });
      cargarRolesYPermisos();
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'No se Pudo Crear el Rol',
        mensaje: err.response?.data?.detail || 'Error al registrar el rol.'
      });
    }
  };

  const handleConfirmarEliminarRol = async () => {
    if (!modalEliminarRol.id_rol) return;
    try {
      const resp = await apiCliente.delete(`/superadmin/roles/${modalEliminarRol.id_rol}`);
      const borrado = modalEliminarRol.nombre_rol;
      setModalEliminarRol({ abierto: false, id_rol: '', nombre_rol: '', total_usuarios: 0 });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Rol Eliminado',
        mensaje: resp.data?.mensaje || `El rol '${borrado}' fue eliminado correctamente.`
      });
      await cargarRolesYPermisos();
      setRolSeleccionadoMatriz('');
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'No se Pudo Eliminar el Rol',
        mensaje: err.response?.data?.detail || 'Error al eliminar el rol seleccionado.'
      });
    }
  };

  const handleConfirmarCambioRol = async () => {
    if (!modalCambiarRol.usuario || !modalCambiarRol.nuevoRol) return;
    try {
      const resp = await apiCliente.put(`/superadmin/usuarios/${modalCambiarRol.usuario.id_usuario}/rol`, {
        nuevo_rol: modalCambiarRol.nuevoRol
      });
      const usuarioNombre = modalCambiarRol.usuario.username;
      const rolNuevo = modalCambiarRol.nuevoRol;
      setModalCambiarRol({ abierto: false, usuario: null, nuevoRol: '' });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Rol Actualizado',
        mensaje: resp.data?.mensaje || `El rol de '${usuarioNombre}' fue cambiado a '${rolNuevo}' correctamente.`
      });
      cargarUsuarios();
      cargarDashboard();
      cargarRolesYPermisos();
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Error al Cambiar Rol',
        mensaje: err.response?.data?.detail || 'No se pudo actualizar el rol del usuario.'
      });
    }
  };

  useEffect(() => {
    if (seccionActiva === 'DASHBOARD') cargarDashboard();
    if (seccionActiva === 'ESTUDIANTES_TUTORES') cargarEstudiantesTutores();
    if (seccionActiva === 'GESTION_CUENTAS') cargarUsuarios();
    if (seccionActiva === 'USUARIOS_PENDIENTES') {
      cargarUsuariosPendientes();
      if (rolesList.length === 0) cargarRolesYPermisos();
    }
    if (seccionActiva === 'ROLES_PERMISOS') cargarRolesYPermisos();
    if (seccionActiva === 'PRIVACIDAD_CAP5') cargarAuditoriaLegal();
    if (seccionActiva === 'MANTENIMIENTO_SERVIDOR') cargarSaludServidor();
    if (seccionActiva === 'CURSOS') {
      cargarCursos();
      cargarDocentesCursos();
    }
  }, [seccionActiva]);

  // Recarga bajo demanda
  const refrescarDatosActuales = () => {
    if (seccionActiva === 'DASHBOARD') cargarDashboard();
    if (seccionActiva === 'ESTUDIANTES_TUTORES') cargarEstudiantesTutores();
    if (seccionActiva === 'GESTION_CUENTAS') cargarUsuarios();
    if (seccionActiva === 'USUARIOS_PENDIENTES') {
      cargarUsuariosPendientes();
      cargarRolesYPermisos();
    }
    if (seccionActiva === 'ROLES_PERMISOS') cargarRolesYPermisos();
    if (seccionActiva === 'PRIVACIDAD_CAP5') cargarAuditoriaLegal();
    if (seccionActiva === 'MANTENIMIENTO_SERVIDOR') cargarSaludServidor();
    if (seccionActiva === 'CURSOS') {
      cargarCursos();
      cargarDocentesCursos();
    }
  };

  const handleCrearCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNuevoCurso.nombre_curso.trim()) return;
    try {
      await apiCliente.post('/superadmin/cursos', formNuevoCurso);
      setModalCrearCurso(false);
      const creado = formNuevoCurso.nombre_curso;
      setFormNuevoCurso({ nombre_curso: '', nivel_academico: 'Universidad', descripcion: '' });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Curso Registrado',
        mensaje: `El curso '${creado}' fue creado exitosamente y ya está disponible para matriculación.`
      });
      cargarCursos();
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Fallo al Crear Curso',
        mensaje: err.response?.data?.detail || 'No se pudo crear el curso.'
      });
    }
  };

  const cargarDocentesCursos = async () => {
    setCargandoDocentesCursos(true);
    try {
      const resp = await apiCliente.get('/superadmin/docentes-cursos');
      setDocentesCursosList(resp.data.docentes || []);
    } catch (err) {
      console.warn('Error al cargar docentes y cursos:', err);
    } finally {
      setCargandoDocentesCursos(false);
    }
  };

  const handleGuardarCursosDocente = async () => {
    if (!modalAsignarCursosDocente.docente) return;
    try {
      await apiCliente.put(`/superadmin/docentes/${modalAsignarCursosDocente.docente.id_usuario}/cursos`, {
        cursos_ids: modalAsignarCursosDocente.cursosSeleccionados
      });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Cursos Asignados',
        mensaje: `Se actualizaron los cursos del docente '${modalAsignarCursosDocente.docente.username}' correctamente.`
      });
      setModalAsignarCursosDocente({ abierto: false, docente: null, cursosSeleccionados: [] });
      cargarDocentesCursos();
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Error al Asignar Cursos',
        mensaje: err.response?.data?.detail || 'No se pudieron asignar los cursos.'
      });
    }
  };

  const toggleCursoSeleccionado = (idCurso: string) => {
    setModalAsignarCursosDocente(prev => {
      const existe = prev.cursosSeleccionados.includes(idCurso);
      return {
        ...prev,
        cursosSeleccionados: existe
          ? prev.cursosSeleccionados.filter(id => id !== idCurso)
          : [...prev.cursosSeleccionados, idCurso]
      };
    });
  };

  const handleAlternarEstadoCurso = async (c: CursoItem) => {
    try {
      const nuevoEstado = !c.activo;
      await apiCliente.put(`/superadmin/cursos/${c.id_curso}/estado`, { activo: nuevoEstado });
      setCursos(prev => prev.map(item => item.id_curso === c.id_curso ? { ...item, activo: nuevoEstado } : item));
      setModalNotificacion({
        abierto: true,
        tipo: nuevoEstado ? 'EXITO' : 'ADVERTENCIA',
        titulo: 'Estado Modificado',
        mensaje: `El curso '${c.nombre_curso}' ahora está ${nuevoEstado ? 'Activo' : 'Desactivado'}.`
      });
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Fallo de Actualización',
        mensaje: err.response?.data?.detail || 'No se pudo actualizar el estado del curso.'
      });
    }
  };

  const handleEliminarCurso = async (c: CursoItem) => {
    if (!confirm(`¿Estás seguro de eliminar el curso "${c.nombre_curso}"?`)) return;
    try {
      await apiCliente.delete(`/superadmin/cursos/${c.id_curso}`);
      setCursos(prev => prev.filter(item => item.id_curso !== c.id_curso));
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Curso Eliminado',
        mensaje: `El curso '${c.nombre_curso}' fue eliminado correctamente.`
      });
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'No se Pudo Eliminar',
        mensaje: err.response?.data?.detail || 'No se pudo eliminar el curso.'
      });
    }
  };

  // Guardar nuevo usuario
  const handleCrearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiCliente.post('/superadmin/usuarios', formNuevoUsuario);
      setModalCrearUsuario(false);
      setFormNuevoUsuario({
        username: '',
        email: '',
        password: '',
        rol: 'DOCENTE',
        nombre_completo: '',
        codigo_estudiante: '',
        grado_escolar: '1º de Secundaria',
        subtipo_tdah: 'F90_2',
        diagnostico_observacion: ''
      });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Usuario Creado',
        mensaje: `La cuenta '${formNuevoUsuario.username}' fue creada y registrada con consentimiento legal.`
      });
      cargarUsuarios();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'No se pudo crear el usuario.';
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Error al Crear',
        mensaje: String(msg)
      });
    }
  };

  // Resetear Password
  const handleConfirmarResetPass = async () => {
    if (!modalResetPass.usuario || !modalResetPass.nuevaPass.trim()) return;
    try {
      await apiCliente.put(`/superadmin/usuarios/${modalResetPass.usuario.id_usuario}/reset-password`, {
        nueva_password: modalResetPass.nuevaPass.trim()
      });
      setModalResetPass({ abierto: false, usuario: null, nuevaPass: '' });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Contraseña Actualizada',
        mensaje: `La contraseña para '${modalResetPass.usuario.username}' fue reestablecida exitosamente.`
      });
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Fallo al Restablecer',
        mensaje: err.response?.data?.detail || 'No se pudo actualizar la contraseña.'
      });
    }
  };

  // Alternar Activo/Inactivo
  const handleAlternarEstado = async (u: UsuarioItem) => {
    try {
      const estadoActual = u.activo !== undefined ? u.activo : true;
      const nuevoEstado = !estadoActual;
      await apiCliente.put(`/superadmin/usuarios/${u.id_usuario}/estado`, { activo: nuevoEstado });
      setUsuarios(prev => prev.map(item => item.id_usuario === u.id_usuario ? { ...item, activo: nuevoEstado } : item));
      setModalNotificacion({
        abierto: true,
        tipo: nuevoEstado ? 'EXITO' : 'ADVERTENCIA',
        titulo: 'Estado Modificado',
        mensaje: `La cuenta de '${u.username}' ahora está ${nuevoEstado ? 'Activa' : 'Desactivada (Suspendida)'}.`
      });
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Operación Denegada',
        mensaje: err.response?.data?.detail || 'No se pudo modificar el estado del usuario.'
      });
    }
  };

  // Vincular/Desvincular Tutor
  const handleGuardarVinculoTutor = async () => {
    if (!modalVincularTutor.estudiante) return;
    try {
      await apiCliente.put('/superadmin/vincular-tutor', {
        id_estudiante: modalVincularTutor.estudiante.id_estudiante,
        id_tutor: modalVincularTutor.tutorSeleccionado || null
      });
      setModalVincularTutor({ abierto: false, estudiante: null, tutorSeleccionado: '' });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Vínculo Actualizado',
        mensaje: 'La relación tutor-estudiante ha sido guardada en la base de datos.'
      });
      cargarEstudiantesTutores();
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'Fallo de Vinculación',
        mensaje: err.response?.data?.detail || 'No se pudo actualizar el tutor del estudiante.'
      });
    }
  };

  // Eliminar Usuario y sus Datos Vinculados (Superadmin)
  const handleConfirmarEliminarUsuario = async () => {
    if (!modalEliminarUsuario.id_usuario) return;
    try {
      const resp = await apiCliente.delete(`/superadmin/usuarios/${modalEliminarUsuario.id_usuario}`);
      const nombreEliminado = modalEliminarUsuario.nombre_completo || modalEliminarUsuario.username;
      setModalEliminarUsuario({ abierto: false, id_usuario: '', username: '', rol: '' });
      setModalNotificacion({
        abierto: true,
        tipo: 'EXITO',
        titulo: 'Usuario Eliminado',
        mensaje: resp.data?.mensaje || `El usuario '${nombreEliminado}' fue eliminado permanentemente de la base de datos.`
      });
      // Recargar vistas relacionadas
      cargarUsuarios();
      cargarEstudiantesTutores();
      cargarDashboard();
      cargarCursos();
    } catch (err: any) {
      setModalNotificacion({
        abierto: true,
        tipo: 'ERROR',
        titulo: 'No se Pudo Eliminar',
        mensaje: err.response?.data?.detail || 'Error al eliminar el usuario.'
      });
    }
  };

  // Descargar Respaldo de Base de Datos
  const handleDescargarBackupDB = () => {
    const a = document.createElement('a');
    a.href = '/api/v1/superadmin/descargar-backup-db';
    a.download = `backup_monitoreo_tdah_${new Date().toISOString().slice(0, 10)}.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Exportar auditoría a CSV
  const handleExportarAuditoriaCSV = () => {
    if (!auditorias.length) return;
    const encabezados = ['ID Consentimiento', 'Usuario', 'Email', 'Rol', 'Cod Estudiante', 'Version', 'IP', 'Navegador/UserAgent', 'FechaHora'];
    const filas = auditorias.map(a => [
      a.id_consentimiento,
      a.username,
      a.email,
      a.rol_usuario,
      a.codigo_estudiante_asociado || 'N/A',
      a.version_documento,
      a.ip_registro,
      `"${a.user_agent.replace(/"/g, '""')}"`,
      a.fecha_hora
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [encabezados.join(','), ...filas.map(f => f.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `auditoria_consentimientos_neurofocus_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtros en memoria para estudiantes
  const estudiantesFiltrados = estudiantes.filter(e => {
    const cumpleTexto = e.nombre_completo.toLowerCase().includes(busquedaEstudiante.toLowerCase()) ||
                         e.codigo_estudiante.toLowerCase().includes(busquedaEstudiante.toLowerCase());
    if (!cumpleTexto) return false;
    if (filtroTutorEstudiante === 'CON_TUTOR') return e.tiene_tutor;
    if (filtroTutorEstudiante === 'SIN_TUTOR') return !e.tiene_tutor;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans selection:bg-indigo-500 selection:text-white">

      {/* ========================================================================= */}
      {/* MENÚ LATERAL PERSISTENTE (SIDEBAR DARK GLASS)                            */}
      {/* ========================================================================= */}
      <aside className="w-full md:w-72 bg-slate-900/90 border-r border-slate-800/80 flex flex-col justify-between shrink-0 p-5 backdrop-blur-xl">
        <div className="space-y-6">
          
          {/* Brand Header */}
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <h1 className="text-sm font-black tracking-wider text-white flex items-center gap-1.5 font-mono">
                NEUROFOCUS<span className="text-indigo-400">AI</span>
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-300/80 block">
                Superadministrador
              </span>
            </div>
          </div>

          {/* Menú de Navegación Lateral */}
          <nav className="space-y-1.5 text-xs font-semibold">
            <button
              onClick={() => setSeccionActiva('DASHBOARD')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'DASHBOARD'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dashboard Global</span>
            </button>

            <button
              onClick={() => setSeccionActiva('ESTUDIANTES_TUTORES')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'ESTUDIANTES_TUTORES'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Estudiantes y Tutores</span>
            </button>

            <button
              onClick={() => setSeccionActiva('CURSOS')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'CURSOS'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>Cursos y Niveles</span>
            </button>

            <button
              onClick={() => setSeccionActiva('GESTION_CUENTAS')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'GESTION_CUENTAS'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>Gestión de Usuarios</span>
            </button>

            <button
              onClick={() => setSeccionActiva('USUARIOS_PENDIENTES')}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'USUARIOS_PENDIENTES'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Usuarios Pendientes</span>
              </div>
              {(stats?.total_pendientes || 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {stats?.total_pendientes}
                </span>
              )}
            </button>

            <button
              onClick={() => setSeccionActiva('ROLES_PERMISOS')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'ROLES_PERMISOS'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Roles y Permisos</span>
            </button>

            <button
              onClick={() => setSeccionActiva('PRIVACIDAD_CAP5')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'PRIVACIDAD_CAP5'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span>Oficial de Privacidad (Cap. 5)</span>
            </button>

            <button
              onClick={() => setSeccionActiva('MANTENIMIENTO_SERVIDOR')}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition cursor-pointer text-left ${
                seccionActiva === 'MANTENIMIENTO_SERVIDOR'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Server className="w-4 h-4 shrink-0" />
              <span>Mantenimiento y Servidor</span>
            </button>
          </nav>
        </div>

        {/* Footer del Menú Lateral: Perfil y Logout */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">{usuario?.username || 'superadmin'}</p>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Oficial TI / Activo
              </span>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-xl transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* CONTENIDO PRINCIPAL                                                       */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        
        {/* Topbar Superior */}
        <header className="h-20 px-6 sm:px-8 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              {seccionActiva === 'DASHBOARD' && <LayoutDashboard className="w-5 h-5 text-indigo-400" />}
              {seccionActiva === 'ESTUDIANTES_TUTORES' && <Users className="w-5 h-5 text-indigo-400" />}
              {seccionActiva === 'CURSOS' && <BookOpen className="w-5 h-5 text-indigo-400" />}
              {seccionActiva === 'GESTION_CUENTAS' && <UserCheck className="w-5 h-5 text-indigo-400" />}
              {seccionActiva === 'USUARIOS_PENDIENTES' && <Clock className="w-5 h-5 text-amber-400" />}
              {seccionActiva === 'ROLES_PERMISOS' && <KeyRound className="w-5 h-5 text-indigo-400" />}
              {seccionActiva === 'PRIVACIDAD_CAP5' && <Lock className="w-5 h-5 text-indigo-400" />}
              {seccionActiva === 'MANTENIMIENTO_SERVIDOR' && <Server className="w-5 h-5 text-indigo-400" />}
              <span>
                {seccionActiva === 'DASHBOARD' && 'Dashboard Ejecutivo y Métricas Globales'}
                {seccionActiva === 'ESTUDIANTES_TUTORES' && 'Directorio de Estudiantes y Vínculo de Tutores'}
                {seccionActiva === 'CURSOS' && 'Catálogo de Cursos y Grados Académicos'}
                {seccionActiva === 'GESTION_CUENTAS' && 'Control de Cuentas de Usuario'}
                {seccionActiva === 'USUARIOS_PENDIENTES' && 'Validación de Cuentas y Solicitudes Pendientes'}
                {seccionActiva === 'ROLES_PERMISOS' && 'Matriz de Roles y Permisos Granulares'}
                {seccionActiva === 'PRIVACIDAD_CAP5' && 'Auditoría Legal de Consentimientos (Capítulo 5)'}
                {seccionActiva === 'MANTENIMIENTO_SERVIDOR' && 'Estado del Servidor, Base de Datos y Archivos'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestión centralizada del sistema para personal de infraestructura y seguridad de datos
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refrescarDatosActuales}
              disabled={cargando}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition flex items-center gap-1.5 text-xs font-semibold"
              title="Refrescar datos"
            >
              <RefreshCw className={`w-4 h-4 text-cyan-400 ${cargando ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refrescar</span>
            </button>
          </div>
        </header>

        {/* Cuerpo de la Sección Activa */}
        <div className="p-6 sm:p-8 space-y-6">

          {/* ========================================================================= */}
          {/* SECCIÓN 1: DASHBOARD GLOBAL                                              */}
          {/* ========================================================================= */}
          {seccionActiva === 'DASHBOARD' && stats && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Tarjetas de Conteo por Rol */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Estudiantes</span>
                  <p className="text-2xl font-black text-white font-mono">{stats.usuarios_por_rol.ESTUDIANTE || 0}</p>
                  <span className="text-[10px] text-cyan-400 font-medium">Alumnos en Plataforma</span>
                </div>

                <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Docentes</span>
                  <p className="text-2xl font-black text-white font-mono">{stats.usuarios_por_rol.DOCENTE || 0}</p>
                  <span className="text-[10px] text-indigo-400 font-medium">Profesores de Aula</span>
                </div>

                <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Tutores</span>
                  <p className="text-2xl font-black text-white font-mono">{stats.usuarios_por_rol.TUTOR || 0}</p>
                  <span className="text-[10px] text-amber-400 font-medium">Padres de Familia</span>
                </div>

                <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Psicólogos</span>
                  <p className="text-2xl font-black text-white font-mono">{stats.usuarios_por_rol.PSICOLOGO || 0}</p>
                  <span className="text-[10px] text-purple-400 font-medium">Gabinete Psicológico</span>
                </div>

                <div className="p-5 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Directores</span>
                  <p className="text-2xl font-black text-white font-mono">{stats.usuarios_por_rol.DIRECTOR || 0}</p>
                  <span className="text-[10px] text-emerald-400 font-medium">Dirección Académica</span>
                </div>

                <div className="p-5 bg-slate-900/80 rounded-2xl border border-indigo-500/30 space-y-2 bg-gradient-to-br from-indigo-950/40 to-slate-900">
                  <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block">Total Cuentas</span>
                  <p className="text-2xl font-black text-white font-mono">{stats.total_usuarios}</p>
                  <span className="text-[10px] text-indigo-400 font-medium">Usuarios Registrados</span>
                </div>
              </div>

              {/* Fila 2: Cursos y Distribución Clínica */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Estudiantes por Curso */}
                <div className="p-6 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-cyan-400" /> Distribución de Estudiantes por Curso
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">
                      {Object.values(stats.estudiantes_por_curso).reduce((a, b) => a + b, 0)} Alumnos
                    </span>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(stats.estudiantes_por_curso).map(([curso, cant]) => {
                      const totalEst = Math.max(1, stats.usuarios_por_rol.ESTUDIANTE || 1);
                      const porcentaje = Math.round((cant / totalEst) * 100);
                      return (
                        <div key={curso} className="space-y-1 text-xs">
                          <div className="flex justify-between text-slate-300 font-medium">
                            <span>{curso}</span>
                            <span className="font-mono text-cyan-400 font-bold">{cant} ({porcentaje}%)</span>
                          </div>
                          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full transition-all duration-500"
                              style={{ width: `${porcentaje}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Distribución Clínica DSM-5-TR */}
                <div className="p-6 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-400" /> Clasificación Clínica DSM-5-TR (TDAH)
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">Protocolo Clínico</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {Object.entries(stats.distribucion_tdah).map(([sub, cant]) => (
                      <div key={sub} className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-1">
                        <span className="text-[11px] text-slate-400 font-medium block truncate">{sub}</span>
                        <p className="text-lg font-bold text-purple-300 font-mono">{cant} <span className="text-xs text-slate-500">casos</span></p>
                      </div>
                    ))}
                  </div>

                  {/* Resumen de actividad del día */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                    <span>Sesiones monitoreadas hoy: <strong className="text-emerald-400 font-mono">{stats.sesiones_hoy}</strong></span>
                    <span>Sesiones históricas: <strong className="text-indigo-400 font-mono">{stats.total_sesiones}</strong></span>
                  </div>
                </div>

              </div>

            </div>
          )}



          {/* ========================================================================= */}
          {/* SECCIÓN 2: ESTUDIANTES Y VINCULACIÓN CON TUTORES                          */}
          {/* ========================================================================= */}
          {seccionActiva === 'ESTUDIANTES_TUTORES' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Barra de Filtros y Búsqueda */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={busquedaEstudiante}
                    onChange={(e) => setBusquedaEstudiante(e.target.value)}
                    placeholder="Buscar por nombre o código..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs text-slate-400">Filtrar por Tutor:</span>
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      onClick={() => setFiltroTutorEstudiante('TODOS')}
                      className={`px-3 py-1 rounded-lg font-semibold transition ${filtroTutorEstudiante === 'TODOS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      Todos ({estudiantes.length})
                    </button>
                    <button
                      onClick={() => setFiltroTutorEstudiante('CON_TUTOR')}
                      className={`px-3 py-1 rounded-lg font-semibold transition ${filtroTutorEstudiante === 'CON_TUTOR' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      Con Tutor
                    </button>
                    <button
                      onClick={() => setFiltroTutorEstudiante('SIN_TUTOR')}
                      className={`px-3 py-1 rounded-lg font-semibold transition ${filtroTutorEstudiante === 'SIN_TUTOR' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      Sin Tutor
                    </button>
                  </div>
                </div>
              </div>

              {/* Fichas de Estudiantes */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {estudiantesFiltrados.map((est) => (
                  <div
                    key={est.id_estudiante}
                    className="p-5 bg-slate-900/90 rounded-3xl border border-slate-800 hover:border-slate-700 transition space-y-4 shadow-xl"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                          {est.codigo_estudiante}
                        </span>
                        <h4 className="text-sm font-bold text-white mt-1.5">{est.nombre_completo}</h4>
                        <p className="text-xs text-slate-400">{est.grado_escolar} • {est.subtipo_tdah}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {est.id_usuario && (
                          <button
                            onClick={() => setModalEliminarUsuario({
                              abierto: true,
                              id_usuario: est.id_usuario!,
                              username: est.codigo_estudiante,
                              rol: 'ESTUDIANTE',
                              nombre_completo: est.nombre_completo
                            })}
                            className="p-2 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-xl transition border border-slate-700 hover:border-rose-500/40"
                            title="Eliminar estudiante permanentemente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-300">
                          {est.nombre_completo.slice(0, 2).toUpperCase()}
                        </div>
                      </div>
                    </div>

                    {/* Estado del Tutor Asignado */}
                    <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-400" /> Tutor / Apoderado:
                        </span>
                        {est.tiene_tutor ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Asignado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Sin Asignar
                          </span>
                        )}
                      </div>

                      {est.tiene_tutor ? (
                        <div className="text-xs">
                          <p className="font-bold text-white">{est.nombre_tutor}</p>
                          <p className="text-slate-400 text-[11px] truncate">{est.email_tutor}</p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic">No tiene ningún tutor o padre vinculado actualmente.</p>
                      )}
                    </div>

                    {/* Botón de Acción para Vincular */}
                    <button
                      onClick={() => setModalVincularTutor({
                        abierto: true,
                        estudiante: est,
                        tutorSeleccionado: est.id_tutor || ''
                      })}
                      className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700"
                    >
                      <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
                      {est.tiene_tutor ? 'Cambiar / Desvincular Tutor' : 'Vincular a un Tutor'}
                    </button>
                  </div>
                ))}
              </div>

            </div>
          )}



          {/* ========================================================================= */}
          {/* SECCIÓN 3: GESTIÓN DE CUENTAS Y ACCESOS (RBAC)                           */}
          {/* ========================================================================= */}
          {seccionActiva === 'GESTION_CUENTAS' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Controles de Búsqueda y Botón Alta */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={busquedaUsuario}
                      onChange={(e) => setBusquedaUsuario(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && cargarUsuarios()}
                      placeholder="Buscar por usuario o email..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <select
                    value={filtroRolUsuario}
                    onChange={(e) => { setFiltroRolUsuario(e.target.value); }}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none"
                  >
                    <option value="">Todos los Roles</option>
                    <option value="ESTUDIANTE">Estudiante</option>
                    <option value="DOCENTE">Docente</option>
                    <option value="TUTOR">Tutor / Padre</option>
                    <option value="PSICOLOGO">Psicólogo</option>
                    <option value="DIRECTOR">Director</option>
                    <option value="SUPERADMIN">Superadministrador</option>
                  </select>

                  <button
                    onClick={cargarUsuarios}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-white transition"
                  >
                    Filtrar
                  </button>
                </div>

                <button
                  onClick={() => setModalCrearUsuario(true)}
                  className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Crear Nuevo Usuario</span>
                </button>
              </div>

              {/* Tabla de Usuarios */}
              <div className="bg-slate-900/80 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono text-[11px]">
                        <th className="p-4">Usuario / Nombre</th>
                        <th className="p-4">Email</th>
                        <th className="p-4">Rol Asignado</th>
                        <th className="p-4">Términos Legales</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones RBAC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300 font-normal">
                      {usuarios.map((u) => (
                        <tr key={u.id_usuario} className="hover:bg-slate-800/30 transition">
                          <td className="p-4">
                            <div className="font-bold text-white">{u.username}</div>
                            {u.nombre_completo && u.nombre_completo !== u.username && (
                              <div className="text-[11px] text-slate-400">{u.nombre_completo}</div>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="font-mono text-slate-400">{u.email}</div>
                            {u.ip_registro && (
                              <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 mt-0.5">
                                <Globe className="w-3 h-3 text-cyan-400/80" />
                                <span>{u.ip_registro}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                              u.rol === 'SUPERADMIN' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                              u.rol === 'DOCENTE' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' :
                              u.rol === 'PSICOLOGO' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                              u.rol === 'TUTOR' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                              u.rol === 'DIRECTOR' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                              'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                              {u.rol}
                            </span>
                          </td>
                          <td className="p-4">
                            {u.acepto_terminos ? (
                              <span className="text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Aceptado ({u.version_terminos})
                              </span>
                            ) : (
                              <span className="text-rose-400 flex items-center gap-1 font-semibold text-[11px]">
                                <AlertCircle className="w-3.5 h-3.5" /> Pendiente
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <button
                              onClick={() => handleAlternarEstado(u)}
                              disabled={u.rol === 'SUPERADMIN'}
                              className={`px-3 py-1 rounded-full text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                (u.activo !== undefined ? u.activo : true)
                                  ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${(u.activo !== undefined ? u.activo : true) ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                              {(u.activo !== undefined ? u.activo : true) ? 'Activo' : 'Inactivo'}
                            </button>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setModalCambiarRol({ abierto: true, usuario: u, nuevoRol: u.rol })}
                                disabled={u.rol === 'SUPERADMIN'}
                                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-1 border border-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                                title="Cambiar rol de usuario"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="hidden sm:inline">Rol</span>
                              </button>
                              <button
                                onClick={() => setModalResetPass({ abierto: true, usuario: u, nuevaPass: '' })}
                                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition flex items-center gap-1 border border-slate-700 cursor-pointer"
                                title="Resetear contraseña"
                              >
                                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                                <span className="hidden sm:inline">Reset Pass</span>
                              </button>
                              {u.rol !== 'SUPERADMIN' && (
                                <button
                                  onClick={() => setModalEliminarUsuario({
                                    abierto: true,
                                    id_usuario: u.id_usuario,
                                    username: u.username,
                                    rol: u.rol,
                                    nombre_completo: u.nombre_completo
                                  })}
                                  className="p-1.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-xl transition border border-slate-700 hover:border-rose-500/40 cursor-pointer"
                                  title="Eliminar usuario permanentemente"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* SECCIÓN: USUARIOS PENDIENTES DE VALIDACIÓN INSTITUCIONAL                  */}
          {/* ========================================================================= */}
          {seccionActiva === 'USUARIOS_PENDIENTES' && (
            <div className="space-y-6 animate-in fade-in duration-300">

              {/* Banner Informativo de Solicitudes */}
              <div className="p-6 bg-gradient-to-r from-slate-900 to-amber-950/30 rounded-3xl border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white">Solicitudes de Acceso en Espera de Aprobación</h3>
                  </div>
                  <p className="text-xs text-slate-300 max-w-2xl">
                    Conforme al Capítulo 5 de la Tesis y la Ley 548, los usuarios que solicitan cuentas con roles institucionales (o sin rol) no pueden acceder a los datos clínicos ni a la telemetría hasta que el Superadministrador valide su identidad y apruebe su activación.
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-2 rounded-2xl shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                  <span className="text-xs font-bold text-amber-300 font-mono">
                    {usuariosPendientes.length} {usuariosPendientes.length === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}
                  </span>
                </div>
              </div>

              {/* Tabla de Solicitudes */}
              <div className="bg-slate-900/90 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                {usuariosPendientes.length === 0 ? (
                  <div className="p-12 text-center space-y-3">
                    <div className="w-14 h-14 rounded-3xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                    <p className="text-sm font-bold text-slate-300">No hay solicitudes pendientes en este momento</p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Todas las cuentas docentes, directivas y del gabinete se encuentran validadas o no se han emitido nuevas solicitudes públicas.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950/60 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                        <tr>
                          <th className="p-4 font-semibold">Usuario / Nombre</th>
                          <th className="p-4 font-semibold">Correo Electrónico</th>
                          <th className="p-4 font-semibold">Rol Solicitado</th>
                          <th className="p-4 font-semibold">Fecha y Origen</th>
                          <th className="p-4 font-semibold text-right">Acciones de Verificación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {usuariosPendientes.map((sol) => (
                          <tr key={sol.id_usuario} className="hover:bg-slate-800/40 transition">
                            <td className="p-4">
                              <div className="font-bold text-white">{sol.username}</div>
                              {sol.nombre_completo && sol.nombre_completo !== sol.username && (
                                <div className="text-[11px] text-slate-400">{sol.nombre_completo}</div>
                              )}
                            </td>
                            <td className="p-4 font-mono text-slate-400">{sol.email}</td>
                            <td className="p-4">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                                sol.rol === 'SIN_ROL'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : sol.rol === 'DOCENTE'
                                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                                  : sol.rol === 'PSICOLOGO'
                                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                  : sol.rol === 'DIRECTOR'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : 'bg-slate-500/10 text-slate-300 border-slate-500/30'
                              }`}>
                                {sol.rol === 'SIN_ROL' ? 'Sin Rol Asignado' : sol.rol}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="text-slate-300">{sol.fecha_solicitud || 'Reciente'}</div>
                              <div className="text-[10px] font-mono text-slate-500">{sol.ip_registro}</div>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    if (rolesList.length === 0) cargarRolesYPermisos();
                                    setModalAprobarUsuario({
                                      abierto: true,
                                      usuario: sol,
                                      rolAsignar: sol.rol === 'SIN_ROL' ? 'DOCENTE' : sol.rol
                                    });
                                  }}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition flex items-center gap-1.5 font-bold shadow-lg shadow-emerald-600/20 cursor-pointer"
                                  title="Aprobar y activar acceso a la plataforma"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Aprobar y Activar</span>
                                </button>
                                <button
                                  onClick={() => setModalRechazarUsuario({
                                    abierto: true,
                                    usuario: sol
                                  })}
                                  className="p-1.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-xl transition border border-slate-700 hover:border-rose-500/40 cursor-pointer"
                                  title="Descartar y rechazar solicitud"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* SECCIÓN: ROLES Y MATRIZ DE PERMISOS GRANULARES (RBAC)                     */}
          {/* ========================================================================= */}
          {seccionActiva === 'ROLES_PERMISOS' && (
            <div className="space-y-6 animate-in fade-in duration-300">

              {/* Barra de Acciones y Selector de Rol */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  <span className="text-xs font-semibold text-slate-400">
                    Selecciona un rol para inspeccionar o personalizar sus capacidades atómicas:
                  </span>
                </div>
                <button
                  onClick={() => setModalCrearRol(true)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer shrink-0 self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Nuevo Rol</span>
                </button>
              </div>

              {/* Selector de Rol (Tabs horizontales) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {rolesList.map((r) => {
                  const esActivo = rolSeleccionadoMatriz === r.id_rol;
                  const permsCount = matrizPermisos[r.id_rol]?.length || 0;
                  return (
                    <button
                      key={r.id_rol}
                      onClick={() => setRolSeleccionadoMatriz(r.id_rol)}
                      className={`px-4 py-3 rounded-2xl text-xs font-bold transition flex items-center gap-2.5 shrink-0 cursor-pointer border ${
                        esActivo
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30'
                          : 'bg-slate-900/90 text-slate-400 hover:text-white border-slate-800 hover:bg-slate-800/80'
                      }`}
                    >
                      <span>{r.nombre_rol}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                        esActivo ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {permsCount} / {permisosList.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Contenedor del Rol Seleccionado */}
              {(() => {
                const rolActual = rolesList.find(r => r.id_rol === rolSeleccionadoMatriz) || rolesList[0];
                if (!rolActual) return null;
                const permsDelRol = matrizPermisos[rolActual.id_rol] || [];

                // Agrupar permisos por módulo
                const modulosMap: Record<string, PermisoItem[]> = {};
                permisosList.forEach(p => {
                  if (!modulosMap[p.modulo]) modulosMap[p.modulo] = [];
                  modulosMap[p.modulo].push(p);
                });

                return (
                  <div className="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 space-y-6 shadow-2xl">
                    
                    {/* Barra de Datos del Rol y Guardado */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-extrabold text-white">{rolActual.nombre_rol}</h4>
                          {rolActual.es_sistema ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              Rol de Sistema
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                              Rol Personalizado
                            </span>
                          )}
                          <span className="text-xs text-slate-400 font-mono">
                            • {rolActual.total_usuarios} {rolActual.total_usuarios === 1 ? 'usuario asignado' : 'usuarios asignados'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {rolActual.descripcion || 'Sin descripción asignada.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {!rolActual.es_sistema && (
                          <button
                            onClick={() => setModalEliminarRol({
                              abierto: true,
                              id_rol: rolActual.id_rol,
                              nombre_rol: rolActual.nombre_rol,
                              total_usuarios: rolActual.total_usuarios
                            })}
                            className="px-4 py-2.5 bg-red-950/40 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-500/30 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                            title="Eliminar este rol personalizado"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Eliminar Rol</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleGuardarPermisosRol(rolActual.id_rol)}
                          disabled={guardandoPermisos}
                          className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/25 transition flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{guardandoPermisos ? 'Guardando...' : `Guardar Cambios de ${rolActual.nombre_rol}`}</span>
                        </button>
                      </div>
                    </div>

                    {/* Lista de Permisos por Módulo */}
                    <div className="space-y-6">
                      {Object.entries(modulosMap).map(([modulo, permisosModulo]) => (
                        <div key={modulo} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                            <h5 className="text-xs font-bold text-indigo-300 uppercase tracking-wider font-mono">
                              Módulo: {modulo} ({permisosModulo.length} {permisosModulo.length === 1 ? 'capacidad' : 'capacidades'})
                            </h5>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {permisosModulo.map((p) => {
                              const activo = permsDelRol.includes(p.codigo_permiso);
                              return (
                                <div
                                  key={p.codigo_permiso}
                                  onClick={() => togglePermisoRol(rolActual.id_rol, p.codigo_permiso)}
                                  className={`p-4 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                                    activo
                                      ? 'bg-indigo-950/40 border-indigo-500/40 hover:border-indigo-400 shadow-sm'
                                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-60 hover:opacity-90'
                                  }`}
                                >
                                  <div className="space-y-1 pr-2">
                                    <p className="text-xs font-bold text-white">{p.nombre_permiso}</p>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                      {p.descripcion}
                                    </p>
                                    <span className="inline-block text-[10px] font-mono font-semibold text-slate-500 pt-1">
                                      {p.codigo_permiso}
                                    </span>
                                  </div>

                                  <div className={`w-11 h-6 rounded-full transition-colors p-1 flex items-center shrink-0 ${
                                    activo ? 'bg-indigo-600 justify-end' : 'bg-slate-800 justify-start'
                                  }`}>
                                    <span className="w-4 h-4 rounded-full bg-white shadow-md"></span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                );
              })()}

            </div>
          )}

          {/* ========================================================================= */}
          {/* SECCIÓN 4: OFICIAL DE PROTECCIÓN DE DATOS Y PRIVACIDAD (CAPÍTULO 5)       */}
          {/* ========================================================================= */}
          {seccionActiva === 'PRIVACIDAD_CAP5' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Header Informativo y Botón Exportar */}
              <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950/40 rounded-3xl border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-bold text-white">Libro de Consentimientos Informados (Ley 548 & RGPD)</h3>
                  </div>
                  <p className="text-xs text-slate-300 max-w-2xl">
                    Registro probatorio inmutable de aceptación de términos por rol. Garantiza que ningún dato biométrico es procesado sin consentimiento expreso y verificable.
                  </p>
                </div>

                <button
                  onClick={handleExportarAuditoriaCSV}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar Auditoría CSV</span>
                </button>
              </div>

              {/* Filtro por Rol */}
              <div className="flex items-center gap-3 p-3 bg-slate-900/80 rounded-2xl border border-slate-800 text-xs">
                <span className="text-slate-400 font-semibold flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-indigo-400" /> Filtrar por Rol:
                </span>
                <select
                  value={filtroRolAuditoria}
                  onChange={(e) => {
                    setFiltroRolAuditoria(e.target.value);
                    setTimeout(() => cargarAuditoriaLegal(), 50);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 outline-none"
                >
                  <option value="">Todos los Roles</option>
                  <option value="ESTUDIANTE">Estudiante</option>
                  <option value="DOCENTE">Docente</option>
                  <option value="TUTOR">Tutor / Padre</option>
                  <option value="PSICOLOGO">Psicólogo</option>
                  <option value="DIRECTOR">Director</option>
                  <option value="SUPERADMIN">Superadministrador</option>
                </select>
                <span className="text-slate-500 ml-auto font-mono">{auditorias.length} registros probatorios</span>
              </div>

              {/* Tabla de Auditoría */}
              <div className="bg-slate-900/80 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono text-[11px]">
                        <th className="p-4">Fecha y Hora</th>
                        <th className="p-4">Usuario</th>
                        <th className="p-4">Rol</th>
                        <th className="p-4">Versión Términos</th>
                        <th className="p-4">Dirección IP</th>
                        <th className="p-4">Agente / Navegador</th>
                        <th className="p-4">Código Asoc.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300 font-normal">
                      {auditorias.map((a) => (
                        <tr key={a.id_consentimiento} className="hover:bg-slate-800/30 transition">
                          <td className="p-4 font-mono text-cyan-400 whitespace-nowrap">{a.fecha_hora}</td>
                          <td className="p-4">
                            <span className="font-bold text-white block">{a.username}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{a.email}</span>
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                              {a.rol_usuario}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-indigo-300 font-bold">{a.version_documento}</td>
                          <td className="p-4 font-mono text-slate-400">{a.ip_registro}</td>
                          <td className="p-4 text-slate-400 max-w-xs truncate" title={a.user_agent}>
                            {a.user_agent}
                          </td>
                          <td className="p-4 font-mono text-emerald-400">
                            {a.codigo_estudiante_asociado || 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}



          {/* ========================================================================= */}
          {/* SECCIÓN 5: MANTENIMIENTO DEL SERVIDOR, ARCHIVOS Y RESPALDOS               */}
          {/* ========================================================================= */}
          {seccionActiva === 'MANTENIMIENTO_SERVIDOR' && salud && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Tarjetas de Salud Operativa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                
                <div className="p-5 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span className="font-semibold flex items-center gap-1.5"><Database className="w-4 h-4 text-cyan-400" /> Base de Datos</span>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-bold text-[10px]">Activo</span>
                  </div>
                  <p className="text-2xl font-black text-white font-mono">{salud.tamano_db_mb} <span className="text-xs text-slate-400">MB</span></p>
                  <p className="text-[11px] text-slate-500">{salud.motor_bd}</p>
                </div>

                <div className="p-5 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span className="font-semibold flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-indigo-400" /> Materiales (PDFs)</span>
                    <span className="font-mono text-xs text-indigo-400">{salud.total_archivos_materiales} archivos</span>
                  </div>
                  <p className="text-2xl font-black text-white font-mono">{salud.materiales_almacenados_mb} <span className="text-xs text-slate-400">MB</span></p>
                  <p className="text-[11px] text-slate-500">Documentos de lectura en disco</p>
                </div>

                <div className="p-5 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span className="font-semibold flex items-center gap-1.5"><Activity className="w-4 h-4 text-purple-400" /> Capturas Forenses</span>
                    <span className="font-mono text-xs text-purple-400">{salud.total_archivos_capturas} fotos</span>
                  </div>
                  <p className="text-2xl font-black text-white font-mono">{salud.capturas_eventos_mb} <span className="text-xs text-slate-400">MB</span></p>
                  <p className="text-[11px] text-slate-500">Evidencias multi-ángulo en disco</p>
                </div>

                <div className="p-5 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-xs">
                    <span className="font-semibold flex items-center gap-1.5"><Server className="w-4 h-4 text-emerald-400" /> WebSockets RFC 6455</span>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-bold text-[10px]">Online</span>
                  </div>
                  <p className="text-2xl font-black text-white font-mono">{salud.conexiones_ws_activas} <span className="text-xs text-slate-400">canales</span></p>
                  <p className="text-[11px] text-slate-500">Streaming biométrico concurrente</p>
                </div>

              </div>

              {/* Panel de Respaldo y Mantenimiento de BD */}
              <div className="p-6 bg-slate-900/80 rounded-3xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Respaldo Integral de Base de Datos SQLite</h3>
                      <p className="text-xs text-slate-400">Genera una copia en caliente de `monitoreo_tdah.db` con timestamp para contingencias.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDescargarBackupDB}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Descargar Backup .db</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-xs text-slate-300 space-y-2 font-mono">
                  <p className="text-slate-400">Ubicación física: <span className="text-white">backend/monitoreo_tdah.db</span></p>
                  <p className="text-slate-400">Espacio Total Almacenamiento: <span className="text-indigo-400 font-bold">{salud.almacenamiento_total_mb} MB</span></p>
                  <p className="text-slate-400">Último Timestamp del Servidor: <span className="text-cyan-400">{salud.timestamp}</span></p>
                </div>
              </div>

            </div>
          )}



          {/* ========================================================================= */}
          {/* SECCIÓN 6: GESTIÓN DE CURSOS Y NIVELES ACADÉMICOS                         */}
          {/* ========================================================================= */}
          {seccionActiva === 'CURSOS' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Header Informativo */}
              <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950/40 rounded-3xl border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-bold text-white">Gestión Académica de Cursos y Docentes</h3>
                  </div>
                  <p className="text-xs text-slate-300 max-w-2xl">
                    Administra el catálogo de cursos institucionales y asigna los cursos a cada docente para que puedan distribuir materiales y tareas a sus estudiantes.
                  </p>
                </div>

                {subtabCursos === 'CATALOGO' && (
                  <button
                    onClick={() => setModalCrearCurso(true)}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Nuevo Curso</span>
                  </button>
                )}
              </div>

              {/* Selector de Subpestañas */}
              <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
                <button
                  onClick={() => setSubtabCursos('CATALOGO')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    subtabCursos === 'CATALOGO'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Catálogo de Cursos ({cursos.length})</span>
                </button>
                <button
                  onClick={() => {
                    setSubtabCursos('ASIGNACION_DOCENTES');
                    cargarDocentesCursos();
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    subtabCursos === 'ASIGNACION_DOCENTES'
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>Asignación Docentes - Cursos ({docentesCursosList.length})</span>
                </button>
              </div>

              {/* Subtab 1: Catálogo de Cursos */}
              {subtabCursos === 'CATALOGO' && (
                <div className="bg-slate-900/80 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono text-[11px]">
                          <th className="p-4">Nombre del Curso</th>
                          <th className="p-4">Nivel Académico</th>
                          <th className="p-4">Alumnos Matriculados</th>
                          <th className="p-4">Descripción</th>
                          <th className="p-4">Estado</th>
                          <th className="p-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300 font-normal">
                        {cursos.map((c) => (
                          <tr key={c.id_curso} className="hover:bg-slate-800/30 transition">
                            <td className="p-4 font-bold text-white flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-cyan-400" />
                              <span>{c.nombre_curso}</span>
                            </td>
                            <td className="p-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                c.nivel_academico === 'Universidad'
                                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                  : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                              }`}>
                                {c.nivel_academico}
                              </span>
                            </td>
                            <td className="p-4 font-mono">
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-bold text-xs border border-slate-700">
                                {c.total_estudiantes} estudiantes
                              </span>
                            </td>
                            <td className="p-4 text-slate-400 max-w-xs truncate" title={c.descripcion || ''}>
                              {c.descripcion || 'Sin descripción'}
                            </td>
                            <td className="p-4">
                              <button
                                onClick={() => handleAlternarEstadoCurso(c)}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                                  c.activo
                                    ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${c.activo ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                                {c.activo ? 'Activo' : 'Inactivo'}
                              </button>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleEliminarCurso(c)}
                                className="p-1.5 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-xl transition border border-slate-700 hover:border-rose-500/30"
                                title="Eliminar curso"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Subtab 2: Asignación Docentes - Cursos */}
              {subtabCursos === 'ASIGNACION_DOCENTES' && (
                <div className="bg-slate-900/80 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl space-y-4">
                  <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-cyan-400" />
                        <span>Nómina de Docentes y Cursos Habilitados</span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Selecciona a cada docente para asignarle uno o múltiples cursos donde podrá publicar tareas y documentos.
                      </p>
                    </div>
                    <button
                      onClick={cargarDocentesCursos}
                      disabled={cargandoDocentesCursos}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${cargandoDocentesCursos ? 'animate-spin' : ''}`} />
                      <span>Actualizar</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono text-[11px]">
                          <th className="p-4">Docente</th>
                          <th className="p-4">Email</th>
                          <th className="p-4">Cursos Asignados</th>
                          <th className="p-4 text-center">Total</th>
                          <th className="p-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300 font-normal">
                        {docentesCursosList.map((doc) => (
                          <tr key={doc.id_usuario} className="hover:bg-slate-800/30 transition">
                            <td className="p-4">
                              <div className="font-bold text-white flex items-center gap-2">
                                <Users className="w-4 h-4 text-indigo-400" />
                                <span>{doc.username}</span>
                              </div>
                              <span className="text-[10px] text-cyan-400 font-mono">{doc.rol}</span>
                            </td>
                            <td className="p-4 font-mono text-slate-400">{doc.email}</td>
                            <td className="p-4">
                              <div className="flex flex-wrap gap-1.5 max-w-md">
                                {doc.cursos_asignados.length > 0 ? (
                                  doc.cursos_asignados.map((cur) => (
                                    <span
                                      key={cur.id_curso}
                                      className="px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1"
                                    >
                                      <BookOpen className="w-3 h-3 text-cyan-400" />
                                      {cur.nombre_curso}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[11px] text-amber-400/80 italic flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Sin cursos asignados
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-center font-mono font-bold text-white">
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs border border-slate-700">
                                {doc.total_cursos}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <button
                                onClick={() => {
                                  setModalAsignarCursosDocente({
                                    abierto: true,
                                    docente: doc,
                                    cursosSeleccionados: doc.cursos_asignados.map((c) => c.id_curso)
                                  });
                                }}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow transition cursor-pointer ml-auto"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Asignar Cursos</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {docentesCursosList.length === 0 && !cargandoDocentesCursos && (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400">
                              No hay usuarios con rol Docente registrados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: ALTA DE NUEVO USUARIO (RBAC)                                    */}
      {/* ========================================================================= */}
      {modalCrearUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" /> Alta Administrativa de Usuario
              </h3>
              <button
                onClick={() => setModalCrearUsuario(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearUsuario} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Nombre de Usuario (Login)</label>
                  <input
                    type="text"
                    required
                    value={formNuevoUsuario.username}
                    onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, username: e.target.value })}
                    placeholder="ej: juan_perez"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={formNuevoUsuario.email}
                    onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, email: e.target.value })}
                    placeholder="correo@institucion.edu"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Contraseña Inicial</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={formNuevoUsuario.password}
                    onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Rol en la Plataforma</label>
                  <select
                    value={formNuevoUsuario.rol}
                    onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, rol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                  >
                    {rolesList.length > 0 ? (
                      rolesList.map(r => (
                        <option key={r.id_rol} value={r.nombre_rol}>
                          {r.nombre_rol} {r.es_sistema ? '' : '(Personalizado)'}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="DOCENTE">Docente</option>
                        <option value="PSICOLOGO">Psicólogo / Gabinete</option>
                        <option value="TUTOR">Tutor / Padre de Familia</option>
                        <option value="DIRECTOR">Director Académico</option>
                        <option value="ESTUDIANTE">Estudiante</option>
                        <option value="SUPERADMIN">Superadministrador (TI)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Campos opcionales si es Estudiante */}
              {formNuevoUsuario.rol === 'ESTUDIANTE' && (
                <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
                  <span className="text-[11px] font-bold text-indigo-400 block">Datos del Perfil Escolar</span>
                  <div className="space-y-1">
                    <label className="text-slate-400">Nombre Completo del Alumno</label>
                    <input
                      type="text"
                      value={formNuevoUsuario.nombre_completo}
                      onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, nombre_completo: e.target.value })}
                      placeholder="ej: Mateo Morales Villalobos"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-slate-400">Grado / Nivel Académico</label>
                      <select
                        value={formNuevoUsuario.grado_escolar}
                        onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, grado_escolar: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white outline-none"
                      >
                        {cursos.length > 0 ? (
                          cursos.filter(c => c.activo).map((c) => (
                            <option key={c.id_curso} value={c.nombre_curso}>
                              {c.nombre_curso} ({c.nivel_academico})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="1º de Secundaria">1º de Secundaria</option>
                            <option value="2º de Secundaria">2º de Secundaria</option>
                            <option value="3º de Secundaria">3º de Secundaria</option>
                            <option value="4º de Secundaria">4º de Secundaria</option>
                            <option value="5º de Secundaria">5º de Secundaria</option>
                            <option value="6º de Secundaria">6º de Secundaria</option>
                            <option value="Universitario - Pregrado">Universitario - Pregrado</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400">Subtipo TDAH (DSM-5-TR)</label>
                      <select
                        value={formNuevoUsuario.subtipo_tdah}
                        onChange={(e) => setFormNuevoUsuario({ ...formNuevoUsuario, subtipo_tdah: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white outline-none"
                      >
                        <option value="F90_2">F90.2 Combinado</option>
                        <option value="F90_0">F90.0 Inatento</option>
                        <option value="F90_1">F90.1 Hiperactivo</option>
                        <option value="CONTROL">Control (Sin TDAH)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalCrearUsuario(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer"
                >
                  Guardar y Activar Cuenta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RESETEAR CONTRASEÑA                                             */}
      {/* ========================================================================= */}
      {modalResetPass.abierto && modalResetPass.usuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" /> Restablecer Contraseña
              </h3>
              <button
                onClick={() => setModalResetPass({ abierto: false, usuario: null, nuevaPass: '' })}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Ingresa la nueva contraseña para el usuario <strong className="text-white font-mono">{modalResetPass.usuario.username}</strong> ({modalResetPass.usuario.rol}):
            </p>

            <div className="space-y-1">
              <input
                type="text"
                value={modalResetPass.nuevaPass}
                onChange={(e) => setModalResetPass({ ...modalResetPass, nuevaPass: e.target.value })}
                placeholder="Nueva contraseña temporal"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 text-xs">
              <button
                onClick={() => setModalResetPass({ abierto: false, usuario: null, nuevaPass: '' })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarResetPass}
                disabled={!modalResetPass.nuevaPass.trim()}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold shadow-lg shadow-amber-500/25 transition disabled:opacity-50 cursor-pointer"
              >
                Actualizar Contraseña
              </button>
            </div>
          </div>
        </div>
      )}





      {/* ========================================================================= */}
      {/* MODAL 3: VINCULAR TUTOR                                                  */}
      {/* ========================================================================= */}
      {modalVincularTutor.abierto && modalVincularTutor.estudiante && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-indigo-400" /> Vinculación de Tutor
              </h3>
              <button
                onClick={() => setModalVincularTutor({ abierto: false, estudiante: null, tutorSeleccionado: '' })}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Estudiante: <strong className="text-white">{modalVincularTutor.estudiante.nombre_completo}</strong> ({modalVincularTutor.estudiante.codigo_estudiante})
            </p>

            <div className="space-y-1 text-xs">
              <label className="text-slate-400">Seleccionar Tutor / Padre de Familia:</label>
              <select
                value={modalVincularTutor.tutorSeleccionado}
                onChange={(e) => setModalVincularTutor({ ...modalVincularTutor, tutorSeleccionado: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="">-- Sin Tutor Vinculado (Desvincular) --</option>
                {tutoresDisponibles.map((t) => (
                  <option key={t.id_usuario} value={t.id_usuario}>
                    {t.username} ({t.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 text-xs">
              <button
                onClick={() => setModalVincularTutor({ abierto: false, estudiante: null, tutorSeleccionado: '' })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardarVinculoTutor}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer"
              >
                Guardar Relación
              </button>
            </div>
          </div>
        </div>
      )}





      {/* ========================================================================= */}
      {/* MODAL 4: CREAR NUEVO CURSO                                               */}
      {/* ========================================================================= */}
      {modalCrearCurso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-400" /> Crear Nuevo Curso o Grado
              </h3>
              <button
                onClick={() => setModalCrearCurso(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearCurso} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Nombre del Curso</label>
                <input
                  type="text"
                  required
                  value={formNuevoCurso.nombre_curso}
                  onChange={(e) => setFormNuevoCurso({ ...formNuevoCurso, nombre_curso: e.target.value })}
                  placeholder="ej: Universitario, Medicina - 1er Año, etc."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Nivel Académico</label>
                <select
                  value={formNuevoCurso.nivel_academico}
                  onChange={(e) => setFormNuevoCurso({ ...formNuevoCurso, nivel_academico: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                >
                  <option value="Universidad">Universidad / Pregrado</option>
                  <option value="Secundaria">Secundaria</option>
                  <option value="Primaria">Primaria</option>
                  <option value="Postgrado">Postgrado</option>
                  <option value="Técnico">Técnico Superior</option>
                  <option value="Otro">Otro Nivel</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400">Descripción / Observación (Opcional)</label>
                <textarea
                  rows={2}
                  value={formNuevoCurso.descripcion}
                  onChange={(e) => setFormNuevoCurso({ ...formNuevoCurso, descripcion: e.target.value })}
                  placeholder="ej: Grupo de validación experimental universitaria"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalCrearCurso(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer"
                >
                  Crear Curso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: CONFIRMACIÓN PARA ELIMINAR USUARIO                              */}
      {/* ========================================================================= */}
      {modalEliminarUsuario.abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Eliminar Usuario Definitivamente</h3>
                <p className="text-xs text-slate-400">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <p className="text-slate-300">
                ¿Estás seguro de eliminar al usuario <strong className="text-white font-mono">{modalEliminarUsuario.username}</strong> ({modalEliminarUsuario.rol})?
              </p>
              {modalEliminarUsuario.nombre_completo && (
                <p className="text-slate-400">
                  Nombre: <strong className="text-slate-200">{modalEliminarUsuario.nombre_completo}</strong>
                </p>
              )}
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-[11px] space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Efectos de la eliminación:
                </p>
                <ul className="list-disc list-inside text-[10px] text-rose-200/80 space-y-0.5">
                  <li>Se borrarán sus credenciales y registros de acceso.</li>
                  <li>Si es estudiante, se limpiarán sus perfiles, capturas y telemetría de monitoreo.</li>
                  <li>Si tiene un curso asignado, se liberará para poder borrar el curso si llega a 0 alumnos.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModalEliminarUsuario({ abierto: false, id_usuario: '', username: '', rol: '' })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarEliminarUsuario}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Confirmar y Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMACIÓN PARA ELIMINAR ROL PERSONALIZADO                       */}
      {/* ========================================================================= */}
      {modalEliminarRol.abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Eliminar Rol Institucional</h3>
                <p className="text-xs text-slate-400">Control de Roles y Permisos (RBAC)</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                ¿Estás seguro de eliminar el rol <strong className="text-white font-mono font-bold">{modalEliminarRol.nombre_rol}</strong>?
              </p>

              {modalEliminarRol.total_usuarios > 0 ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-400" /> Acción Bloqueada
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Este rol tiene <strong>{modalEliminarRol.total_usuarios} {modalEliminarRol.total_usuarios === 1 ? 'usuario activo asignado' : 'usuarios activos asignados'}</strong>. Debes reasignar primero a esos usuarios a otro rol en la pestaña <em>Gestión de Usuarios</em> antes de poder eliminarlo.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <p className="text-slate-300 font-semibold">Consecuencias de esta acción:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                    <li>El rol se removerá del catálogo y selectores de usuario.</li>
                    <li>Se revocarán todas sus relaciones en la tabla intermedia de permisos.</li>
                    <li>Esta acción es permanente e irreversible.</li>
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalEliminarRol({ abierto: false, id_rol: '', nombre_rol: '', total_usuarios: 0 })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={modalEliminarRol.total_usuarios > 0}
                onClick={handleConfirmarEliminarRol}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs shadow-lg shadow-red-600/30 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: APROBAR Y ACTIVAR USUARIO PENDIENTE                                */}
      {/* ========================================================================= */}
      {modalAprobarUsuario.abierto && modalAprobarUsuario.usuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Aprobar Solicitud de Acceso</h3>
                <p className="text-xs text-slate-400">Activación de Cuenta Institucional (Ley 548)</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
                <p className="text-slate-400">Solicitante:</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-mono text-sm">{modalAprobarUsuario.usuario.username}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                    {modalAprobarUsuario.usuario.email}
                  </span>
                </div>
                {modalAprobarUsuario.usuario.nombre_completo && (
                  <p className="text-slate-400 text-[11px] pt-1">
                    Nombre: <strong className="text-slate-200">{modalAprobarUsuario.usuario.nombre_completo}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  {modalAprobarUsuario.usuario.rol === 'SIN_ROL'
                    ? 'Asignar Rol Definitivo al Usuario *'
                    : 'Confirmar o Modificar Rol Asignado:'}
                </label>
                <select
                  value={modalAprobarUsuario.rolAsignar}
                  onChange={(e) => setModalAprobarUsuario(prev => ({ ...prev, rolAsignar: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-indigo-500 text-xs font-semibold"
                >
                  {rolesList.filter(r => r.nombre_rol !== 'SIN_ROL').length > 0 ? (
                    rolesList.filter(r => r.nombre_rol !== 'SIN_ROL').map(r => (
                      <option key={r.id_rol} value={r.nombre_rol} className="bg-slate-900 text-white py-1.5">
                        {r.nombre_rol} {r.es_sistema ? '(Sistema)' : '(Personalizado)'} — {matrizPermisos[r.id_rol]?.length || 0} permisos
                      </option>
                    ))
                  ) : (
                    ['PSICOLOGO', 'DOCENTE', 'TUTOR', 'DIRECTOR', 'ADMINISTRADOR', 'ESTUDIANTE'].map(rolDef => (
                      <option key={rolDef} value={rolDef} className="bg-slate-900 text-white py-1.5">
                        {rolDef} (Sistema)
                      </option>
                    ))
                  )}
                </select>
                <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                  Al aprobar, se marcará <strong className="text-emerald-400">verificado = true</strong> y el usuario podrá iniciar sesión inmediatamente con el rol <strong>{modalAprobarUsuario.rolAsignar}</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalAprobarUsuario({ abierto: false, usuario: null, rolAsignar: '' })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarAprobarUsuario}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Aprobar y Habilitar Acceso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECHAZAR SOLICITUD DE USUARIO PENDIENTE                            */}
      {/* ========================================================================= */}
      {modalRechazarUsuario.abierto && modalRechazarUsuario.usuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Rechazar Solicitud de Acceso</h3>
                <p className="text-xs text-slate-400">Eliminación de Registro No Autorizado</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                ¿Estás seguro de rechazar y descartar la solicitud del usuario <strong className="text-white font-mono">{modalRechazarUsuario.usuario.username}</strong> ({modalRechazarUsuario.usuario.email})?
              </p>
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-[11px]">
                Esta acción eliminará permanentemente la cuenta no verificada del sistema. El usuario no podrá acceder.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalRechazarUsuario({ abierto: false, usuario: null })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarRechazarUsuario}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REASIGNAR ROL INSTITUCIONAL A UN USUARIO (RBAC)                     */}
      {/* ========================================================================= */}
      {modalCambiarRol.abierto && modalCambiarRol.usuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Reasignar Rol de Usuario</h3>
                <p className="text-xs text-slate-400">Control de Acceso y Autorizaciones (RBAC)</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
                <p className="text-slate-400">Usuario seleccionado:</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-mono text-sm">{modalCambiarRol.usuario.username}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                    Rol actual: {modalCambiarRol.usuario.rol}
                  </span>
                </div>
                {modalCambiarRol.usuario.nombre_completo && (
                  <p className="text-slate-400 text-[11px] pt-1">
                    Nombre: <strong className="text-slate-200">{modalCambiarRol.usuario.nombre_completo}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Seleccionar Nuevo Rol:</label>
                <select
                  value={modalCambiarRol.nuevoRol}
                  onChange={(e) => setModalCambiarRol(prev => ({ ...prev, nuevoRol: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-white outline-none focus:border-indigo-500 text-xs font-semibold"
                >
                  {rolesList.map(r => (
                    <option key={r.id_rol} value={r.nombre_rol}>
                      {r.nombre_rol} {r.es_sistema ? '(Sistema)' : '(Personalizado)'} — {matrizPermisos[r.id_rol]?.length || 0} permisos
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                  Al confirmar, este usuario adoptará de inmediato la matriz de permisos correspondiente a <strong>{modalCambiarRol.nuevoRol}</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalCambiarRol({ abierto: false, usuario: null, nuevoRol: '' })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarCambioRol}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Aplicar Rol
              </button>
            </div>
          </div>
        </div>
      )}








            {/* ========================================================================= */}
      {/* MODAL 6: CREAR NUEVO ROL INSTITUCIONAL                                   */}
      {/* ========================================================================= */}
      {modalCrearRol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-400" /> Crear Nuevo Rol Institucional
              </h3>
              <button
                onClick={() => setModalCrearRol(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCrearNuevoRol} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Nombre del Rol (Identificador en Mayúsculas)</label>
                <input
                  type="text"
                  required
                  value={formNuevoRol.nombre_rol}
                  onChange={(e) => setFormNuevoRol({ ...formNuevoRol, nombre_rol: e.target.value.toUpperCase() })}
                  placeholder="ej: DIRECTOR_SECUNDARIO, DOCENTE_GUIA"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400">Descripción o Propósito Institucional (Opcional)</label>
                <textarea
                  rows={2}
                  value={formNuevoRol.descripcion}
                  onChange={(e) => setFormNuevoRol({ ...formNuevoRol, descripcion: e.target.value })}
                  placeholder="ej: Subdirección académica con acceso a reportes y nómina de estudiantes"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalCrearRol(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/25 transition cursor-pointer"
                >
                  Crear Rol
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: ASIGNACIÓN DE CURSOS A DOCENTE                                    */}
      {/* ========================================================================= */}
      {modalAsignarCursosDocente.abierto && modalAsignarCursosDocente.docente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-400" /> Asignar Cursos al Docente
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Profesor: <span className="font-bold text-cyan-300">{modalAsignarCursosDocente.docente.username}</span> ({modalAsignarCursosDocente.docente.email})
                </p>
              </div>
              <button
                onClick={() => setModalAsignarCursosDocente({ abierto: false, docente: null, cursosSeleccionados: [] })}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-300">
                Selecciona los cursos que este docente tendrá a su cargo para compartir materiales, lecturas y guías de tarea:
              </p>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {cursos.filter((c) => c.activo).map((curso) => {
                  const seleccionado = modalAsignarCursosDocente.cursosSeleccionados.includes(curso.id_curso);
                  return (
                    <div
                      key={curso.id_curso}
                      onClick={() => toggleCursoSeleccionado(curso.id_curso)}
                      className={`p-3 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
                        seleccionado
                          ? 'bg-indigo-600/15 border-indigo-500/50 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {seleccionado ? (
                          <CheckSquare className="w-5 h-5 text-indigo-400 shrink-0" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-600 shrink-0" />
                        )}
                        <div>
                          <p className="text-xs font-bold text-white">{curso.nombre_curso}</p>
                          <span className="text-[10px] text-slate-500">{curso.nivel_academico}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{curso.total_estudiantes} alumnos</span>
                    </div>
                  );
                })}
                {cursos.filter((c) => c.activo).length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-4">No hay cursos activos disponibles en el catálogo.</p>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <span className="text-xs font-mono text-indigo-300">
                {modalAsignarCursosDocente.cursosSeleccionados.length} curso(s) marcado(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalAsignarCursosDocente({ abierto: false, docente: null, cursosSeleccionados: [] })}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleGuardarCursosDocente}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/25 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar Asignaciones</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Notificación General */}
      <ModalNotificacion
        config={modalNotificacion}
        onCerrar={() => setModalNotificacion(prev => ({ ...prev, abierto: false }))}
      />

    </div>
  );
};
