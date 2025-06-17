# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
from app.config import ALLOWED_ORIGINS, LOG_LEVEL
from app.api import auth_router, servers_router, health_router, stats_router
from app.database import db_pool

# Настройка логирования
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# События жизненного цикла
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("=" * 60)
    logger.info("PostgreSQL Activity Monitor API v2.0")
    logger.info(f"Уровень логирования: {LOG_LEVEL}")
    logger.info("=" * 60)
    yield
    # Shutdown
    logger.info("Завершение работы PostgreSQL Activity Monitor API...")
    db_pool.close_all()
    logger.info("Все ресурсы освобождены. До свидания!")

# Создание приложения
app = FastAPI(
    title="PostgreSQL Activity Monitor API",
    description="API для мониторинга активности PostgreSQL серверов",
    version="2.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключение роутеров
app.include_router(auth_router)
app.include_router(servers_router)
app.include_router(health_router)
app.include_router(stats_router)

# Корневой маршрут
@app.get("/")
async def root():
    return {
        "message": "PostgreSQL Activity Monitor API v2.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }
