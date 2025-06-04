import json
import psycopg2
from psycopg2 import pool
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import List, Optional, Dict
from pydantic import BaseModel
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
import paramiko
from cryptography.fernet import Fernet
import logging
import socket
import os
from contextlib import contextmanager
import threading
import time

# Настройка логирования с форматированием
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Настройки приложения
app = FastAPI(
    title="PostgreSQL Activity Monitor API",
    description="API для мониторинга активности PostgreSQL серверов",
    version="2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://10.110.20.55:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== КОНФИГУРАЦИЯ =====
SECRET_KEY = os.getenv("SECRET_KEY", "default-secret-for-local-testing")
ALGORITHM = "HS256"
TOKEN_EXPIRATION = 60
CONFIG_DIR = Path("/etc/pg_activity_monitor")
SERVERS_FILE = CONFIG_DIR / "servers.json"
USERS_FILE = CONFIG_DIR / "users.json"
ENCRYPTION_KEY_FILE = CONFIG_DIR / "encryption_key.key"

# Настройки пулов подключений
POOL_CONFIGS = {
    "default": {"minconn": 1, "maxconn": 5},
    "stats_db": {"minconn": 2, "maxconn": 10},
    "high_load": {"minconn": 5, "maxconn": 20}
}

# Настройки кэширования
SERVER_STATUS_CACHE_TTL = 5  # секунд - кэш статуса серверов
SSH_CACHE_TTL = 30  # секунд - кэш SSH данных

# Кэши
ssh_cache = {}
ssh_cache_lock = threading.Lock()
server_status_cache = {}
server_status_cache_lock = threading.Lock()

# Загрузка ключа шифрования
try:
    with open(ENCRYPTION_KEY_FILE, "rb") as key_file:
        fernet = Fernet(key_file.read())
    logger.info("Ключ шифрования успешно загружен")
except Exception as e:
    logger.error(f"Критическая ошибка: не удалось загрузить ключ шифрования: {e}")
    raise Exception(f"Ошибка загрузки ключа шифрования: {e}")

# ===== МОДЕЛИ =====
class Server(BaseModel):
    name: str
    host: str
    stats_db: Optional[str] = None
    user: str
    password: str
    port: int
    ssh_user: str
    ssh_password: str
    ssh_port: int = 22

# ===== УПРАВЛЕНИЕ ПУЛАМИ ПОДКЛЮЧЕНИЙ =====
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
                        connect_timeout=5
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

# ===== АВТОРИЗАЦИЯ =====
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def clear_cache(cache: dict, lock: threading.Lock, ttl: int):
    """Универсальная функция очистки кэша"""
    current_time = time.time()
    with lock:
        expired = [key for key, value in cache.items() 
                  if current_time - value["timestamp"] > ttl]
        for key in expired:
            logger.debug(f"Удаление устаревшей записи из кэша: {key}")
            del cache[key]

def load_users():
    """Загрузка пользователей из файла"""
    try:
        with USERS_FILE.open("r") as f:
            users = json.load(f)
        logger.debug(f"Загружено {len(users)} пользователей")
        return users
    except Exception as e:
        logger.error(f"Ошибка загрузки пользователей: {e}")
        raise

def verify_password(plain_password, hashed_password):
    """Проверка пароля"""
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

def create_access_token(data: dict, expires_delta: timedelta):
    """Создание JWT токена"""
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Получение текущего пользователя из токена"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        users = load_users()
        for user in users:
            if user["login"] == username:
                logger.debug(f"Авторизован пользователь: {username}")
                return user
        raise HTTPException(status_code=401, detail="Invalid credentials")
    except jwt.ExpiredSignatureError:
        logger.warning("Попытка использования истёкшего токена")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        logger.warning("Попытка использования невалидного токена")
        raise HTTPException(status_code=401, detail="Invalid token")

# ===== РАБОТА С СЕРВЕРАМИ =====
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
            item["password"] = fernet.decrypt(item["password"].encode()).decode()
            item["ssh_password"] = fernet.decrypt(item["ssh_password"].encode()).decode()
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
                "password": fernet.encrypt(s.password.encode()).decode(),
                "port": s.port,
                "ssh_user": s.ssh_user,
                "ssh_password": fernet.encrypt(s.ssh_password.encode()).decode(),
                "ssh_port": s.ssh_port
            } for s in servers], f)
        logger.info(f"Сохранено {len(servers)} серверов")
    except Exception as e:
        logger.error(f"Ошибка сохранения серверов: {e}")
        raise

