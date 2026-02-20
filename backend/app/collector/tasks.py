# app/collector/tasks.py
"""
Модуль сбора статистики с удалённых PostgreSQL серверов.
Собранные данные записываются в локальную БД pam_stats через asyncpg.

Все синхронные операции (psycopg2, paramiko) выполняются в thread executor,
чтобы не блокировать asyncio event loop.
"""
import asyncio
import re
import logging
from datetime import datetime, timezone

from app.models import Server
from app.database.pool import db_pool
from app.database.local_db import get_pool
from app.services.ssh import get_ssh_client

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  Вспомогательные синхронные функции (выполняются в executor)
# --------------------------------------------------------------------------- #

def _fetch_pg_stat_database(server: Server) -> list[dict]:
    """Получить pg_stat_database + data_directory с удалённого сервера (sync)."""
    rows = []
    with db_pool.get_connection(server) as conn:
        with conn.cursor() as cur:
            cur.execute("SHOW data_directory;")
            data_dir = cur.fetchone()[0]

            cur.execute("""
                SELECT s.datname, s.numbackends, s.xact_commit
                FROM pg_stat_database s
                JOIN pg_database d ON s.datid = d.oid
                WHERE NOT d.datistemplate AND d.datname != 'postgres'
                ORDER BY s.datname;
            """)
            for row in cur.fetchall():
                rows.append({
                    "datname": row[0],
                    "numbackends": row[1],
                    "xact_commit": row[2],
                    "data_dir": data_dir,
                })
    return rows


def _fetch_db_sizes(server: Server) -> list[dict]:
    """Получить размеры баз данных с удалённого сервера (sync).
    Запрашиваем размер каждой БД отдельно, чтобы не словить общий таймаут
    на серверах с большим количеством баз (80+).
    """
    sizes = []
    with db_pool.get_connection(server) as conn:
        with conn.cursor() as cur:
            # Сначала получаем список БД
            cur.execute("""
                SELECT datname FROM pg_database
                WHERE NOT datistemplate AND datname != 'postgres'
                ORDER BY datname;
            """)
            db_names = [row[0] for row in cur.fetchall()]

            # Запрашиваем размер каждой БД отдельно с таймаутом на каждый запрос
            for dbname in db_names:
                try:
                    cur.execute("SET statement_timeout = '600s'")
                    cur.execute("SELECT pg_database_size(%s)", (dbname,))
                    row = cur.fetchone()
                    if row:
                        sizes.append({"datname": dbname, "db_size": row[0]})
                except Exception as e:
                    logger.warning(f"Таймаут pg_database_size для {server.name}/{dbname}: {e}")
                    # Сброс состояния после ошибки
                    conn.rollback()
            cur.execute("SET statement_timeout = '5s'")
    return sizes


