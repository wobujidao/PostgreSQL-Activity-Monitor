# app/services/cache.py
import time
import threading
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class CacheManager:
    def __init__(self):
        self.ssh_cache: Dict[str, Any] = {}
        self.ssh_cache_lock = threading.Lock()
        self.server_status_cache: Dict[str, Any] = {}
        self.server_status_cache_lock = threading.Lock()
    
    def clear_cache(self, cache: dict, lock: threading.Lock, ttl: int):
        """Универсальная функция очистки кэша"""
        current_time = time.time()
        with lock:
            expired = [key for key, value in cache.items() 
                      if current_time - value["timestamp"] > ttl]
            for key in expired:
                logger.debug(f"Удаление устаревшей записи из кэша: {key}")
                del cache[key]
    
    def get_ssh_cache(self, key: str) -> Optional[dict]:
        """Получить данные из SSH кэша"""
        with self.ssh_cache_lock:
            if key in self.ssh_cache:
                return self.ssh_cache[key].copy()
        return None
    
    def set_ssh_cache(self, key: str, data: dict):
        """Сохранить данные в SSH кэш"""
        with self.ssh_cache_lock:
            self.ssh_cache[key] = {
                **data,
                "timestamp": time.time()
            }
    
    def get_server_cache(self, key: str) -> Optional[dict]:
        """Получить данные из кэша серверов"""
        with self.server_status_cache_lock:
            if key in self.server_status_cache:
                return self.server_status_cache[key].copy()
        return None
    
    def set_server_cache(self, key: str, data: dict):
        """Сохранить данные в кэш серверов"""
        with self.server_status_cache_lock:
            self.server_status_cache[key] = {
                **data,
                "timestamp": time.time()
            }
    
    def invalidate_server_cache(self, key: str):
        """Инвалидировать кэш сервера"""
        with self.server_status_cache_lock:
            if key in self.server_status_cache:
                del self.server_status_cache[key]

# Глобальный менеджер кэша
cache_manager = CacheManager()
