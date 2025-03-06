#!/bin/bash
# stats_collection.sh - Сбор статистики из PostgreSQL с обновлением размера базы не чаще одного раза в 30 минут.
# Предполагается, что этот скрипт запускается по cron каждые 10 минут.
# Пример cron-записи:
# */10 * * * * /usr/local/bin/stats_collection.sh

PGHOST="/var/run/postgresql"
PGUSER="postgres"
SOURCE_DB="postgres"
STAT_DB="stats_db"
LOG_FILE="/var/log/pg_stats.log"
MAX_LOG_SIZE=5242880  # 5 МБ в байтах

# Текущее время (с часовым поясом)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %z')

echo "$(date '+%Y-%m-%d %H:%M:%S') - Начало сбора статистики" >> "$LOG_FILE"

# Определяем путь к каталогу данных PostgreSQL через запрос
PGDATA_DIR=$(psql -h "$PGHOST" -U "$PGUSER" -d "$SOURCE_DB" -t -A -c "SHOW data_directory;" 2>>"$LOG_FILE")
if [ -z "$PGDATA_DIR" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Не удалось определить каталог данных PostgreSQL" >> "$LOG_FILE"
  exit 1
fi
echo "$(date '+%Y-%m-%d %H:%M:%S') - Каталог данных: $PGDATA_DIR" >> "$LOG_FILE"

# Вычисляем свободное место на диске, где находится каталог данных
DISK_FREE_BYTES=$(df --output=avail -B1 "$PGDATA_DIR" | tail -n 1 | awk '{print $1}')

# Ротация лога (если лог превышает 5 МБ, удаляем его)
if [ -f "$LOG_FILE" ]; then
  LOG_SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || ls -l "$LOG_FILE" | awk '{print $5}')
  if [ "$LOG_SIZE" -gt "$MAX_LOG_SIZE" ]; then
    rm -f "$LOG_FILE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Лог был удалён (был >5MB)" >> "$LOG_FILE"
  fi
fi

# Вставляем основную статистику (без db_size, обновление db_size будет происходить отдельно)
psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
  INSERT INTO pg_statistics (
    ts, datname, numbackends, xact_commit, disk_free_space
  )
  SELECT
    '$TIMESTAMP',
    s.datname,
    s.numbackends,
    s.xact_commit,
    $DISK_FREE_BYTES
  FROM pg_stat_database s
  WHERE s.datname NOT IN ('template0', 'template1');

  -- Удаляем записи старше 1 года
  DELETE FROM pg_statistics
  WHERE ts < now() - interval '1 year';
" >> "$LOG_FILE" 2>&1

# Проверяем, когда в последний раз обновлялся размер базы (last_size_update)
# Обновление db_size производится, только если прошло более 30 минут с последнего обновления.
UPDATE_SIZES=$(psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -t -A -c "
  SELECT CASE
    WHEN MAX(last_size_update) IS NULL OR MAX(last_size_update) < now() - interval '30 minutes'
    THEN 'true' ELSE 'false'
  END
  FROM pg_statistics;
" 2>>"$LOG_FILE")

echo "$(date '+%Y-%m-%d %H:%M:%S') - UPDATE_SIZES=$UPDATE_SIZES" >> "$LOG_FILE"

if [ "$UPDATE_SIZES" = "true" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Обновляем размер баз" >> "$LOG_FILE"
  psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
    UPDATE pg_statistics
    SET db_size = pg_database_size(datname),
        last_size_update = now()
    WHERE ts = '$TIMESTAMP'
      AND datname NOT IN ('template0', 'template1');
  " >> "$LOG_FILE" 2>&1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Сбор статистики завершён" >> "$LOG_FILE"