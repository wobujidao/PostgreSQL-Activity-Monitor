# app/api/health.py
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from datetime import datetime, timezone
import logging
from app.models.user import User
from app.auth import get_current_user
from app.database import db_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])

@router.get("/pools/status")
async def get_pools_status(current_user: User = Depends(get_current_user)):
    """Получить статус всех пулов подключений"""
    return db_pool.get_status()

@router.get("/health")
async def health_check():
    """Проверка состояния API"""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pools_count": len(db_pool.pools),
        "version": "2.2",
    }

@router.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return JSONResponse(status_code=404, content={"message": "Not Found"})
