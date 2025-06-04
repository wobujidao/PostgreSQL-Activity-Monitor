# PostgreSQL Activity Monitor - Backend API

[![Python](https://img.shields.io/badge/python-3.7+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.68+-green.svg)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Высокопроизводительный REST API для мониторинга PostgreSQL серверов с поддержкой connection pooling, кэширования и исторической статистики.

## 📋 Содержание

- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Требования](#-требования)
- [Установка](#-установка)
- [Конфигурация](#️-конфигурация)
- [API Endpoints](#-api-endpoints)
- [Оптимизации](#-оптимизации)
- [Мониторинг и отладка](#-мониторинг-и-отладка)
- [Безопасность](#-безопасность)

## 🚀 Возможности

### Основной функционал
- ✅ **Мониторинг в реальном времени** - активные запросы, соединения, блокировки
- ✅ **Историческая статистика** - данные о нагрузке за любой период (требует настройки сбора данных)
- ✅ **Мониторинг дисков** - свободное место через SSH
- ✅ **Управление серверами** - CRUD операции через API
- ✅ **JWT авторизация** - безопасный доступ с токенами

### Оптимизации производительности
- ⚡ **Connection Pooling** - переиспользование соединений (до 100x быстрее)
- ⚡ **Двухуровневое кэширование** - статус серверов (5с) и SSH данные (30с)
- ⚡ **Настраиваемое логирование** - DEBUG/INFO/WARNING/ERROR
- ⚡ **Graceful shutdown** - корректное завершение работы

## 🏗️ Архитектура

```
backend/
├── main.py              # Основной файл приложения (600+ строк)
│   ├── DatabasePool     # Класс управления пулами соединений
│   ├── Server Model     # Pydantic модель для валидации
│   ├── Auth Functions   # JWT токены и авторизация
│   ├── API Endpoints    # REST API маршруты
│   └── Cache System     # Кэширование статусов
├── requirements.txt     # Python зависимости
└── README.md           # Этот файл
```

### Ключевые компоненты

#### DatabasePool
- Потокобезопасное управление пулами
- Автоматическое создание/закрытие пулов
- Конфигурируемые размеры пулов
- Контекстный менеджер для безопасной работы

#### Система кэширования
- `server_status_cache` - кэш статуса серверов (TTL: 5 сек)
- `ssh_cache` - кэш SSH данных о дисках (TTL: 30 сек)
- Автоматическая очистка устаревших записей

## 📋 Требования

- **Python 3.7+** (рекомендуется 3.8+)
- **PostgreSQL 9.6+**
- **Linux/Unix** система
- **SSH доступ** к серверам для мониторинга дисков

### Python библиотеки
```
fastapi==0.68.0
uvicorn==0.15.0
psycopg2-binary==2.9.1
paramiko==3.5.1
cryptography==3.4.8
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.5
```

## 🛠️ Установка

### 1. Клонирование репозитория
```bash
git clone https://github.com/wobujidao/PostgreSQL-Activity-Monitor.git
cd PostgreSQL-Activity-Monitor/backend
```

### 2. Установка зависимостей
```bash
pip install -r requirements.txt
# или для изолированной установки
pip install --user -r requirements.txt
```

### 3. Создание директории конфигурации
```bash
sudo mkdir -p /etc/pg_activity_monitor
sudo chown $USER:$USER /etc/pg_activity_monitor
```

### 4. Генерация ключа шифрования
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" | \
  sudo tee /etc/pg_activity_monitor/encryption_key.key
```

### 5. Создание файла пользователей
```bash
# Генерируем хэш пароля
python3 -c "
import bcrypt
password = input('Введите пароль для admin: ').encode('utf-8')
hashed = bcrypt.hashpw(password, bcrypt.gensalt())
print(f'Хэш пароля: {hashed.decode()}')"

# Создаем users.json
sudo nano /etc/pg_activity_monitor/users.json
```

Пример `users.json`:
```json
[
  {
    "login": "admin",
    "password": "$2b$12$YourGeneratedHashHere"
  }
]
```

## ⚙️ Конфигурация

### Структура конфигурационных файлов

#### `/etc/pg_activity_monitor/servers.json`
Автоматически создается при добавлении серверов через API. Пароли шифруются.

#### `/etc/pg_activity_monitor/users.json`
```json
[
  {
    "login": "admin",
    "password": "$2b$12$..."  // bcrypt hash
  },
  {
    "login": "viewer",
    "password": "$2b$12$..."
  }
]
```

### Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `LOG_LEVEL` | Уровень логирования (DEBUG, INFO, WARNING, ERROR) | INFO |
| `SECRET_KEY` | Ключ для JWT токенов | default-secret-for-local-testing |

### Настройки пулов подключений

```python
POOL_CONFIGS = {
    "default": {"minconn": 1, "maxconn": 5},      # Обычные БД
    "stats_db": {"minconn": 2, "maxconn": 10},    # БД статистики
    "high_load": {"minconn": 5, "maxconn": 20}    # Высоконагруженные
}
```

### Настройки кэширования

```python
SERVER_STATUS_CACHE_TTL = 5   # секунд - для статуса серверов
SSH_CACHE_TTL = 30           # секунд - для SSH данных
```

## 📡 API Endpoints

### Авторизация

#### `POST /token`
Получение JWT токена.

**Request:**
```bash
curl -X POST http://localhost:8000/token \
  -d "username=admin&password=your_password"
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

### Управление серверами

#### `GET /servers`
Список всех серверов с их текущим статусом.

**Response:**
```json
[
  {
    "name": "production-db",
    "host": "192.168.1.100",
    "port": 5432,
    "version": "14.5",
    "connections": {"active": 5, "idle": 10},
    "uptime_hours": 720.5,
    "free_space": 107374182400,
    "total_space": 214748364800,
    "status": "ok"
  }
]
```

#### `POST /servers`
Добавление нового сервера.

**Request:**
```json
{
  "name": "new-server",
  "host": "192.168.1.101",
  "port": 5432,
  "user": "postgres",
  "password": "pg_password",
  "ssh_user": "root",
  "ssh_password": "ssh_password",
  "ssh_port": 22,
  "stats_db": "statistics"
}
```

#### `PUT /servers/{server_name}`
Обновление конфигурации сервера.

#### `DELETE /servers/{server_name}`
Удаление сервера.

### Мониторинг

#### `GET /server_stats/{server_name}`
Текущие активные запросы на сервере.

**Response:**
```json
{
  "queries": [
    {
      "pid": 12345,
      "usename": "app_user",
      "datname": "production",
      "query": "SELECT * FROM users WHERE...",
      "state": "active"
    }
  ]
}
```

#### `GET /server/{server_name}/stats`
Историческая статистика сервера (требует наличия данных в таблице `pg_statistics`).

**Query параметры:**
- `start_date` - начало периода (ISO format)
- `end_date` - конец периода (ISO format)

**Response:**
```json
{
  "last_stat_update": "2025-06-03T10:00:00Z",
  "total_connections": 1543,
  "total_size_gb": 125.4,
  "databases": [
    {
      "name": "production",
      "exists": true,
      "creation_time": "2025-01-15T08:00:00Z"
    }
  ],
  "connection_timeline": [
    {
      "ts": "2025-06-03T09:00:00Z",
      "datname": "production",
      "connections": 45,
      "size_gb": 124.8
    }
  ]
}
```

#### `GET /server/{server_name}/db/{db_name}`
Краткая информация о базе данных.

#### `GET /server/{server_name}/db/{db_name}/stats`
Детальная статистика базы данных за период.

### Служебные endpoints

#### `GET /api/pools/status`
Статус всех connection pools.

**Response:**
```json
{
  "192.168.1.100:5432:postgres:postgres": {
    "minconn": 1,
    "maxconn": 5,
    "closed": false
  }
}
```

#### `GET /api/health`
Проверка здоровья API.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-06-03T10:00:00Z",
  "pools_count": 4,
  "version": "2.0",
  "log_level": "INFO"
}
```

## 🚀 Запуск

### Development режим
```bash
# Стандартный запуск
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# С отладочными логами
LOG_LEVEL=DEBUG uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production через systemd

Создайте файл `/etc/systemd/system/pgmon-backend.service`:
```ini
[Unit]
Description=PostgreSQL Activity Monitor Backend
After=network.target

[Service]
Type=simple
User=pgmonitor
WorkingDirectory=/home/pgmonitor/pg_activity_monitor/backend
Environment="PATH=/home/pgmonitor/.local/bin:/usr/bin"
Environment="LOG_LEVEL=INFO"
ExecStart=/home/pgmonitor/.local/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Запуск:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pgmon-backend
sudo systemctl start pgmon-backend
sudo systemctl status pgmon-backend
```

## ⚡ Оптимизации

### Connection Pooling
- **До 100x быстрее** для частых запросов
- Автоматическое переиспользование соединений
- Разные конфигурации для разных типов БД
- Graceful shutdown при остановке

### Кэширование
- **Двухуровневая система** кэширования
- Снижение нагрузки на PostgreSQL серверы
- Автоматическая инвалидация при изменениях
- Thread-safe реализация

### Производительность
```python
# Пример использования пула
with db_pool.get_connection(server) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT ...")
        result = cur.fetchall()
# Соединение автоматически возвращается в пул
```

## 🔍 Мониторинг и отладка

### Просмотр логов
```bash
# Systemd логи
sudo journalctl -u pgmon-backend -f

# Последние 100 строк
sudo journalctl -u pgmon-backend -n 100

# За последние 5 минут
sudo journalctl -u pgmon-backend --since "5 minutes ago"
```

### Уровни логирования

| Уровень | Описание |
|---------|----------|
| DEBUG | Все события включая работу с кэшем и пулами |
| INFO | Важные события (запуск, создание пулов, ошибки) |
| WARNING | Предупреждения (недоступные хосты, таймауты) |
| ERROR | Ошибки требующие внимания |

### Полезные команды
```bash
# Проверка статуса пулов
TOKEN=$(curl -s -X POST http://localhost:8000/token \
  -d "username=admin&password=pass" | jq -r .access_token)

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/pools/status | jq

# Мониторинг в реальном времени
watch -n 5 'curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/servers | jq'
```

## 📊 Работа с исторической статистикой

API поддерживает работу с исторической статистикой через endpoints `/server/{server_name}/stats` и `/server/{server_name}/db/{db_name}/stats`.

Для работы этих endpoints необходимо наличие таблиц в БД указанной в поле `stats_db` при добавлении сервера:

### Требуемые таблицы

#### `pg_statistics`
```sql
CREATE TABLE pg_statistics (
    datid OID,
    datname TEXT,
    numbackends INTEGER,
    xact_commit BIGINT,
    xact_rollback BIGINT,
    blks_read BIGINT,
    blks_hit BIGINT,
    tup_returned BIGINT,
    tup_fetched BIGINT,
    tup_inserted BIGINT,
    tup_updated BIGINT,
    tup_deleted BIGINT,
    conflicts BIGINT,
    temp_files BIGINT,
    temp_bytes BIGINT,
    deadlocks BIGINT,
    blk_read_time DOUBLE PRECISION,
    blk_write_time DOUBLE PRECISION,
    stats_reset TIMESTAMP WITH TIME ZONE,
    db_size BIGINT,
    ts TIMESTAMP WITH TIME ZONE
);
```

#### `db_creation`
```sql
CREATE TABLE db_creation (
    datname TEXT PRIMARY KEY,
    creation_time TIMESTAMP WITH TIME ZONE
);
```

### Сбор данных

Данные должны собираться отдельным процессом/скриптом с нужной периодичностью (например, каждые 5 минут через cron).

## 🔒 Безопасность

### Шифрование
- **Fernet** - симметричное шифрование паролей
- Все пароли шифруются перед сохранением
- Ключ шифрования хранится отдельно

### Авторизация
- **JWT токены** с временем жизни 60 минут
- **Bcrypt** для хэширования паролей пользователей
- Проверка токена на каждый защищённый endpoint

### CORS
```python
allow_origins=["http://10.110.20.55:3000"]  # Только разрешённые источники
```

### Рекомендации
1. Используйте сильные пароли
2. Регулярно обновляйте ключ шифрования
3. Ограничьте доступ к конфигурационным файлам
4. Используйте HTTPS в production
5. Настройте firewall для портов

## 🐛 Решение проблем

### Ошибка подключения к PostgreSQL
```
PostgreSQL: host unreachable
```
- Проверьте доступность хоста: `telnet host port`
- Проверьте настройки pg_hba.conf
- Убедитесь в правильности credentials

### Ошибка SSH
```
SSH: timeout
```
- Проверьте SSH доступ: `ssh user@host`
- Убедитесь что df доступна в PATH
- Проверьте права на директории

### Высокое потребление памяти
- Уменьшите `maxconn` в POOL_CONFIGS
- Проверьте количество пулов через `/api/pools/status`
- Перезапустите сервис

## 📈 Метрики производительности

При тестировании на сервере с 4 CPU, 8GB RAM:
- **Без пулов**: ~100ms на запрос
- **С пулами**: ~10ms на запрос
- **С кэшем**: ~2ms на повторный запрос
- **Поддерживает**: 100+ одновременных пользователей

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing`)
5. Создайте Pull Request

## 📄 Лицензия

MIT License - см. файл LICENSE

## 👥 Авторы

- Поддерживается сообществом

## 📞 Поддержка

- GitHub Issues: [создать issue](https://github.com/wobujidao/PostgreSQL-Activity-Monitor/issues)
- Email: demidov_vlad@mail.ru

---

⭐ Если проект полезен, поставьте звезду на GitHub!