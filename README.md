# PostgreSQL Activity Monitor

## Описание

**PostgreSQL Activity Monitor** — это веб-инструмент для мониторинга активности серверов PostgreSQL. Он предоставляет удобный интерфейс для отслеживания состояния серверов, активности баз данных, статистики подключений и размеров баз данных с визуализацией данных через графики. Проект состоит из бэкенда на Python (FastAPI) и фронтенда на React.

## Технологии

- **Бэкенд:** Python 3.7+, FastAPI, bcrypt, psycopg2, paramiko, cryptography (fernet)
- **Фронтенд:** React, React Router, Axios, React-Bootstrap, Chart.js, react-chartjs-2, react-datepicker
- **Запуск:** Node.js 23.9.0, NPM, serve для фронтенда, uvicorn для бэкенда
- **Управление:** systemd для бэкенда и фронтенда
- **Хранение секретов:** .env для конфиденциальных данных

## Требования

- **Сервер:** Linux (например, Ubuntu)
- **Python:** 3.7+
- **Node.js:** 23.9.0 (рекомендуется использовать nvm)
- **PostgreSQL:** Доступ к серверам PostgreSQL для мониторинга
- **SSH:** Доступ к серверам для получения данных о свободном месте

## Установка и запуск

### 1. Клонирование репозитория

```bash
git clone https://github.com/wobujidao/PostgreSQL-Activity-Monitor.git
cd PostgreSQL-Activity-Monitor
```

### 2. Настройка бэкенда

#### Установка зависимостей

```bash
cd backend
pip3 install -r requirements.txt
```

Если `requirements.txt` отсутствует:

```bash
pip3 install fastapi uvicorn psycopg2-binary bcrypt pyjwt cryptography paramiko
```

#### Настройка `.env`

```bash
echo "SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" > .env
```

Пример `.env`:
```text
SECRET_KEY=jmrBBKeDSqHFDgDRePS8nLHo71EfhDtC2RjmU_HhpxU
```
Этот ключ используется для подписи JWT-токенов.

#### Конфигурация серверов и пользователей

Создай директорию конфигурации:

```bash
sudo mkdir -p /etc/pg_activity_monitor
```

Пример `users.json`:
```json
[
  {"login": "admin", "password": "$2b$12$vnHuQ0Do5lL4KIFjQpEFzeo.oZX5.w0/PCzrBE/0uSE2B/pLV5GZS", "role": "admin"}
]
```

Пример `servers.json` (пароли зашифрованы fernet):
```json
[
  {
    "name": "s00-dbs06",
    "host": "10.110.23.115",
    "stats_db": "stats_db",
    "user": "postgres",
    "password": "gAAAAABm...==",
    "port": 5432,
    "ssh_user": "demidovve",
    "ssh_password": "gAAAAABm...==",
    "ssh_port": 22
  }
]
```

#### Создание службы `systemd` для бэкенда

Создай файл `/etc/systemd/system/pgmon-backend.service`:
```ini
[Unit]
Description=PostgreSQL Activity Monitor Backend
After=network.target

[Service]
ExecStart=/home/pgmonitor/.local/bin/uvicorn main:app --host 0.0.0.0 --port 8000
WorkingDirectory=/home/pgmonitor/pg_activity_monitor/backend
Restart=always
RestartSec=5s
User=pgmonitor
Environment="PYTHONPATH=/home/pgmonitor/pg_activity_monitor/backend"
EnvironmentFile=/home/pgmonitor/pg_activity_monitor/.env

[Install]
WantedBy=multi-user.target
```

Запуск службы:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pgmon-backend
sudo systemctl start pgmon-backend
sudo systemctl status pgmon-backend
```

### 3. Настройка фронтенда

#### Установка зависимостей

```bash
cd ~/pg_activity_monitor/frontend/pgmon-frontend
nvm use 23
npm install
```

#### Локальный запуск (разработка)

```bash
npm start
```
Фронтенд доступен на [http://localhost:3000](http://localhost:3000).

#### Сборка и запуск для продакшена

```bash
npm run build
```

Создай файл `/etc/systemd/system/pgmon-frontend.service`:
```ini
[Unit]
Description=PostgreSQL Activity Monitor Frontend
After=network.target

[Service]
ExecStart=/home/pgmonitor/.nvm/versions/node/v23.9.0/bin/npx serve -s /home/pgmonitor/pg_activity_monitor/frontend/pgmon-frontend/build -l 3000
WorkingDirectory=/home/pgmonitor/pg_activity_monitor/frontend/pgmon-frontend
Restart=always
RestartSec=5s
User=pgmonitor
Environment="PATH=/home/pgmonitor/.nvm/versions/node/v23.9.0/bin:$PATH"

[Install]
WantedBy=multi-user.target
```

Запуск службы:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pgmon-frontend
sudo systemctl start pgmon-frontend
sudo systemctl status pgmon-frontend
```

Фронтенд будет доступен на `http://<server-ip>:3000`.

## 4. Использование

- **Авторизация**: Войди с логином и паролем (по умолчанию `admin:admin`).
- **Список серверов**: Главная страница (`/`) показывает список серверов с функциями добавления, редактирования и удаления.
- **Детали сервера**: Перейди на `/server/:name` (например, `/server/s00-dbs06`) для просмотра статистики, графиков и списка баз данных.
- **API**: Бэкенд доступен на `http://<server-ip>:8000` (Swagger-документация на `/docs`).

## Контрибьюция

1. Сделай форк репозитория.
2. Создай ветку для изменений:
   ```bash
   git checkout -b feature/название_задачи
   ```
3. Внеси изменения и закоммить:
   ```bash
   git commit -m "Описание изменений"
   ```
4. Запушь изменения:
   ```bash
   git push origin feature/название_задачи
   ```
5. Создай Pull Request на GitHub.

## Лицензия

Проект распространяется под лицензией MIT. См. файл `LICENSE`.
