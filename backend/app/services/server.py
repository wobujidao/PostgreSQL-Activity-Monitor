# app/services/server.py
import socket
import logging
from typing import Any
from datetime import datetime, timezone
from app.models import Server
from app.config import SERVER_STATUS_CACHE_TTL
from app.database import db_pool
from app.services.cache import cache_manager
from app.services.ssh import get_ssh_disk_usage, is_host_reachable
from app.database.repositories import server_repo
import time

logger = logging.getLogger(__name__)


async def load_servers() -> list[Server]:
    """Загрузка списка серверов из БД."""
    rows = await server_repo.list_servers()
    servers = []
    for r in rows:
        # Убираем поля, которых нет в модели Server
        r.pop("created_at", None)
        r.pop("updated_at", None)
        servers.append(Server(**r))
    logger.debug(f"Загружено {len(servers)} серверов")
    return servers


async def save_server(server: Server) -> dict:
    """Создать новый сервер в БД."""
    return await server_repo.create_server(
        name=server.name,
        host=server.host,
        port=server.port,
        user=server.user,
        password=server.password,
        ssh_user=server.ssh_user,
        ssh_password=server.ssh_password,
        ssh_port=server.ssh_port,
        ssh_auth_type=getattr(server, "ssh_auth_type", "password"),
        ssh_key_id=getattr(server, "ssh_key_id", None),
        ssh_key_passphrase=getattr(server, "ssh_key_passphrase", None),
    )


async def update_server_config(name: str, server: Server) -> dict | None:
    """Обновить сервер в БД."""
    return await server_repo.update_server(
        name,
        host=server.host,
        port=server.port,
        user=server.user,
        password=server.password,
        ssh_user=server.ssh_user,
        ssh_password=server.ssh_password,
        ssh_port=server.ssh_port,
        ssh_auth_type=getattr(server, "ssh_auth_type", "password"),
        ssh_key_id=getattr(server, "ssh_key_id", None),
        ssh_key_passphrase=getattr(server, "ssh_key_passphrase", None),
    )


async def delete_server_config(name: str) -> bool:
    """Удалить сервер из БД."""
    return await server_repo.delete_server(name)


def connect_to_server(server: Server) -> dict[str, Any]:
    """Получение информации о сервере с кэшированием и таймаутами (SYNC)."""
    cache_key = f"{server.host}:{server.port}"

    # Проверяем кэш статуса сервера
    cache_manager.clear_cache(
        cache_manager.server_status_cache,
        cache_manager.server_status_cache_lock,
        SERVER_STATUS_CACHE_TTL
    )

    cached = cache_manager.get_server_cache(cache_key)
    if cached:
        logger.debug(f"Использование кэша статуса для {server.name}")
        # Обновляем только SSH данные если есть data_dir
        if cached.get("data_dir"):
            free_space, total_space, ssh_status = get_ssh_disk_usage(server, cached["data_dir"])
            cached["free_space"] = free_space
            cached["total_space"] = total_space
            if ssh_status != "ok" and ssh_status != "cached":
                cached["status"] = f"{cached['status']} (SSH: {ssh_status})"
        return cached

    # Базовая информация
    result = {
        "name": server.name,
        "host": server.host,
        "user": server.user,
        "port": server.port,
        "ssh_user": server.ssh_user,
        "ssh_port": server.ssh_port,
        "has_password": bool(server.password),
        "has_ssh_password": bool(server.ssh_password),
        "ssh_auth_type": getattr(server, "ssh_auth_type", "password"),
        "ssh_key_id": getattr(server, "ssh_key_id", None),
        "version": None,
        "free_space": None,
        "total_space": None,
        "connections": None,
        "uptime_hours": None,
        "status": "pending",
        "data_dir": None
    }

    # Проверка PostgreSQL с таймаутом
    if not is_host_reachable(server.host, server.port):
        logger.warning(f"PostgreSQL недоступен для {server.name}")
        result["status"] = "PostgreSQL: host unreachable"
    else:
        start_time = time.time()
        try:
            with db_pool.get_connection(server) as conn:
                with conn.cursor() as cur:
                    cur.execute("SET statement_timeout = 5000;")  # 5 секунд

                    cur.execute("SHOW server_version;")
                    result["version"] = cur.fetchone()[0]

                    cur.execute("SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;")
                    result["connections"] = dict(cur.fetchall())

                    cur.execute("SELECT pg_postmaster_start_time();")
                    start_time_pg = cur.fetchone()[0]
                    now_utc = datetime.now(timezone.utc)
                    result["uptime_hours"] = round((now_utc - start_time_pg).total_seconds() / 3600, 2)

                    cur.execute("SHOW data_directory;")
                    result["data_dir"] = cur.fetchone()[0]

            result["status"] = "ok"
            logger.info(f"Сервер {server.name} доступен (время: {time.time() - start_time:.2f}с)")

        except socket.timeout:
            result["status"] = "PostgreSQL: socket timeout"
            logger.error(f"PostgreSQL socket таймаут для {server.name}")
        except Exception as e:
            error_msg = str(e)
            if "timeout" in error_msg.lower():
                result["status"] = "PostgreSQL: operation timeout"
            else:
                result["status"] = f"PostgreSQL: {error_msg[:50]}"
            logger.error(f"PostgreSQL ошибка для {server.name}: {e}")

    # Получение SSH данных если есть data_dir
    if result["data_dir"] and result["status"] == "ok":
        free_space, total_space, ssh_status = get_ssh_disk_usage(server, result["data_dir"])
        result["free_space"] = free_space
        result["total_space"] = total_space
        if ssh_status != "ok" and ssh_status != "cached":
            result["status"] = f"ok (SSH: {ssh_status})"

    # Сохраняем в кэш только успешные результаты
    if result["status"] == "ok" or result["status"].startswith("ok (SSH:"):
        cache_manager.set_server_cache(cache_key, result)

    return result
