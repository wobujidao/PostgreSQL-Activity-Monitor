# app/services/audit_logger.py
"""
Аудит сессий пользователей — запись и чтение событий аутентификации.
Хранение: PostgreSQL (pam_stats) через asyncpg.
"""
from datetime import datetime, timezone, timedelta
import logging

from fastapi import Request
from app.config import AUDIT_RETENTION_DAYS

logger = logging.getLogger(__name__)


def _get_pool():
    """Ленивый импорт пула — избегаем циклических зависимостей при старте."""
    from app.database.local_db import get_pool
    return get_pool()


def _get_client_ip(request: Request) -> str:
    """Извлечь реальный IP клиента (X-Real-IP от nginx или client.host)."""
    return (
        request.headers.get("x-real-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


def _get_user_agent(request: Request) -> str:
    return request.headers.get("user-agent", "unknown")


async def log_event(
    event_type: str,
    username: str,
    request: Request,
    jti: str | None = None,
    details: str | None = None,
) -> None:
    """Записать событие аудита."""
    ip = _get_client_ip(request)
    ua = _get_user_agent(request)
    try:
        pool = _get_pool()
        await pool.execute(
            """
            INSERT INTO audit_sessions (timestamp, event_type, username, ip_address, user_agent, jti, details)
            VALUES (now(), $1, $2, $3, $4, $5, $6)
            """,
            event_type, username, ip, ua, jti, details,
        )
        logger.debug(f"Audit: {event_type} — {username}")
    except Exception as e:
        logger.error(f"Ошибка записи аудита: {e}")


async def get_events(
    limit: int = 50,
    offset: int = 0,
    username: str | None = None,
    event_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """Получить события с фильтрацией и пагинацией."""
    conditions = []
    params = []
    idx = 1

    if username:
        conditions.append(f"(username ILIKE ${idx} OR ip_address ILIKE ${idx})")
        params.append(f"%{username}%")
        idx += 1
    if event_type:
        conditions.append(f"event_type = ${idx}")
        params.append(event_type)
        idx += 1
    if date_from:
        conditions.append(f"timestamp >= ${idx}")
        dt_from = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        if dt_from.tzinfo is None:
            dt_from = dt_from.replace(tzinfo=timezone.utc)
        params.append(dt_from)
        idx += 1
    if date_to:
        conditions.append(f"timestamp <= ${idx}")
        dt_to = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
        if dt_to.tzinfo is None:
            dt_to = dt_to.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        else:
            dt_to = dt_to.replace(hour=23, minute=59, second=59)
        params.append(dt_to)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    pool = _get_pool()
    total = await pool.fetchval(f"SELECT COUNT(*) FROM audit_sessions {where}", *params)

    rows = await pool.fetch(
        f"SELECT timestamp, event_type, username, ip_address, user_agent, jti, details "
        f"FROM audit_sessions {where} ORDER BY timestamp DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params, limit, offset,
    )

    items = [
        {
            "timestamp": row["timestamp"].isoformat(),
            "event_type": row["event_type"],
            "username": row["username"],
            "ip_address": row["ip_address"],
            "user_agent": row["user_agent"],
            "jti": row["jti"],
            "details": row["details"],
        }
        for row in rows
    ]

    return {"items": items, "total": total, "limit": limit, "offset": offset}


async def get_stats() -> dict:
    """Агрегированная статистика."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    pool = _get_pool()
    total_events = await pool.fetchval("SELECT COUNT(*) FROM audit_sessions")
    logins_today = await pool.fetchval(
        "SELECT COUNT(*) FROM audit_sessions WHERE event_type = 'login_success' AND timestamp >= $1",
        today_start,
    )
    failed_total = await pool.fetchval(
        "SELECT COUNT(*) FROM audit_sessions WHERE event_type = 'login_failed'",
    )
    failed_today = await pool.fetchval(
        "SELECT COUNT(*) FROM audit_sessions WHERE event_type = 'login_failed' AND timestamp >= $1",
        today_start,
    )
    unique_users_week = await pool.fetchval(
        "SELECT COUNT(DISTINCT username) FROM audit_sessions WHERE event_type = 'login_success' AND timestamp >= $1",
        week_ago,
    )

    return {
        "total_events": total_events,
        "logins_today": logins_today,
        "unique_users_week": unique_users_week,
        "failed_total": failed_total,
        "failed_today": failed_today,
    }


async def cleanup(days: int = AUDIT_RETENTION_DAYS) -> int:
    """Удалить записи старше N дней."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        pool = _get_pool()
        result = await pool.execute("DELETE FROM audit_sessions WHERE timestamp < $1", cutoff)
        removed = int(result.split()[-1])
        if removed > 0:
            logger.info(f"Audit cleanup: удалено {removed} записей старше {days} дней")
        return removed
    except Exception as e:
        logger.error(f"Ошибка очистки аудита: {e}")
        return 0
