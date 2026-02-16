# -*- coding: utf-8 -*-
# app/services/cache.py
import time
import threading
import logging

logger = logging.getLogger(__name__)

MAX_CACHE_SIZE = 500  # Максимальное количество записей в каждом кэше


class CacheManager:
    def __init__(self):
        self.ssh_cache = {}
        self.ssh_cache_lock = threading.Lock()
        self.server_status_cache = {}
        self.server_status_cache_lock = threading.Lock()
    
    def clear_cache(self, cache, lock, ttl):
        """Universal cache cleanup function with size limit"""
        current_time = time.time()
        with lock:
            expired = [key for key, value in cache.items()
                      if current_time - value["timestamp"] > ttl]
            for key in expired:
                logger.debug(f"Removing expired cache entry: {key}")
                del cache[key]
            # Ограничиваем размер кэша — удаляем самые старые записи
            if len(cache) > MAX_CACHE_SIZE:
                sorted_keys = sorted(cache, key=lambda k: cache[k]["timestamp"])
                for key in sorted_keys[:len(cache) - MAX_CACHE_SIZE]:
                    del cache[key]
    
    def get_ssh_cache(self, key):
        """Get data from SSH cache"""
        with self.ssh_cache_lock:
            if key in self.ssh_cache:
                return self.ssh_cache[key].copy()
        return None
    
    def set_ssh_cache(self, key, data):
        """Save data to SSH cache"""
        with self.ssh_cache_lock:
            cache_data = {}
            cache_data.update(data)
            cache_data["timestamp"] = time.time()
            self.ssh_cache[key] = cache_data
    
    def get_server_cache(self, key):
        """Get data from server cache"""
        with self.server_status_cache_lock:
            if key in self.server_status_cache:
                return self.server_status_cache[key].copy()
        return None
    
    def set_server_cache(self, key, data):
        """Save data to server cache"""
        with self.server_status_cache_lock:
            cache_data = {}
            cache_data.update(data)
            cache_data["timestamp"] = time.time()
            self.server_status_cache[key] = cache_data
    
    def invalidate_server_cache(self, key):
        """Invalidate server cache"""
        with self.server_status_cache_lock:
            if key in self.server_status_cache:
                del self.server_status_cache[key]

# Global cache manager
cache_manager = CacheManager()
