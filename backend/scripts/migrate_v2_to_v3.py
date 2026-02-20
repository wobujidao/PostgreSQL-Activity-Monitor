#!/usr/bin/env python3
"""
Миграция данных из v2 (удалённые stats_db) в v3 (локальная pam_stats).

Для каждого сервера подключается к удалённой stats_db,
читает pg_statistics и db_creation, пишет в локальную pam_stats.

Использование:
    cd /home/pgmonitor/pg_activity_monitor/backend
    source venv/bin/activate
    python scripts/migrate_v2_to_v3.py [--dry-run] [--server SERVER_NAME]
"""
import sys
import os
import argparse
import asyncio
import logging
from datetime import datetime, timezone

# Добавляем путь к backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import psycopg2
import asyncpg

from app.config import LOCAL_DB_DSN
from app.services.server import load_servers
from app.database.pool import db_pool

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


def fetch_remote_stats(server, stats_db_name: str) -> tuple[list, list]:
    """Получить все данные из удалённой stats_db."""
    stats_rows = []
    db_creation_rows = []

    try:
        with db_pool.get_connection(server, stats_db_name) as conn:
            with conn.cursor() as cur:
                # pg_statistics
                cur.execute("""
                    SELECT ts, datname, numbackends, xact_commit, db_size, disk_free_space
                    FROM pg_statistics
                    ORDER BY ts;
                """)
                stats_rows = cur.fetchall()
                logger.info(f"  pg_statistics: {len(stats_rows)} записей")

                # db_creation
                cur.execute("SELECT datname, creation_time, oid FROM db_creation;")
                db_creation_rows = cur.fetchall()
                logger.info(f"  db_creation: {len(db_creation_rows)} записей")

    except Exception as e:
        logger.error(f"  Ошибка чтения stats_db: {e}")

    return stats_rows, db_creation_rows


async def write_to_local(
    pool: asyncpg.Pool,
    server_name: str,
    stats_rows: list,
    db_creation_rows: list,
    dry_run: bool = False
):
    """Записать данные в локальную pam_stats."""
    if dry_run:
        logger.info(f"  [DRY-RUN] Пропуск записи {len(stats_rows)} stats + {len(db_creation_rows)} db_info")
        return

    async with pool.acquire() as conn:
        # Записываем statistics батчами
        inserted = 0
        for i in range(0, len(stats_rows), BATCH_SIZE):
            batch = stats_rows[i:i + BATCH_SIZE]
            # Формируем данные для copy
            records = [
                (server_name, row[0], row[1], row[2], row[3], row[4], row[5], None)
                for row in batch
            ]
            await conn.executemany("""
                INSERT INTO statistics (server_name, ts, datname, numbackends, xact_commit, db_size, disk_free, disk_total)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT DO NOTHING;
            """, records)
            inserted += len(batch)

        logger.info(f"  statistics: вставлено {inserted} записей")

        # Записываем db_info
        for row in db_creation_rows:
            datname, creation_time, oid = row
            await conn.execute("""
                INSERT INTO db_info (server_name, datname, oid, creation_time, first_seen, last_seen)
                VALUES ($1, $2, $3, $4, $5, $5)
                ON CONFLICT (server_name, datname)
                DO UPDATE SET oid = $3, creation_time = $4, last_seen = $5;
            """, server_name, datname, int(oid), creation_time, datetime.now(timezone.utc))

        logger.info(f"  db_info: вставлено {len(db_creation_rows)} записей")


async def migrate(args):
    """Основная логика миграции."""
    logger.info("=" * 60)
    logger.info("Миграция v2 → v3")
    logger.info(f"Источник: удалённые stats_db")
    logger.info(f"Цель: {LOCAL_DB_DSN.split('@')[1] if '@' in LOCAL_DB_DSN else LOCAL_DB_DSN}")
    if args.dry_run:
        logger.info("[DRY-RUN режим — данные не будут записаны]")
    logger.info("=" * 60)

    # Подключаемся к локальной БД
    pool = await asyncpg.create_pool(LOCAL_DB_DSN, min_size=1, max_size=5)

    # Убедимся что партиции существуют
    from app.database.local_db import _pool as _lp
    # Временно устанавливаем пул для init
    import app.database.local_db as local_db_mod
    local_db_mod._pool = pool
    await local_db_mod._init_schema()
    await local_db_mod.ensure_partitions()

    # Создаём партиции для старых данных (до 12 месяцев назад)
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        for months_back in range(1, 13):
            dt = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
            # Отматываем на months_back месяцев
            for _ in range(months_back):
                if dt.month == 1:
                    dt = datetime(dt.year - 1, 12, 1, tzinfo=timezone.utc)
                else:
                    dt = datetime(dt.year, dt.month - 1, 1, tzinfo=timezone.utc)

            part_name = f"statistics_{dt.year}_{dt.month:02d}"
            year, month = dt.year, dt.month
            start = datetime(year, month, 1, tzinfo=timezone.utc)
            if month == 12:
                end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
            else:
                end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

            exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM pg_class WHERE relname = $1)", part_name
            )
            if not exists:
                await conn.execute(f"""
                    CREATE TABLE {part_name} PARTITION OF statistics
                    FOR VALUES FROM ('{start.isoformat()}') TO ('{end.isoformat()}');
                """)
                logger.info(f"Создана партиция {part_name}")

    # Загружаем серверы
    servers = load_servers()
    if args.server:
        servers = [s for s in servers if s.name == args.server]
        if not servers:
            logger.error(f"Сервер '{args.server}' не найден")
            await pool.close()
            return

    total_stats = 0
    total_db_info = 0
    errors = 0

    for server in servers:
        logger.info(f"\n--- Сервер: {server.name} ({server.host}:{server.port}) ---")
        stats_db_name = "stats_db"

        try:
            stats_rows, db_creation_rows = fetch_remote_stats(server, stats_db_name)
            if stats_rows or db_creation_rows:
                await write_to_local(pool, server.name, stats_rows, db_creation_rows, args.dry_run)
                total_stats += len(stats_rows)
                total_db_info += len(db_creation_rows)
            else:
                logger.warning(f"  Нет данных для миграции")
        except Exception as e:
            logger.error(f"  Ошибка миграции: {e}")
            errors += 1

    await pool.close()

    logger.info("\n" + "=" * 60)
    logger.info("Результат миграции:")
    logger.info(f"  Серверов обработано: {len(servers)}")
    logger.info(f"  statistics записей: {total_stats}")
    logger.info(f"  db_info записей: {total_db_info}")
    logger.info(f"  Ошибок: {errors}")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Миграция данных v2 → v3")
    parser.add_argument("--dry-run", action="store_true", help="Только чтение, без записи")
    parser.add_argument("--server", type=str, help="Мигрировать только один сервер")
    args = parser.parse_args()

    asyncio.run(migrate(args))


if __name__ == "__main__":
    main()
