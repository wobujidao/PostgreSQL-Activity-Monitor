# app/config.py
import os
from pathlib import Path

# Основные настройки
SECRET_KEY = os.getenv("SECRET_KEY", "default-secret-for-local-testing")
ALGORITHM = "HS256"
TOKEN_EXPIRATION = 60  # минут

# Пути к файлам
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
SERVER_STATUS_CACHE_TTL = 5  # секунд
SSH_CACHE_TTL = 30  # секунд

# Логирование
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# CORS
ALLOWED_ORIGINS = ["http://10.110.20.55:3000"]
