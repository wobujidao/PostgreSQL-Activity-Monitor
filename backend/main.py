import json
import psycopg2
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
import paramiko
from cryptography.fernet import Fernet
import logging
import socket
import os

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://10.110.20.55:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Конфигурация
SECRET_KEY = os.getenv("SECRET_KEY", "default-secret-for-local-testing")
ALGORITHM = "HS256"
TOKEN_EXPIRATION = 60
CONFIG_DIR = Path("/etc/pg_activity_monitor")
SERVERS_FILE = CONFIG_DIR / "servers.json"
USERS_FILE = CONFIG_DIR / "users.json"
ENCRYPTION_KEY_FILE = CONFIG_DIR / "encryption_key.key"

# Кэш для SSH-данных
ssh_cache = {}

def clear_ssh_cache():
    current_time = datetime.now(timezone.utc)
    expired = [key for key, value in ssh_cache.items() if (current_time - value["timestamp"]).total_seconds() > 30]
    for key in expired:
        del ssh_cache[key]

# Загрузка ключа шифрования
try:
    with open(ENCRYPTION_KEY_FILE, "rb") as key_file:
        fernet = Fernet(key_file.read())
except Exception as e:
    raise Exception(f"Ошибка загрузки ключа шифрования: {e}")

# Модель сервера
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

# OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def load_users():
    try:
        with USERS_FILE.open("r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Ошибка загрузки пользователей: {e}")
        raise Exception(f"Ошибка загрузки пользователей: {e}")

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        users = load_users()
        for user in users:
            if user["login"] == username:
                return user
        raise HTTPException(status_code=401, detail="Invalid credentials")
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    users = load_users()
    for user in users:
        if user["login"] == form_data.username and verify_password(form_data.password, user["password"]):
            token = create_access_token({"sub": user["login"]}, timedelta(minutes=TOKEN_EXPIRATION))
            return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

def load_servers() -> List[Server]:
    try:
        if not SERVERS_FILE.exists() or SERVERS_FILE.stat().st_size == 0:
            logger.info("Файл servers.json пуст или отсутствует, возвращаем пустой список")
            return []
        with SERVERS_FILE.open("r") as f:
            data = json.load(f)
        servers = []
        for item in data:
            item["password"] = fernet.decrypt(item["password"].encode()).decode()
            item["ssh_password"] = fernet.decrypt(item["ssh_password"].encode()).decode()
            servers.append(Server(**item))
        return servers
    except Exception as e:
        logger.error(f"Ошибка загрузки серверов: {e}")
        raise Exception(f"Ошибка загрузки серверов: {e}")

def is_host_reachable(host, port, timeout=2):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception as e:
        logger.error(f"Ошибка проверки доступности {host}:{port}: {e}")
        return False