def _fetch_remote_databases(server: Server) -> list[dict]:
    """Получить список баз данных (datname, oid) с удалённого сервера (sync)."""
    databases = []
    with db_pool.get_connection(server) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT datname, oid
                FROM pg_database
                WHERE NOT datistemplate AND datname != 'postgres'
                ORDER BY datname;
            """)
            for row in cur.fetchall():
                databases.append({"datname": row[0], "oid": int(row[1])})
    return databases


def _ssh_df(server: Server, data_dir: str) -> tuple[int | None, int | None]:
    """Выполнить df -B1 через SSH и вернуть (disk_free, disk_total)."""
    # Определяем точку монтирования и валидируем
    mount_point = data_dir.split("/DB")[0] if "/DB" in data_dir else data_dir
    if not mount_point or not mount_point.startswith("/") or ".." in mount_point:
        logger.warning(f"Невалидный mount_point для {server.name}: {mount_point}")
        return None, None
    if not re.match(r"^[a-zA-Z0-9/_.-]+$", mount_point):
        logger.warning(f"Подозрительный mount_point для {server.name}: {mount_point}")
        return None, None

    ssh = None
    try:
        ssh = get_ssh_client(server)
        cmd = f"df -B1 {mount_point}"
        _stdin, stdout, stderr = ssh.exec_command(cmd, timeout=10)
        output = stdout.read().decode().strip().splitlines()
        err = stderr.read().decode().strip()

        if err:
            logger.warning(f"df stderr для {server.name}: {err}")
            return None, None

        if len(output) > 1:
            cols = output[1].split()
            if len(cols) >= 4:
                total = int(cols[1])
                free = int(cols[3])
                return free, total

        logger.warning(f"Неожиданный вывод df для {server.name}: {output}")
        return None, None
    except Exception as e:
        logger.error(f"SSH df ошибка для {server.name}: {e}")
        return None, None
    finally:
        if ssh:
            ssh.close()


def _pg_stat_file_via_sql(server: Server, oid: int) -> datetime | None:
    """Получить время создания БД через pg_stat_file по SQL-соединению."""
    try:
        with db_pool.get_connection(server) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT (pg_stat_file('base/' || %s || '/PG_VERSION')).modification",
                    (str(oid),)
                )
                row = cur.fetchone()
                if row and row[0]:
                    return row[0]
        return None
    except Exception as e:
        logger.warning(f"pg_stat_file SQL ошибка для {server.name} OID {oid}: {e}")
        return None


# --------------------------------------------------------------------------- #
#  Публичные async-функции
# --------------------------------------------------------------------------- #

async def _get_disk_usage_ssh(server: Server, data_dir: str) -> tuple[int | None, int | None]:
    """Получить disk_free/disk_total через SSH df -B1 (async-обёртка)."""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _ssh_df, server, data_dir)
    except Exception as e:
        logger.error(f"Ошибка получения disk usage для {server.name}: {e}")
        return None, None


async def _get_db_creation_time(server: Server, oid: int) -> datetime | None:
    """Получить время создания БД через pg_stat_file (async-обёртка)."""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _pg_stat_file_via_sql, server, oid)
    except Exception as e:
        logger.error(f"Ошибка получения creation_time для {server.name} OID {oid}: {e}")
        return None


async def collect_server_stats(server: Server) -> dict:
    """
    Собрать статистику pg_stat_database и информацию о диске с одного сервера.
    Записать результаты в локальную таблицу statistics.

    Возвращает dict с итогами: inserted, errors, server_name.
    """
    result = {"server_name": server.name, "inserted": 0, "errors": []}
    loop = asyncio.get_event_loop()

    try:
        # 1. Получаем pg_stat_database с удалённого сервера (sync -> executor)
        rows = await loop.run_in_executor(None, _fetch_pg_stat_database, server)
        if not rows:
            result["errors"].append("Нет баз данных в pg_stat_database")
            return result

        # 2. Получаем disk usage через SSH
        data_dir = rows[0]["data_dir"]
        disk_free, disk_total = await _get_disk_usage_ssh(server, data_dir)

        # 3. Вставляем в локальную БД через asyncpg
        pool = get_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            for row in rows:
                try:
                    await conn.execute(
                        """
                        INSERT INTO statistics
                            (server_name, ts, datname, numbackends, xact_commit, disk_free, disk_total)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        """,
                        server.name,
                        now,
                        row["datname"],
                        row["numbackends"],
                        row["xact_commit"],
                        disk_free,
                        disk_total,
                    )
                    result["inserted"] += 1
                except Exception as e:
                    result["errors"].append(f"{row['datname']}: {e}")
                    logger.error(
                        f"Ошибка INSERT statistics для {server.name}/{row['datname']}: {e}"
                    )

        logger.info(
            f"[collect] {server.name}: вставлено {result['inserted']} строк, "
            f"disk_free={disk_free}, disk_total={disk_total}"
        )
    except Exception as e:
        msg = f"Ошибка сбора статистики с {server.name}: {e}"
        result["errors"].append(msg)
        logger.error(msg)

    return result


async def collect_server_sizes(server: Server) -> dict:
    """
    Собрать размеры баз данных с одного сервера.
    Обновляет поле db_size в последней записи statistics для каждой БД
    или сохраняет для вставки при следующем сборе.

    Возвращает dict с итогами: updated, errors, server_name.
    """
    result = {"server_name": server.name, "updated": 0, "errors": []}
    loop = asyncio.get_event_loop()

    try:
        # 1. Получаем размеры с удалённого сервера
        sizes = await loop.run_in_executor(None, _fetch_db_sizes, server)
        if not sizes:
            result["errors"].append("Нет баз данных для получения размеров")
            return result

        # 2. Обновляем последние записи в statistics
        pool = get_pool()
        async with pool.acquire() as conn:
            for entry in sizes:
                try:
                    # Обновляем ВСЕ записи с NULL db_size для данной БД
                    tag = await conn.execute(
                        """
                        UPDATE statistics
                        SET db_size = $1
                        WHERE server_name = $2 AND datname = $3 AND db_size IS NULL
                        """,
                        entry["db_size"],
                        server.name,
                        entry["datname"],
                    )
                    # asyncpg возвращает строку вида "UPDATE N"
                    updated_count = int(tag.split()[-1])
                    result["updated"] += updated_count
                except Exception as e:
                    result["errors"].append(f"{entry['datname']}: {e}")
                    logger.error(
                        f"Ошибка UPDATE db_size для {server.name}/{entry['datname']}: {e}"
                    )

        logger.info(f"[sizes] {server.name}: обновлено {result['updated']} записей")
    except Exception as e:
        msg = f"Ошибка сбора размеров с {server.name}: {e}"
        result["errors"].append(msg)
        logger.error(msg)

    return result


async def sync_server_db_info(server: Server) -> dict:
    """
    Синхронизация таблицы db_info для одного сервера.
    Обнаруживает новые, удалённые и пересозданные (изменённый OID) базы данных.

    Возвращает dict с итогами: added, deleted, recreated, errors, server_name.
    """
    result = {
        "server_name": server.name,
        "added": 0,
        "deleted": 0,
        "recreated": 0,
        "errors": [],
    }
    loop = asyncio.get_event_loop()

    try:
        # 1. Получаем текущий список БД с удалённого сервера
        remote_dbs = await loop.run_in_executor(None, _fetch_remote_databases, server)
        remote_map = {db["datname"]: db["oid"] for db in remote_dbs}

        # 2. Получаем текущее состояние из локальной db_info
        pool = get_pool()
        async with pool.acquire() as conn:
            local_rows = await conn.fetch(
                "SELECT datname, oid FROM db_info WHERE server_name = $1",
                server.name,
            )
        local_map = {row["datname"]: row["oid"] for row in local_rows}

        local_names = set(local_map.keys())
        remote_names = set(remote_map.keys())

        new_dbs = remote_names - local_names
        deleted_dbs = local_names - remote_names
        common_dbs = local_names & remote_names

        # 3. Обработка пересозданных БД (OID изменился)
        recreated_dbs = set()
        for dbname in common_dbs:
            if remote_map[dbname] != local_map[dbname]:
                recreated_dbs.add(dbname)

        # 4. Обновляем last_seen для всех существующих
        if common_dbs - recreated_dbs:
            pool = get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE db_info
                    SET last_seen = now()
                    WHERE server_name = $1 AND datname = ANY($2::text[])
                    """,
                    server.name,
                    list(common_dbs - recreated_dbs),
                )

        # 4b. Backfill: заполняем creation_time для записей где он NULL
        pool = get_pool()
        async with pool.acquire() as conn:
            null_rows = await conn.fetch(
                "SELECT datname, oid FROM db_info WHERE server_name = $1 AND creation_time IS NULL",
                server.name,
            )
        for nr in null_rows:
            try:
                ct = await _get_db_creation_time(server, nr["oid"])
                if ct:
                    pool = get_pool()
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE db_info SET creation_time = $1 WHERE server_name = $2 AND datname = $3",
                            ct, server.name, nr["datname"],
                        )
            except Exception:
                pass

        # 5. Обработка новых БД
        for dbname in new_dbs:
            try:
                oid = remote_map[dbname]
                creation_time = await _get_db_creation_time(server, oid)

                pool = get_pool()
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO db_info (server_name, datname, oid, creation_time, first_seen, last_seen)
                        VALUES ($1, $2, $3, $4, now(), now())
                        """,
                        server.name,
                        dbname,
                        oid,
                        creation_time,
                    )
                result["added"] += 1
                logger.info(f"[db_info] {server.name}: новая БД '{dbname}' (OID {oid})")
            except Exception as e:
                result["errors"].append(f"add {dbname}: {e}")
                logger.error(f"Ошибка добавления db_info для {server.name}/{dbname}: {e}")

        # 6. Обработка пересозданных БД
        for dbname in recreated_dbs:
            try:
                new_oid = remote_map[dbname]
                creation_time = await _get_db_creation_time(server, new_oid)

                pool = get_pool()
                async with pool.acquire() as conn:
                    # Удаляем старую статистику
                    await conn.execute(
                        "DELETE FROM statistics WHERE server_name = $1 AND datname = $2",
                        server.name,
                        dbname,
                    )
                    # Обновляем db_info с новым OID
                    await conn.execute(
                        """
                        UPDATE db_info
                        SET oid = $1, creation_time = $2, first_seen = now(), last_seen = now()
                        WHERE server_name = $3 AND datname = $4
                        """,
                        new_oid,
                        creation_time,
                        server.name,
                        dbname,
                    )
                result["recreated"] += 1
                logger.info(
                    f"[db_info] {server.name}: БД '{dbname}' пересоздана "
                    f"(OID {local_map[dbname]} -> {new_oid})"
                )
            except Exception as e:
                result["errors"].append(f"recreate {dbname}: {e}")
                logger.error(
                    f"Ошибка обновления db_info для пересозданной {server.name}/{dbname}: {e}"
                )

        # 7. Обработка удалённых БД
        for dbname in deleted_dbs:
            try:
                pool = get_pool()
                async with pool.acquire() as conn:
                    await conn.execute(
                        "DELETE FROM statistics WHERE server_name = $1 AND datname = $2",
                        server.name,
                        dbname,
                    )
                    await conn.execute(
                        "DELETE FROM db_info WHERE server_name = $1 AND datname = $2",
                        server.name,
                        dbname,
                    )
                result["deleted"] += 1
                logger.info(f"[db_info] {server.name}: БД '{dbname}' удалена")
            except Exception as e:
                result["errors"].append(f"delete {dbname}: {e}")
                logger.error(
                    f"Ошибка удаления db_info для {server.name}/{dbname}: {e}"
                )

        logger.info(
            f"[db_info] {server.name}: +{result['added']} новых, "
            f"-{result['deleted']} удалённых, ~{result['recreated']} пересозданных"
        )
    except Exception as e:
        msg = f"Ошибка синхронизации db_info для {server.name}: {e}"
        result["errors"].append(msg)
        logger.error(msg)

    return result
