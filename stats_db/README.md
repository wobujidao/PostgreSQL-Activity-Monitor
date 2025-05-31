# 📊 PostgreSQL Stats Collector

[![Version](https://img.shields.io/badge/version-2.1-blue.svg)](https://github.com/wobujidao/PostgreSQL-Activity-Monitor/tree/main/stats_db)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](../LICENSE)

## 📋 Описание

**PostgreSQL Stats Collector** — это набор скриптов для автоматического сбора и хранения статистики работы PostgreSQL серверов. Является частью проекта [PostgreSQL Activity Monitor](https://github.com/wobujidao/PostgreSQL-Activity-Monitor).

### 🎯 Что собирается:
- 📈 **Количество активных подключений** к каждой БД
- 💾 **Размеры баз данных** (обновляется раз в 30 минут)
- 🔄 **Количество транзакций** (commits)
- 💿 **Свободное место на диске**
- 📅 **Даты создания баз данных**
- 🔑 **OID баз** для отслеживания пересозданий

## 🚀 Возможности

- ✅ Автоматический сбор статистики каждые 10 минут
- ✅ Оптимизированное обновление размеров БД (раз в 30 минут)
- ✅ Защита от одновременного запуска (lock-файл)
- ✅ Отслеживание пересозданных БД по OID
- ✅ Автоматическая очистка старых данных (старше 1 года)
- ✅ Мониторинг всех БД включая системные (postgres, stats_db)
- ✅ Подробное логирование с ротацией

## 📦 Компоненты

### 🔧 create_stats_db.sh (v2.1)
Скрипт для создания и обновления структуры БД:
- Создаёт базу данных `stats_db`
- Создаёт таблицы `pg_statistics` и `db_creation`
- Добавляет необходимые индексы
- Обновляет структуру существующих таблиц

### 📊 stats_collection.sh (v2.0)
Основной скрипт сбора статистики:
- Собирает метрики каждые 10 минут
- Обновляет размеры БД каждые 30 минут
- Отслеживает новые и удалённые БД
- Ведёт лог операций

## 🛠 Требования

- 🐧 **ОС**: Linux (тестировалось на Astra Linux 1.7, Ubuntu)
- 🐘 **PostgreSQL**: 14+ (возможна работа на более ранних версиях)
- 🔐 **Доступ**: Запуск от пользователя `postgres`
- 📁 **Права**: Запись в `/tmp` и `/var/log`

## 📥 Установка

### 1️⃣ Клонирование репозитория

```bash
git clone https://github.com/wobujidao/PostgreSQL-Activity-Monitor.git
cd PostgreSQL-Activity-Monitor/stats_db
```

### 2️⃣ Копирование скриптов

```bash
# Копируем скрипты в системную директорию
sudo cp create_stats_db.sh stats_collection.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/create_stats_db.sh
sudo chmod +x /usr/local/bin/stats_collection.sh
```

### 3️⃣ Инициализация базы данных

```bash
# Запускаем от имени postgres
sudo -u postgres /usr/local/bin/create_stats_db.sh
```

Вы увидите подробный вывод:
```
=== Начало работы скрипта create_stats_db.sh ===
Версия: 2.1 от 2025-05-31

[1/5] Проверка подключения к PostgreSQL...
✓ Подключение успешно

[2/5] Проверяем наличие базы данных 'stats_db'...
✓ База данных создана

[3/5] Создаём/проверяем основные таблицы...
✓ Таблицы и индексы созданы

[4/5] Обновляем структуру таблицы db_creation...
✓ Структура таблицы обновлена

[5/5] Проверяем результат...
  - Записей в pg_statistics: 0
  - Записей в db_creation: 0

=== Скрипт завершён успешно ===
```

### 4️⃣ Настройка cron для автоматического сбора

```bash
# Редактируем crontab для пользователя postgres
sudo crontab -u postgres -e

# Добавляем строку для запуска каждые 10 минут:
*/10 * * * * /usr/local/bin/stats_collection.sh
```

### 5️⃣ Проверка работы

```bash
# Запускаем сбор статистики вручную
sudo -u postgres /usr/local/bin/stats_collection.sh

# Проверяем лог
sudo tail -f /var/log/pg_stats.log

# Смотрим собранные данные
sudo -u postgres psql -d stats_db -c "
  SELECT datname, ts, numbackends, db_size 
  FROM pg_statistics 
  ORDER BY ts DESC 
  LIMIT 10;"
```

## 📊 Структура базы данных

### Таблица `pg_statistics`
| Поле | Тип | Описание |
|------|-----|----------|
| id | serial | Уникальный идентификатор |
| ts | timestamptz | Время сбора статистики |
| datname | text | Имя базы данных |
| numbackends | integer | Количество активных подключений |
| xact_commit | bigint | Количество завершённых транзакций |
| db_size | bigint | Размер БД в байтах |
| disk_free_space | bigint | Свободное место на диске |
| last_size_update | timestamptz | Время последнего обновления размера |

### Таблица `db_creation`
| Поле | Тип | Описание |
|------|-----|----------|
| datname | text | Имя базы данных (PRIMARY KEY) |
| creation_time | timestamptz | Время создания БД |
| oid | oid | OID базы данных |

## 🔍 Примеры запросов

### Последняя статистика по всем БД
```sql
SELECT DISTINCT ON (datname) 
  datname, ts, numbackends, 
  pg_size_pretty(db_size) as size
FROM pg_statistics 
ORDER BY datname, ts DESC;
```

### История подключений за последние 24 часа
```sql
SELECT 
  date_trunc('hour', ts) as hour,
  datname,
  AVG(numbackends) as avg_connections
FROM pg_statistics 
WHERE ts > now() - interval '24 hours'
GROUP BY hour, datname
ORDER BY hour, datname;
```

### Топ-10 БД по размеру
```sql
SELECT 
  datname,
  pg_size_pretty(db_size) as size,
  last_size_update
FROM pg_statistics
WHERE (datname, ts) IN (
  SELECT datname, MAX(ts) 
  FROM pg_statistics 
  WHERE db_size IS NOT NULL
  GROUP BY datname
)
ORDER BY db_size DESC NULLS LAST
LIMIT 10;
```

## 🐛 Решение проблем

### Ошибка "Отказано в доступе" для lock-файла
```bash
# Проверьте права на /tmp
ls -la /tmp/pg_stats_collection.lock

# Удалите старый lock-файл если процесс не запущен
sudo rm -f /tmp/pg_stats_collection.lock
```

### Скрипт выполняется долго
Обновление OID может занять время при большом количестве БД. Это нормально при первом запуске.

### Не обновляются размеры БД
Размеры обновляются раз в 30 минут. Проверьте время последнего обновления:
```sql
SELECT datname, MAX(last_size_update) 
FROM pg_statistics 
WHERE last_size_update IS NOT NULL 
GROUP BY datname;
```

## 📈 Мониторинг

Для визуализации собранных данных используйте основной проект [PostgreSQL Activity Monitor](https://github.com/wobujidao/PostgreSQL-Activity-Monitor) с веб-интерфейсом.

## 🤝 Вклад в проект

Приветствуются любые улучшения! Пожалуйста:

1. Форкните репозиторий
2. Создайте ветку для ваших изменений
3. Внесите изменения и протестируйте
4. Создайте Pull Request

## 📝 Лицензия

Проект распространяется под лицензией MIT. См. файл [LICENSE](../LICENSE).

## 👨�💻 Автор

**Demidov V.E.**
- GitHub: [@wobujidao](https://github.com/wobujidao)

---

⭐ Если проект был полезен, поставьте звезду на GitHub!