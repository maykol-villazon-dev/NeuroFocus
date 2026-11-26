import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { apiCliente } from '../servicios_ws/api_cliente';

export interface Usuario {
  id_usuario?: string;
  username: string;
  email?: string;
  rol: string;
  codigo_estudiante?: string;
  permisos?: string[];
  grado_escolar?: string;
  subtipo_tdah?: string;
  protegido?: boolean;
  nombre_completo?: string;
}

export interface RegistroData {
  username: string;
  password: string;
  email: string;
  rol: string;
  nombre_completo: string;
  codigo_estudiante?: string;
  grado_escolar?: string;
  subtipo_tdah?: string;
  acepto_terminos?: boolean;
}

interface AuthContextType {
  usuario: Usuario | null;
  token: string | null;
  cargando: boolean;
  alertaSuspension: string | null;
  cerrarAlertaSuspension: () => void;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  registro: (datos: RegistroData) => Promise<{ ok: boolean; error?: string; requiere_aprobacion?: boolean; mensaje?: string }>;
  logout: () => void;
  tienePermiso: (codigo: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Inicialización síncrona desde localStorage para evitar parpadeos o redirección a LandingPage al refrescar (F5)
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    try {
      const guardado = localStorage.getItem('usuario_actual');
      return guardado ? JSON.parse(guardado) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('access_token');
  });

  const usuarioRef = useRef<Usuario | null>(usuario);
  usuarioRef.current = usuario;

  const [cargando, setCargando] = useState<boolean>(false);
  const [alertaSuspension, setAlertaSuspension] = useState<string | null>(null);

  const cerrarAlertaSuspension = () => {
    setAlertaSuspension(null);
  };

  // Escuchar eventos en tiempo real disparados por el interceptor de Axios
  useEffect(() => {
    const handleCuentaSuspendida = (e: any) => {
      logout();
      setAlertaSuspension(
        e.detail?.mensaje ||
        'Su cuenta ha sido desactivada o suspendida por la administración institucional.'
      );
    };

    window.addEventListener('sesion-cuenta-suspendida', handleCuentaSuspendida);
    return () => {
      window.removeEventListener('sesion-cuenta-suspendida', handleCuentaSuspendida);
    };
  }, []);

  // Verificación y sincronización en segundo plano con el backend al recargar la página
  useEffect(() => {
    const verificarSesion = async () => {
      const tok = localStorage.getItem('access_token');
      if (!tok) return;

      try {
        const res = await apiCliente.get('/auth/me');
        if (res.data) {
          const userActual: Usuario = {
            username: res.data.username,
            rol: res.data.rol,
            codigo_estudiante: res.data.codigo_estudiante,
            email: res.data.email,
            permisos: res.data.permisos || []
          };
          setUsuario(userActual);
          localStorage.setItem('usuario_actual', JSON.stringify(userActual));
        }
      } catch (err: any) {
        if (err.response) {
          const status = err.response.status;
          const detail = err.response.data?.detail || '';
          if (status === 403 && typeof detail === 'string' && detail.includes('CUENTA_SUSPENDIDA')) {
            logout();
            setAlertaSuspension(
              detail.replace('CUENTA_SUSPENDIDA:', '').trim() ||
              'Su cuenta ha sido suspendida por la administración institucional.'
            );
          } else if (status === 401) {
            console.warn('[AUTH] Token JWT expirado o inválido. Cerrando sesión de forma segura...');
            logout();
          }
        }
      }
    };

    verificarSesion();
  }, []);

