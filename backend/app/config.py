# app/config.py
import os
from pathlib import Path
from dotenv import load_dotenv

# Загрузка .env (ищем в корне проекта)
_project_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_root / ".env")

# Основные настройки
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY не установлен! Задайте переменную окружения или укажите в .env")
ALGORITHM = "HS256"
TOKEN_EXPIRATION = 60  # минут
REFRESH_TOKEN_EXPIRATION_DAYS = 7  # дней

# Ключ шифрования для pgcrypto (pgp_sym_encrypt/decrypt)
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
if not ENCRYPTION_KEY:
    raise RuntimeError("ENCRYPTION_KEY не установлен! Задайте переменную окружения или укажите в .env")

# Пути
CONFIG_DIR = Path("/etc/pg_activity_monitor")

# Аудит сессий
AUDIT_RETENTION_DAYS = 90  # хранить записи N дней

# Локальная БД (asyncpg через Unix-сокет)
LOCAL_DB_DSN = os.getenv("LOCAL_DB_DSN", "postgresql://pam:pam@/pam_stats?host=/tmp")

# Интервалы коллектора (секунды)
COLLECT_INTERVAL = int(os.getenv("COLLECT_INTERVAL", "600"))           # 10 минут — основной сбор
SIZE_UPDATE_INTERVAL = int(os.getenv("SIZE_UPDATE_INTERVAL", "1800"))  # 30 минут — размеры БД
DB_CHECK_INTERVAL = int(os.getenv("DB_CHECK_INTERVAL", "1800"))       # 30 минут — новые/удалённые БД

# Retention
RETENTION_MONTHS = int(os.getenv("RETENTION_MONTHS", "12"))

# Настройки пулов подключений
POOL_CONFIGS = {
    "default": {"minconn": 1, "maxconn": 5},
    "high_load": {"minconn": 5, "maxconn": 20}
}

# Настройки кэширования
SERVER_STATUS_CACHE_TTL = 5  # секунд
SSH_CACHE_TTL = 30  # секунд

# Логирование
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# CORS
ALLOWED_ORIGINS = [
    "https://pam.cbmo.mosreg.ru",
]