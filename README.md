# PostgreSQL Activity Monitor

<div align="center">
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"/>
</div>

<div align="center">
  <h3>🚀 Профессиональная система мониторинга PostgreSQL серверов</h3>
  <p>Полнофункциональное решение для администраторов баз данных с веб-интерфейсом, REST API и исторической статистикой</p>
</div>

<div align="center">
  <img src="https://img.shields.io/github/license/wobujidao/PostgreSQL-Activity-Monitor?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/github/stars/wobujidao/PostgreSQL-Activity-Monitor?style=flat-square" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/wobujidao/PostgreSQL-Activity-Monitor?style=flat-square" alt="Forks"/>
  <img src="https://img.shields.io/github/issues/wobujidao/PostgreSQL-Activity-Monitor?style=flat-square" alt="Issues"/>
</div>

---

## 📋 Содержание

- [О проекте](#-о-проекте)
- [Возможности](#-возможности)
- [Архитектура](#-архитектура)
- [Быстрый старт](#-быстрый-старт)
- [Детальная установка](#-детальная-установка)
- [Конфигурация](#-конфигурация)
- [Использование](#-использование)
- [API документация](#-api-документация)
- [Разработка](#-разработка)
- [FAQ](#-faq)
- [Roadmap](#-roadmap)
- [Вклад в проект](#-вклад-в-проект)
- [Лицензия](#-лицензия)
- [Контакты](#-контакты)

## 🎯 О проекте

**PostgreSQL Activity Monitor** - это комплексное решение для мониторинга и анализа PostgreSQL серверов, разработанное специально для администраторов баз данных. Система предоставляет реальную картину происходящего на ваших серверах, помогает выявлять проблемы до того, как они станут критическими, и значительно упрощает ежедневную работу с множеством баз данных.

### Почему выбирают наше решение?

- **🎯 Создано DBA для DBA** - мы знаем, что действительно важно при администрировании
- **⚡ Высокая производительность** - оптимизировано для работы с сотнями серверов
- **📊 Глубокая аналитика** - от текущих запросов до исторических трендов
- **🔒 Безопасность** - шифрование паролей, JWT авторизация, аудит действий
- **🛠️ Простота развертывания** - работает из коробки с минимальной настройкой

## ✨ Возможности

### 🔍 Мониторинг в реальном времени
- **Активные запросы** с возможностью их завершения
- **Блокировки** и deadlocks с визуализацией
- **Активные соединения** с детализацией по пользователям и приложениям
- **Нагрузка на сервер** - CPU, память, I/O
- **Размеры баз данных** и таблиц с динамикой роста
- **Состояние репликации** для мастер-слейв конфигураций

### 📈 Историческая статистика
- **История нагрузки** с графиками за любой период
- **Топ запросов** по времени выполнения и частоте
- **Анализ роста БД** с прогнозированием
- **История блокировок** для выявления проблемных мест
- **Статистика по пользователям** и приложениям

### 🎛️ Управление и автоматизация
- **Централизованное управление** множеством серверов
- **Автоматический анализ** неактивных и проблемных БД
- **SSH мониторинг** дискового пространства
- **Экспорт отчетов** в CSV для дальнейшего анализа
- **Настраиваемые алерты** (в разработке)

### 🔐 Безопасность и контроль
- **JWT авторизация** с настраиваемым временем сессии
- **Ролевая модель** - admin, operator, viewer
- **Шифрование паролей** серверов с использованием Fernet
- **Аудит действий** пользователей
- **Безопасное хранение** конфиденциальных данных

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                        Веб-браузер                              │
│                    React SPA Application                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS/WSS
┌────────────────────────────▼────────────────────────────────────┐
│                      Nginx Reverse Proxy                        │
│                    (SSL termination, static files)              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      FastAPI Backend                            │
│  ┌─────────────┬──────────────┬─────────────┬───────────────┐  │
│  │   Auth      │   REST API   │  WebSocket  │   Services    │  │
│  │   (JWT)     │  Endpoints   │   Events    │  (Business)   │  │
│  └─────────────┴──────────────┴─────────────┴───────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Connection Pool Manager (per server)           │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────┬─────────────────┬──────────────┬──────────────┘
                 │                 │              │
         ┌───────▼──────┐  ┌──────▼──────┐  ┌───▼────┐
         │ PostgreSQL   │  │ PostgreSQL  │  │  SSH   │
         │  Server 1    │  │  Server 2   │  │ Hosts  │
         │  + stats_db  │  │ + stats_db  │  │        │
         └──────────────┘  └─────────────┘  └────────┘
```

### Технологический стек

#### Backend
- **FastAPI** - современный асинхронный веб-фреймворк
- **AuthX** - расширенная JWT авторизация
- **psycopg2** - драйвер PostgreSQL с поддержкой connection pooling
- **Paramiko** - SSH клиент для удаленного мониторинга
- **Pydantic** - валидация данных
- **APScheduler** - планировщик задач

#### Frontend
- **React 18** - UI библиотека
- **React Router** - маршрутизация
- **Axios** - HTTP клиент
- **Bootstrap 5** - CSS фреймворк
- **Chart.js** - графики и визуализация
- **React Select** - улучшенные селекты

#### Инфраструктура
- **PostgreSQL 9.6+** - целевые серверы для мониторинга
- **Python 3.7+** - язык backend
- **Node.js 14+** - для сборки frontend
- **Nginx** - reverse proxy (опционально)
- **Systemd** - управление сервисами

## 🚀 Быстрый старт

### Минимальные требования
- Linux/Unix сервер (Ubuntu 20.04+ рекомендуется)
- Python 3.7+
- PostgreSQL 9.6+ на целевых серверах
- 2GB RAM, 10GB свободного места на диске

### Установка за 5 минут

```bash
# 1. Клонируем репозиторий
git clone https://github.com/wobujidao/PostgreSQL-Activity-Monitor.git
cd PostgreSQL-Activity-Monitor

# 2. Запускаем скрипт установки
chmod +x install.sh
./install.sh

# 3. Следуем инструкциям мастера установки
```

После установки система будет доступна по адресу: `http://your-server:3000`

Логин по умолчанию: `admin` / `admin` (обязательно смените!)

## 📚 Детальная установка

### Шаг 1: Подготовка системы

```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Устанавливаем необходимые пакеты
sudo apt install -y python3 python3-pip python3-venv nodejs npm git nginx postgresql-client

# Создаем пользователя для сервиса
sudo useradd -m -s /bin/bash pgmonitor
sudo usermod -aG sudo pgmonitor
```

### Шаг 2: Установка Backend

```bash
# Переключаемся на пользователя pgmonitor
sudo su - pgmonitor

# Клонируем репозиторий
git clone https://github.com/wobujidao/PostgreSQL-Activity-Monitor.git
cd PostgreSQL-Activity-Monitor

# Устанавливаем backend зависимости
cd backend
pip3 install --user -r requirements.txt

# Создаем директории конфигурации
sudo mkdir -p /etc/pg_activity_monitor
sudo chown pgmonitor:pgmonitor /etc/pg_activity_monitor

# Генерируем ключ шифрования
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" | \
  sudo tee /etc/pg_activity_monitor/encryption_key.key

# Создаем конфигурацию серверов
cp config/servers.json.example /etc/pg_activity_monitor/servers.json
nano /etc/pg_activity_monitor/servers.json

# Создаем пользователей системы
python3 scripts/create_user.py
```

### Шаг 3: Установка Frontend

```bash
# Переходим в директорию frontend
cd ../frontend/pgmon-frontend

# Устанавливаем зависимости
npm install

# Собираем production build
npm run build

# Настраиваем nginx (опционально)
sudo cp ../../config/nginx/pgmon.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/pgmon.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Шаг 4: Настройка systemd сервисов

```bash
# Backend сервис
sudo cp backend/pgmon-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable pgmon-backend
sudo systemctl start pgmon-backend

# Frontend сервис
sudo cp frontend/pgmon-frontend.service /etc/systemd/system/
sudo systemctl enable pgmon-frontend
sudo systemctl start pgmon-frontend

# Проверяем статус
sudo systemctl status pgmon-backend pgmon-frontend
```

### Шаг 5: Настройка сбора статистики (опционально)

```bash
# Устанавливаем скрипты сбора статистики
sudo cp stats_db/create_stats_db.sh /usr/local/bin/
sudo cp stats_db/stats_collection.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/*.sh

# Создаем базу stats_db на каждом сервере
/usr/local/bin/create_stats_db.sh

# Добавляем в cron
sudo crontab -e
# Добавляем строку:
# */5 * * * * /usr/local/bin/stats_collection.sh >> /var/log/pg_stats.log 2>&1
```

## ⚙️ Конфигурация

### Основные конфигурационные файлы

#### `/etc/pg_activity_monitor/servers.json`
```json
[
  {
    "name": "production-master",
    "host": "10.0.1.10",
    "port": 5432,
    "user": "monitoring_user",
    "password": "encrypted_password_here",
    "maintenance_db": "postgres",
    "ssh_user": "postgres",
    "ssh_password": "encrypted_ssh_password",
    "stats_enabled": true,
    "stats_db": "stats_db"
  }
]
```

#### `/etc/pg_activity_monitor/users.json`
```json
[
  {
    "login": "admin",
    "password": "$2b$12$hash_here",
    "role": "admin",
    "email": "admin@example.com"
  }
]
```

### Переменные окружения

Создайте файл `.env` в корне backend:
```bash
# JWT Secret
SECRET_KEY=your-secret-key-here

# Уровень логирования
LOG_LEVEL=INFO

# Настройки кэширования (секунды)
SERVER_STATUS_CACHE_TTL=5
SSH_CACHE_TTL=30

# Размер пула соединений
DB_POOL_MIN_SIZE=1
DB_POOL_MAX_SIZE=10
```

### Настройка PostgreSQL для мониторинга

На каждом PostgreSQL сервере создайте пользователя для мониторинга:

```sql
-- Создаем роль для мониторинга
CREATE ROLE monitoring_user WITH LOGIN PASSWORD 'secure_password';

-- Даем необходимые права
GRANT CONNECT ON DATABASE postgres TO monitoring_user;
GRANT pg_monitor TO monitoring_user;  -- PostgreSQL 10+

-- Для старых версий PostgreSQL
GRANT SELECT ON pg_stat_activity TO monitoring_user;
GRANT SELECT ON pg_stat_database TO monitoring_user;
GRANT SELECT ON pg_stat_user_tables TO monitoring_user;
GRANT SELECT ON pg_locks TO monitoring_user;
```

Обновите `pg_hba.conf`:
```
# Разрешаем подключение для мониторинга
host    all    monitoring_user    monitor_server_ip/32    md5
```

## 📖 Использование

### Веб-интерфейс

1. **Авторизация**
   - Откройте `http://your-server:3000`
   - Введите логин и пароль
   - Система автоматически обновляет токен при истечении

2. **Главная страница**
   - Обзор всех серверов с их статусом
   - Цветовая индикация: � OK, � Warning, 🔴 Error
   - Клик на сервер открывает детальную информацию

3. **Страница сервера**
   - **Вкладка "Обзор"**: список баз данных с метриками
   - **Вкладка "Анализ активности"**: автоматический поиск проблем
   - **Вкладка "Настройки"**: критерии анализа

4. **Работа с базами данных**
   - Клик на БД показывает активные запросы
   - Возможность завершить проблемные запросы
   - Экспорт данных в CSV

### REST API

Все endpoints требуют JWT токен в заголовке `Authorization: Bearer <token>`

```bash
# Получение токена
curl -X POST http://localhost:8000/token \
  -d "username=admin&password=password"

# Список серверов
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/servers

# Статистика сервера
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/server/production-master/stats

# Активные запросы
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/server_stats/production-master
```

Полная документация API доступна по адресу: `http://localhost:8000/docs`

## 📡 API документация

### Основные endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/token` | Получение JWT токена |
| GET | `/servers` | Список всех серверов |
| GET | `/server_stats/{server_name}` | Активные запросы |
| GET | `/server/{server_name}/stats` | Историческая статистика |
| GET | `/server/{server_name}/db/{db_name}` | Информация о БД |
| GET | `/server/{server_name}/db/{db_name}/stats` | Статистика БД |
| GET | `/api/pools/status` | Статус connection pools |
| GET | `/api/health` | Проверка здоровья API |

### Примеры использования

См. [API Examples](docs/api-examples.md) для подробных примеров

## 🛠️ Разработка

### Структура проекта
```
PostgreSQL-Activity-Monitor/
├── backend/                 # Backend API
│   ├── app/                # Основное приложение
│   │   ├── api/           # REST endpoints
│   │   ├── auth/          # Авторизация
│   │   ├── database/      # Работа с БД
│   │   ├── models/        # Модели данных
│   │   ├── services/      # Бизнес-логика
│   │   └── utils/         # Утилиты
│   ├── tests/             # Тесты
│   └── requirements.txt   # Зависимости
├── frontend/              # React приложение
│   └── pgmon-frontend/
│       ├── src/
│       │   ├── components/  # React компоненты
│       │   ├── services/    # API сервисы
│       │   └── styles/      # CSS стили
│       └── package.json
├── stats_db/              # Модуль статистики
│   ├── create_stats_db.sh
│   └── stats_collection.sh
├── docs/                  # Документация
├── config/               # Примеры конфигураций
└── scripts/              # Вспомогательные скрипты
```

### Настройка окружения разработки

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Запуск в режиме разработки
LOG_LEVEL=DEBUG uvicorn app.main:app --reload

# Frontend
cd frontend/pgmon-frontend
npm install
npm start
```

### Запуск тестов

```bash
# Backend тесты
cd backend
pytest tests/ -v

# Frontend тесты
cd frontend/pgmon-frontend
npm test

# E2E тесты
npm run cypress
```

### Code Style

- **Python**: Black, flake8, mypy
- **JavaScript**: ESLint, Prettier
- **Commits**: Conventional Commits

```bash
# Форматирование Python
black app/

# Проверка JavaScript
npm run lint
```

## ❓ FAQ

**Q: Как добавить новый сервер?**
A: Отредактируйте `/etc/pg_activity_monitor/servers.json` и перезапустите backend сервис.

**Q: Как изменить порт веб-интерфейса?**
A: Измените `PORT` в `frontend/pgmon-frontend/.env` и перезапустите frontend.

**Q: Почему не отображается историческая статистика?**
A: Убедитесь, что настроен сбор статистики через cron и база `stats_db` создана.

**Q: Как обновить систему?**
A: 
```bash
git pull
cd backend && pip install -r requirements.txt
cd ../frontend/pgmon-frontend && npm install && npm run build
sudo systemctl restart pgmon-backend pgmon-frontend
```

**Q: Можно ли использовать с PostgreSQL в Docker?**
A: Да, укажите соответствующий host и port в конфигурации серверов.

## 🗺️ Roadmap

### ✅ Выполнено
- Базовый мониторинг серверов
- JWT авторизация
- Историческая статистика
- Анализ активности БД
- Connection pooling
- Модульная архитектура

### 🚧 В разработке
- WebSocket для real-time обновлений
- Управление пользователями через UI
- Интеграция с AuthX
- Настраиваемые дашборды
- Мобильное приложение

### 📋 Планируется
- Система алертов и уведомлений
- Интеграция с Grafana
- Автоматическое выполнение скриптов
- Резервное копирование конфигураций
- Поддержка PostgreSQL 16+
- Multi-tenancy
- API для интеграций
- Плагины расширения

## 🤝 Вклад в проект

Мы приветствуем любой вклад в развитие проекта!

### Как помочь

1. **🐛 Сообщайте о багах**
   - Используйте [GitHub Issues](https://github.com/wobujidao/PostgreSQL-Activity-Monitor/issues)
   - Приложите логи и шаги воспроизведения

2. **💡 Предлагайте улучшения**
   - Опишите идею в Issues
   - Обсудите с сообществом

3. **🔧 Отправляйте Pull Requests**
   ```bash
   # 1. Fork репозитория
   # 2. Создайте branch
   git checkout -b feature/amazing-feature
   
   # 3. Commit изменения
   git commit -m 'feat: add amazing feature'
   
   # 4. Push в branch
   git push origin feature/amazing-feature
   
   # 5. Откройте Pull Request
   ```

### Стандарты кода

- Следуйте PEP 8 для Python
- Используйте ESLint для JavaScript
- Пишите тесты для новой функциональности
- Документируйте API изменения
- Используйте Conventional Commits

### Тестирование

Перед отправкой PR убедитесь:
- ✅ Все тесты проходят
- ✅ Код отформатирован
- ✅ Нет ESLint/flake8 ошибок
- ✅ Добавлена документация

## 📄 Лицензия

Этот проект лицензирован под MIT License - см. файл [LICENSE](LICENSE) для деталей.

### Используемые библиотеки

Проект использует следующие open source библиотеки:
- FastAPI (MIT License)
- React (MIT License)
- Bootstrap (MIT License)
- psycopg2 (LGPL License)
- AuthX (MIT License)
- И многие другие замечательные проекты

## 📞 Контакты

### Автор
**Владислав Демидов**
- 📧 Email: demidov_vlad@mail.ru
- 💼 GitHub: [@wobujidao](https://github.com/wobujidao)

### Сообщество
- 🐛 [GitHub Issues](https://github.com/wobujidao/PostgreSQL-Activity-Monitor/issues) - баги и предложения
- 💬 [Discussions](https://github.com/wobujidao/PostgreSQL-Activity-Monitor/discussions) - обсуждения и вопросы
- 📖 [Wiki](https://github.com/wobujidao/PostgreSQL-Activity-Monitor/wiki) - дополнительная документация

### Поддержка проекта

Если проект оказался полезным:
- ⭐ Поставьте звезду на GitHub
- 🔄 Расскажите коллегам
- 🤝 Внесите свой вклад
- ☕ [Buy me a coffee](https://www.buymeacoffee.com/wobujidao)

---

<div align="center">
  <h3>🌟 Спасибо за использование PostgreSQL Activity Monitor! 🌟</h3>
  <p>Сделано с ❤️ для сообщества PostgreSQL администраторов</p>
  <br>
  <p>⭐ Если проект полезен, поставьте звезду на GitHub! ⭐</p>
</div>
