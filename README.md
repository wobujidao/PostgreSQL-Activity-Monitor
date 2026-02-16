# PostgreSQL Activity Monitor

<div align="center">
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React 19"/>
  <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/Python_3.13-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.13"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
</div>

<div align="center">
  <p>Система мониторинга PostgreSQL серверов с веб-интерфейсом, REST API и исторической статистикой</p>
</div>

<div align="center">
  <img src="https://img.shields.io/github/license/wobujidao/PostgreSQL-Activity-Monitor?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/github/stars/wobujidao/PostgreSQL-Activity-Monitor?style=flat-square" alt="Stars"/>
</div>

---

## Возможности

- **Мониторинг серверов** - статус, версия, uptime, активные соединения
- **Историческая статистика** - графики нагрузки, размеров БД, транзакций за любой период
- **SSH мониторинг** - свободное место на дисках через SSH (пароль или ключ)
- **Управление серверами** - добавление, редактирование, удаление через UI
- **Управление пользователями** - ролевая модель (admin / operator / viewer)
- **Управление SSH-ключами** - генерация, импорт, привязка к серверам
- **JWT авторизация** - безопасный доступ с настраиваемым временем сессии
- **Шифрование паролей** - Fernet шифрование для хранения credentials
- **Connection pooling** - переиспользование соединений к PostgreSQL
- **Кэширование** - двухуровневое (статус серверов 5с, SSH 30с)

## Технологический стек

### Backend
- **Python 3.13** + virtualenv
- **FastAPI 0.129** - REST API
- **Pydantic 2.12** - валидация данных
- **psycopg2** - драйвер PostgreSQL с connection pooling
- **Paramiko** - SSH клиент
- **PyJWT** + **bcrypt** - авторизация
- **cryptography** - шифрование (Fernet)

### Frontend
- **React 19.2** + React Router 7.13
- **Vite 7.3** - сборка и dev-сервер
- **Tailwind CSS v4.1** + **shadcn/ui** - UI компоненты
- **Chart.js 4.5** - графики
- **axios 1.13** - HTTP клиент
- **react-datepicker 9.1** - выбор диапазона дат
- **sonner 2.0** - toast-уведомления
- **lucide-react** - иконки

### Инфраструктура
- **PostgreSQL 9.6+** - целевые серверы
- **Nginx** - reverse proxy + SSL
- **systemd** - управление сервисами
- **cron** - сбор статистики

## Структура проекта

```
PostgreSQL-Activity-Monitor/
├── backend/                    # FastAPI REST API
│   ├── main.py                 # Точка входа
│   ├── requirements.txt        # Python зависимости
│   ├── pgmon-backend.service   # systemd сервис
│   └── app/
│       ├── config.py           # Конфигурация
│       ├── api/                # REST endpoints
│       │   ├── auth.py         # POST /token
│       │   ├── servers.py      # CRUD /servers
│       │   ├── stats.py        # GET /server_stats, /server/*/stats
│       │   ├── users.py        # CRUD /users
│       │   ├── ssh_keys.py     # CRUD /ssh-keys
│       │   └── health.py       # GET /api/health, /api/pools/status
│       ├── auth/               # JWT авторизация
│       │   ├── dependencies.py # get_current_user
│       │   └── utils.py        # create_access_token, verify_password
│       ├── database/
│       │   └── pool.py         # DatabasePool (ThreadedConnectionPool)
│       ├── models/             # Pydantic v2 модели
│       │   ├── server.py       # Server
│       │   ├── user.py         # User, UserCreate, UserUpdate, UserResponse
│       │   └── ssh_key.py      # SSHKey, SSHKeyCreate, SSHKeyImport
│       ├── services/           # Бизнес-логика
│       │   ├── server.py       # load_servers, save_servers, connect_to_server
│       │   ├── ssh.py          # SSH подключения, disk usage
│       │   ├── cache.py        # CacheManager (thread-safe)
│       │   ├── user_manager.py # UserManager (CRUD + bcrypt)
│       │   ├── ssh_key_manager.py    # Генерация/валидация SSH ключей
│       │   └── ssh_key_storage.py    # Хранение SSH ключей (JSON + файлы)
│       └── utils/
│           └── crypto.py       # Fernet шифрование/расшифровка
├── frontend/                   # React SPA (Vite + shadcn/ui)
│   ├── index.html              # Точка входа Vite
│   ├── vite.config.js          # Конфигурация Vite
│   ├── package.json            # Node.js зависимости
│   └── src/
│       ├── main.jsx            # Точка входа React
│       ├── index.css           # Tailwind + CSS переменные shadcn
│       ├── App.jsx             # Роутинг, хедер, модалы сессии
│       ├── lib/
│       │   ├── api.js          # Централизованный axios + JWT interceptor
│       │   ├── constants.js    # Все константы приложения
│       │   ├── format.js       # Утилиты форматирования
│       │   └── utils.js        # cn() для Tailwind классов
│       ├── contexts/
│       │   └── auth-context.jsx  # AuthProvider (JWT lifecycle)
│       ├── hooks/
│       │   └── use-auth.js     # useAuth hook
│       └── components/
│           ├── Login.jsx             # Авторизация
│           ├── ServerList.jsx        # Список серверов (главная)
│           ├── ServerDetails.jsx     # Детали сервера + анализ БД
│           ├── ServerEdit.jsx        # Редактирование сервера
│           ├── DatabaseDetails.jsx   # Статистика БД + графики
│           ├── UserManagement.jsx    # Управление пользователями
│           ├── SSHKeyManagement.jsx  # Управление SSH ключами
│           ├── ScrollToTop.jsx       # Кнопка "наверх"
│           ├── LoadingSpinner.jsx    # Индикатор загрузки
│           └── ui/                   # shadcn/ui компоненты
├── stats_db/                   # Сбор исторической статистики
│   ├── create_stats_db.sh      # Создание таблиц
│   ├── stats_collection.sh     # Скрипт сбора (для cron)
│   └── README.md
├── .env                        # SECRET_KEY
├── .gitignore
├── CLAUDE.md                   # Инструкции для Claude Code
├── LICENSE                     # MIT
└── README.md                   # Этот файл
```

