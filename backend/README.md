# PostgreSQL Activity Monitor - Backend API

[![Python](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.129-green.svg)](https://fastapi.tiangolo.com/)
[![Pydantic](https://img.shields.io/badge/Pydantic-2.12-purple.svg)](https://docs.pydantic.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

REST API для мониторинга PostgreSQL серверов с connection pooling, кэшированием и управлением SSH-ключами.

## Стек

- **Python 3.13** + virtualenv
- **FastAPI 0.129** + uvicorn 0.40
- **Pydantic 2.12** - валидация данных
- **psycopg2-binary 2.9.11** - PostgreSQL + connection pooling
- **paramiko 3.5** - SSH клиент
- **PyJWT 2.11** + **bcrypt 4.3** - JWT авторизация
- **cryptography 44.0** - Fernet шифрование

## Структура

```
backend/
├── main.py                       # Точка входа FastAPI
├── requirements.txt              # Python зависимости
├── pgmon-backend.service         # systemd сервис
├── venv/                         # virtualenv (не в git)
└── app/
    ├── config.py                 # SECRET_KEY, JWT, POOL_CONFIGS, CORS
    ├── api/
    │   ├── auth.py               # POST /token
    │   ├── servers.py            # CRUD /servers + test-ssh
    │   ├── stats.py              # /server_stats, /server/*/stats, /server/*/db/*
    │   ├── users.py              # CRUD /users (admin only)
    │   ├── ssh_keys.py           # CRUD /ssh-keys (admin/operator)
    │   └── health.py             # /api/health, /api/pools/status
    ├── auth/
    │   ├── dependencies.py       # get_current_user (OAuth2 + JWT)
    │   └── utils.py              # create_access_token, verify_password, hash_password
    ├── database/
    │   └── pool.py               # DatabasePool (ThreadedConnectionPool, keepalive)
    ├── models/                   # Pydantic v2
    │   ├── server.py             # Server
    │   ├── user.py               # User, UserCreate, UserUpdate, UserResponse, UserRole
    │   └── ssh_key.py            # SSHKey, SSHKeyCreate, SSHKeyImport, SSHKeyResponse
    ├── services/
    │   ├── server.py             # load_servers, save_servers, connect_to_server
    │   ├── ssh.py                # get_ssh_client, get_ssh_disk_usage, is_host_reachable
    │   ├── cache.py              # CacheManager (thread-safe, TTL)
    │   ├── user_manager.py       # UserManager (file-based, bcrypt, fcntl locking)
    │   ├── ssh_key_manager.py    # Генерация/валидация SSH ключей (RSA, Ed25519)
    │   └── ssh_key_storage.py    # Хранение ключей (JSON metadata + encrypted files)
    └── utils/
        └── crypto.py             # Fernet: encrypt/decrypt/ensure_encrypted/ensure_decrypted
```

## Установка

```bash
# virtualenv
python3.13 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Конфигурация
sudo mkdir -p /etc/pg_activity_monitor
sudo chown $USER:$USER /etc/pg_activity_monitor

# Ключ шифрования
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" \
  > /etc/pg_activity_monitor/encryption_key.key
chmod 600 /etc/pg_activity_monitor/encryption_key.key

# SECRET_KEY
echo "SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" > .env
```

## Запуск

```bash
# Разработка
source venv/bin/activate
LOG_LEVEL=DEBUG uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production (systemd)
sudo cp pgmon-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pgmon-backend
```

## API Endpoints

Документация: `http://localhost:8000/docs`

| Группа | Метод | Endpoint | Роль |
|--------|-------|----------|------|
| Auth | POST | `/token` | - |
| Servers | GET/POST | `/servers` | any |
| Servers | PUT/DELETE | `/servers/{name}` | any |
| Servers | POST | `/servers/{name}/test-ssh` | any |
| Stats | GET | `/server_stats/{name}` | any |
| Stats | GET | `/server/{name}/stats` | any |
| Stats | GET | `/server/{name}/db/{db}` | any |
| Stats | GET | `/server/{name}/db/{db}/stats` | any |
| Users | GET/POST | `/users` | admin |
| Users | GET | `/users/me` | any |
| Users | GET/PUT/DELETE | `/users/{login}` | admin |
| SSH Keys | GET | `/ssh-keys` | admin/operator |
| SSH Keys | POST | `/ssh-keys/generate` | admin/operator |
| SSH Keys | POST | `/ssh-keys/import` | admin/operator |
| SSH Keys | POST | `/ssh-keys/import-file` | admin/operator |
| SSH Keys | GET/PUT/DELETE | `/ssh-keys/{id}` | admin/operator |
| SSH Keys | GET | `/ssh-keys/{id}/servers` | any |
| SSH Keys | GET | `/ssh-keys/{id}/download-public` | admin |
| Health | GET | `/api/health` | - |
| Health | GET | `/api/pools/status` | any |

## Конфигурация (`app/config.py`)

| Параметр | Значение | Описание |
|----------|----------|----------|
| `SECRET_KEY` | env | Ключ для JWT |
| `TOKEN_EXPIRATION` | 60 мин | Время жизни токена |
| `SERVER_STATUS_CACHE_TTL` | 5 сек | TTL кэша статуса серверов |
| `SSH_CACHE_TTL` | 30 сек | TTL кэша SSH данных |
| `POOL_CONFIGS.default` | min=1, max=5 | Пул по умолчанию |
| `POOL_CONFIGS.stats_db` | min=2, max=10 | Пул для stats_db |
| `POOL_CONFIGS.high_load` | min=5, max=20 | Пул для нагруженных серверов |
| `ALLOWED_ORIGINS` | list | CORS origins |

## Файлы конфигурации

| Путь | Описание |
|------|----------|
| `/etc/pg_activity_monitor/servers.json` | Серверы (пароли зашифрованы Fernet) |
| `/etc/pg_activity_monitor/users.json` | Пользователи (bcrypt хэши) |
| `/etc/pg_activity_monitor/encryption_key.key` | Ключ Fernet |
| `/etc/pg_activity_monitor/ssh_keys/` | SSH-ключи (metadata + encrypted private keys) |
| `.env` | SECRET_KEY, LOG_LEVEL |

## Лицензия

MIT License - см. [LICENSE](../LICENSE)
