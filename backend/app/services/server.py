# app/services/server.py
import socket
import json
import logging
from typing import Any
from datetime import datetime, timezone
from app.models import Server
from app.config import SERVERS_FILE, SERVER_STATUS_CACHE_TTL
from app.utils import ensure_encrypted, ensure_decrypted, is_encrypted, fix_double_encryption
from app.database import db_pool
from app.services.cache import cache_manager
from app.services.ssh import get_ssh_disk_usage, is_host_reachable
import time

logger = logging.getLogger(__name__)

def load_servers() -> list[Server]:
    """Загрузка списка серверов"""
    try:
        if not SERVERS_FILE.exists() or SERVERS_FILE.stat().st_size == 0:
            logger.info("Файл servers.json пуст или отсутствует")
            return []
        
        with SERVERS_FILE.open("r") as f:
            data = json.load(f)
        
        servers = []
        for item in data:
            # Расшифровываем пароли
            item["password"] = ensure_decrypted(item["password"])
            item["ssh_password"] = ensure_decrypted(item["ssh_password"])
            
            # Исправляем двойное шифрование ssh_key_passphrase если есть
            if item.get("ssh_key_passphrase"):
                item["ssh_key_passphrase"] = fix_double_encryption(item["ssh_key_passphrase"])
            
            # Устанавливаем значение по умолчанию для ssh_auth_type
            if "ssh_auth_type" not in item:
                item["ssh_auth_type"] = "password"

            # Удаляем устаревшее поле stats_db (v2 → v3)
            item.pop("stats_db", None)

            servers.append(Server(**item))
        
        logger.debug(f"Загружено {len(servers)} серверов")
        return servers
    except Exception as e:
        logger.error(f"Ошибка загрузки серверов: {e}")
        raise

def save_servers(servers: list[Server]):
    """Сохранение списка серверов"""
    try:
        with SERVERS_FILE.open("w") as f:
            json.dump([{
                "name": s.name,
                "host": s.host,
                "user": s.user,
                "password": ensure_encrypted(s.password),
                "port": s.port,
                "ssh_user": s.ssh_user,
                "ssh_password": ensure_encrypted(s.ssh_password),
                "ssh_port": s.ssh_port,
                "ssh_auth_type": getattr(s, "ssh_auth_type", "password"),
                "ssh_key_id": getattr(s, "ssh_key_id", None),
                "ssh_key_passphrase": ensure_encrypted(getattr(s, "ssh_key_passphrase", None)) if getattr(s, "ssh_key_passphrase", None) else None
            } for s in servers], f, indent=2)
        logger.info(f"Сохранено {len(servers)} серверов")
    except Exception as e:
        logger.error(f"Ошибка сохранения серверов: {e}")
        raise

def connect_to_server(server: Server) -> dict[str, Any]:
    """Получение информации о сервере с кэшированием и таймаутами"""
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
    
    # Получаем информацию о ключе если используется
    ssh_key_info = None
    if getattr(server, "ssh_auth_type", "password") == "key" and getattr(server, "ssh_key_id", None):
        from app.services.ssh_key_storage import ssh_key_storage
        ssh_key = ssh_key_storage.get_key(server.ssh_key_id)
        if ssh_key:
            ssh_key_info = {
                "name": ssh_key.name,
                "fingerprint": ssh_key.fingerprint
            }
    
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
        "ssh_key_info": ssh_key_info,
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