## Установка

### Требования

- Linux сервер (Debian/Ubuntu/Astra Linux)
- Python 3.10+ (рекомендуется 3.13)
- PostgreSQL 9.6+ на целевых серверах
- Node.js 18+ (для frontend)
- Nginx (для HTTPS)

### 1. Клонирование

```bash
git clone https://github.com/wobujidao/PostgreSQL-Activity-Monitor.git
cd PostgreSQL-Activity-Monitor
```

### 2. Backend

```bash
cd backend

# Создаем virtualenv
python3.13 -m venv venv
source venv/bin/activate

# Устанавливаем зависимости
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Конфигурация

```bash
# Создаем директорию конфигурации
sudo mkdir -p /etc/pg_activity_monitor
sudo chown $USER:$USER /etc/pg_activity_monitor

# Генерируем ключ шифрования
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" \
  > /etc/pg_activity_monitor/encryption_key.key
chmod 600 /etc/pg_activity_monitor/encryption_key.key

# Создаем SECRET_KEY
echo "SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" > .env
```

### 4. Создание администратора

```bash
# Генерируем хэш пароля
python3 -c "
import bcrypt, json
password = input('Пароль для admin: ').encode()
hashed = bcrypt.hashpw(password, bcrypt.gensalt()).decode()
users = [{'login': 'admin', 'password': hashed, 'role': 'admin', 'is_active': True}]
with open('/etc/pg_activity_monitor/users.json', 'w') as f:
    json.dump(users, f, indent=2)
print('Пользователь admin создан')
"
```

### 5. Добавление серверов

Создайте `/etc/pg_activity_monitor/servers.json`:

```json
[
  {
    "name": "my-server",
    "host": "10.0.1.10",
    "port": 5432,
    "user": "postgres",
    "password": "password",
    "ssh_user": "pgadmin",
    "ssh_password": "ssh_password",
    "ssh_port": 22,
    "ssh_auth_type": "password",
    "stats_db": "stats_db"
  }
]
```

> Пароли будут автоматически зашифрованы при первом сохранении через API.

### 6. Frontend

```bash
cd frontend
npm install
```

### 7. Systemd сервисы

```bash
# Backend
sudo cp backend/pgmon-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pgmon-backend

# Frontend (создайте сервис или используйте nginx + build)
sudo systemctl enable --now pgmon-frontend

# Проверка
sudo systemctl status pgmon-backend pgmon-frontend
```

### 8. Nginx (HTTPS)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.crt;
    ssl_certificate_key /path/to/cert.key;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    # API
    location /token {
        proxy_pass http://127.0.0.1:8000/token;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
    }

    location ~ ^/(servers|users|ssh-keys|server_stats|server/) {
        proxy_pass http://127.0.0.1:8000$request_uri;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
    }
}
```

### 9. Сбор статистики (опционально)

```bash
# Создаем базу stats_db на целевом сервере
bash stats_db/create_stats_db.sh

# Добавляем в cron (каждые 10 минут)
crontab -e
# */10 * * * * /path/to/stats_db/stats_collection.sh >> /var/log/pg_stats.log 2>&1
```