def connect_to_server(server: Server):
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

    if not is_host_reachable(server.host, server.port):
        logger.warning(f"Хост {server.host}:{server.port} недоступен для PostgreSQL")
        result["status"] = "PostgreSQL: host unreachable"
    else:
        try:
            logger.info(f"Попытка подключения к PostgreSQL на {server.name} ({server.host}:{server.port})")
            conn = psycopg2.connect(
                host=server.host,
                database="postgres",
                user=server.user,
                password=server.password,
                port=server.port,
                connect_timeout=5
            )
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
            conn.close()
            logger.info(f"Успешное подключение к PostgreSQL на {server.name}")
            result["status"] = "ok" if result["status"] == "pending" else result["status"]
        except socket.timeout:
            logger.error(f"Тайм-аут PostgreSQL для {server.name}")
            result["status"] = "PostgreSQL: timeout"
        except Exception as e:
            logger.error(f"Ошибка PostgreSQL для {server.name}: {e}")
            result["status"] = f"PostgreSQL: {str(e)}"

    # Кэширование SSH-данных
    clear_ssh_cache()
    cache_key = f"{server.host}:{server.ssh_port}"
    if cache_key in ssh_cache and (datetime.now(timezone.utc) - ssh_cache[cache_key]["timestamp"]).total_seconds() < 30:
        result["free_space"] = ssh_cache[cache_key]["free_space"]
        result["total_space"] = ssh_cache[cache_key]["total_space"]
        result["status"] = f"{result['status']} (SSH cached)"
    else:
        if not is_host_reachable(server.host, server.ssh_port):
            logger.warning(f"Хост {server.host}:{server.ssh_port} недоступен для SSH")
            result["status"] = f"{result['status']} (SSH: host unreachable)" if result["status"] != "pending" else "SSH: host unreachable"
        elif result["data_dir"]:
            try:
                logger.info(f"Попытка подключения к SSH на {server.name} ({server.host}:{server.ssh_port})")
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
                # Извлекаем точку монтирования из data_dir
                data_dir = result["data_dir"]
                mount_point = data_dir.split('/DB')[0] if '/DB' in data_dir else data_dir
                cmd = f"df -B1 {mount_point}"
                stdin, stdout, stderr = ssh.exec_command(cmd, timeout=5)
                df_output = stdout.read().decode().strip().splitlines()
                error_output = stderr.read().decode().strip()
                logger.info(f"Вывод df для {server.name} с командой '{cmd}': {df_output}")
                if error_output:
                    logger.warning(f"Ошибка при выполнении df для {server.name}: {error_output}")
                    result["status"] = f"{result['status']} (SSH: df error: {error_output})"
                elif len(df_output) > 1:
                    columns = df_output[1].split()
                    if len(columns) >= 4:
                        result["total_space"] = int(columns[1])
                        result["free_space"] = int(columns[3])
                        ssh_cache[cache_key] = {
                            "free_space": result["free_space"],
                            "total_space": result["total_space"],
                            "timestamp": datetime.now(timezone.utc)
                        }
                    else:
                        logger.warning(f"Некорректный вывод df для {server.name}: {df_output[1]}")
                        result["status"] = f"{result['status']} (SSH: invalid df output)"
                else:
                    logger.warning(f"Пустой или недостаточный вывод df для {server.name}: {df_output}")
                    result["status"] = f"{result['status']} (SSH: no df data)"
                ssh.close()
                logger.info(f"Успешное подключение к SSH на {server.name}")
                result["status"] = "ok" if result["status"] == "pending" else f"{result['status']} (SSH ok)"
            except socket.timeout:
                logger.error(f"Тайм-аут SSH для {server.name}")
                result["status"] = f"{result['status']} (SSH: timeout)" if result["status"] != "pending" else "SSH: timeout"
            except Exception as e:
                logger.error(f"Ошибка SSH для {server.name}: {e}")
                result["status"] = f"{result['status']} (SSH: {str(e)})" if result["status"] != "pending" else f"SSH: {str(e)}"

    return result

@app.get("/servers", response_model=List[dict])
async def get_servers(current_user: dict = Depends(get_current_user)):
    servers = load_servers()
    return [connect_to_server(server) for server in servers]