def is_host_reachable(host: str, port: int, timeout: int = 2) -> bool:
    """Проверка доступности хоста"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception as e:
        logger.debug(f"Ошибка проверки доступности {host}:{port}: {e}")
        return False

def get_ssh_disk_usage(server: Server, data_dir: str) -> tuple:
    """Получение информации о диске через SSH"""
    cache_key = f"{server.host}:{server.ssh_port}"
    
    # Проверяем кэш
    clear_cache(ssh_cache, ssh_cache_lock, SSH_CACHE_TTL)
    
    with ssh_cache_lock:
        if cache_key in ssh_cache:
            cached_data = ssh_cache[cache_key]
            logger.debug(f"Использование SSH кэша для {server.name}")
            return cached_data["free_space"], cached_data["total_space"], "cached"
    
    # Если не в кэше, получаем данные
    if not is_host_reachable(server.host, server.ssh_port):
        logger.warning(f"SSH недоступен для {server.name}")
        return None, None, "unreachable"
    
    try:
        logger.debug(f"SSH подключение к {server.name}")
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            server.host,
            username=server.ssh_user,
            password=server.ssh_password,
            port=server.ssh_port,
            timeout=5,
            banner_timeout=5,
            auth_timeout=5
        )
        
        # Извлекаем точку монтирования
        mount_point = data_dir.split('/DB')[0] if '/DB' in data_dir else data_dir
        cmd = f"df -B1 {mount_point}"
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=5)
        df_output = stdout.read().decode().strip().splitlines()
        error_output = stderr.read().decode().strip()
        
        if error_output:
            logger.warning(f"Ошибка df для {server.name}: {error_output}")
            ssh.close()
            return None, None, f"df error: {error_output}"
        
        if len(df_output) > 1:
            columns = df_output[1].split()
            if len(columns) >= 4:
                total_space = int(columns[1])
                free_space = int(columns[3])
                
                # Сохраняем в кэш
                with ssh_cache_lock:
                    ssh_cache[cache_key] = {
                        "free_space": free_space,
                        "total_space": total_space,
                        "timestamp": time.time()
                    }
                
                ssh.close()
                logger.debug(f"SSH данные получены для {server.name}")
                return free_space, total_space, "ok"
        
        ssh.close()
        return None, None, "invalid df output"
        
    except socket.timeout:
        logger.error(f"SSH таймаут для {server.name}")
        return None, None, "timeout"
    except Exception as e:
        logger.error(f"SSH ошибка для {server.name}: {e}")
        return None, None, str(e)

def connect_to_server(server: Server) -> dict:
    """Получение информации о сервере с кэшированием"""
    cache_key = f"{server.host}:{server.port}"
    
    # Проверяем кэш статуса сервера
    clear_cache(server_status_cache, server_status_cache_lock, SERVER_STATUS_CACHE_TTL)
    
    with server_status_cache_lock:
        if cache_key in server_status_cache:
            cached = server_status_cache[cache_key]
            logger.debug(f"Использование кэша статуса для {server.name}")
            # Обновляем только SSH данные если есть data_dir
            if cached.get("data_dir"):
                free_space, total_space, ssh_status = get_ssh_disk_usage(server, cached["data_dir"])
                cached["free_space"] = free_space
                cached["total_space"] = total_space
                if ssh_status != "ok" and ssh_status != "cached":
                    cached["status"] = f"{cached['status']} (SSH: {ssh_status})"
            return cached.copy()
    
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
        with server_status_cache_lock:
            server_status_cache[cache_key] = {
                **result,
                "timestamp": time.time()
            }
    
    return result

# ===== API ENDPOINTS =====

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Авторизация и получение токена"""
    users = load_users()
    for user in users:
        if user["login"] == form_data.username and verify_password(form_data.password, user["password"]):
            token = create_access_token({"sub": user["login"]}, timedelta(minutes=TOKEN_EXPIRATION))
            logger.info(f"Успешная авторизация: {user['login']}")
            return {"access_token": token, "token_type": "bearer"}
    
    logger.warning(f"Неудачная попытка авторизации: {form_data.username}")
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.get("/servers", response_model=List[dict])
async def get_servers(current_user: dict = Depends(get_current_user)):
    """Получить список всех серверов с их статусом"""
    servers = load_servers()
    return [connect_to_server(server) for server in servers]