## API Endpoints

Все endpoints (кроме `/token` и `/api/health`) требуют JWT токен: `Authorization: Bearer <token>`

### Авторизация

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/token` | Получение JWT токена |

### Серверы

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/servers` | Список серверов с текущим статусом |
| POST | `/servers` | Добавить сервер |
| PUT | `/servers/{name}` | Обновить сервер |
| DELETE | `/servers/{name}` | Удалить сервер |
| POST | `/servers/{name}/test-ssh` | Тест SSH подключения |

### Статистика

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/server_stats/{name}` | Активные запросы (pg_stat_activity) |
| GET | `/server/{name}/stats` | Историческая статистика сервера |
| GET | `/server/{name}/db/{db}` | Краткая информация о БД |
| GET | `/server/{name}/db/{db}/stats` | Детальная статистика БД за период |

### Пользователи (требуется роль admin)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/users` | Список пользователей |
| POST | `/users` | Создать пользователя |
| GET | `/users/me` | Текущий пользователь |
| GET | `/users/{login}` | Информация о пользователе |
| PUT | `/users/{login}` | Обновить пользователя |
| DELETE | `/users/{login}` | Удалить пользователя |

### SSH-ключи (требуется роль admin или operator)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/ssh-keys` | Список ключей |
| GET | `/ssh-keys/{id}` | Информация о ключе |
| POST | `/ssh-keys/generate` | Сгенерировать новый ключ |
| POST | `/ssh-keys/import` | Импортировать ключ (текст) |
| POST | `/ssh-keys/import-file` | Импортировать ключ (файл) |
| PUT | `/ssh-keys/{id}` | Обновить имя/описание |
| DELETE | `/ssh-keys/{id}` | Удалить ключ |
| GET | `/ssh-keys/{id}/servers` | Серверы, использующие ключ |
| GET | `/ssh-keys/{id}/download-public` | Скачать публичный ключ |

### Служебные

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/health` | Состояние API (без авторизации) |
| GET | `/api/pools/status` | Статус connection pools |
| GET | `/docs` | Swagger UI |
| GET | `/redoc` | ReDoc |

## Конфигурация

### Файлы конфигурации

| Файл | Описание |
|------|----------|
| `/etc/pg_activity_monitor/servers.json` | Конфигурация серверов (пароли зашифрованы) |
| `/etc/pg_activity_monitor/users.json` | Пользователи (пароли — bcrypt хэши) |
| `/etc/pg_activity_monitor/encryption_key.key` | Ключ Fernet для шифрования |
| `/etc/pg_activity_monitor/ssh_keys/` | Хранилище SSH-ключей |
| `backend/.env` | SECRET_KEY, LOG_LEVEL |

### Параметры (`backend/app/config.py`)

| Параметр | Значение | Описание |
|----------|----------|----------|
| `SECRET_KEY` | из .env | Ключ для JWT |
| `TOKEN_EXPIRATION` | 60 мин | Время жизни токена |
| `SERVER_STATUS_CACHE_TTL` | 5 сек | TTL кэша статуса |
| `SSH_CACHE_TTL` | 30 сек | TTL кэша SSH |
| `POOL_CONFIGS` | default/stats_db/high_load | Размеры connection pools |
| `ALLOWED_ORIGINS` | list | CORS origins |

### Роли пользователей

| Роль | Серверы | Пользователи | SSH-ключи |
|------|---------|---------------|-----------|
| **admin** | Полный доступ | Полный доступ | Полный доступ |
| **operator** | Полный доступ | Нет доступа | Создание/импорт |
| **viewer** | Только чтение | Нет доступа | Нет доступа |

## Использование

```bash
# Получение токена
TOKEN=$(curl -s -X POST http://localhost:8000/token \
  -d "username=admin&password=admin" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Список серверов
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/servers

# Активные запросы
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/server_stats/my-server

# Статистика за период
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/server/my-server/stats?start_date=2026-01-01&end_date=2026-02-01"

# Состояние API
curl http://localhost:8000/api/health
```

Интерактивная документация: `http://localhost:8000/docs`

## Обслуживание

```bash
# Логи backend
sudo journalctl -u pgmon-backend -f

# Перезапуск
sudo systemctl restart pgmon-backend
sudo systemctl restart pgmon-frontend

# Обновление
git pull
cd backend && source venv/bin/activate && pip install -r requirements.txt
sudo systemctl restart pgmon-backend
cd ../frontend && npm install
sudo systemctl restart pgmon-frontend
```

## Лицензия

MIT License - см. файл [LICENSE](LICENSE).

## Автор

**Владислав Демидов** - [@wobujidao](https://github.com/wobujidao)