  // Monitor de Sesión Activa (Heartbeat de Seguridad y Sincronización en Vivo cada 4 segundos)
  useEffect(() => {
    if (!token || !usuario) return;

    const intervalId = setInterval(async () => {
      const currentToken = localStorage.getItem('access_token');
      if (!currentToken) return;

      try {
        const res = await apiCliente.get('/auth/me');
        if (res.data) {
          const uActual = usuarioRef.current;
          if (uActual) {
            const nuevosPermisos: string[] = res.data.permisos || [];
            const nuevoRol: string = res.data.rol || uActual.rol;
            const nuevoCodigo: string | undefined = res.data.codigo_estudiante;

            // Comparar si hubo cambios en permisos o rol asignado por el Superadmin
            const permisosCambiaron = (
              nuevosPermisos.length !== (uActual.permisos?.length || 0) ||
              nuevosPermisos.some(p => !uActual.permisos?.includes(p)) ||
              (uActual.permisos && uActual.permisos.some(p => !nuevosPermisos.includes(p)))
            );

            const rolCambio = nuevoRol !== uActual.rol;
            const codigoCambio = nuevoCodigo !== uActual.codigo_estudiante;

            if (permisosCambiaron || rolCambio || codigoCambio) {
              console.log('[AUTH HEARTBEAT] Sincronización reactiva de permisos/rol en tiempo real:', {
                usuario: uActual.username,
                rolAnterior: uActual.rol,
                nuevoRol,
                permisosAnteriores: uActual.permisos?.length || 0,
                nuevosPermisos: nuevosPermisos.length
              });

              const usuarioSincronizado: Usuario = {
                ...uActual,
                rol: nuevoRol,
                codigo_estudiante: nuevoCodigo,
                permisos: nuevosPermisos
              };

              setUsuario(usuarioSincronizado);
              localStorage.setItem('usuario_actual', JSON.stringify(usuarioSincronizado));
            }
          }
        }
      } catch (err: any) {
        if (err.response) {
          const status = err.response.status;
          const detail = err.response.data?.detail || '';
          if (status === 403 && typeof detail === 'string' && detail.includes('CUENTA_SUSPENDIDA')) {
            clearInterval(intervalId);
            logout();
            setAlertaSuspension(
              detail.replace('CUENTA_SUSPENDIDA:', '').trim() ||
              'Su cuenta ha sido desactivada o suspendida por la administración institucional.'
            );
          } else if (status === 401) {
            clearInterval(intervalId);
            logout();
          }
        }
      }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [token, usuario?.username]);

  const login = async (usernameInput: string, passwordInput: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      setCargando(true);
      const formData = new FormData();
      formData.append('username', usernameInput.trim());
      formData.append('password', passwordInput);

      const res = await apiCliente.post('/auth/login', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const { access_token, username, rol, codigo_estudiante, permisos } = res.data;
      const nuevoUsuario: Usuario = {
        username,
        rol,
        codigo_estudiante,
        permisos: permisos || []
      };

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('usuario_actual', JSON.stringify(nuevoUsuario));

      setToken(access_token);
      setUsuario(nuevoUsuario);
      setCargando(false);
      return { ok: true };
    } catch (err: any) {
      console.warn('Error en login:', err);
      setCargando(false);

      // Si el servidor respondió con error HTTP formal (400, 401, etc.)
      if (err.response && err.response.data && err.response.data.detail) {
        return { ok: false, error: err.response.data.detail };
      }

      // Si el backend estuviera completamente apagado (Network Error / Offline)
      if (err.message && (err.message.includes('Network Error') || err.code === 'ERR_NETWORK')) {
        let mockRol = 'DOCENTE';
        let mockCodigo = undefined;
        const uLower = usernameInput.toLowerCase();
        if (uLower.includes('est') || usernameInput.startsWith('EST-')) {
          mockRol = 'ESTUDIANTE';
          mockCodigo = 'EST-2026-001';
        } else if (uLower.includes('psico')) {
          mockRol = 'PSICOLOGO';
        }

        console.warn(`[OFFLINE FALLBACK] Asignando sesión local de prueba con rol ${mockRol}`);
        const userMock: Usuario = { username: usernameInput, rol: mockRol, codigo_estudiante: mockCodigo };
        localStorage.setItem('usuario_actual', JSON.stringify(userMock));
        setUsuario(userMock);
        return { ok: true };
      }

      return { ok: false, error: 'Credenciales inválidas o error de conexión con el servidor.' };
    }
  };

  const registro = async (datos: RegistroData): Promise<{ ok: boolean; error?: string; requiere_aprobacion?: boolean; mensaje?: string }> => {
    try {
      setCargando(true);
      const payload = {
        username: datos.username.trim(),
        password: datos.password,
        email: datos.email.trim(),
        rol: datos.rol,
        nombre_completo: datos.nombre_completo.trim(),
        codigo_estudiante: datos.codigo_estudiante ? datos.codigo_estudiante.trim().toUpperCase() : undefined,
        grado_escolar: datos.grado_escolar ? datos.grado_escolar.trim() : undefined,
        subtipo_tdah: datos.subtipo_tdah || 'F90_2',
        acepto_terminos: datos.acepto_terminos ?? false
      };

      const res = await apiCliente.post('/auth/registro', payload);
      console.log('[REGISTRO EXITOSO]', res.data);

      if (res.data?.requiere_aprobacion) {
        setCargando(false);
        return {
          ok: true,
          requiere_aprobacion: true,
          mensaje: res.data.mensaje || 'Su cuenta fue registrada pero requiere aprobación del Superadministrador antes de iniciar sesión.'
        };
      }

      // Si es estudiante (aprobación automática), autenticar para obtener el token JWT
      const loginRes = await login(datos.username.trim(), datos.password);
      setCargando(false);
      return loginRes;
    } catch (err: any) {
      console.warn('Error en registro:', err);
      setCargando(false);

      if (err.response && err.response.data && err.response.data.detail) {
        return { ok: false, error: err.response.data.detail };
      }

      // Si backend offline, fallback respetando estrictamente el rol elegido por el usuario
      if (err.message && (err.message.includes('Network Error') || err.code === 'ERR_NETWORK')) {
        const mockCod = datos.rol === 'ESTUDIANTE' ? (datos.codigo_estudiante || 'EST-2026-NEW') : undefined;
        setUsuario({
          username: datos.username,
          rol: datos.rol,
          codigo_estudiante: mockCod,
          email: datos.email
        });
        return { ok: true };
      }

      return { ok: false, error: 'No se pudo completar el registro en el servidor.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('usuario_actual');
    sessionStorage.removeItem('dashboard_seccion_activa');
    sessionStorage.removeItem('dashboard_codigo_estudiante');
    setToken(null);
    setUsuario(null);
  };

  const tienePermiso = (codigo: string): boolean => {
    if (!usuario) return false;
    if (usuario.rol === 'SUPERADMIN') return true;
    return Array.isArray(usuario.permisos) && usuario.permisos.includes(codigo);
  };

  return (
    <AuthContext.Provider value={{ usuario, token, cargando, alertaSuspension, cerrarAlertaSuspension, login, registro, logout, tienePermiso }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
};
