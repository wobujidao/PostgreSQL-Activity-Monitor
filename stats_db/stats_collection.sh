#!/bin/bash
# stats_collection.sh - Сбор статистики из PostgreSQL с оптимизированным обновлением размера базы и отслеживанием создания новых баз.
# Запускается по cron каждые 10 минут от имени пользователя postgres.
# Пример cron-записи:
# */10 * * * * /usr/local/bin/stats_collection.sh

PGHOST="/var/run/postgresql"
PGUSER="postgres"
SOURCE_DB="postgres"
STAT_DB="stats_db"
LOG_FILE="/var/log/pg_stats.log"
MAX_LOG_SIZE=5242880  # 5 МБ в байтах

# Проверка и создание лог-файла
if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE"
  chown postgres:postgres "$LOG_FILE"
  chmod 664 "$LOG_FILE"
fi

# Текущее время (с часовым поясом)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %z')

echo "$(date '+%Y-%m-%d %H:%M:%S') - Начало сбора статистики" >> "$LOG_FILE"

# Определяем путь к каталогу данных PostgreSQL через запрос
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
START_TIME=$(date +%s)
if [ -f "$LOG_FILE" ]; then
  LOG_SIZE=$(stat -c%s "$LOG_FILE" 2>/dev/null || ls -l "$LOG_FILE" | awk '{print $5}')
  if [ "$LOG_SIZE" -gt "$MAX_LOG_SIZE" ]; then
    rm -f "$LOG_FILE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Лог был удалён (был >5MB)" >> "$LOG_FILE"
  fi
fi
END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Ротация лога выполнена (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

# Вставляем статистику с начальным значением last_size_update
START_TIME=$(date +%s)
psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
  INSERT INTO pg_statistics (
    ts, datname, numbackends, xact_commit, disk_free_space, last_size_update
  )
  SELECT
    '$TIMESTAMP',
    s.datname,
    s.numbackends,
    s.xact_commit,
    $DISK_FREE_BYTES,
    now()
  FROM pg_stat_database s
  WHERE s.datname NOT IN ('template0', 'template1');

  DELETE FROM pg_statistics
  WHERE ts < now() - interval '1 year';
" >> "$LOG_FILE" 2>&1
END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Статистика собрана и старые записи удалены (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

# Удаляем записи из db_creation для несуществующих баз
START_TIME=$(date +%s)
psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
  DELETE FROM db_creation
  WHERE datname NOT IN (
    SELECT datname FROM pg_database WHERE datname NOT IN ('template0', 'template1', '$STAT_DB')
  );
" >> "$LOG_FILE" 2>&1
END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Удаление записей для несуществующих баз (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

# Проверка новых и пересозданных баз
START_TIME=$(date +%s)
NEW_DBS=$(psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -t -A -c "
  SELECT d.datname, d.oid
  FROM pg_database d
  WHERE d.datname NOT IN ('template0', 'template1', '$STAT_DB')
    AND (
      NOT EXISTS (
        SELECT 1 FROM db_creation dc WHERE dc.datname = d.datname
      )
      OR EXISTS (
        SELECT 1 FROM db_creation dc WHERE dc.datname = d.datname AND dc.oid != d.oid
      )
    );
" 2>>"$LOG_FILE")

if [ -n "$NEW_DBS" ]; then
  while IFS='|' read -r datname oid; do
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Обнаружена новая или пересозданная база: $datname (oid: $oid)" >> "$LOG_FILE"
    # Пытаемся получить дату создания через pg_stat_file
    CREATION_TIME=$(psql -h "$PGHOST" -U "$PGUSER" -d "$SOURCE_DB" -t -A -c \
      "SELECT (pg_stat_file('base/$oid/PG_VERSION')).modification;" 2>>"$LOG_FILE")
    if [ -z "$CREATION_TIME" ]; then
      CREATION_TIME="$TIMESTAMP"
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Не удалось получить дату создания для $datname, используется $TIMESTAMP" >> "$LOG_FILE"
    else
      echo "$(date '+%Y-%m-%d %H:%M:%S') - Дата создания для $datname: $CREATION_TIME" >> "$LOG_FILE"
    fi
    psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
      INSERT INTO db_creation (datname, creation_time, oid)
      VALUES ('$datname', '$CREATION_TIME', $oid)
      ON CONFLICT (datname) DO UPDATE
      SET creation_time = EXCLUDED.creation_time, oid = EXCLUDED.oid;
    " >> "$LOG_FILE" 2>&1
  done <<< "$NEW_DBS"
fi
END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Проверка новых баз завершена (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

# Обновляем db_size только для баз, у которых нет актуального размера за последние 30 минут
START_TIME=$(date +%s)
# Получаем список баз, требующих обновления размера
UPDATE_DBS=$(psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -t -A -c "
  SELECT DISTINCT datname
  FROM pg_statistics
  WHERE ts = '$TIMESTAMP'
    AND datname NOT IN ('template0', 'template1')
    AND (last_size_update IS NULL OR last_size_update < now() - interval '30 minutes');
" 2>>"$LOG_FILE")

if [ -n "$UPDATE_DBS" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Базы для обновления размера: $UPDATE_DBS" >> "$LOG_FILE"
  for datname in $UPDATE_DBS; do
    START_DB_TIME=$(date +%s)
    psql -h "$PGHOST" -d "$STAT_DB" -U "$PGUSER" -c "
      UPDATE pg_statistics
      SET db_size = pg_database_size('$datname'),
          last_size_update = now()
      WHERE ts = '$TIMESTAMP'
        AND datname = '$datname';
    " >> "$LOG_FILE" 2>&1
    END_DB_TIME=$(date +%s)
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Размер базы $datname обновлен (выполнено за $((END_DB_TIME - START_DB_TIME)) сек)" >> "$LOG_FILE"
  done
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') - Нет баз для обновления размера" >> "$LOG_FILE"
fi
END_TIME=$(date +%s)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Обновление размеров баз завершено (выполнено за $((END_TIME - START_TIME)) сек)" >> "$LOG_FILE"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Сбор статистики завершён" >> "$LOG_FILE"
