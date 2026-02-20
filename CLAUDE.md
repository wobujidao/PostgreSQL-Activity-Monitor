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
- `frontend/` — React SPA (Vite + shadcn/ui)
- Конфиги серверов: `/etc/pg_activity_monitor/`
- Локальная БД: PostgresPro 1C 17 (`pam_stats`) — статистика + аудит

## Стек
- Backend: FastAPI, psycopg2, asyncpg, paramiko, PyJWT, bcrypt
- Frontend: React 19, Vite, Tailwind CSS v4, shadcn/ui, Chart.js, axios
- БД: PostgreSQL
- Деплой: systemd, Nginx, HTTPS

## Дизайн-система
Перед созданием/изменением UI обязательно прочитай `docs/DESIGN_SYSTEM.md`
