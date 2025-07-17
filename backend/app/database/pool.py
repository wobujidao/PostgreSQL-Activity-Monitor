# app/database/pool.py
import psycopg2
from psycopg2 import pool
import threading
import logging
from contextlib import contextmanager
from typing import Dict, Optional
from app.models import Server
from app.config import POOL_CONFIGS

logger = logging.getLogger(__name__)

class DatabasePool:
    def __init__(self):
        self.pools: Dict[str, psycopg2.pool.ThreadedConnectionPool] = {}
        self.lock = threading.Lock()
        
    def get_pool_key(self, server: Server, db_name: str = None) -> str:
        """Генерация уникального ключа для пула"""
        database = db_name or server.stats_db or "postgres"
        return f"{server.host}:{server.port}:{server.user}:{database}"
    
    def get_pool_config(self, server: Server) -> dict:
        """Получить конфигурацию пула для сервера"""
        if server.stats_db:
            return POOL_CONFIGS["stats_db"]
        return POOL_CONFIGS["default"]
    
    def get_pool(self, server: Server, db_name: str = None) -> psycopg2.pool.ThreadedConnectionPool:
        """Получить или создать пул для сервера"""
        pool_key = self.get_pool_key(server, db_name)
        
        with self.lock:
            if pool_key not in self.pools:
                config = self.get_pool_config(server)
                database = db_name or server.stats_db or "postgres"
                
                logger.info(f"Создание пула подключений для {server.name} ({database})")
                try:
                    self.pools[pool_key] = psycopg2.pool.ThreadedConnectionPool(
                        config["minconn"],
                        config["maxconn"],
                        host=server.host,
                        database=database,
                        user=server.user,
                        password=server.password,
                        port=server.port,
                        connect_timeout=5,
                        options='-c statement_timeout=5000 -c tcp_user_timeout=5000',
                        keepalives=1,
                        keepalives_idle=30,
                        keepalives_interval=5,
                        keepalives_count=5
                    )
                except Exception as e:
                    logger.error(f"Ошибка создания пула для {server.name}: {e}")
                    raise
                    
            return self.pools[pool_key]
    
    @contextmanager
    def get_connection(self, server: Server, db_name: str = None):
        """Контекстный менеджер для безопасной работы с подключением"""
        pool = self.get_pool(server, db_name)
        conn = None
        try:
            conn = pool.getconn()
            
            # Проверяем, что соединение живое
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                logger.warning(f"Мёртвое соединение обнаружено для {server.name}, переподключение...")
                if conn:
                    try:
                        pool.putconn(conn, close=True)
                    except:
                        pass
                # Получаем новое соединение
                conn = pool.getconn()
                # Проверяем новое соединение
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            
            logger.debug(f"Получено соединение из пула для {server.name}")
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Ошибка при работе с БД {server.name}: {e}")
            raise
        finally:
            if conn:
                pool.putconn(conn)
                logger.debug(f"Соединение возвращено в пул для {server.name}")
    
    def close_pool(self, server: Server, db_name: str = None):
        """Закрыть конкретный пул"""
        pool_key = self.get_pool_key(server, db_name)
        with self.lock:
            if pool_key in self.pools:
                logger.info(f"Закрытие пула для {server.name}")
                self.pools[pool_key].closeall()
                del self.pools[pool_key]
    
    def close_all(self):
        """Закрыть все пулы"""
        with self.lock:
            logger.info(f"Закрытие всех пулов подключений ({len(self.pools)} пулов)")
            for pool_key, pool_obj in self.pools.items():
                pool_obj.closeall()
            self.pools.clear()
    
    def get_status(self) -> dict:
        """Получить статус всех пулов"""
        with self.lock:
            status = {}
            for pool_key, pool_obj in self.pools.items():
                status[pool_key] = {
                    "minconn": pool_obj.minconn,
                    "maxconn": pool_obj.maxconn,
                    "closed": pool_obj.closed
                }
            return status

# Создаём глобальный пул
db_pool = DatabasePool()
