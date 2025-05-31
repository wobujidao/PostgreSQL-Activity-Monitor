#!/bin/bash
# Скрипт для создания базы данных и таблиц для хранения статистики

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
  -- Основная таблица статистики
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

  -- Индексы для быстрого поиска
  CREATE INDEX IF NOT EXISTS pg_statistics_ts_idx ON pg_statistics (ts);
  CREATE INDEX IF NOT EXISTS pg_statistics_datname_ts_idx ON pg_statistics (datname, ts DESC);
  CREATE INDEX IF NOT EXISTS pg_statistics_last_size_update_idx ON pg_statistics (datname, last_size_update DESC) 
    WHERE last_size_update IS NOT NULL;

  -- Таблица для хранения информации о создании БД
  CREATE TABLE IF NOT EXISTS db_creation (
    datname text PRIMARY KEY,
    creation_time timestamptz NOT NULL,
    oid oid NOT NULL
  );

  -- Индексы для db_creation
  CREATE INDEX IF NOT EXISTS db_creation_oid_idx ON db_creation (oid);
  
  -- Добавляем комментарии к таблицам и колонкам
  COMMENT ON TABLE pg_statistics IS 'Статистика использования баз данных PostgreSQL';
  COMMENT ON COLUMN pg_statistics.ts IS 'Время сбора статистики';
  COMMENT ON COLUMN pg_statistics.datname IS 'Имя базы данных';
  COMMENT ON COLUMN pg_statistics.numbackends IS 'Количество активных подключений';
  COMMENT ON COLUMN pg_statistics.xact_commit IS 'Количество завершённых транзакций';
  COMMENT ON COLUMN pg_statistics.db_size IS 'Размер базы данных в байтах (обновляется раз в 30 минут)';
  COMMENT ON COLUMN pg_statistics.disk_free_space IS 'Свободное место на диске в байтах';
  COMMENT ON COLUMN pg_statistics.last_size_update IS 'Время последнего обновления размера БД';
  
  COMMENT ON TABLE db_creation IS 'Информация о создании баз данных';
  COMMENT ON COLUMN db_creation.datname IS 'Имя базы данных';
  COMMENT ON COLUMN db_creation.creation_time IS 'Время создания базы данных';
  COMMENT ON COLUMN db_creation.oid IS 'OID базы данных';
"

if [ $? -eq 0 ]; then
  echo "База данных '$STAT_DB' и таблицы успешно созданы/обновлены."
else
  echo "Ошибка при создании таблиц." >&2
  exit 1
fi