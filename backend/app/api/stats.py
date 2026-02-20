# app/api/stats.py
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta, timezone
import logging
from app.auth import get_current_user
from app.services import load_servers
from app.database import db_pool
from app.database.local_db import get_pool

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stats"])


def parse_date_param(value: str | None, default_offset_days: int | None = None) -> datetime:
    """Парсит дату из ISO-формата или возвращает default."""
    if not value:
        if default_offset_days is not None:
            return datetime.now(timezone.utc) - timedelta(days=default_offset_days)
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail=f"Невалидный формат даты: {value}")


# Белый список SQL-выражений для агрегации (защита от SQL injection)
_AGG_LEVELS = {
    "raw": {
        "trunc": "ts",
        "group": "ts",
    },
    "hour": {
        "trunc": "date_trunc('hour', ts)",
        "group": "date_trunc('hour', ts)",
    },
    "4hour": {
        "trunc": "to_timestamp(floor(extract(epoch from ts) / 14400) * 14400)",
        "group": "floor(extract(epoch from ts) / 14400)",
    },
    "day": {
        "trunc": "date_trunc('day', ts)",
        "group": "date_trunc('day', ts)",
    },
}


def get_aggregation_params(start_dt, end_dt):
    """Определяет параметры агрегации SQL в зависимости от диапазона дат."""
    delta_days = (end_dt - start_dt).total_seconds() / 86400

    if delta_days <= 2:
        level = "raw"
    elif delta_days <= 14:
        level = "hour"
    elif delta_days <= 90:
        level = "4hour"
    else:
        level = "day"

    agg = _AGG_LEVELS[level]
    return {"trunc": agg["trunc"], "group": agg["group"], "level": level}

