#!/bin/bash
# Скрипт для создания базы данных и таблицы для хранения статистики (pg_statistics).
# В таблицу добавлен столбец db_size для хранения размера каждой базы.

PGHOST="/var/run/postgresql"
PGUSER="postgres"
STAT_DB="stats_db"

# Функция для выполнения команд psql
run_psql() {
  psql -h "$PGHOST" -U "$PGUSER" "$@"
}

echo "Проверка подключения к PostgreSQL"
if ! run_psql -c "SELECT 1" >/dev/null 2>&1; then
  echo "Ошибка: Не удалось подключиться к PostgreSQL" >&2
  exit 1
fi

echo "Проверяем наличие базы данных '$STAT_DB'..."
DB_EXISTS=$(run_psql -tAc "SELECT 1 FROM pg_database WHERE datname='$STAT_DB';")
if [ "$DB_EXISTS" != "1" ]; then
  echo "База данных '$STAT_DB' не найдена, создаём..."
  run_psql -c "CREATE DATABASE $STAT_DB OWNER $PGUSER;"
  if [ $? -ne 0 ]; then
    echo "Ошибка при создании базы данных $STAT_DB" >&2
    exit 1
  fi
else
  echo "База данных '$STAT_DB' уже существует."
fi

echo "Создаём таблицу pg_statistics в базе $STAT_DB..."
run_psql -d "$STAT_DB" -c "
  CREATE TABLE IF NOT EXISTS pg_statistics (
    id serial PRIMARY KEY,               -- уникальный идентификатор записи
    ts timestamptz NOT NULL,             -- время сбора статистики
    datname text NOT NULL,               -- имя базы данных
    numbackends integer,                 -- число активных подключений
    xact_commit bigint,                  -- число выполненных коммитов
    db_size bigint,                      -- размер базы данных (в байтах)
    disk_free_space bigint,              -- свободное место на диске (в байтах)
    last_size_update timestamptz         -- время последнего обновления db_size
  );

  -- Индекс по времени сбора для ускорения выборок
  CREATE INDEX IF NOT EXISTS pg_statistics_ts_idx ON pg_statistics (ts);
"
if [ $? -eq 0 ]; then
  echo "База данных '$STAT_DB' и таблица 'pg_statistics' успешно созданы."
else
  echo "Ошибка при создании таблицы 'pg_statistics'." >&2
  exit 1
fi