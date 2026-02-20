# app/services/system_logger.py
"""
Системные логи — запись и чтение событий работы приложения.
Хранение: PostgreSQL (pam_stats) через asyncpg.
"""
from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)


def _get_pool():
    from app.database.local_db import get_pool
    return get_pool()


async def log(level: str, source: str, message: str, details: str | None = None) -> None:
    """Записать событие в system_log."""
    try:
        pool = _get_pool()
        await pool.execute(
            "INSERT INTO system_log (timestamp, level, source, message, details) VALUES (now(), $1, $2, $3, $4)",
            level, source, message, details,
        )
    except Exception as e:
        logger.error(f"Ошибка записи system_log: {e}")


async def info(source: str, message: str, details: str | None = None) -> None:
    await log("info", source, message, details)


async def warning(source: str, message: str, details: str | None = None) -> None:
    await log("warning", source, message, details)


async def error(source: str, message: str, details: str | None = None) -> None:
    await log("error", source, message, details)


async def get_logs(
    limit: int = 50,
    offset: int = 0,
    level: str | None = None,
    source: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
) -> dict:
    """Получить логи с фильтрацией и пагинацией."""
    conditions = []
    params = []
    idx = 1

    if level:
        conditions.append(f"level = ${idx}")
        params.append(level)
        idx += 1
    if source:
        conditions.append(f"source = ${idx}")
        params.append(source)
        idx += 1
    if search:
        conditions.append(f"(message ILIKE ${idx} OR details ILIKE ${idx})")
        params.append(f"%{search}%")
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
    total = await pool.fetchval(f"SELECT COUNT(*) FROM system_log {where}", *params)

    rows = await pool.fetch(
        f"SELECT timestamp, level, source, message, details "
        f"FROM system_log {where} ORDER BY timestamp DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params, limit, offset,
    )

    items = [
        {
            "timestamp": row["timestamp"].isoformat(),
            "level": row["level"],
            "source": row["source"],
            "message": row["message"],
            "details": row["details"],
        }
        for row in rows
    ]

    return {"items": items, "total": total, "limit": limit, "offset": offset}


async def get_stats() -> dict:
    """Статистика логов."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    pool = _get_pool()
    total = await pool.fetchval("SELECT COUNT(*) FROM system_log")
    errors_today = await pool.fetchval(
        "SELECT COUNT(*) FROM system_log WHERE level = 'error' AND timestamp >= $1", today_start,
    )
    warnings_today = await pool.fetchval(
        "SELECT COUNT(*) FROM system_log WHERE level = 'warning' AND timestamp >= $1", today_start,
    )

    return {
        "total": total,
        "errors_today": errors_today,
        "warnings_today": warnings_today,
    }


async def cleanup(days: int = 30) -> int:
    """Удалить записи старше N дней."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        pool = _get_pool()
        result = await pool.execute("DELETE FROM system_log WHERE timestamp < $1", cutoff)
        removed = int(result.split()[-1])
        if removed > 0:
            logger.info(f"System log cleanup: удалено {removed} записей старше {days} дней")
        return removed
    except Exception as e:
        logger.error(f"Ошибка очистки system_log: {e}")
        return 0
