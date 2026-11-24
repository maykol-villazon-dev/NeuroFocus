import axios from 'axios';

const API_BASE_URL = '/api/v1';

export const apiCliente = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para inyectar automáticamente el Token JWT
apiCliente.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Interceptor de respuesta para detectar expulsión y suspensión en tiempo real
apiCliente.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail || '';

      if (status === 403 && typeof detail === 'string' && detail.includes('CUENTA_SUSPENDIDA')) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user_data');
        window.dispatchEvent(
          new CustomEvent('sesion-cuenta-suspendida', {
            detail: {
              mensaje: detail.replace('CUENTA_SUSPENDIDA:', '').trim() ||
                'Su cuenta ha sido desactivada o suspendida por la administración institucional.',
            },
          })
        );
      }
    }
    return Promise.reject(error);
  }
);
