# PostgreSQL Activity Monitor

<div align="center">

<img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
<img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React 19"/>
<img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI"/>
<img src="https://img.shields.io/badge/Python_3.13-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.13"/>
<img src="https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
<img src="https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>

**Система мониторинга PostgreSQL серверов с веб-интерфейсом, REST API и исторической статистикой**

<img src="https://img.shields.io/github/license/wobujidao/PostgreSQL-Activity-Monitor?style=flat-square" alt="License"/>
<img src="https://img.shields.io/github/stars/wobujidao/PostgreSQL-Activity-Monitor?style=flat-square" alt="Stars"/>
<img src="https://img.shields.io/badge/version-3.0.0-blue?style=flat-square" alt="Version"/>

</div>

---

## Возможности

- **Мониторинг серверов** — статус, версия, uptime, активные соединения, дисковое пространство
- **Историческая статистика** — автоматический сбор каждые 10 мин, графики нагрузки, размеров БД, транзакций
- **Анализ баз данных** — автоматическое выявление неактивных, статичных и малоактивных БД
- **SSH мониторинг** — свободное место на дисках через SSH (пароль или ключ)
- **Управление серверами** — добавление, редактирование, удаление через UI
- **Управление пользователями** — ролевая модель (admin / operator / viewer)
- **Управление SSH-ключами** — генерация, импорт, привязка к серверам
- **JWT авторизация** — access + refresh tokens, httpOnly cookies, token blacklist
- **CSRF-защита** — SameSite=Strict cookies + проверка Origin header
- **Аудит сессий** — журнал входов/выходов с IP, User-Agent, временем (admin)
- **Системные логи** — журнал работы коллектора и системных событий с фильтрами по уровню, источнику, дате, тексту (admin)
- **Rate limiting** — защита от brute force (slowapi)
- **Тёмная тема** — полная поддержка light/dark режимов
- **Command Palette** — быстрый поиск (`Ctrl+K`)
- **Автосбор статистики** — бэкенд сам подключается к серверам и собирает данные (коллектор v3)
- **Connection pooling** — psycopg2 для удалённых серверов, asyncpg для локальной БД
- **Кэширование** — двухуровневое (статус серверов 5с, SSH 30с)
- **Шифрование** — pgcrypto (PGP-AES256) для credentials в БД, bcrypt для паролей

## Архитектура

```mermaid
graph TB
    subgraph Client["Браузер"]
        SPA["React SPA<br/>Vite + shadcn/ui"]
    end

    subgraph Proxy["Nginx (HTTPS)"]
        direction LR
        NF[":443 → :3000<br/>Frontend"]
        NB[":443 → :8000<br/>API"]
    end

    subgraph Backend["FastAPI Backend"]
        Auth["JWT Auth"]
        API["REST API"]
        Cache["Cache Manager"]
        Pool["psycopg2 Pool"]
        SSHClient["SSH Client"]
        Collector["Коллектор<br/>(asyncio, 10/30 мин)"]
        LocalPool["asyncpg Pool"]
    end

    subgraph Data["Удалённые серверы"]
        PG[("PostgreSQL<br/>серверы")]
        SSH["SSH<br/>серверы"]
    end

    subgraph Local["Локальное хранение"]
        LocalPG[("PostgresPro 17<br/>pam_stats")]
    end

    SPA -->|HTTPS| Proxy
    NF --> SPA
    NB --> API
    API --> Auth
    API --> Cache
    API --> Pool
    API --> SSHClient
    API -->|stats, audit| LocalPool
    Pool -->|psycopg2| PG
    SSHClient -->|paramiko| SSH
    Collector -->|psycopg2| PG
    Collector -->|paramiko| SSH
    Collector -->|asyncpg| LocalPG
    LocalPool -->|asyncpg| LocalPG
```

## Поток авторизации

```mermaid
sequenceDiagram
    participant B as Браузер
    participant F as FastAPI
    participant C as Cookie (httpOnly)
    participant S as localStorage

    B->>F: POST /token (login + password)
    F-->>B: access_token (JSON) + Set-Cookie: refresh_token
    B->>S: access_token
    F->>C: refresh_token (httpOnly, Secure, SameSite=Strict)

    loop Каждый запрос
        B->>F: API запрос + Authorization: Bearer
        F-->>B: Данные
    end

    Note over B: Access token истёк (401)
    B->>F: POST /refresh (cookie автоматически)
    F->>F: Ротация: старый refresh → blacklist
    F-->>B: Новый access_token + новый refresh cookie

    Note over B: За 5 мин до истечения
    B->>B: Модалка «Сессия истекает»
    alt Продолжить
        B->>F: POST /refresh
        F-->>B: Новый access_token
    else Выйти
        B->>F: POST /logout
        F->>F: Оба токена → blacklist
        F-->>B: Cookie удалена
    end
```

