from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.persistencia.repositorios import init_db_and_seed
from app.autenticacion_rbac.rutas_auth import router as auth_router
from app.servicios.rutas_monitoreo import router as monitoreo_router
from app.servicios.rutas_websockets import router as ws_router
from app.servicios.rutas_reportes import router as reportes_router
from app.servicios.rutas_materiales import router as materiales_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Inicializar BD y usuarios semilla
    print("[STARTUP] Iniciando Servidor FastAPI e Inicializando Base de Datos...")
    await init_db_and_seed()
    print("[SUCCESS] Base de Datos conectada y usuarios semilla creados con exito.")
    yield
    # Shutdown
    print("[SHUTDOWN] Apagando Servidor FastAPI...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Configuración de CORS para conexión con Frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # En producción se especifica el dominio del frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(monitoreo_router, prefix=settings.API_V1_STR)
app.include_router(reportes_router, prefix=settings.API_V1_STR)
app.include_router(materiales_router, prefix=settings.API_V1_STR)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "mensaje": "Servidor de Monitoreo Multimodal de Atención para Estudiantes con TDAH",
        "institucion": "U.E. Luis Barrancos Álvarez - UAGRM FICCT",
        "version": settings.VERSION,
        "docs": "/docs"
    }


@app.get("/api/v1/health")
async def health_check():
    return {"status": "healthy", "database": "connected"}
