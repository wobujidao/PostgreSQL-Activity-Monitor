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
from cryptography.fernet import Fernet  # Добавлен импорт Fernet

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://10.110.20.55:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Конфигурация
SECRET_KEY = "mtttDjjZ4VlgntKph8mI3eSVFEgGDVfiVlGyGfXOq9I"
ALGORITHM = "HS256"
TOKEN_EXPIRATION = 30
CONFIG_DIR = Path("/etc/pg_activity_monitor")
SERVERS_FILE = CONFIG_DIR / "servers.json"
USERS_FILE = CONFIG_DIR / "users.json"
ENCRYPTION_KEY_FILE = CONFIG_DIR / "encryption_key.key"

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
    stats_db: Optional[str]
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
        with SERVERS_FILE.open("r") as f:
            data = json.load(f)
        servers = []
        for item in data:
            item["password"] = fernet.decrypt(item["password"].encode()).decode()
            item["ssh_password"] = fernet.decrypt(item["ssh_password"].encode()).decode()
            servers.append(Server(**item))
        return servers
    except Exception as e:
        raise Exception(f"Ошибка загрузки серверов: {e}")

def connect_to_server(server: Server):
    try:
        conn = psycopg2.connect(host=server.host, database="postgres", user=server.user, password=server.password, port=server.port, connect_timeout=3)
        with conn.cursor() as cur:
            cur.execute("SHOW server_version;")
            version = cur.fetchone()[0]
            cur.execute("SELECT state, COUNT(*) FROM pg_stat_activity GROUP BY state;")
            connections = dict(cur.fetchall())
            cur.execute("SELECT pg_postmaster_start_time();")
            start_time = cur.fetchone()[0]
            now_utc = datetime.now(timezone.utc)
            uptime = (now_utc - start_time).total_seconds() / 3600
            cur.execute("SHOW data_directory;")
            data_dir = cur.fetchone()[0]
        conn.close()

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(server.host, username=server.ssh_user, password=server.ssh_password, port=server.ssh_port)
        stdin, stdout, stderr = ssh.exec_command(f"df -B1 {data_dir}")
        df_output = stdout.read().decode().splitlines()
        free_space = int(df_output[1].split()[3]) if len(df_output) > 1 else None
        ssh.close()

        return {
            "name": server.name,
            "host": server.host,
            "version": version,
            "free_space": free_space,
            "connections": {"active": connections.get("active", 0), "idle": connections.get("idle", 0)},
            "uptime_hours": round(uptime, 2),
            "stats_db": server.stats_db,
            "status": "ok"
        }
    except Exception as e:
        return {"name": server.name, "host": server.host, "version": None, "free_space": None, "status": str(e)}

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
        conn = psycopg2.connect(host=server.host, database="postgres", user=server.user, password=server.password, port=server.port, connect_timeout=3)
        with conn.cursor() as cur:
            cur.execute("SELECT pid, usename, datname, query, state FROM pg_stat_activity WHERE state IS NOT NULL;")
            queries = [{"pid": row[0], "usename": row[1], "datname": row[2], "query": row[3], "state": row[4]} for row in cur.fetchall()]
        conn.close()
        return {"queries": queries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(status_code=404, content={"message": "Not Found"})