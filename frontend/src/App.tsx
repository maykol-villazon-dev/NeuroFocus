import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexto/AuthContext';
import { LandingPage } from './vistas_publicas/LandingPage';
import { PortalEstudiante } from './vistas_estudiante/PortalEstudiante';
import { DashboardAutoridades } from './vistas_autoridades/DashboardAutoridades';
import { ShieldCheck, LogOut, User, Lock, Sparkles, X, UserPlus, LogIn } from 'lucide-react';

const MainApp: React.FC = () => {
  const { usuario, logout, login } = useAuth();
  const [modalAuth, setModalAuth] = useState<'NONE' | 'LOGIN' | 'REGISTRO'>('NONE');
  
  // State for Login/Register Form
  const [formAuth, setFormAuth] = useState({
    username: '',
    password: '',
    email: '',
    rol: 'ESTUDIANTE',
    nombre_completo: '',
    codigo_estudiante: ''
  });

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(formAuth.username || 'EST-2026-001', formAuth.password || 'Estudiante2026!');
    setModalAuth('NONE');
  };

  const handleRegistroSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(formAuth.username || 'nuevo_usuario', formAuth.password || 'User2026!');
    setModalAuth('NONE');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Navbar Principal */}
      <header className="glass-panel border-b border-slate-800/80 sticky top-0 z-40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => { if (!usuario) setModalAuth('NONE'); }}>
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

          {/* Botones Header / Estado Usuario */}
          {usuario ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 px-4 py-2 rounded-xl text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-slate-300 font-medium">
                  {usuario.rol === 'ESTUDIANTE' ? 'Estudiante:' : 'Personal:'} <strong className="text-white">{usuario.username}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px]">
                  {usuario.rol}
                </span>
              </div>

              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-rose-400 rounded-xl border border-slate-800 transition text-xs font-semibold"
                title="Cerrar Sesión de forma segura"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setModalAuth('LOGIN')}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-2"
              >
                <LogIn className="w-4 h-4 text-emerald-400" /> Iniciar Sesión
              </button>
              <button
                onClick={() => setModalAuth('REGISTRO')}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Registrarse
              </button>
            </div>
          )}

        </div>
      </header>

      {/* Área Principal de Contenido (Flujo Estricto de Seguridad) */}
      <main className="flex-1">
        {usuario ? (
          // Si el usuario está autenticado, solo ve la vista correspondiente a su rol estricto
          usuario.rol === 'ESTUDIANTE' ? (
            <PortalEstudiante />
          ) : (
            <DashboardAutoridades />
          )
        ) : (
          // Si no está autenticado, siempre ve la Landing Page por defecto
          <LandingPage
            onAbrirLogin={() => setModalAuth('LOGIN')}
            onAbrirRegistro={() => setModalAuth('REGISTRO')}
          />
        )}
      </main>

      {/* Modal de Autenticación (Login / Registro) */}
      {modalAuth !== 'NONE' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel p-8 rounded-3xl border border-slate-800 max-w-md w-full space-y-6 relative shadow-2xl animate-in fade-in zoom-in duration-200">
            
            <button
              onClick={() => setModalAuth('NONE')}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            {modalAuth === 'LOGIN' ? (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                    <LogIn className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold font-heading text-white">Iniciar Sesión</h2>
                  <p className="text-xs text-slate-400">Acceso institucional U.E. Luis Barrancos Álvarez</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Usuario o Código de Estudiante</label>
                    <input
                      type="text"
                      value={formAuth.username}
                      onChange={(e) => setFormAuth({ ...formAuth, username: e.target.value })}
                      placeholder="Ej: EST-2026-001 o docente_demo"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Contraseña</label>
                    <input
                      type="password"
                      value={formAuth.password}
                      onChange={(e) => setFormAuth({ ...formAuth, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition mt-2"
                  >
                    Ingresar al Sistema
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button
                    onClick={() => setModalAuth('REGISTRO')}
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
                  <p className="text-xs text-slate-400">Crea tu perfil según tu rol académico</p>
                </div>

                <form onSubmit={handleRegistroSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo</label>
                    <input
                      type="text"
                      value={formAuth.nombre_completo}
                      onChange={(e) => setFormAuth({ ...formAuth, nombre_completo: e.target.value })}
                      placeholder="Ej: Mateo Morales Villalobos"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre de Usuario</label>
                    <input
                      type="text"
                      value={formAuth.username}
                      onChange={(e) => setFormAuth({ ...formAuth, username: e.target.value })}
                      placeholder="mateo_estudiante"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={formAuth.email}
                      onChange={(e) => setFormAuth({ ...formAuth, email: e.target.value })}
                      placeholder="mateo@barrancos.edu.bo"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Seleccionar Rol (RBAC)</label>
                    <select
                      value={formAuth.rol}
                      onChange={(e) => setFormAuth({ ...formAuth, rol: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition"
                    >
                      <option value="ESTUDIANTE">Estudiante con TDAH</option>
                      <option value="DOCENTE">Docente de Aula</option>
                      <option value="PSICOLOGO">Gabinete Psicopedagógico</option>
                      <option value="TUTOR">Tutor / Padre de Familia</option>
                      <option value="DIRECTOR">Director de UE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Contraseña</label>
                    <input
                      type="password"
                      value={formAuth.password}
                      onChange={(e) => setFormAuth({ ...formAuth, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500 transition"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition mt-2"
                  >
                    Crear Cuenta e Ingresar
                  </button>
                </form>

                <div className="text-center pt-2">
                  <button
                    onClick={() => setModalAuth('LOGIN')}
                    className="text-xs text-slate-400 hover:text-emerald-400 transition"
                  >
                    ¿Ya tienes cuenta? <span className="underline font-semibold text-emerald-400">Iniciar Sesión</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

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