@router.get("/server_stats/{server_name}")
async def get_server_stats(server_name: str, current_user: dict = Depends(get_current_user)):
    """Получить текущую активность на сервере (live с удалённого сервера)"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    try:
        with db_pool.get_connection(server) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT pid, usename, datname, query, state FROM pg_stat_activity WHERE state IS NOT NULL;")
                queries = [{"pid": row[0], "usename": row[1], "datname": row[2], "query": row[3], "state": row[4]}
                          for row in cur.fetchall()]
        return {"queries": queries}
    except Exception as e:
        logger.error(f"Ошибка получения активности для {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/server/{server_name}/stats")
async def get_server_stats_details(
    server_name: str,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    """Получить детальную статистику сервера за период (из локальной pam_stats)"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    result = {
        "last_stat_update": None,
        "total_connections": 0,
        "total_size_gb": 0,
        "databases": [],
        "connection_timeline": []
    }

    try:
        pool = get_pool()
        start_date_dt = parse_date_param(start_date, default_offset_days=7)
        end_date_dt = parse_date_param(end_date)

        # Последнее обновление
        last_update = await pool.fetchval(
            "SELECT MAX(ts) FROM statistics WHERE server_name = $1;",
            server_name
        )
        result["last_stat_update"] = last_update.isoformat() if last_update else None

        # Агрегированные данные
        stats = await pool.fetchrow(
            """
            SELECT SUM(numbackends), SUM(db_size::float / (1048576 * 1024))
            FROM statistics
            WHERE server_name = $1 AND ts BETWEEN $2 AND $3;
            """,
            server_name, start_date_dt, end_date_dt
        )
        result["total_connections"] = stats[0] or 0 if stats else 0
        result["total_size_gb"] = stats[1] or 0 if stats else 0

        # Список БД
        db_rows = await pool.fetch(
            """
            SELECT DISTINCT s.datname, d.creation_time
            FROM statistics s
            LEFT JOIN db_info d ON s.server_name = d.server_name AND s.datname = d.datname
            WHERE s.server_name = $1 AND s.ts BETWEEN $2 AND $3;
            """,
            server_name, start_date_dt, end_date_dt
        )
        stats_dbs = [
            {"name": row["datname"], "creation_time": row["creation_time"].isoformat() if row["creation_time"] else None}
            for row in db_rows
        ]

        # Timeline с адаптивной агрегацией
        agg = get_aggregation_params(start_date_dt, end_date_dt)
        timeline_rows = await pool.fetch(
            f"""
            SELECT {agg['trunc']} as ts, datname,
                   AVG(numbackends) as avg_connections,
                   MAX(db_size::float / (1048576 * 1024)) as max_size_gb
            FROM statistics
            WHERE server_name = $1 AND ts BETWEEN $2 AND $3
            GROUP BY {agg['group']}, datname
            ORDER BY 1;
            """,
            server_name, start_date_dt, end_date_dt
        )
        timeline = [
            {
                "ts": row["ts"].isoformat(),
                "datname": row["datname"],
                "connections": round(row["avg_connections"] or 0),
                "size_gb": row["max_size_gb"] or 0
            }
            for row in timeline_rows
        ]
        result["connection_timeline"] = timeline
        result["aggregation"] = agg["level"]

        # Проверяем существующие БД на удалённом сервере
        with db_pool.get_connection(server) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
                active_dbs = [row[0] for row in cur.fetchall()]

        result["databases"] = [
            {"name": db["name"], "exists": db["name"] in active_dbs, "creation_time": db["creation_time"]}
            for db in stats_dbs
        ]

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения статистики для {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/server/{server_name}/db/{db_name}")
async def get_database_stats(
    server_name: str,
    db_name: str,
    current_user: dict = Depends(get_current_user)
):
    """Получить краткую статистику по базе данных (из локальной pam_stats)"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    result = {
        "size_mb": 0,
        "connections": 0,
        "commits": 0,
        "last_update": None
    }

    try:
        pool = get_pool()

        # Последняя запись из локальной статистики
        stats = await pool.fetchrow(
            """
            SELECT numbackends, db_size::float / 1048576, xact_commit, ts
            FROM statistics
            WHERE server_name = $1 AND datname = $2 AND db_size IS NOT NULL
            ORDER BY ts DESC
            LIMIT 1;
            """,
            server_name, db_name
        )
        if stats:
            result["connections"] = stats[0] or 0
            result["size_mb"] = stats[1] or 0
            result["commits"] = stats[2] or 0
            result["last_update"] = stats[3].isoformat() if stats[3] else None

        # Если размер не найден, получаем напрямую с удалённого сервера
        if result["size_mb"] == 0:
            with db_pool.get_connection(server) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_database_size(%s) / 1048576.0 AS size_mb;", (db_name,))
                    real_size = cur.fetchone()[0]
                    result["size_mb"] = real_size or 0

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения статистики БД {db_name} на {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/server/{server_name}/db/{db_name}/stats")
async def get_database_stats_details(
    server_name: str,
    db_name: str,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    """Получить детальную статистику по базе данных за период (из локальной pam_stats)"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    result = {
        "last_stat_update": None,
        "total_connections": 0,
        "total_commits": 0,
        "total_size_mb": 0,
        "creation_time": None,
        "max_connections": 0,
        "min_connections": 0,
        "timeline": []
    }

    try:
        pool = get_pool()
        start_date_dt = parse_date_param(start_date, default_offset_days=7)
        end_date_dt = parse_date_param(end_date)

        # Последнее обновление
        last_update = await pool.fetchval(
            "SELECT MAX(ts) FROM statistics WHERE server_name = $1 AND datname = $2;",
            server_name, db_name
        )
        result["last_stat_update"] = last_update.isoformat() if last_update else None

        # Агрегированные метрики
        stats = await pool.fetchrow(
            """
            SELECT SUM(numbackends), SUM(xact_commit), SUM(db_size::float / 1048576),
                   MAX(numbackends), MIN(numbackends)
            FROM statistics
            WHERE server_name = $1 AND datname = $2 AND ts BETWEEN $3 AND $4;
            """,
            server_name, db_name, start_date_dt, end_date_dt
        )
        if stats:
            result["total_connections"] = stats[0] or 0
            result["total_commits"] = stats[1] or 0
            result["total_size_mb"] = stats[2] or 0
            result["max_connections"] = stats[3] or 0
            result["min_connections"] = stats[4] or 0

        # Время создания базы (из db_info)
        creation_time = await pool.fetchval(
            "SELECT creation_time FROM db_info WHERE server_name = $1 AND datname = $2;",
            server_name, db_name
        )
        result["creation_time"] = creation_time.isoformat() if creation_time else None

        # Timeline с адаптивной агрегацией
        agg = get_aggregation_params(start_date_dt, end_date_dt)
        timeline_rows = await pool.fetch(
            f"""
            SELECT {agg['trunc']} as ts,
                   AVG(numbackends) as avg_connections,
                   MAX(db_size::float / 1048576) as max_size_mb,
                   SUM(xact_commit) as total_commits
            FROM statistics
            WHERE server_name = $1 AND datname = $2 AND ts BETWEEN $3 AND $4
            GROUP BY {agg['group']}
            ORDER BY 1;
            """,
            server_name, db_name, start_date_dt, end_date_dt
        )
        timeline = [
            {
                "ts": row["ts"].isoformat(),
                "connections": round(row["avg_connections"] or 0),
                "size_mb": row["max_size_mb"] or 0,
                "commits": row["total_commits"] or 0
            }
            for row in timeline_rows
        ]
        result["timeline"] = timeline
        result["aggregation"] = agg["level"]

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения детальной статистики БД {db_name} на {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
