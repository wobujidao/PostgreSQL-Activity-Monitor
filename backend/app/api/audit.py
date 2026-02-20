# app/api/audit.py
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
from app.auth import get_current_user
from app.models.user import User, UserRole
from app.services import audit_logger

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audit", tags=["audit"])


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/sessions")
async def get_sessions(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    username: str | None = Query(None),
    event_type: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    current_user: User = Depends(_require_admin),
):
    """Список событий аудита (admin only)."""
    return await audit_logger.get_events(
        limit=limit,
        offset=offset,
        username=username,
        event_type=event_type,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/sessions/stats")
async def get_sessions_stats(
    current_user: User = Depends(_require_admin),
):
    """Статистика аудита (admin only)."""
    return await audit_logger.get_stats()
