#!/usr/bin/env python3
"""
PostgreSQL Activity Monitor API - точка входа
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import asyncio
import logging
import uvicorn
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import ALLOWED_ORIGINS, LOG_LEVEL
from app.api import auth_router, servers_router, health_router, stats_router, users_router, audit_router, settings_router
from app.database import db_pool
from app.database.local_db import init_pool, close_pool
from app.api.ssh_keys import router as ssh_keys_router
from app.auth.blacklist import token_blacklist
from app.services import audit_logger
from app.collector.scheduler import start_collector, stop_collector

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Настройка логирования
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Фоновая задача: очистка blacklist каждые 10 минут
async def cleanup_blacklist():
    while True:
        await asyncio.sleep(600)  # 10 минут
        token_blacklist.cleanup()
        await audit_logger.cleanup()

# События жизненного цикла
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("=" * 60)
    logger.info("PostgreSQL Activity Monitor API v3.0")
    logger.info(f"Уровень логирования: {LOG_LEVEL}")
    logger.info("=" * 60)
    await init_pool()
    collector_tasks = await start_collector()
    cleanup_task = asyncio.create_task(cleanup_blacklist())
    yield
    # Shutdown
    cleanup_task.cancel()
    await stop_collector(collector_tasks)
    logger.info("Завершение работы PostgreSQL Activity Monitor API...")
    await close_pool()
    db_pool.close_all()
    logger.info("Все ресурсы освобождены. До свидания!")

# Создание приложения
app = FastAPI(
    title="PostgreSQL Activity Monitor API",
    description="API для мониторинга активности PostgreSQL серверов",
    version="3.0",
    lifespan=lifespan
)

# Rate limiting
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Слишком много запросов. Попробуйте позже."}
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
app.include_router(users_router, tags=["users"])
app.include_router(ssh_keys_router, tags=["ssh-keys"])
app.include_router(audit_router, tags=["audit"])
app.include_router(settings_router, tags=["settings"])
# Корневой маршрут
@app.get("/")
async def root():
    return {
        "message": "PostgreSQL Activity Monitor API v3.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=False
    )