@app.get("/server_stats/{server_name}")
async def get_server_stats(server_name: str, current_user: dict = Depends(get_current_user)):
    """Получить текущую активность на сервере"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    try:
        with db_pool.get_connection(server) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT pid, usename, datname, query, state FROM pg_stat_activity WHERE state IS NOT NULL;")
                queries = [{"pid": row[0], "usename": row[1], "datname": row[2], "query": row[3], "state": row[4]} 
                          for row in cur.fetchall()]
        return {"queries": queries}
    except Exception as e:
        logger.error(f"Ошибка получения активности для {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/server/{server_name}/stats")
async def get_server_stats_details(
    server_name: str, 
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    current_user: dict = Depends(get_current_user)
):
    """Получить детальную статистику сервера за период"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    stats_db = server.stats_db or "stats_db"
    result = {
        "last_stat_update": None,
        "total_connections": 0,
        "total_size_gb": 0,
        "databases": [],
        "connection_timeline": []
    }
    
    try:
        # Получаем статистику из stats_db
        with db_pool.get_connection(server, stats_db) as conn:
            with conn.cursor() as cur:
                start_date_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else datetime.now(timezone.utc) - timedelta(days=7)
                end_date_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else datetime.now(timezone.utc)
                
                # Последнее обновление
                cur.execute("SELECT MAX(ts) FROM pg_statistics;")
                last_update = cur.fetchone()[0]
                result["last_stat_update"] = last_update.isoformat() if last_update else None
                
                # Агрегированные данные
                cur.execute("""
                    SELECT SUM(numbackends), SUM(db_size::float / (1048576 * 1024))
                    FROM pg_statistics
                    WHERE ts BETWEEN %s AND %s;
                """, (start_date_dt, end_date_dt))
                stats = cur.fetchone()
                result["total_connections"] = stats[0] or 0
                result["total_size_gb"] = stats[1] or 0
                
                # Список БД
                cur.execute("""
                    SELECT DISTINCT p.datname, d.creation_time
                    FROM pg_statistics p
                    LEFT JOIN db_creation d ON p.datname = d.datname
                    WHERE p.ts BETWEEN %s AND %s;
                """, (start_date_dt, end_date_dt))
                stats_dbs = [{"name": row[0], "creation_time": row[1].isoformat() if row[1] else None} 
                            for row in cur.fetchall()]
                
                # Timeline
                cur.execute("""
                    SELECT date_trunc('hour', ts) as ts, datname, 
                           AVG(numbackends) as avg_connections, 
                           AVG(db_size::float / (1048576 * 1024)) as avg_size_gb
                    FROM pg_statistics
                    WHERE ts BETWEEN %s AND %s
                    GROUP BY date_trunc('hour', ts), datname
                    ORDER BY date_trunc('hour', ts);
                """, (start_date_dt, end_date_dt))
                timeline = [
                    {
                        "ts": row[0].isoformat(),
                        "datname": row[1],
                        "connections": round(row[2] or 0),
                        "size_gb": row[3] or 0
                    }
                    for row in cur.fetchall()
                ]
                result["connection_timeline"] = timeline
        
        # Проверяем существующие БД
        with db_pool.get_connection(server) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
                active_dbs = [row[0] for row in cur.fetchall()]
        
        result["databases"] = [
            {"name": db["name"], "exists": db["name"] in active_dbs, "creation_time": db["creation_time"]}
            for db in stats_dbs
        ]
        
        return result
        
    except Exception as e:
        logger.error(f"Ошибка получения статистики для {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/server/{server_name}/db/{db_name}")
