# app/collector/scheduler.py
"""Планировщик сбора статистики."""
import asyncio
import logging

from app.config import COLLECT_INTERVAL, SIZE_UPDATE_INTERVAL, DB_CHECK_INTERVAL
from app.collector.tasks import collect_server_stats, collect_server_sizes, sync_server_db_info
from app.database.local_db import ensure_partitions, cleanup_old_partitions
from app.database.repositories import settings_repo
from app.services.server import load_servers  # async
from app.services import system_logger

logger = logging.getLogger(__name__)

DAILY = 86400  # 24 часа в секундах


async def _get_interval(key: str, default: int) -> int:
    """Получить интервал из БД с fallback на default из config."""
    try:
        return await settings_repo.get_int_setting(key, default)
    except Exception:
        return default


async def stats_loop():
    """Основной цикл сбора статистики (каждые COLLECT_INTERVAL секунд)."""
    await asyncio.sleep(10)
    while True:
        try:
            servers = await load_servers()
            logger.info(f"[stats] Запуск сбора статистики для {len(servers)} серверов")
            tasks = [collect_server_stats(s) for s in servers]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            ok = sum(1 for r in results if not isinstance(r, Exception))
            errors = sum(1 for r in results if isinstance(r, Exception))
            error_details = []
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error(f"[stats] Ошибка для {servers[i].name}: {r}")
                    error_details.append(f"{servers[i].name}: {r}")
            logger.info(f"[stats] Завершено: {ok} успешно, {errors} ошибок")
            if errors > 0:
                await system_logger.error("collector_stats", f"Сбор статистики: {errors} ошибок из {len(servers)} серверов", "; ".join(error_details))
            else:
                await system_logger.info("collector_stats", f"Сбор статистики: {ok} серверов ОК")
        except Exception as e:
            logger.error(f"[stats] Критическая ошибка в цикле: {e}")
            await system_logger.error("collector_stats", f"Критическая ошибка: {e}")
        interval = await _get_interval("collect_interval", COLLECT_INTERVAL)
        await asyncio.sleep(interval)


async def sizes_loop():
    """Цикл обновления размеров БД (каждые SIZE_UPDATE_INTERVAL секунд)."""
    await asyncio.sleep(10)
    while True:
        try:
            servers = await load_servers()
            logger.info(f"[sizes] Запуск обновления размеров для {len(servers)} серверов")
            tasks = [collect_server_sizes(s) for s in servers]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            ok = sum(1 for r in results if not isinstance(r, Exception))
            errors = sum(1 for r in results if isinstance(r, Exception))
            error_details = []
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error(f"[sizes] Ошибка для {servers[i].name}: {r}")
                    error_details.append(f"{servers[i].name}: {r}")
            logger.info(f"[sizes] Завершено: {ok} успешно, {errors} ошибок")
            if errors > 0:
                await system_logger.error("collector_sizes", f"Обновление размеров: {errors} ошибок из {len(servers)} серверов", "; ".join(error_details))
            else:
                await system_logger.info("collector_sizes", f"Обновление размеров: {ok} серверов ОК")
        except Exception as e:
            logger.error(f"[sizes] Критическая ошибка в цикле: {e}")
            await system_logger.error("collector_sizes", f"Критическая ошибка: {e}")
        interval = await _get_interval("size_update_interval", SIZE_UPDATE_INTERVAL)
        await asyncio.sleep(interval)


async def db_info_loop():
    """Цикл синхронизации информации о БД (каждые DB_CHECK_INTERVAL секунд)."""
    await asyncio.sleep(10)
    while True:
        try:
            servers = await load_servers()
            logger.info(f"[db_info] Запуск синхронизации БД для {len(servers)} серверов")
            tasks = [sync_server_db_info(s) for s in servers]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            ok = sum(1 for r in results if not isinstance(r, Exception))
            errors = sum(1 for r in results if isinstance(r, Exception))
            error_details = []
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error(f"[db_info] Ошибка для {servers[i].name}: {r}")
                    error_details.append(f"{servers[i].name}: {r}")
            logger.info(f"[db_info] Завершено: {ok} успешно, {errors} ошибок")
            if errors > 0:
                await system_logger.error("collector_db_info", f"Синхронизация БД: {errors} ошибок из {len(servers)} серверов", "; ".join(error_details))
            else:
                await system_logger.info("collector_db_info", f"Синхронизация БД: {ok} серверов ОК")
        except Exception as e:
            logger.error(f"[db_info] Критическая ошибка в цикле: {e}")
            await system_logger.error("collector_db_info", f"Критическая ошибка: {e}")
        interval = await _get_interval("db_check_interval", DB_CHECK_INTERVAL)
        await asyncio.sleep(interval)


async def maintenance_loop():
    """Ежедневное обслуживание: создание/удаление партиций + очистка логов."""
    await asyncio.sleep(10)
    while True:
        try:
            logger.info("[maintenance] Запуск обслуживания партиций")
            await ensure_partitions()
            logger.info("[maintenance] Партиции на будущие месяцы созданы")
            await cleanup_old_partitions()
            logger.info("[maintenance] Старые партиции очищены")

            # Очистка системных логов
            logs_days = await _get_interval("logs_retention_days", 30)
            removed = await system_logger.cleanup(logs_days)

            await system_logger.info("maintenance", f"Обслуживание завершено. Логов очищено: {removed}")
        except Exception as e:
            logger.error(f"[maintenance] Ошибка обслуживания: {e}")
            await system_logger.error("maintenance", f"Ошибка обслуживания: {e}")
        await asyncio.sleep(DAILY)


async def start_collector() -> list[asyncio.Task]:
    """Запуск всех циклов коллектора как asyncio-задач."""
    logger.info("Запуск коллектора статистики...")
    tasks = [
        asyncio.create_task(stats_loop(), name="collector-stats"),
        asyncio.create_task(sizes_loop(), name="collector-sizes"),
        asyncio.create_task(db_info_loop(), name="collector-db-info"),
        asyncio.create_task(maintenance_loop(), name="collector-maintenance"),
    ]
    logger.info(f"Коллектор запущен: {len(tasks)} задач")
    await system_logger.info("system", f"Коллектор запущен: {len(tasks)} задач")
    return tasks


async def stop_collector(tasks: list[asyncio.Task]):
    """Остановка всех задач коллектора."""
    logger.info("Остановка коллектора...")
    for task in tasks:
        task.cancel()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for task, result in zip(tasks, results):
        if isinstance(result, asyncio.CancelledError):
            logger.debug(f"Задача {task.get_name()} отменена")
        elif isinstance(result, Exception):
            logger.error(f"Задача {task.get_name()} завершилась с ошибкой: {result}")
    logger.info("Коллектор остановлен")
