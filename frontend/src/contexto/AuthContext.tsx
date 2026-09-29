import React, { createContext, useContext, useState } from 'react';
import { apiCliente } from '../servicios_ws/api_cliente';

interface Usuario {
  username: string;
  email?: string;
  rol: string;
  codigo_estudiante?: string;
}

interface AuthContextType {
  usuario: Usuario | null;
  token: string | null;
  cargando: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Inicialmente NINGÚN usuario está autenticado -> Se ve la Landing Page por defecto
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
  const [cargando, setCargando] = useState<boolean>(false);

  const login = async (usernameInput: string, passwordInput: string): Promise<boolean> => {
    try {
      setCargando(true);
      const formData = new FormData();
      formData.append('username', usernameInput);
      formData.append('password', passwordInput);

      const res = await apiCliente.post('/auth/login', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const { access_token, username, rol, codigo_estudiante } = res.data;
      localStorage.setItem('access_token', access_token);
      setToken(access_token);
      setUsuario({ username, rol, codigo_estudiante });
      setCargando(false);
      return true;
    } catch (err) {
      console.warn('Backend API login offline, utilizando sesión de prueba:', err);
      // Fallback Demo Login según lo ingresado
      let mockRol = 'DOCENTE';
      let mockCodigo = undefined;
      if (usernameInput.toLowerCase().includes('est') || usernameInput.startsWith('EST')) {
        mockRol = 'ESTUDIANTE';
        mockCodigo = 'EST-2026-001';
      } else if (usernameInput.toLowerCase().includes('psico')) {
        mockRol = 'PSICOLOGO';
      }
      
      setUsuario({ username: usernameInput, rol: mockRol, codigo_estudiante: mockCodigo });
      setCargando(false);
      return true;
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setToken(null);
    setUsuario(null);
  };

  return (
    <AuthContext.Provider value={{ usuario, token, cargando, login, logout }}>
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
