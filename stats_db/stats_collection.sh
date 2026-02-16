#!/bin/bash
# stats_collection.sh - Сбор статистики из PostgreSQL с оптимизированным обновлением размера базы
# Запускается по cron каждые 10 минут от имени пользователя postgres
# */10 * * * * /usr/local/bin/stats_collection.sh

PGHOST="/var/run/postgresql"
PGUSER="postgres"
SOURCE_DB="postgres"
STAT_DB="stats_db"
LOG_FILE="/var/log/pg_stats.log"
MAX_LOG_SIZE=5242880  # 5 МБ
LOCK_FILE="/tmp/pg_stats_collection.lock"

# Атомарная блокировка через flock (защита от race condition)
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Скрипт уже запущен" >> "$LOG_FILE"
    exit 0
fi
trap "rm -f $LOCK_FILE" EXIT

# Текущее время
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %z')

echo "$(date '+%Y-%m-%d %H:%M:%S') - Начало сбора статистики" >> "$LOG_FILE"

# Определяем путь к каталогу данных PostgreSQL
START_TIME=$(date +%s)
PGDATA_DIR=$(psql -h "$PGHOST" -U "$PGUSER" -d "$SOURCE_DB" -t -A -c "SHOW data_directory;" 2>>"$LOG_FILE")
if [ -z "$PGDATA_DIR" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Не удалось определить каталог данных PostgreSQL" >> "$LOG_FILE"
  exit 1
fi
END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Каталог данных: $PGDATA_DIR (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

# Вычисляем свободное место на диске
START_TIME=$(date +%s)
DISK_FREE_BYTES=$(df --output=avail -B1 "$PGDATA_DIR" | tail -n 1 | awk '{print $1}')
END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Свободное место: $DISK_FREE_BYTES байт (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

# Ротация лога
if [ -f "$LOG_FILE" ]; then
  LOG_SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || ls -l "$LOG_FILE" | awk '{print $5}')
  if [ "$LOG_SIZE" -gt "$MAX_LOG_SIZE" ]; then
    rm -f "$LOG_FILE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Лог был удалён (был >5MB)" >> "$LOG_FILE"
  fi
fi

# Основной запрос: вставка статистики с условным обновлением размера
START_TIME=$(date +%s)
psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
  -- Вставляем статистику и обновляем размеры БД если прошло 30 минут
  WITH last_sizes AS (
    SELECT datname, MAX(last_size_update) as last_update
    FROM pg_statistics
    WHERE last_size_update IS NOT NULL
    GROUP BY datname
  ),
  new_stats AS (
    INSERT INTO pg_statistics (
      ts, datname, numbackends, xact_commit, disk_free_space, db_size, last_size_update
    )
    SELECT
      '$TIMESTAMP'::timestamptz,
      s.datname,
      s.numbackends,
      s.xact_commit,
      $DISK_FREE_BYTES,
      CASE 
        WHEN COALESCE(ls.last_update, '1970-01-01'::timestamptz) < now() - interval '30 minutes' 
        THEN pg_database_size(s.datname)
        ELSE NULL
      END,
      CASE 
        WHEN COALESCE(ls.last_update, '1970-01-01'::timestamptz) < now() - interval '30 minutes' 
        THEN now()
        ELSE NULL
      END
    FROM pg_stat_database s
    LEFT JOIN last_sizes ls ON s.datname = ls.datname
    WHERE s.datname NOT IN ('template0', 'template1')
    RETURNING datname, db_size IS NOT NULL as size_updated
  )
  SELECT COUNT(*) FILTER (WHERE size_updated) as updated_sizes FROM new_stats;

  -- Копируем последний известный размер для записей где размер не обновлялся
  UPDATE pg_statistics p1
  SET db_size = (
    SELECT db_size 
    FROM pg_statistics p2 
    WHERE p2.datname = p1.datname 
      AND p2.db_size IS NOT NULL 
    ORDER BY p2.ts DESC 
    LIMIT 1
  )
  WHERE p1.ts = '$TIMESTAMP'::timestamptz
    AND p1.db_size IS NULL
    AND EXISTS (
      SELECT 1 FROM pg_statistics p3 
      WHERE p3.datname = p1.datname AND p3.db_size IS NOT NULL
    );

  -- Удаляем старые записи
  DELETE FROM pg_statistics
  WHERE ts < now() - interval '1 year'
    OR datname NOT IN (
      SELECT datname FROM pg_database WHERE datname NOT IN ('template0', 'template1')
    );
" >> "$LOG_FILE" 2>&1
END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Статистика собрана (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

# Обработка таблицы db_creation
START_TIME=$(date +%s)

# Удаляем записи для несуществующих БД или с изменённым OID
psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
  DELETE FROM db_creation
  WHERE (datname, oid) NOT IN (
    SELECT datname, oid FROM pg_database 
    WHERE datname NOT IN ('template0', 'template1')
  );
" >> "$LOG_FILE" 2>&1

# Проверка новых баз (учитываем OID)
NEW_DBS=$(psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -t -A -c "
  SELECT d.datname || '|' || d.oid
  FROM pg_database d
  WHERE d.datname NOT IN ('template0', 'template1')
    AND NOT EXISTS (
      SELECT 1 FROM db_creation dc 
      WHERE dc.datname = d.datname AND dc.oid = d.oid
    );
" 2>>"$LOG_FILE")

if [ -n "$NEW_DBS" ]; then
  while IFS='|' read -r datname oid; do
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Обнаружена новая база: $datname (oid: $oid)" >> "$LOG_FILE"
    
    # Пытаемся получить дату создания через pg_stat_file
    CREATION_TIME=$(psql -h "$PGHOST" -U "$PGUSER" -d "$SOURCE_DB" -t -A -c \
      "SELECT (pg_stat_file('base/$oid/PG_VERSION')).modification::timestamptz;" 2>/dev/null)
    
    if [ -z "$CREATION_TIME" ]; then
      CREATION_TIME="$TIMESTAMP"
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Не удалось получить дату создания для $datname, используется текущее время" >> "$LOG_FILE"
    else
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Дата создания для $datname: $CREATION_TIME" >> "$LOG_FILE"
    fi
    
    # Экранируем имя БД для защиты от SQL injection
    safe_datname="${datname//\'/\'\'}"
    psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
      INSERT INTO db_creation (datname, creation_time, oid)
      VALUES ('$safe_datname', '$CREATION_TIME', $oid)
      ON CONFLICT (datname) DO UPDATE
      SET oid = $oid, creation_time = '$CREATION_TIME'
      WHERE db_creation.oid != $oid;
    " >> "$LOG_FILE" 2>&1
  done <<< "$NEW_DBS"
fi

END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Обработка db_creation завершена (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Сбор статистики завершён" >> "$LOG_FILE"
