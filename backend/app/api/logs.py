# app/api/logs.py
"""API системных логов (admin only)."""
from fastapi import APIRouter, Depends, Query
from app.auth.dependencies import get_current_user
from app.models.user import User, UserRole
from fastapi import HTTPException
from app.services import system_logger

router = APIRouter(prefix="/logs", tags=["logs"])


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return current_user


@router.get("")
async def get_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    level: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    current_user: User = Depends(_require_admin),
):
    """Получить системные логи."""
    return await system_logger.get_logs(
        limit=limit, offset=offset,
        level=level, source=source,
        date_from=date_from, date_to=date_to,
        search=search,
    )


@router.get("/stats")
async def get_logs_stats(current_user: User = Depends(_require_admin)):
    """Статистика системных логов."""
    return await system_logger.get_stats()
