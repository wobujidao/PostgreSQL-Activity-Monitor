import json
import psycopg2
from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone

print("Запуск main.py")  # Отладка: проверяем начало выполнения

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://10.110.20.55:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Настройки JWT
SECRET_KEY = "mtttDjjZ4VlgntKph8mI3eSVFEgGDVfiVlGyGfXOq9I"  # Твой сгенерированный ключ
ALGORITHM = "HS256"
TOKEN_EXPIRATION = 30  # Минуты

# Файлы конфигурации
CONFIG_DIR = Path("/etc/pg_activity_monitor")
SERVERS_FILE = CONFIG_DIR / "servers.json"
USERS_FILE = CONFIG_DIR / "users.json"

# Модель сервера
class Server(BaseModel):
    name: str
    host: str
    stats_db: Optional[str]
    user: str
    password: str
    port: int

# Модель пользователя
class User(BaseModel):
    login: str
    password: str
    role: str

# OAuth2 для авторизации
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Загрузка пользователей
def load_users():
    with USERS_FILE.open("r") as f:
        return json.load(f)

# Проверка пароля
def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

# Создание JWT-токена
def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# Получение текущего пользователя
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

# Авторизация
@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    users = load_users()
    for user in users:
        if user["login"] == form_data.username and verify_password(form_data.password, user["password"]):
            token = create_access_token({"sub": user["login"]}, timedelta(minutes=TOKEN_EXPIRATION))
            return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

# Загрузка серверов
def load_servers() -> List[Server]:
    with SERVERS_FILE.open("r") as f:
        data = json.load(f)
    return [Server(**item) for item in data]

# Получение данных о сервере
def connect_to_server(server: Server):
    try:
        conn = psycopg2.connect(
            host=server.host,
            database="postgres",
            user=server.user,
            password=server.password,
            port=server.port
        )
        with conn.cursor() as cur:
            # Версия
            cur.execute("SHOW server_version;")
            version = cur.fetchone()[0]
            # Соединения
            cur.execute("SELECT state, COUNT(*) FROM pg_stat_activity WHERE datname='postgres' GROUP BY state;")
            connections = dict(cur.fetchall())
            active = connections.get("active", 0)
            idle = connections.get("idle", 0)
            # Uptime
            cur.execute("SELECT pg_postmaster_start_time();")
            start_time = cur.fetchone()[0]
            now_utc = datetime.now(timezone.utc)  # Используем UTC
            uptime = (now_utc - start_time).total_seconds() / 3600  # В часах
        conn.close()
        return {
            "name": server.name,
            "host": server.host,
            "version": version,
            "free_space": "N/A",
            "connections": {"active": active, "idle": idle},
            "uptime_hours": round(uptime, 2),
            "stats_db": server.stats_db,
            "status": "ok"
        }
    except Exception as e:
        return {"name": server.name, "host": server.host, "version": None, "status": str(e)}

@app.get("/servers", response_model=List[dict])
async def get_servers(current_user: dict = Depends(get_current_user)):
    servers = load_servers()
    result = [connect_to_server(server) for server in servers]
    return result

@app.get("/favicon.ico")
async def favicon():
    return JSONResponse(status_code=404, content={"message": "Not Found"})

print("Дошли до конца импортов")  # Отладка: проверяем, дошли ли до конца кода

if __name__ == "__main__":
    print("Запускаем Uvicorn")  # Отладка: проверяем вход в блок __main__
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)