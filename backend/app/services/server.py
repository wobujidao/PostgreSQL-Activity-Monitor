# app/services/server.py
import socket
import json
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone
from app.models import Server
from app.config import SERVERS_FILE, SERVER_STATUS_CACHE_TTL
from app.utils import encrypt_password, decrypt_password
from app.database import db_pool
from app.services.cache import cache_manager
from app.services.ssh import get_ssh_disk_usage, is_host_reachable

logger = logging.getLogger(__name__)

def load_servers() -> List[Server]:
    """Загрузка списка серверов"""
    try:
        if not SERVERS_FILE.exists() or SERVERS_FILE.stat().st_size == 0:
            logger.info("Файл servers.json пуст или отсутствует")
            return []
        
        with SERVERS_FILE.open("r") as f:
            data = json.load(f)
        
        servers = []
        for item in data:
            item["password"] = decrypt_password(item["password"])
            item["ssh_password"] = decrypt_password(item["ssh_password"])
            servers.append(Server(**item))
        
        logger.debug(f"Загружено {len(servers)} серверов")
        return servers
    except Exception as e:
        logger.error(f"Ошибка загрузки серверов: {e}")
        raise

def save_servers(servers: List[Server]):
    """Сохранение списка серверов"""
    try:
        with SERVERS_FILE.open("w") as f:
            json.dump([{
                "name": s.name,
                "host": s.host,
                "stats_db": s.stats_db,
                "user": s.user,
                "password": encrypt_password(s.password),
                "port": s.port,
                "ssh_user": s.ssh_user,
                "ssh_password": encrypt_password(s.ssh_password),
                "ssh_port": s.ssh_port
            } for s in servers], f, indent=2)
        logger.info(f"Сохранено {len(servers)} серверов")
    except Exception as e:
        logger.error(f"Ошибка сохранения серверов: {e}")
        raise

def connect_to_server(server: Server) -> Dict[str, Any]:
    """Получение информации о сервере с кэшированием"""
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
        "version": None,
        "free_space": None,
        "total_space": None,
        "connections": None,
        "uptime_hours": None,
        "stats_db": server.stats_db,
        "status": "pending",
        "data_dir": None
    }
    
    # Проверка PostgreSQL
    if not is_host_reachable(server.host, server.port):
        logger.warning(f"PostgreSQL недоступен для {server.name}")
        result["status"] = "PostgreSQL: host unreachable"
    else:
        try:
            with db_pool.get_connection(server) as conn:
                with conn.cursor() as cur:
                    cur.execute("SHOW server_version;")
                    result["version"] = cur.fetchone()[0]
                    
                    cur.execute("SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;")
                    result["connections"] = dict(cur.fetchall())
                    
                    cur.execute("SELECT pg_postmaster_start_time();")
                    start_time = cur.fetchone()[0]
                    now_utc = datetime.now(timezone.utc)
                    result["uptime_hours"] = round((now_utc - start_time).total_seconds() / 3600, 2)
                    
                    cur.execute("SHOW data_directory;")
                    result["data_dir"] = cur.fetchone()[0]
            
            result["status"] = "ok"
            logger.info(f"Сервер {server.name} доступен")
            
        except socket.timeout:
            result["status"] = "PostgreSQL: timeout"
            logger.error(f"PostgreSQL таймаут для {server.name}")
        except Exception as e:
            result["status"] = f"PostgreSQL: {str(e)}"
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
