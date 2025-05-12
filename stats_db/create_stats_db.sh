#!/bin/bash
# Скрипт для создания базы данных и таблиц для хранения статистики (pg_statistics и db_creation).
# В таблицу pg_statistics добавлен столбец db_size.
# Таблица db_creation хранит дату создания баз данных.

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

echo "Создаём таблицы в базе $STAT_DB..."
run_psql -d "$STAT_DB" -c "
  CREATE TABLE IF NOT EXISTS pg_statistics (
    id serial PRIMARY KEY,
    ts timestamptz NOT NULL,
    datname text NOT NULL,
    numbackends integer,
    xact_commit bigint,
    db_size bigint,
    disk_free_space bigint,
    last_size_update timestamptz
  );

  CREATE INDEX IF NOT EXISTS pg_statistics_ts_idx ON pg_statistics (ts);

  CREATE TABLE IF NOT EXISTS db_creation (
    datname text PRIMARY KEY,
    creation_time timestamptz NOT NULL,
    oid oid
  );

  CREATE INDEX IF NOT EXISTS db_creation_datname_idx ON db_creation (datname);
  CREATE INDEX IF NOT EXISTS db_creation_oid_idx ON db_creation (oid);
"
if [ $? -eq 0 ]; then
  echo "База данных '$STAT_DB' и таблицы 'pg_statistics', 'db_creation' успешно созданы."
else
  echo "Ошибка при создании таблиц." >&2
  exit 1
fi