@app.get("/server_stats/{server_name}")
async def get_server_stats(server_name: str, current_user: dict = Depends(get_current_user)):
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    try:
        conn = psycopg2.connect(host=server.host, database="postgres", user=server.user, password=server.password, port=server.port, connect_timeout=5)
        with conn.cursor() as cur:
            cur.execute("SELECT pid, usename, datname, query, state FROM pg_stat_activity WHERE state IS NOT NULL;")
            queries = [{"pid": row[0], "usename": row[1], "datname": row[2], "query": row[3], "state": row[4]} for row in cur.fetchall()]
        conn.close()
        return {"queries": queries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def cached_server_stats(server_name: str, start_date: str, end_date: str):
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
        conn = psycopg2.connect(
            host=server.host,
            database=stats_db,
            user=server.user,
            password=server.password,
            port=server.port,
            connect_timeout=5
        )
        with conn.cursor() as cur:
            start_date_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else datetime.now(timezone.utc) - timedelta(days=7)
            end_date_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else datetime.now(timezone.utc)

            cur.execute("SELECT MAX(ts) FROM pg_statistics;")
            last_update = cur.fetchone()[0]
            result["last_stat_update"] = last_update.isoformat() if last_update else None

            cur.execute("""
                SELECT SUM(numbackends), SUM(db_size::float / (1048576 * 1024))
                FROM pg_statistics
                WHERE ts BETWEEN %s AND %s;
            """, (start_date_dt, end_date_dt))
            stats = cur.fetchone()
            result["total_connections"] = stats[0] or 0
            result["total_size_gb"] = stats[1] or 0

            cur.execute("""
                SELECT DISTINCT datname
                FROM pg_statistics
                WHERE ts BETWEEN %s AND %s;
            """, (start_date_dt, end_date_dt))
            stats_dbs = [row[0] for row in cur.fetchall()]

            cur.execute("""
                SELECT date_trunc('hour', ts) as ts, datname, AVG(numbackends) as avg_connections, AVG(db_size::float / (1048576 * 1024)) as avg_size_gb
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

        conn.close()

        conn = psycopg2.connect(
            host=server.host,
            database="postgres",
            user=server.user,
            password=server.password,
            port=server.port,
            connect_timeout=5
        )
        with conn.cursor() as cur:
            cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
            active_dbs = [row[0] for row in cur.fetchall()]
        conn.close()

        result["databases"] = [
            {"name": db, "exists": db in active_dbs}
            for db in stats_dbs
        ]

        return result
    except Exception as e:
        logger.error(f"Ошибка получения статистики для {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/server/{server_name}/stats")
async def get_server_stats_details(server_name: str, start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    return cached_server_stats(server_name, start_date, end_date)

@app.get("/server/{server_name}/db/{db_name}")
async def get_database_stats(server_name: str, db_name: str, current_user: dict = Depends(get_current_user)):
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
        conn = psycopg2.connect(
            host=server.host,
            database=stats_db,
            user=server.user,
            password=server.password,
            port=server.port,
            connect_timeout=5
        )
        with conn.cursor() as cur:
            cur.execute("""
                SELECT numbackends, db_size::float / 1048576, xact_commit, ts
                FROM pg_statistics
                WHERE datname = %s AND ts = (SELECT MAX(ts) FROM pg_statistics WHERE datname = %s);
            """, (db_name, db_name))
            stats = cur.fetchone()
            if stats:
                result["connections"] = stats[0] or 0
                result["size_mb"] = stats[1] or 0
                result["commits"] = stats[2] or 0
                result["last_update"] = stats[3].isoformat() if stats[3] else None
        conn.close()

        if result["size_mb"] == 0:
            conn = psycopg2.connect(
                host=server.host,
                database="postgres",
                user=server.user,
                password=server.password,
                port=server.port,
                connect_timeout=5
            )
            with conn.cursor() as cur:
                cur.execute("SELECT pg_database_size(%s) / 1048576.0 AS size_mb;", (db_name,))
                real_size = cur.fetchone()[0]
                result["size_mb"] = real_size or 0
            conn.close()

        return result
    except Exception as e:
        logger.error(f"Ошибка получения статистики для базы {db_name} на сервере {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/servers/{server_name}")
async def delete_server(server_name: str, current_user: dict = Depends(get_current_user)):
    servers = load_servers()
    updated_servers = [s for s in servers if s.name != server_name]
    if len(updated_servers) == len(servers):
        raise HTTPException(status_code=404, detail="Server not found")
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
        } for s in updated_servers], f)
    return {"message": f"Server {server_name} deleted"}

@app.put("/servers/{server_name}", response_model=dict)
async def update_server(server_name: str, updated_server: Server, current_user: dict = Depends(get_current_user)):
    try:
        servers = load_servers()
        server_index = next((i for i, s in enumerate(servers) if s.name == server_name), None)
        if server_index is None:
            raise HTTPException(status_code=404, detail="Server not found")
        
        servers[server_index] = updated_server
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
        logger.info(f"Сервер {server_name} успешно обновлён в servers.json")
        return connect_to_server(updated_server)
    except Exception as e:
        logger.error(f"Ошибка при обновлении сервера {server_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при обновлении сервера: {str(e)}")

@app.post("/servers", response_model=dict)
async def add_server(server: Server, current_user: dict = Depends(get_current_user)):
    try:
        servers = load_servers()
        if any(s.name == server.name for s in servers):
            logger.warning(f"Попытка добавить уже существующий сервер: {server.name}")
            raise HTTPException(status_code=400, detail="Server with this name already exists")
        logger.info(f"Добавление сервера {server.name} с хостом {server.host}")
        servers.append(server)
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
        logger.info(f"Сервер {server.name} успешно добавлен в servers.json")
        return connect_to_server(server)
    except Exception as e:
        logger.error(f"Ошибка при добавлении сервера {server.name}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при добавлении сервера: {str(e)}")

@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(status_code=404, content={"message": "Not Found"})