## Технологический стек

### Backend
| Технология | Версия | Назначение |
|-----------|--------|------------|
| Python | 3.13 | Среда выполнения |
| FastAPI | 0.129 | REST API фреймворк |
| Pydantic | 2.12 | Валидация данных |
| psycopg2 | 2.9 | PostgreSQL (удалённые серверы) |
| asyncpg | 0.31 | PostgreSQL (локальная БД pam_stats) |
| Paramiko | 3.5 | SSH клиент |
| PyJWT + bcrypt | 2.11 / 4.3 | Авторизация |
| cryptography | 46.0 | SSH-ключи (генерация, парсинг) |
| slowapi | 0.1.9 | Rate limiting (защита от brute force) |

### Frontend
| Технология | Версия | Назначение |
|-----------|--------|------------|
| React | 19.2 | UI фреймворк |
| Vite | 7.3 | Сборка и dev-сервер |
| Tailwind CSS | 4.2 | Utility-first CSS |
| shadcn/ui | 27 компонентов | UI-библиотека (Radix + Tailwind) |
| Chart.js | 4.5 | Графики временных рядов |
| React Router | 7.13 | SPA маршрутизация |
| axios | 1.13 | HTTP клиент с JWT interceptors |
| lucide-react | 0.575 | SVG иконки |

### Инфраструктура
| Технология | Назначение |
|-----------|------------|
| PostgreSQL 9.6+ | Целевые серверы мониторинга |
| PostgresPro 1C 17 | Локальная БД (статистика + аудит) |
| Nginx | Reverse proxy + SSL termination |
| systemd | Управление сервисами |

## Структура проекта

```
PostgreSQL-Activity-Monitor/
├── backend/                        # FastAPI REST API
│   ├── main.py                     # Точка входа
│   ├── requirements.txt            # Python зависимости
│   ├── pgmon-backend.service       # systemd сервис
│   ├── README.md                   # Документация backend
│   ├── USER_MANAGEMENT_API.md      # API управления пользователями
│   └── app/
│       ├── config.py               # Конфигурация (JWT, CORS, pools)
│       ├── api/                    # REST endpoints
│       │   ├── auth.py             # POST /token, /refresh, /logout
│       │   ├── servers.py          # CRUD /servers + test-ssh
│       │   ├── stats.py            # Статистика серверов и БД
│       │   ├── users.py            # CRUD /users (admin)
│       │   ├── ssh_keys.py         # CRUD /ssh-keys
│       │   ├── audit.py            # GET /audit/sessions (admin)
│       │   ├── logs.py             # GET /api/logs (admin)
│       │   └── health.py           # /api/health, /api/pools/status
│       ├── auth/                   # JWT авторизация
│       │   ├── blacklist.py        # In-memory token blacklist
│       │   ├── dependencies.py     # get_current_user (OAuth2)
│       │   └── utils.py            # access/refresh токены, пароли
│       ├── collector/              # Автосбор статистики (v3)
│       │   ├── scheduler.py       # asyncio loops: stats, sizes, db_info
│       │   └── tasks.py           # Логика сбора данных
│       ├── database/
│       │   ├── pool.py             # psycopg2 Pool (удалённые серверы)
│       │   └── local_db.py         # asyncpg Pool (локальная БД pam_stats)
│       ├── repositories/          # async CRUD (asyncpg + pgcrypto)
│       ├── models/                 # Pydantic v2 модели
│       │   ├── server.py           # Server
│       │   ├── user.py             # User, UserCreate, UserUpdate
│       │   ├── ssh_key.py          # SSHKey, SSHKeyCreate, SSHKeyImport
│       │   └── audit.py            # AuditEvent
│       ├── services/               # Бизнес-логика
│       │   ├── server.py           # Загрузка/сохранение серверов
│       │   ├── ssh.py              # SSH подключения, disk usage
│       │   ├── cache.py            # CacheManager (thread-safe, TTL)
│       │   ├── user_manager.py     # Пользователи (async, asyncpg)
│       │   ├── ssh_key_manager.py  # Генерация SSH ключей
│       │   ├── ssh_key_storage.py  # Хранение SSH ключей (async, pgcrypto)
│       │   ├── audit_logger.py     # Аудит сессий (asyncpg)
│       │   └── system_logger.py   # Системные логи (asyncpg)
│
├── frontend/                       # React SPA
│   ├── index.html                  # Точка входа
│   ├── vite.config.js              # Конфигурация Vite
│   ├── components.json             # Конфигурация shadcn/ui
│   ├── package.json                # Node.js зависимости
│   ├── README.md                   # Документация frontend
│   └── src/
│       ├── main.jsx                # Точка входа React
│       ├── App.jsx                 # Роутинг, sidebar layout, модалы сессии
│       ├── index.css               # Tailwind + CSS-переменные (Steel Blue)
│       ├── components/
│       │   ├── AppSidebar.jsx      # Боковая навигация
│       │   ├── CommandPalette.jsx  # Ctrl+K поиск
│       │   ├── ErrorBoundary.jsx   # Обработка ошибок React
│       │   ├── Login.jsx           # Авторизация
│       │   ├── ServerList.jsx      # Список серверов (главная)
│       │   ├── ServerDetails.jsx   # Детали сервера + анализ БД
│       │   ├── ServerEdit.jsx      # Редактирование сервера
│       │   ├── DatabaseDetails.jsx # Статистика БД + графики
│       │   ├── UserManagement.jsx  # Управление пользователями
│       │   ├── SSHKeyManagement.jsx# Управление SSH-ключами
│       │   ├── SessionAudit.jsx   # Аудит сессий (admin)
│       │   ├── SystemLogs.jsx    # Системные логи (admin)
│       │   ├── PageHeader.jsx      # Заголовок + breadcrumbs
│       │   ├── EmptyState.jsx      # Заглушка пустого состояния
│       │   ├── LoadingSpinner.jsx  # Индикатор загрузки
│       │   ├── ScrollToTop.jsx     # Кнопка «Наверх»
│       │   ├── skeletons/          # Skeleton-загрузка страниц
│       │   └── ui/                 # 27 shadcn/ui компонентов
│       ├── contexts/
│       │   ├── auth-context.jsx    # JWT lifecycle, cookie-based refresh
│       │   └── servers-context.jsx # Глобальный список серверов
│       ├── hooks/
│       │   ├── use-auth.js         # useAuth()
│       │   ├── use-servers.js      # useServers()
│       │   └── use-mobile.js       # useMobile() (responsive)
│       └── lib/
│           ├── api.js              # Axios + JWT interceptors + auto-refresh
│           ├── chart-config.js     # Chart.js: цвета, опции, градиенты
│           ├── constants.js        # Все константы приложения
│           ├── format.js           # Форматирование: bytes, uptime, даты
│           ├── validation.js       # Валидация: hostname, port
│           └── utils.js            # cn() для Tailwind классов
│
├── docs/
│   └── DESIGN_SYSTEM.md            # Дизайн-система проекта
│
├── .env                            # SECRET_KEY, ENCRYPTION_KEY
├── .gitignore
├── CLAUDE.md                       # Инструкции для Claude Code
├── LICENSE                         # MIT
└── README.md                       # Этот файл
```

