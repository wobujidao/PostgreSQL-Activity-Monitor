#!/bin/bash
# create_stats_db.sh - Создание базы данных и таблиц для хранения статистики
# Версия: 2.1
# Дата: 2025-05-31
# Изменения v2.1: Убран DO блок, добавлены подробные комментарии и прогресс
#
# Что делает этот скрипт:
# 1. Проверяет подключение к PostgreSQL через Unix-сокет
# 2. Создаёт базу данных stats_db (если не существует)
# 3. Создаёт две таблицы:
#    - pg_statistics: для хранения статистики по базам (размер, подключения, транзакции)
#    - db_creation: для хранения информации о создании баз данных
# 4. Создаёт индексы для быстрого поиска
# 5. Обновляет структуру существующих таблиц (добавляет OID если нужно)

PGHOST="/var/run/postgresql"
PGUSER="postgres"
STAT_DB="stats_db"

# Функция для выполнения команд psql
run_psql() {
  psql -h "$PGHOST" -U "$PGUSER" "$@"
}

echo "=== Начало работы скрипта create_stats_db.sh ==="
echo "Версия: 2.1 от 2025-05-31"
echo ""

# ШАГ 1: Проверка подключения к PostgreSQL
echo "[1/5] Проверка подключения к PostgreSQL..."
if ! run_psql -c "SELECT 1" >/dev/null 2>&1; then
  echo "ОШИБКА: Не удалось подключиться к PostgreSQL" >&2
  echo "Проверьте, что PostgreSQL запущен и доступен через сокет $PGHOST" >&2
  exit 1
fi
echo "✓ Подключение успешно"

# ШАГ 2: Проверка и создание базы данных
echo ""
echo "[2/5] Проверяем наличие базы данных '$STAT_DB'..."
DB_EXISTS=$(run_psql -tAc "SELECT 1 FROM pg_database WHERE datname='$STAT_DB';")
if [ "$DB_EXISTS" != "1" ]; then
  echo "База данных '$STAT_DB' не найдена, создаём..."
  run_psql -c "CREATE DATABASE $STAT_DB OWNER $PGUSER;"
  if [ $? -ne 0 ]; then
    echo "ОШИБКА при создании базы данных $STAT_DB" >&2
    exit 1
  fi
  echo "✓ База данных создана"
else
  echo "✓ База данных '$STAT_DB' уже существует"
fi

# ШАГ 3: Создание основных таблиц и индексов
echo ""
echo "[3/5] Создаём/проверяем основные таблицы в базе $STAT_DB..."
echo "  - pg_statistics: для статистики по базам"
echo "  - db_creation: для информации о создании БД"

run_psql -d "$STAT_DB" -c "
  -- Основная таблица статистики
  -- Хранит снимки состояния всех БД каждые 10 минут
  CREATE TABLE IF NOT EXISTS pg_statistics (
    id serial PRIMARY KEY,                    -- Уникальный ID записи
    ts timestamptz NOT NULL,                  -- Время сбора статистики
    datname text NOT NULL,                    -- Имя базы данных
    numbackends integer,                      -- Количество активных подключений
    xact_commit bigint,                       -- Количество завершённых транзакций
    db_size bigint,                          -- Размер БД в байтах (обновляется раз в 30 мин)
    disk_free_space bigint,                  -- Свободное место на диске в байтах
    last_size_update timestamptz             -- Когда последний раз обновлялся размер
  );

  -- Индексы для быстрого поиска
  CREATE INDEX IF NOT EXISTS pg_statistics_ts_idx ON pg_statistics (ts);
  CREATE INDEX IF NOT EXISTS pg_statistics_datname_ts_idx ON pg_statistics (datname, ts DESC);
  CREATE INDEX IF NOT EXISTS pg_statistics_last_size_update_idx ON pg_statistics (datname, last_size_update DESC) 
    WHERE last_size_update IS NOT NULL;

  -- Таблица для хранения информации о создании БД
  -- Отслеживает когда была создана каждая база
  CREATE TABLE IF NOT EXISTS db_creation (
    datname text PRIMARY KEY,                 -- Имя базы данных
    creation_time timestamptz NOT NULL,       -- Время создания (из файла PG_VERSION)
    oid oid                                  -- OID базы для отслеживания пересозданий
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
  echo "✓ Таблицы и индексы созданы/проверены"
else
  echo "✗ Ошибка при создании таблиц" >&2
  exit 1
fi

# ШАГ 4: Обновление структуры существующей таблицы db_creation
echo ""
echo "[4/5] Обновляем структуру таблицы db_creation (добавляем OID)..."
echo "  Это может занять время если баз много..."

# Добавляем колонку OID если её нет и заполняем значения
run_psql -d "$STAT_DB" -c "
  -- Проверяем и добавляем колонку oid если её нет
  ALTER TABLE db_creation ADD COLUMN IF NOT EXISTS oid oid;
  
  -- Обновляем OID для существующих записей (может быть долго!)
  UPDATE db_creation dc
  SET oid = d.oid
  FROM pg_database d
  WHERE dc.datname = d.datname
    AND dc.oid IS NULL;
  
  -- Делаем колонку обязательной
  ALTER TABLE db_creation ALTER COLUMN oid SET NOT NULL;
" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "✓ Структура таблицы обновлена"
else
  echo "✓ Структура таблицы обновлена (возможны предупреждения)"
fi

# ШАГ 5: Финальная проверка
echo ""
echo "[5/5] Проверяем результат..."

# Показываем количество записей
STATS_COUNT=$(run_psql -d "$STAT_DB" -tAc "SELECT COUNT(*) FROM pg_statistics;")
DB_COUNT=$(run_psql -d "$STAT_DB" -tAc "SELECT COUNT(*) FROM db_creation;")

echo "  - Записей в pg_statistics: $STATS_COUNT"
echo "  - Записей в db_creation: $DB_COUNT"

echo ""
echo "=== Скрипт завершён успешно ==="
echo "База данных '$STAT_DB' готова к использованию"
echo "Запускайте stats_collection.sh для сбора статистики"
