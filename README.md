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
| **Estudiante** | `EST-2026-001` (o `mateo_estudiante`) | `Estudiante2026!` |
| **Psicopedagogía** | `psicologo_demo` | `Psicologo2026!` |
| **Docente** | `docente_demo` | `Docente2026!` |
