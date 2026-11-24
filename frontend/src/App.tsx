import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexto/AuthContext';
import { LandingPage } from './vistas_publicas/LandingPage';
import { PortalEstudiante } from './vistas_estudiante/PortalEstudiante';
import { DashboardAutoridades } from './vistas_autoridades/DashboardAutoridades';
import { DashboardSuperadmin } from './vistas_superadmin/DashboardSuperadmin';
import { ModalTerminosCondiciones } from './componentes_ui/ModalTerminosCondiciones';
import { apiCliente } from './servicios_ws/api_cliente';
import { ShieldCheck, LogOut, User, Lock, Sparkles, X, UserPlus, LogIn, AlertCircle, Clock } from 'lucide-react';

const MainApp: React.FC = () => {
  const { usuario, logout, login, registro, cargando, alertaSuspension, cerrarAlertaSuspension, tienePermiso } = useAuth();
  const [modalAuth, setModalAuth] = useState<'NONE' | 'LOGIN' | 'REGISTRO'>('NONE');
  const [modalTerminosAbierto, setModalTerminosAbierto] = useState<boolean>(false);
  const [modalCuentaPendiente, setModalCuentaPendiente] = useState<{
    abierto: boolean;
    username: string;
    rol: string;
  }>({
    abierto: false,
    username: '',
    rol: ''
  });
  const [errorAuth, setErrorAuth] = useState<string | null>(null);

  // Catálogo dinámico de cursos y niveles académicos obtenido del backend
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([
    '1º de Secundaria', '2º de Secundaria', '3º de Secundaria',
    '4º de Secundaria', '5º de Secundaria', '6º de Secundaria',
    'Universitario - Pregrado'
  ]);

  useEffect(() => {
    const cargarCursos = async () => {
      try {
        const resp = await apiCliente.get('/auth/cursos-activos');
        if (resp.data && Array.isArray(resp.data) && resp.data.length > 0) {
          setCursosDisponibles(resp.data);
        }
      } catch (e) {
        console.warn('Fallback a cursos por defecto:', e);
      }
    };
    cargarCursos();
  }, []);
  
  // Generador dinámico de Código de Estudiante institucional
  const generarCodigoEstudiante = () => {
    const aleatorio = Math.floor(100 + Math.random() * 900);
    return `EST-2026-${aleatorio}`;
  };

  // Valores iniciales limpios para registro (con placeholders de sugerencia)
  const getFormRegistroInicial = (rol = 'ESTUDIANTE') => ({
    nombre_completo: '',
    username: '',
    email: '',
    password: '',
    rol: rol,
    codigo_estudiante: rol === 'ESTUDIANTE' ? generarCodigoEstudiante() : '',
    grado_escolar: '1º de Secundaria',
    subtipo_tdah: 'CONTROL',
    acepto_terminos: false
  });

  // Estado limpio para Login (vacío para escribir desde cero)
  const getFormLoginInicial = () => ({
    nombre_completo: '',
    username: '',
    email: '',
    password: '',
    rol: 'ESTUDIANTE',
    codigo_estudiante: '',
    grado_escolar: '1º de Secundaria',
    acepto_terminos: false
  });

  // State for Login/Register Form
  const [formAuth, setFormAuth] = useState(getFormLoginInicial());

  const limpiarFormulario = () => {
    setFormAuth(getFormLoginInicial());
    setErrorAuth(null);
  };

  const abrirModal = (tipo: 'LOGIN' | 'REGISTRO') => {
    setErrorAuth(null);
    if (tipo === 'REGISTRO') {
      setFormAuth(getFormRegistroInicial('ESTUDIANTE'));
    } else {
      setFormAuth(getFormLoginInicial());
    }
    setModalAuth(tipo);
  };

  const cerrarModal = () => {
    limpiarFormulario();
    setModalAuth('NONE');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAuth(null);
    if (!formAuth.username || !formAuth.password) {
      setErrorAuth('Por favor ingresa usuario y contraseña.');
      return;
    }

    const res = await login(formAuth.username, formAuth.password);
    if (res.ok) {
      limpiarFormulario();
      setModalAuth('NONE');
    } else {
      setErrorAuth(res.error || 'Credenciales incorrectas.');
    }
  };

  const handleRegistroSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAuth(null);
    if (!formAuth.username || !formAuth.password || !formAuth.email || !formAuth.nombre_completo) {
      setErrorAuth('Por favor completa todos los campos obligatorios.');
      return;
    }

    if (!formAuth.acepto_terminos) {
      setErrorAuth('Debes aceptar los Términos y Condiciones y la Política de Privacidad correspondiente a tu rol para crear la cuenta.');
      return;
    }

    const res = await registro({
      username: formAuth.username,
      password: formAuth.password,
      email: formAuth.email,
      rol: formAuth.rol,
      nombre_completo: formAuth.nombre_completo,
      codigo_estudiante: formAuth.rol === 'ESTUDIANTE' ? formAuth.codigo_estudiante || undefined : undefined,
      grado_escolar: formAuth.rol === 'ESTUDIANTE' ? formAuth.grado_escolar || undefined : undefined,
      subtipo_tdah: formAuth.rol === 'ESTUDIANTE' ? (formAuth as any).subtipo_tdah || 'F90_2' : undefined,
      acepto_terminos: formAuth.acepto_terminos
    });

    if (res.ok) {
      if (res.requiere_aprobacion) {
        setModalCuentaPendiente({
          abierto: true,
          username: formAuth.username,
          rol: formAuth.rol
        });
      }
      limpiarFormulario();
      setModalAuth('NONE');
    } else {
      setErrorAuth(res.error || 'No se pudo crear la cuenta.');
    }
  };

  // Color de etiqueta según Rol
  const getBadgeRol = (rol: string) => {
    switch (rol) {
      case 'ESTUDIANTE':
        return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
      case 'PSICOLOGO':
        return 'bg-violet-500/20 text-violet-300 border border-violet-500/40';
      case 'DOCENTE':
        return 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40';
      case 'DIRECTOR':
        return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
      case 'SUPERADMIN':
        return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40';
      default:
        return 'bg-slate-700 text-slate-300 border border-slate-600';
    }
  };

  // Si el usuario está autenticado, cada portal tiene su propio App Shell con Sidebar lateral dedicado
  if (usuario) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
        {(tienePermiso('ACCESO_PANEL_SUPERADMIN') || usuario.rol === 'SUPERADMIN') ? (
          <DashboardSuperadmin />
        ) : (tienePermiso('ACCESO_PORTAL_ESTUDIANTE') || usuario.rol === 'ESTUDIANTE') ? (
          <PortalEstudiante />
        ) : (
          <DashboardAutoridades />
        )}

        {/* Modal Notificación de Cuenta Suspendida / Desactivada en Tiempo Real */}
        {alertaSuspension && (
          <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-rose-500/30 max-w-md w-full p-6 rounded-3xl space-y-5 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Sesión Finalizada: Cuenta Suspendida</h3>
                  <p className="text-xs text-rose-400">Acceso institucional revocado</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-slate-300">
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-200 leading-relaxed text-[11px] space-y-2">
                  <p className="font-semibold text-rose-300">{alertaSuspension}</p>
                  <p className="text-[10px] text-slate-400">
                    Tu sesión activa ha sido cerrada inmediatamente por seguridad. Si consideras que se trata de un error o requieres rehabilitar tu acceso, comunícate con el Superadministrador de la institución.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={cerrarAlertaSuspension}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition cursor-pointer"
                >
                  Entendido, ir al inicio
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Navbar Público para Visitantes */}
      <header className="glass-panel border-b border-slate-800/80 sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => cerrarModal()}>
            <img
              src="/Logo.jpg"
              alt="NEUROFOCUS AI Logo"
              className="w-10 h-10 rounded-full object-contain bg-white p-0.5 shadow-lg shadow-cyan-500/20 shrink-0"
            />
            <div>
              <h1 className="text-lg font-bold font-heading text-white tracking-wide">NEUROFOCUS <span className="text-cyan-400">AI</span></h1>
              <p className="text-[9px] text-slate-400 font-mono tracking-wider uppercase font-semibold">ENTERPRISE AI EDUCATION TECHNOLOGY</p>
            </div>
          </div>

          {/* Botones Header / Estado Visitante */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => abrirModal('LOGIN')}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-emerald-400" /> Iniciar Sesión
            </button>
            <button
              onClick={() => abrirModal('REGISTRO')}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Registrarse
            </button>
          </div>

        </div>
      </header>

      {/* Área Principal de Contenido (Landing Page) */}
      <main className="flex-1">
        <LandingPage
          onAbrirLogin={() => abrirModal('LOGIN')}
          onAbrirRegistro={() => abrirModal('REGISTRO')}
        />
      </main>

      {/* Modal de Autenticación (Login / Registro) */}
      {modalAuth !== 'NONE' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel p-8 rounded-3xl border border-slate-800 max-w-md w-full space-y-6 relative shadow-2xl animate-in fade-in zoom-in duration-200">
            
            <button
              onClick={cerrarModal}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Mensaje de Error en Alerta */}
            {errorAuth && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-rose-300 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorAuth}</span>
              </div>
            )}

            {modalAuth === 'LOGIN' ? (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                    <LogIn className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold font-heading text-white">Iniciar Sesión</h2>
                  <p className="text-xs text-slate-400">Acceso institucional U.E. Luis Barrancos Álvarez</p>
                </div>

                <form key={modalAuth} autoComplete="off" onSubmit={handleLoginSubmit} className="space-y-4">
                  {/* Trampa anti-autocompletado para navegadores Chromium */}
                  <input type="text" name="fake_user_trap" className="hidden" tabIndex={-1} autoComplete="off" />
                  <input type="password" name="fake_pass_trap" className="hidden" tabIndex={-1} autoComplete="new-password" />

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Usuario, Correo o Código de Estudiante</label>
                    <input
                      type="text"
                      name="acceso_identificador_usuario"
                      autoComplete="new-password"
                      value={formAuth.username}
                      onChange={(e) => setFormAuth({ ...formAuth, username: e.target.value })}
                      placeholder="Ej: jperez@colegio.edu o EST-2026-001"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition placeholder:text-slate-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Contraseña</label>
                    <input
                      type="password"
                      name="acceso_credencial_secreta"
                      autoComplete="new-password"
                      value={formAuth.password}
                      onChange={(e) => setFormAuth({ ...formAuth, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={cargando}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition mt-2 disabled:opacity-50"
                  >
                    {cargando ? 'Verificando...' : 'Ingresar al Sistema'}
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button
                    onClick={() => abrirModal('REGISTRO')}
                    className="text-xs text-slate-400 hover:text-emerald-400 transition"
                  >
                    ¿No tienes cuenta? <span className="underline font-semibold text-emerald-400">Regístrate gratis</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 rounded-2xl flex items-center justify-center mx-auto">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold font-heading text-white">Registrar Nueva Cuenta</h2>
                  <p className="text-xs text-slate-400">Selecciona tu rol para acceder a tu panel correspondiente</p>
                </div>

                <form autoComplete="off" onSubmit={handleRegistroSubmit} className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      name="neuro_reg_nombre_full"
                      autoComplete="off"
                      value={formAuth.nombre_completo}
                      onChange={(e) => setFormAuth({ ...formAuth, nombre_completo: e.target.value })}
                      placeholder="Ej: Juan Pablo Pérez Rodríguez"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm outline-none focus:border-cyan-500 transition placeholder:text-slate-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre de Usuario *</label>
                    <input
                      type="text"
                      name="neuro_reg_alias_user"
                      autoComplete="off"
                      value={formAuth.username}
                      onChange={(e) => setFormAuth({ ...formAuth, username: e.target.value })}
                      placeholder="Ej: jperez"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm outline-none focus:border-cyan-500 transition placeholder:text-slate-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Correo Electrónico *</label>
                    <input
                      type="email"
                      name="neuro_reg_email_addr"
                      autoComplete="off"
                      value={formAuth.email}
                      onChange={(e) => setFormAuth({ ...formAuth, email: e.target.value })}
                      placeholder="Ej: estudiante@gmail.com"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm outline-none focus:border-cyan-500 transition placeholder:text-slate-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Rol en el Sistema (RBAC) *</label>
                    <select
                      name="neuro_reg_rol_select"
                      value={formAuth.rol}
                      onChange={(e) => {
                        const nuevoRol = e.target.value;
                        setFormAuth({
                          ...formAuth,
                          rol: nuevoRol,
                          codigo_estudiante: nuevoRol === 'ESTUDIANTE' ? (formAuth.codigo_estudiante || generarCodigoEstudiante()) : ''
                        });
                      }}
                      className="w-full bg-slate-900 border border-cyan-500/50 text-cyan-300 font-semibold rounded-xl px-4 py-2 text-sm outline-none focus:border-cyan-400 transition"
                    >
                      <option value="ESTUDIANTE"> Estudiante con TDAH (Portal Biométrico)</option>
                      <option value="DOCENTE">Docente de Aula (Panel de Monitoreo)</option>
                      <option value="PSICOLOGO"> Gabinete Psicopedagógico (Reportes PDF)</option>
                      <option value="DIRECTOR"> Director de Unidad Educativa</option>
                      <option value="TUTOR"> Tutor / Padre de Familia</option>
                      <option value="SIN_ROL"> Sin Rol (Personal en Espera de Asignación)</option>
                    </select>
                  </div>

                  {/* Advertencia institucional para roles que requieren validación */}
                  {formAuth.rol !== 'ESTUDIANTE' && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-[11px] flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <p className="leading-relaxed">
                        <strong>Validación Requerida:</strong> Por políticas de privacidad y protección de datos (Ley 548), las cuentas con rol de <strong>{formAuth.rol === 'SIN_ROL' ? 'Sin Rol' : formAuth.rol}</strong> requieren validación del Superadministrador antes de poder iniciar sesión.
                      </p>
                    </div>
                  )}

                  {/* Campos específicos cuando se registra como ESTUDIANTE */}
                  {formAuth.rol === 'ESTUDIANTE' && (
                    <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-semibold text-emerald-300">
                            Código de Estudiante
                          </label>
                          <button
                            type="button"
                            onClick={() => setFormAuth({ ...formAuth, codigo_estudiante: generarCodigoEstudiante() })}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer"
                          >
                            Regenerar código
                          </button>
                        </div>
                        <input
                          type="text"
                          name="neuro_reg_cod_estudiante"
                          autoComplete="off"
                          value={formAuth.codigo_estudiante}
                          onChange={(e) => setFormAuth({ ...formAuth, codigo_estudiante: e.target.value.toUpperCase() })}
                          placeholder="EST-2026-002"
                          className="w-full bg-slate-900 border border-emerald-500/30 text-white rounded-xl px-3 py-1.5 text-xs font-mono outline-none focus:border-emerald-400 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-300 mb-1">
                          Grado Escolar
                        </label>
                        <select
                          name="neuro_reg_grado_escolar"
                          value={formAuth.grado_escolar}
                          onChange={(e) => setFormAuth({ ...formAuth, grado_escolar: e.target.value })}
                          className="w-full bg-slate-900 border border-emerald-500/30 text-emerald-300 font-semibold rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-400 transition"
                        >
                          {cursosDisponibles.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-300 mb-1">
                          Subtipo Clínico DSM-5-TR (Sección 2.1.1)
                        </label>
                        <select
                          name="neuro_reg_subtipo_tdah"
                          value={(formAuth as any).subtipo_tdah || 'CONTROL'}
                          onChange={(e) => setFormAuth({ ...formAuth, subtipo_tdah: e.target.value } as any)}
                          className="w-full bg-slate-900 border border-emerald-500/30 text-amber-300 font-semibold rounded-xl px-3 py-2 text-xs outline-none focus:border-emerald-400 transition"
                        >
                          <option value="CONTROL">Sin Diagnóstico Previo / Grupo Control (Neurotípico)</option>
                          <option value="F90_2">F90.2: Presentación Combinada (Inatento + Hiperactivo)</option>
                          <option value="F90_0">F90.0: Predominio Déficit de Atención (Inatento)</option>
                          <option value="F90_1">F90.1: Predominio Hiperactividad / Impulsividad</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Contraseña *</label>
                    <input
                      type="password"
                      name="neuro_reg_pass_secret"
                      autoComplete="new-password"
                      value={formAuth.password}
                      onChange={(e) => setFormAuth({ ...formAuth, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm outline-none focus:border-cyan-500 transition"
                      required
                    />
                  </div>

                  {/* 🛡️ Consentimiento Informado y Términos Legales por Rol (Capítulo 5) */}
                  <div className={`p-3.5 rounded-2xl border transition ${
                    formAuth.acepto_terminos 
                      ? 'bg-emerald-500/10 border-emerald-500/30' 
                      : 'bg-slate-950/80 border-slate-800'
                  }`}>
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        id="check_terminos_legales"
                        checked={formAuth.acepto_terminos}
                        onChange={(e) => setFormAuth({ ...formAuth, acepto_terminos: e.target.checked })}
                        className="mt-1 w-4 h-4 rounded border-slate-700 text-cyan-500 focus:ring-cyan-500/30 cursor-pointer accent-cyan-400 shrink-0"
                      />
                      <label htmlFor="check_terminos_legales" className="text-xs text-slate-300 select-none leading-relaxed">
                        He leído y acepto los{' '}
                        <button
                          type="button"
                          onClick={() => setModalTerminosAbierto(true)}
                          className="font-bold text-cyan-400 hover:text-cyan-300 underline inline cursor-pointer"
                        >
                          Términos y Condiciones
                        </button>{' '}
                        y la{' '}
                        <button
                          type="button"
                          onClick={() => setModalTerminosAbierto(true)}
                          className="font-bold text-emerald-400 hover:text-emerald-300 underline inline cursor-pointer"
                        >
                          Política de Privacidad Biométrica
                        </button>{' '}
                        correspondiente a mi rol de <span className="font-semibold text-white uppercase tracking-wider bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{formAuth.rol}</span>.
                      </label>
                    </div>

                    {!formAuth.acepto_terminos && (
                      <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5 pl-6 font-medium mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        Es obligatorio aceptar los términos para crear tu cuenta.
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!formAuth.acepto_terminos || cargando}
                    className={`w-full py-3 font-bold text-sm rounded-xl shadow-lg transition mt-2 flex items-center justify-center gap-2 ${
                      formAuth.acepto_terminos && !cargando
                        ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 cursor-pointer'
                        : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                    }`}
                  >
                    {cargando ? 'Registrando...' : 'Crear Cuenta e Ingresar'}
                  </button>
                </form>

                <div className="text-center pt-1">
                  <button
                    onClick={() => abrirModal('LOGIN')}
                    className="text-xs text-slate-400 hover:text-cyan-400 transition"
                  >
                    ¿Ya tienes cuenta? <span className="underline font-semibold text-cyan-400">Iniciar Sesión</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Modal Notificación de Cuenta en Revisión / Pendiente de Aprobación */}
      {modalCuentaPendiente.abierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full p-6 rounded-3xl space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Solicitud de Registro Enviada</h3>
                <p className="text-xs text-slate-400">Validación Institucional en Proceso</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
                <p className="text-slate-400">Usuario registrado:</p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-mono text-sm">{modalCuentaPendiente.username}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    Rol: {modalCuentaPendiente.rol === 'SIN_ROL' ? 'Sin Rol Asignado' : modalCuentaPendiente.rol}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-200 leading-relaxed text-[11px] space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-amber-300">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" /> Control de Acceso y Protección de Datos (Ley 548)
                </p>
                <p>
                  Tu cuenta ha sido creada exitosamente. Sin embargo, por normativas de seguridad y privacidad clínica, las cuentas con perfiles docentes o evaluadores <strong>deben ser aprobadas por el Superadministrador</strong> antes de poder iniciar sesión.
                </p>
                <p className="text-[10px] text-amber-300/80 pt-0.5">
                  Una vez que la administración apruebe tu solicitud, podrás ingresar normalmente con tu usuario y contraseña.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setModalCuentaPendiente({ abierto: false, username: '', rol: '' })}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                Entendido, esperar aprobación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Notificación de Cuenta Suspendida / Desactivada en Tiempo Real */}
      {alertaSuspension && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/30 max-w-md w-full p-6 rounded-3xl space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Sesión Finalizada: Cuenta Suspendida</h3>
                <p className="text-xs text-rose-400">Acceso institucional revocado</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-200 leading-relaxed text-[11px] space-y-2">
                <p className="font-semibold text-rose-300">{alertaSuspension}</p>
                <p className="text-[10px] text-slate-400">
                  Tu sesión activa ha sido cerrada inmediatamente por seguridad. Si consideras que se trata de un error o requieres rehabilitar tu acceso, comunícate con el Superadministrador de la institución.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={cerrarAlertaSuspension}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition cursor-pointer"
              >
                Entendido, ir al inicio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Interactivo de Términos y Condiciones por Rol (Capítulo 5) */}
      <ModalTerminosCondiciones
        isOpen={modalTerminosAbierto}
        onClose={() => setModalTerminosAbierto(false)}
        onAceptar={() => {
          setFormAuth(prev => ({ ...prev, acepto_terminos: true }));
          setModalTerminosAbierto(false);
        }}
        rolSeleccionado={formAuth.rol}
      />

    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};

export default App;
