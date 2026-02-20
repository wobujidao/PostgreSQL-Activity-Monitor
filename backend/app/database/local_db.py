# app/database/local_db.py
"""
Модуль для работы с локальной БД pam_stats через asyncpg.
Хранит историческую статистику, собранную коллектором.
"""
import asyncio
import asyncpg
import logging
from datetime import datetime, timedelta, timezone
from app.config import LOCAL_DB_DSN, RETENTION_MONTHS

logger = logging.getLogger(__name__)

# Глобальный пул asyncpg
_pool: asyncpg.Pool | None = None
# Ссылка на main event loop (для вызова async из sync-потоков)
_main_loop: asyncio.AbstractEventLoop | None = None


def get_main_loop() -> asyncio.AbstractEventLoop:
    """Получить main event loop (для вызова async из sync-потоков)."""
    if _main_loop is None:
        raise RuntimeError("Main loop не инициализирован. Вызовите init_pool() сначала.")
    return _main_loop


async def init_pool() -> asyncpg.Pool:
    """Инициализация пула подключений asyncpg."""
    global _pool, _main_loop
    if _pool is not None:
        return _pool

    _main_loop = asyncio.get_running_loop()

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

        # Расширение pgcrypto для шифрования
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

        # Таблица пользователей
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                login         TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                role          TEXT NOT NULL DEFAULT 'viewer',
                email         TEXT,
                is_active     BOOLEAN NOT NULL DEFAULT true,
                created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at    TIMESTAMPTZ,
                last_login    TIMESTAMPTZ
            );
        """)

        # Таблица SSH-ключей (до servers из-за FK)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS ssh_keys (
                id              TEXT PRIMARY KEY,
                name            TEXT UNIQUE NOT NULL,
                fingerprint     TEXT UNIQUE NOT NULL,
                key_type        TEXT NOT NULL,
                public_key      TEXT NOT NULL,
                private_key_enc TEXT NOT NULL,
                created_by      TEXT NOT NULL,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                has_passphrase  BOOLEAN NOT NULL DEFAULT false,
                description     TEXT
            );
        """)

        # Таблица серверов
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS servers (
                name                   TEXT PRIMARY KEY,
                host                   TEXT NOT NULL,
                port                   INTEGER NOT NULL DEFAULT 5432,
                pg_user                TEXT NOT NULL,
                password_enc           TEXT,
                ssh_user               TEXT NOT NULL,
                ssh_password_enc       TEXT,
                ssh_port               INTEGER NOT NULL DEFAULT 22,
                ssh_auth_type          TEXT NOT NULL DEFAULT 'password',
                ssh_key_id             TEXT REFERENCES ssh_keys(id),
                ssh_key_passphrase_enc TEXT,
                created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at             TIMESTAMPTZ
            );
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

        # Таблица настроек
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                value_type  TEXT NOT NULL DEFAULT 'int',
                description TEXT,
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)
        await conn.execute("""
            INSERT INTO settings (key, value, value_type, description) VALUES
                ('collect_interval', '600', 'int', 'Интервал сбора статистики (сек)'),
                ('size_update_interval', '1800', 'int', 'Интервал обновления размеров БД (сек)'),
                ('db_check_interval', '1800', 'int', 'Интервал проверки новых/удалённых БД (сек)'),
                ('retention_months', '12', 'int', 'Срок хранения данных (месяцев)'),
                ('audit_retention_days', '90', 'int', 'Срок хранения аудита (дней)')
            ON CONFLICT (key) DO NOTHING;
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