async def get_database_stats(
    server_name: str, 
    db_name: str, 
    current_user: dict = Depends(get_current_user)
):
    """Получить краткую статистику по базе данных"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    stats_db = server.stats_db or "stats_db"
    result = {
        "size_mb": 0,
        "connections": 0,
        "commits": 0,
        "last_update": None
    }
    
    try:
        # Пробуем получить из статистики
        with db_pool.get_connection(server, stats_db) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT numbackends, db_size::float / 1048576, xact_commit, ts
                    FROM pg_statistics
                    WHERE datname = %s AND db_size IS NOT NULL
                    ORDER BY ts DESC
                    LIMIT 1;
                """, (db_name,))
                stats = cur.fetchone()
                if stats:
                    result["connections"] = stats[0] or 0
                    result["size_mb"] = stats[1] or 0
                    result["commits"] = stats[2] or 0
                    result["last_update"] = stats[3].isoformat() if stats[3] else None
        
        # Если размер не найден, получаем напрямую
        if result["size_mb"] == 0:
            with db_pool.get_connection(server) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_database_size(%s) / 1048576.0 AS size_mb;", (db_name,))
                    real_size = cur.fetchone()[0]
                    result["size_mb"] = real_size or 0
        
        return result
        
    except Exception as e:
        logger.error(f"Ошибка получения статистики БД {db_name} на {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/server/{server_name}/db/{db_name}/stats")
