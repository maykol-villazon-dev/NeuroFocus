# NEUROFOCUS AI 🧠⚡
> **Herramienta Computacional de Monitoreo Multimodal de Atención e Inquietud Motriz para Estudiantes con TDAH**  
> *Proyecto de Grado | UAGRM - FICCT*

---

## 🚀 Descripción del Proyecto
Plataforma web no invasiva para la detección temprana de episodios de desatención, somnolencia e inquietud corporal en estudiantes con TDAH durante entornos educativos digitales.

### 🔬 Tecnologías y Fundamentos Biométricos
- **Detección Ocular (EAR):** Relación de Aspecto Ocular basada en *Soukupová & Čech (2016)* para parpadeo y fatiga.
- **Pose Cefálica 3D (PnP):** Estimación Perspective-n-Point de ángulos de Euler (Yaw, Pitch, Roll).
- **Inquietud Motriz:** Varianza cinemática en ventana deslizante de 3 segundos.
- **Filtro de Kalman 1D:** Suavizado del Índice de Atención Integral ($IAI \in [0, 100]\%$).
- **Privacy by Design:** Procesamiento de 468 landmarks en memoria RAM volátil mediante Google MediaPipe Face Mesh WebAssembly; cero almacenamiento de video en disco.

---

## 🛠️ Stack Tecnológico
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, MediaPipe Face Mesh.
- **Backend:** FastAPI, Python 3.11+, SQLAlchemy 2.0 (Async), WebSockets, SQLite, JWT / bcrypt (RBAC).

---

## 📦 Instalación y Ejecución Local

### 1. Backend (FastAPI)
```bash
cd backend
python -m venv venv
# En Windows:
.\venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
Swagger UI disponible en: `http://127.0.0.1:8000/docs`

### 2. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Aplicación disponible en: `http://localhost:5173`

---

## 👥 Cuentas de Acceso Preconfiguradas (Seed Demo)
| Rol | Usuario | Contraseña |
| :--- | :--- | :--- |
| **Superadministrador** | `superadmin` | `Admin2026!` |
| **Estudiante** | `EST-2026-001` (o `mateo_estudiante`) | `Estudiante2026!` |
| **Psicopedagogía** | `psicologo_demo` | `Psicologo2026!` |
| **Docente** | `docente_demo` | `Docente2026!` |

---

## 🧪 Controles de Prueba y Depuración (Modo Exposición / Jurado)

En la interfaz del estudiante existen controles de depuración diseñados para auditar visualmente los algoritmos sin depender de movimientos físicos involuntarios. Para la versión final de producción estos botones han sido **ocultados** a fin de mantener una interfaz limpia y autónoma.

### 📍 Ubicación en el Código Fuente
Archivo: [`frontend/src/vistas_estudiante/PortalEstudiante.tsx`](frontend/src/vistas_estudiante/PortalEstudiante.tsx)

#### 1. Botones de Simulación de los 4 Estados Clínicos (Capítulo 2)
- **Ubicación:** Bloque de tarjeta del Avatar HUD (aprox. líneas 1025–1065).
- **Finalidad:** Permiten forzar al instante el estado atencional, el cálculo del Índice de Atención Integral ($IAI$), el resplandor perimetral de pantalla (*Border Glow* acelerado por GPU) y la animación del avatar acompañante:
  - **`Est 1: Hiperfoco (#00F5D4)`**: Fuerza un $IAI = 92\%$, estado 1 (Cian fluorescente) y avatar Cohete 🚀 (+10 pts/s).
  - **`Est 2: Sostenida (#2EC4B6)`**: Fuerza un $IAI = 72\%$, estado 2 (Verde esmeralda) y avatar Sonrisa 😊 (+7.5 pts/s).
  - **`Est 3: Desvío (#FFB703)`**: Fuerza un $IAI = 48\%$, estado 3 (Ámbar preventivo) y avatar Alerta de mirada 👀 (+2.5 pts/s).
  - **`Est 4: Fatiga (#7209B7)`**: Fuerza un $IAI = 32\%$, estado 4 (Púrpura/Violeta) y avatar Pausa activa 🌱.

#### 2. Botón de Validación de Parpadeo durante Calibración
- **Ubicación:** Bloque de calibración biométrica (aprox. líneas 697–715).
- **Nombre:** **`Simular Parpadeo (EAR < 0.20)`**.
- **Finalidad:** Disminuye puntualmente el cálculo de relación de aspecto ocular ($EAR$) por debajo de $0.20$ para comprobar el contador de parpadeos en caso de iluminación deficiente o pruebas automatizadas.

#### 3. Botón y Fórmulas Matemáticas de la Rutina de Calibración
- **Ubicación:** Bloque de inicio de calibración (aprox. líneas 785–845).
- **Nombre:** **`Ver Fórmulas del Algoritmo` / `Ocultar Algoritmo`**.
- **Finalidad:** Despliega las ecuaciones LaTeX y código matemático de la tesis (`calculo_biometrico.ts`, fórmula de Soukupová & Čech, algoritmo PnP 3D y pesos de Kalman 1D). Oculto para evitar saturación cognitiva en estudiantes con TDAH.

---

### 🔄 Cómo Reactivar los Botones para una Presentación
Si un jurado o evaluador solicita verificar de forma manual e inmediata la respuesta visual de la interfaz ante los distintos estados del $IAI$ o ver las fórmulas en pantalla, sigue estos pasos:

1. Abrir [`frontend/src/vistas_estudiante/PortalEstudiante.tsx`](frontend/src/vistas_estudiante/PortalEstudiante.tsx).
2. Localizar el comentario de cabecera:
   ```tsx
   {/* [MODO DEPURACIÓN / DEMOSTRACIÓN JURADOS] */}
   {false && (
     // bloque de botones
   )}
   ```
3. Cambiar `{false && (` por `{true && (` en las líneas correspondientes:
   - Línea ~702: Validación de parpadeo voluntario.
   - Línea ~788: Botón de fórmulas matemáticas del algoritmo de calibración.
   - Línea ~1040: Simulación de los 4 estados clínicos del IAI.
4. Guardar el archivo (`Ctrl + S`). Vite aplicará Hot Module Replacement (HMR) al instante sin necesidad de reiniciar la app.