## Установка

### Требования

- Linux (Debian / Ubuntu / Astra Linux)
- Python 3.10+ (рекомендуется 3.13)
- Node.js 20+
- PostgreSQL 9.6+ на целевых серверах
- Nginx (для HTTPS)

### 1. Клонирование

```bash
git clone https://github.com/wobujidao/PostgreSQL-Activity-Monitor.git
cd PostgreSQL-Activity-Monitor
```

### 2. Backend

```bash
cd backend
python3.13 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Локальная база данных

```bash
# Установите PostgreSQL (или PostgresPro) и создайте БД:
sudo -u postgres createuser pam
sudo -u postgres createdb -O pam pam_stats
sudo -u postgres psql -c "ALTER USER pam WITH PASSWORD 'pam';"
```

### 4. Конфигурация

```bash
# SECRET_KEY и ENCRYPTION_KEY
cat > .env << 'EOF'
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
ENCRYPTION_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
LOCAL_DB_DSN=postgresql://pam:pam@/pam_stats?host=/tmp
EOF
```

### 5. Первый запуск и создание администратора

При первом запуске backend автоматически создаёт все таблицы в БД `pam_stats`.

```bash
# Запустить backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000

# В другом терминале — создать администратора
source venv/bin/activate
python3 -c "
import asyncio, bcrypt, asyncpg
async def main():
    pool = await asyncpg.create_pool('postgresql://pam:pam@/pam_stats?host=/tmp')
    pw = bcrypt.hashpw(b'admin', bcrypt.gensalt()).decode()
    await pool.execute(
        'INSERT INTO users (login, password_hash, role) VALUES (\$1, \$2, \$3) ON CONFLICT DO NOTHING',
        'admin', pw, 'admin'
    )
    print('Администратор создан')
    await pool.close()