async def get_database_stats_details(
    server_name: str, 
    db_name: str, 
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    current_user: dict = Depends(get_current_user)
):
    """Получить детальную статистику по базе данных за период"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    stats_db = server.stats_db or "stats_db"
    result = {
        "last_stat_update": None,
        "total_connections": 0,
        "total_commits": 0,
        "total_size_mb": 0,
        "creation_time": None,
        "max_connections": 0,
        "min_connections": 0,
        "timeline": []
    }
    
    try:
        with db_pool.get_connection(server, stats_db) as conn:
            with conn.cursor() as cur:
                start_date_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else datetime.now(timezone.utc) - timedelta(days=7)
                end_date_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else datetime.now(timezone.utc)
                
                # Последнее обновление
                cur.execute("SELECT MAX(ts) FROM pg_statistics WHERE datname = %s;", (db_name,))
                last_update = cur.fetchone()[0]
                result["last_stat_update"] = last_update.isoformat() if last_update else None
                
                # Агрегированные метрики
                cur.execute("""
                    SELECT SUM(numbackends), SUM(xact_commit), SUM(db_size::float / 1048576),
                           MAX(numbackends), MIN(numbackends)
                    FROM pg_statistics
                    WHERE datname = %s AND ts BETWEEN %s AND %s;
                """, (db_name, start_date_dt, end_date_dt))
                stats = cur.fetchone()
                result["total_connections"] = stats[0] or 0
                result["total_commits"] = stats[1] or 0
                result["total_size_mb"] = stats[2] or 0
                result["max_connections"] = stats[3] or 0
                result["min_connections"] = stats[4] or 0
                
                # Время создания базы
                cur.execute("SELECT creation_time FROM db_creation WHERE datname = %s;", (db_name,))
                creation_time = cur.fetchone()
                result["creation_time"] = creation_time[0].isoformat() if creation_time else None
                
                # Timeline для графиков
                cur.execute("""
                    SELECT date_trunc('hour', ts) as ts, 
                           AVG(numbackends) as avg_connections,
                           AVG(db_size::float / 1048576) as avg_size_mb, 
                           SUM(xact_commit) as total_commits
                    FROM pg_statistics
                    WHERE datname = %s AND ts BETWEEN %s AND %s
                    GROUP BY date_trunc('hour', ts)
                    ORDER BY date_trunc('hour', ts);
                """, (db_name, start_date_dt, end_date_dt))
                timeline = [
                    {
                        "ts": row[0].isoformat(),
                        "connections": round(row[1] or 0),
                        "size_mb": row[2] or 0,
                        "commits": row[3] or 0
                    }
                    for row in cur.fetchall()
                ]
                result["timeline"] = timeline
        
        return result
        
    except Exception as e:
        logger.error(f"Ошибка получения детальной статистики БД {db_name} на {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/servers", response_model=dict)
async def add_server(server: Server, current_user: dict = Depends(get_current_user)):
    """Добавить новый сервер"""
    try:
        servers = load_servers()
        if any(s.name == server.name for s in servers):
            logger.warning(f"Попытка добавить существующий сервер: {server.name}")
            raise HTTPException(status_code=400, detail="Server with this name already exists")
        
        servers.append(server)
        save_servers(servers)
        logger.info(f"Добавлен новый сервер: {server.name}")
        
        return connect_to_server(server)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при добавлении сервера {server.name}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при добавлении сервера: {str(e)}")

@app.put("/servers/{server_name}", response_model=dict)
async def update_server(
    server_name: str, 
    updated_server: Server, 
    current_user: dict = Depends(get_current_user)
):
    """Обновить конфигурацию сервера"""
    try:
        servers = load_servers()
        server_index = next((i for i, s in enumerate(servers) if s.name == server_name), None)
        if server_index is None:
            raise HTTPException(status_code=404, detail="Server not found")
        
        old_server = servers[server_index]
        
        # Очищаем кэши при изменении сервера
        with server_status_cache_lock:
            cache_key = f"{old_server.host}:{old_server.port}"
            if cache_key in server_status_cache:
                del server_status_cache[cache_key]
        
        # Закрываем старые пулы если изменились параметры подключения
        if (old_server.host != updated_server.host or 
            old_server.port != updated_server.port or 
            old_server.user != updated_server.user):
            db_pool.close_pool(old_server)
            if old_server.stats_db:
                db_pool.close_pool(old_server, old_server.stats_db)
        
        servers[server_index] = updated_server
        save_servers(servers)
        logger.info(f"Обновлён сервер: {server_name}")
        
        return connect_to_server(updated_server)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при обновлении сервера {server_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при обновлении сервера: {str(e)}")

@app.delete("/servers/{server_name}")
async def delete_server(server_name: str, current_user: dict = Depends(get_current_user)):
    """Удалить сервер из конфигурации"""
    servers = load_servers()
    server_to_delete = next((s for s in servers if s.name == server_name), None)
    
    if not server_to_delete:
        raise HTTPException(status_code=404, detail="Server not found")
    
    # Очищаем кэши
    with server_status_cache_lock:
        cache_key = f"{server_to_delete.host}:{server_to_delete.port}"
        if cache_key in server_status_cache:
            del server_status_cache[cache_key]
    
    # Закрываем пулы для удаляемого сервера
    db_pool.close_pool(server_to_delete)
    if server_to_delete.stats_db:
        db_pool.close_pool(server_to_delete, server_to_delete.stats_db)
    
    updated_servers = [s for s in servers if s.name != server_name]
    save_servers(updated_servers)
    logger.info(f"Удалён сервер: {server_name}")
    
    return {"message": f"Server {server_name} deleted"}

# ===== СЛУЖЕБНЫЕ ENDPOINTS =====

@app.get("/api/pools/status")
async def get_pools_status(current_user: dict = Depends(get_current_user)):
    """Получить статус всех пулов подключений"""
    return db_pool.get_status()

@app.get("/api/health")
async def health_check():
    """Проверка состояния API"""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "pools_count": len(db_pool.pools),
        "version": "2.0",
        "log_level": LOG_LEVEL
    }

@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(status_code=404, content={"message": "Not Found"})

# ===== СОБЫТИЯ ЖИЗНЕННОГО ЦИКЛА =====

@app.on_event("startup")
async def startup_event():
    """Инициализация при запуске"""
    logger.info("=" * 60)
    logger.info("PostgreSQL Activity Monitor API v2.0")
    logger.info(f"Уровень логирования: {LOG_LEVEL}")
    logger.info(f"Конфигурация загружена из: {CONFIG_DIR}")
    logger.info(f"Настройки пулов: {POOL_CONFIGS}")
    logger.info(f"TTL кэшей: статус серверов={SERVER_STATUS_CACHE_TTL}с, SSH={SSH_CACHE_TTL}с")
    logger.info("=" * 60)

@app.on_event("shutdown")
async def shutdown_event():
    """Очистка при завершении"""
    logger.info("Завершение работы PostgreSQL Activity Monitor API...")
    db_pool.close_all()
    logger.info("Все ресурсы освобождены. До свидания!")
