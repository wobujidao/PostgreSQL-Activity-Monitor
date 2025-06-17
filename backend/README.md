# PostgreSQL Activity Monitor - Backend API

[![Python](https://img.shields.io/badge/python-3.7+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.68+-green.svg)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Высокопроизводительный REST API для мониторинга PostgreSQL серверов с модульной архитектурой, поддержкой connection pooling, кэширования и исторической статистики.

## 📋 Содержание

- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Структура проекта](#-структура-проекта)
- [Требования](#-требования)
- [Установка](#-установка)
- [Конфигурация](#️-конфигурация)
- [API Endpoints](#-api-endpoints)
- [Разработка](#-разработка)
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
- ✅ **Модульная архитектура** - чистая структура кода для масштабирования

### Оптимизации производительности
- ⚡ **Connection Pooling** - переиспользование соединений (до 100x быстрее)
- ⚡ **Двухуровневое кэширование** - статус серверов (5с) и SSH данные (30с)
- ⚡ **Настраиваемое логирование** - DEBUG/INFO/WARNING/ERROR
- ⚡ **Graceful shutdown** - корректное завершение работы

## 🏗️ Архитектура

Проект использует модульную архитектуру с четким разделением ответственности:

- **API Layer** - REST endpoints и маршрутизация
- **Service Layer** - бизнес-логика и обработка данных
- **Data Layer** - работа с БД и внешними системами
- **Auth Layer** - авторизация и безопасность
- **Utils Layer** - вспомогательные функции

## 📁 Структура проекта

```
backend/
├── app/                      # Основное приложение
│   ├── __init__.py
│   ├── main.py              # FastAPI приложение и конфигурация
│   ├── config.py            # Централизованная конфигурация
│   ├── api/                 # API endpoints
│   │   ├── __init__.py
│   │   ├── auth.py          # Авторизация (/token)
│   │   ├── servers.py       # Управление серверами (/servers)
│   │   ├── stats.py         # Статистика (/server/*/stats)
│   │   └── health.py        # Служебные endpoints (/api/health)
│   ├── auth/                # Авторизация и безопасность
│   │   ├── __init__.py
│   │   ├── dependencies.py  # FastAPI зависимости (get_current_user)
│   │   └── utils.py         # JWT токены, хэширование паролей
│   ├── database/            # Работа с базами данных
│   │   ├── __init__.py
│   │   └── pool.py          # Connection pooling (DatabasePool)
│   ├── models/              # Pydantic модели
│   │   ├── __init__.py
│   │   ├── server.py        # Модель сервера
│   │   └── user.py          # Модель пользователя
│   ├── services/            # Бизнес-логика
│   │   ├── __init__.py
│   │   ├── cache.py         # Менеджер кэширования
│   │   ├── server.py        # Логика работы с серверами
│   │   └── ssh.py           # SSH подключения и мониторинг
│   └── utils/               # Утилиты
│       ├── __init__.py
│       └── crypto.py        # Шифрование паролей
├── main.py                  # Точка входа для uvicorn
├── requirements.txt         # Python зависимости
├── README.md               # Этот файл
└── pgmon-backend.service   # Systemd сервис файл
```

## 📋 Требования

- **Python 3.7+** (рекомендуется 3.8+)
- **PostgreSQL 9.6+**
- **Linux/Unix** система
- **SSH доступ** к серверам для мониторинга дисков

### Python библиотеки
```
fastapi==0.111.0
uvicorn==0.30.1
psycopg2-binary==2.9.9
paramiko==3.4.0
cryptography==42.0.8
bcrypt==4.1.3
pyjwt==2.8.0
python-dotenv==1.0.1
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
    "password": "$2b$12$YourGeneratedHashHere",
    "role": "admin"
  }
]
```

## ⚙️ Конфигурация

### Основные настройки (`app/config.py`)

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `SECRET_KEY` | Ключ для JWT токенов | Из переменной окружения |
| `TOKEN_EXPIRATION` | Время жизни токена (минут) | 60 |
| `LOG_LEVEL` | Уровень логирования | INFO |
| `SERVER_STATUS_CACHE_TTL` | TTL кэша статуса серверов (сек) | 5 |
| `SSH_CACHE_TTL` | TTL кэша SSH данных (сек) | 30 |

### Переменные окружения

Создайте файл `.env` в корне backend:
```bash
SECRET_KEY=your-secret-key-here
LOG_LEVEL=INFO
```

### Настройки пулов подключений

В `app/config.py` можно настроить размеры пулов:
```python
POOL_CONFIGS = {
    "default": {"minconn": 1, "maxconn": 5},
    "stats_db": {"minconn": 2, "maxconn": 10},
    "high_load": {"minconn": 5, "maxconn": 20}
}
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

#### `POST /servers`
Добавление нового сервера.

#### `PUT /servers/{server_name}`
Обновление конфигурации сервера.

#### `DELETE /servers/{server_name}`
Удаление сервера.

### Статистика

#### `GET /server_stats/{server_name}`
Текущие активные запросы на сервере.

#### `GET /server/{server_name}/stats`
Историческая статистика сервера.

#### `GET /server/{server_name}/db/{db_name}`
Краткая информация о базе данных.

#### `GET /server/{server_name}/db/{db_name}/stats`
Детальная статистика базы данных за период.

### Служебные

#### `GET /api/pools/status`
Статус всех connection pools.

#### `GET /api/health`
Проверка здоровья API.

#### `GET /docs`
Swagger документация.

#### `GET /redoc`
ReDoc документация.

## 💻 Разработка

### Запуск в режиме разработки
```bash
# С автоматической перезагрузкой
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# С отладочными логами
LOG_LEVEL=DEBUG uvicorn app.main:app --reload
```

### Запуск тестов
```bash
# Установка зависимостей для тестов
pip install pytest pytest-asyncio httpx

# Запуск тестов
pytest
```

### Линтинг и форматирование
```bash
# Установка инструментов
pip install black flake8 mypy

# Форматирование
black app/

# Проверка стиля
flake8 app/

# Проверка типов
mypy app/
```

## 🚀 Production deployment

### Использование systemd

1. Скопируйте файл сервиса:
```bash
sudo cp pgmon-backend.service /etc/systemd/system/
```

2. Обновите пути в файле сервиса под вашу систему.

3. Запустите сервис:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pgmon-backend
sudo systemctl start pgmon-backend
```

### Использование Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Использование Gunicorn

```bash
pip install gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
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

## 🔍 Мониторинг и отладка

### Просмотр логов
```bash
# Systemd логи
sudo journalctl -u pgmon-backend -f

# Docker логи
docker logs -f pgmon-backend
```

### Метрики производительности
- Количество активных пулов: `/api/pools/status`
- Время ответа API: проверяйте логи с уровнем DEBUG
- Использование памяти: `systemctl status pgmon-backend`

## 🔒 Безопасность

### Рекомендации
1. **Используйте сильные пароли** для всех учетных записей
2. **Регулярно обновляйте** ключ шифрования
3. **Ограничьте доступ** к конфигурационным файлам (chmod 600)
4. **Используйте HTTPS** в production (nginx reverse proxy)
5. **Настройте firewall** для ограничения доступа к портам
6. **Регулярно обновляйте** зависимости

### Настройка HTTPS с nginx
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch (`git checkout -b feature/amazing`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing`)
5. Создайте Pull Request

## 📄 Лицензия

MIT License - см. файл [LICENSE](../LICENSE)

## 📞 Поддержка

- GitHub Issues: [создать issue](https://github.com/wobujidao/PostgreSQL-Activity-Monitor/issues)
- Email: demidov_vlad@mail.ru

---

⭐ Если проект полезен, поставьте звезду на GitHub!
