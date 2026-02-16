# Инструкции для Claude Code

## Проект
PostgreSQL Activity Monitor — веб-приложение для мониторинга серверов PostgreSQL.

## Правила работы
- Язык общения: русский
- Коммиты на русском с префиксами (feat:, fix:, refactor:, docs:)
- Пушить в оба remote: `origin` (GitHub) и `gitlab`
- Редактор для ручного редактирования: `mcedit`
- После изменений backend: `sudo systemctl restart pgmon-backend`
- После изменений frontend: `sudo systemctl restart pgmon-frontend`

## Структура
- `backend/` — FastAPI REST API (Python)
- `frontend/pgmon-frontend/` — React SPA
- `stats_db/` — скрипты сбора статистики
- Конфиги серверов: `/etc/pg_activity_monitor/`

## Стек
- Backend: FastAPI, psycopg2, paramiko, PyJWT, bcrypt
- Frontend: React 19, Bootstrap 5, Chart.js, axios
- БД: PostgreSQL
- Деплой: systemd, Nginx, HTTPS