asyncio.run(main())
"
```

Серверы добавляются через веб-интерфейс или API.

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

# Frontend
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

    # Auth API
    location /token {
        proxy_pass http://127.0.0.1:8000/token;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Content-Type $http_content_type;
    }

    location /refresh {
        proxy_pass http://127.0.0.1:8000/refresh;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Cookie $http_cookie;
        proxy_set_header Origin $http_origin;
    }

    location /logout {
        proxy_pass http://127.0.0.1:8000/logout;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Cookie $http_cookie;
        proxy_set_header Authorization $http_authorization;
    }

    # Data API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
    }

    location ~ ^/(servers|users|ssh-keys|server_stats|audit|server/) {
        proxy_pass http://127.0.0.1:8000$request_uri;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
    }
}
```

## API

Все endpoints (кроме `/token` и `/api/health`) требуют JWT токен: `Authorization: Bearer <token>`

### Авторизация

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/token` | Логин: access token + refresh cookie |
| POST | `/refresh` | Обновление access token (по refresh cookie) |
| POST | `/logout` | Выход: blacklist токенов + удаление cookie |

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

### Пользователи (admin)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/users` | Список пользователей |
| POST | `/users` | Создать пользователя |
| GET | `/users/me` | Текущий пользователь |
| GET | `/users/{login}` | Информация о пользователе |
| PUT | `/users/{login}` | Обновить пользователя |
| DELETE | `/users/{login}` | Удалить пользователя |

### SSH-ключи (admin / operator)

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

### Аудит (admin)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/audit/sessions` | Журнал событий (с фильтрами и пагинацией) |
| GET | `/audit/sessions/stats` | Статистика: входы сегодня, уникальные за неделю |

### Системные логи (admin)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/logs` | Журнал системных событий (фильтры: level, source, даты, текст, пагинация) |
| GET | `/api/logs/stats` | Статистика логов по уровням |

### Служебные

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/health` | Состояние API (без авторизации) |
| GET | `/api/pools/status` | Статус connection pools |
| GET | `/docs` | Swagger UI |
| GET | `/redoc` | ReDoc |

## Конфигурация

### Файлы

| Файл | Описание |
|------|----------|
| `backend/.env` | SECRET_KEY, ENCRYPTION_KEY, LOCAL_DB_DSN |
| PostgreSQL `pam_stats` | Серверы, пользователи, SSH-ключи, статистика, аудит, системные логи |

### Параметры (`backend/app/config.py`)

| Параметр | Значение | Описание |
|----------|----------|----------|
| `SECRET_KEY` | из .env | Ключ для JWT |
| `TOKEN_EXPIRATION` | 60 мин | Время жизни access token |
| `REFRESH_TOKEN_EXPIRATION_DAYS` | 7 дней | Время жизни refresh token |
| `AUDIT_RETENTION_DAYS` | 90 дней | Хранение записей аудита |
| `SERVER_STATUS_CACHE_TTL` | 5 сек | TTL кэша статуса |
| `SSH_CACHE_TTL` | 30 сек | TTL кэша SSH |
| `LOCAL_DB_DSN` | из .env | DSN для локальной БД pam_stats |
| `COLLECT_INTERVAL` | 600 сек | Интервал сбора статистики |
| `SIZE_UPDATE_INTERVAL` | 1800 сек | Интервал обновления размеров |
| `RETENTION_MONTHS` | 12 | Хранить данные N месяцев |
| `LOGS_RETENTION_DAYS` | 30 дней | Хранение системных логов |
| `POOL_CONFIGS` | default/high_load | Пулы для удалённых серверов |
| `ALLOWED_ORIGINS` | list | CORS origins |

### Роли пользователей

```mermaid
graph LR
    Admin["admin"]
    Operator["operator"]
    Viewer["viewer"]

    Admin -->|Полный доступ| Servers["Серверы"]
    Admin -->|Полный доступ| Users["Пользователи"]
    Admin -->|Полный доступ| Keys["SSH-ключи"]
    Admin -->|Полный доступ| Audit["Аудит сессий"]
    Admin -->|Полный доступ| Logs["Системные логи"]

    Operator -->|Полный доступ| Servers
    Operator -.->|Нет доступа| Users
    Operator -->|Создание/импорт| Keys
    Operator -.->|Нет доступа| Audit
    Operator -.->|Нет доступа| Logs

    Viewer -->|Только чтение| Servers
    Viewer -.->|Нет доступа| Users
    Viewer -.->|Нет доступа| Keys
    Viewer -.->|Нет доступа| Audit
    Viewer -.->|Нет доступа| Logs
```

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

# Состояние API (без авторизации)
curl http://localhost:8000/api/health
```

Интерактивная документация: `http://localhost:8000/docs`

## Обслуживание

```bash
# Логи
sudo journalctl -u pgmon-backend -f
sudo journalctl -u pgmon-frontend -f

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

MIT License — см. файл [LICENSE](LICENSE).

## Автор

**Владислав Демидов** — [@wobujidao](https://github.com/wobujidao)
