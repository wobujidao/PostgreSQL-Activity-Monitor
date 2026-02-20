# app/database/local_db.py
"""
Модуль для работы с локальной БД pam_stats через asyncpg.
Хранит историческую статистику, собранную коллектором.
"""
import asyncpg
import logging
from datetime import datetime, timedelta, timezone
from app.config import LOCAL_DB_DSN, RETENTION_MONTHS

logger = logging.getLogger(__name__)

# Глобальный пул asyncpg
_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    """Инициализация пула подключений asyncpg."""
    global _pool
    if _pool is not None:
        return _pool

    logger.info(f"Создание asyncpg пула: {LOCAL_DB_DSN.split('@')[1] if '@' in LOCAL_DB_DSN else LOCAL_DB_DSN}")
    _pool = await asyncpg.create_pool(
        LOCAL_DB_DSN,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    await _init_schema()
    await ensure_partitions()
    logger.info("asyncpg пул и схема инициализированы")
    return _pool


async def close_pool():
    """Закрытие пула подключений."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("asyncpg пул закрыт")


def get_pool() -> asyncpg.Pool:
    """Получить текущий пул. Вызывать после init_pool()."""
    if _pool is None:
        raise RuntimeError("asyncpg пул не инициализирован. Вызовите init_pool() сначала.")
    return _pool


async def _init_schema():
    """Создание таблиц и индексов если не существуют."""
    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS statistics (
                id          bigserial,
                server_name text        NOT NULL,
                ts          timestamptz NOT NULL DEFAULT now(),
                datname     text        NOT NULL,
                numbackends integer,
                xact_commit bigint,
                db_size     bigint,
                disk_free   bigint,
                disk_total  bigint
            ) PARTITION BY RANGE (ts);
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS db_info (
                server_name   text        NOT NULL,
                datname       text        NOT NULL,
                oid           bigint      NOT NULL,
                creation_time timestamptz,
                first_seen    timestamptz NOT NULL DEFAULT now(),
                last_seen     timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY (server_name, datname)
            );
        """)

        # Индексы на партицированной таблице (создаются автоматически на партициях)
        await conn.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_stats_server_ts') THEN
                    CREATE INDEX idx_stats_server_ts ON statistics (server_name, ts DESC);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_stats_server_db_ts') THEN
                    CREATE INDEX idx_stats_server_db_ts ON statistics (server_name, datname, ts DESC);
                END IF;
            END $$;
        """)

        # Таблица аудита сессий
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_sessions (
                id          bigserial   PRIMARY KEY,
                timestamp   timestamptz NOT NULL DEFAULT now(),
                event_type  text        NOT NULL,
                username    text        NOT NULL,
                ip_address  text,
                user_agent  text,
                jti         text,
                details     text
            );
        """)
        await conn.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_timestamp') THEN
                    CREATE INDEX idx_audit_timestamp ON audit_sessions (timestamp DESC);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_username') THEN
                    CREATE INDEX idx_audit_username ON audit_sessions (username);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_audit_event_type') THEN
                    CREATE INDEX idx_audit_event_type ON audit_sessions (event_type);
                END IF;
            END $$;
        """)

        logger.info("Схема БД проверена/создана")


async def ensure_partitions():
    """Создать партиции на текущий + 2 следующих месяца."""
    now = datetime.now(timezone.utc)
    async with _pool.acquire() as conn:
        for offset in range(3):
            dt = now + timedelta(days=offset * 31)
            year = dt.year
            month = dt.month
            part_name = f"statistics_{year}_{month:02d}"

            # Начало и конец месяца
            start = datetime(year, month, 1, tzinfo=timezone.utc)
            if month == 12:
                end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
            else:
                end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

            exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM pg_class WHERE relname = $1)",
                part_name
            )
            if not exists:
                await conn.execute(f"""
                    CREATE TABLE {part_name} PARTITION OF statistics
                    FOR VALUES FROM ('{start.isoformat()}') TO ('{end.isoformat()}');
                """)
                logger.info(f"Создана партиция {part_name}")


async def cleanup_old_partitions():
    """Удалить партиции старше RETENTION_MONTHS."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_MONTHS * 31)
    cutoff_year = cutoff.year
    cutoff_month = cutoff.month

    async with _pool.acquire() as conn:
        # Находим все партиции statistics_YYYY_MM
        rows = await conn.fetch("""
            SELECT relname FROM pg_class
            WHERE relname ~ '^statistics_\\d{4}_\\d{2}$'
              AND relkind = 'r';
        """)
        for row in rows:
            name = row["relname"]
            try:
                parts = name.split("_")
                y, m = int(parts[1]), int(parts[2])
                if y < cutoff_year or (y == cutoff_year and m < cutoff_month):
                    await conn.execute(f"DROP TABLE IF EXISTS {name};")
                    logger.info(f"Удалена старая партиция {name}")
            except (IndexError, ValueError):
                continue


async def delete_server_data(server_name: str):
    """Удалить все данные сервера (при удалении сервера)."""
    async with _pool.acquire() as conn:
        await conn.execute("DELETE FROM statistics WHERE server_name = $1", server_name)
        await conn.execute("DELETE FROM db_info WHERE server_name = $1", server_name)
        logger.info(f"Данные сервера {server_name} удалены из локальной БД")


async def delete_database_data(server_name: str, datname: str):
    """Удалить данные конкретной БД (при удалении/пересоздании)."""
    async with _pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM statistics WHERE server_name = $1 AND datname = $2",
            server_name, datname
        )
        await conn.execute(
            "DELETE FROM db_info WHERE server_name = $1 AND datname = $2",
            server_name, datname
        )
        logger.info(f"Данные БД {datname} на {server_name} удалены")
