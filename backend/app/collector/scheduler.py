# app/collector/scheduler.py
"""Планировщик сбора статистики."""
import asyncio
import logging

from app.config import COLLECT_INTERVAL, SIZE_UPDATE_INTERVAL, DB_CHECK_INTERVAL
from app.collector.tasks import collect_server_stats, collect_server_sizes, sync_server_db_info
from app.database.local_db import ensure_partitions, cleanup_old_partitions
from app.services.server import load_servers

logger = logging.getLogger(__name__)

DAILY = 86400  # 24 часа в секундах


async def stats_loop():
    """Основной цикл сбора статистики (каждые COLLECT_INTERVAL секунд)."""
    await asyncio.sleep(10)
    while True:
        try:
            servers = load_servers()
            logger.info(f"[stats] Запуск сбора статистики для {len(servers)} серверов")
            tasks = [collect_server_stats(s) for s in servers]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            ok = sum(1 for r in results if not isinstance(r, Exception))
            errors = sum(1 for r in results if isinstance(r, Exception))
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error(f"[stats] Ошибка для {servers[i].name}: {r}")
            logger.info(f"[stats] Завершено: {ok} успешно, {errors} ошибок")
        except Exception as e:
            logger.error(f"[stats] Критическая ошибка в цикле: {e}")
        await asyncio.sleep(COLLECT_INTERVAL)


async def sizes_loop():
    """Цикл обновления размеров БД (каждые SIZE_UPDATE_INTERVAL секунд)."""
    await asyncio.sleep(10)
    while True:
        try:
            servers = load_servers()
            logger.info(f"[sizes] Запуск обновления размеров для {len(servers)} серверов")
            tasks = [collect_server_sizes(s) for s in servers]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            ok = sum(1 for r in results if not isinstance(r, Exception))
            errors = sum(1 for r in results if isinstance(r, Exception))
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error(f"[sizes] Ошибка для {servers[i].name}: {r}")
            logger.info(f"[sizes] Завершено: {ok} успешно, {errors} ошибок")
        except Exception as e:
            logger.error(f"[sizes] Критическая ошибка в цикле: {e}")
        await asyncio.sleep(SIZE_UPDATE_INTERVAL)


async def db_info_loop():
    """Цикл синхронизации информации о БД (каждые DB_CHECK_INTERVAL секунд)."""
    await asyncio.sleep(10)
    while True:
        try:
            servers = load_servers()
            logger.info(f"[db_info] Запуск синхронизации БД для {len(servers)} серверов")
            tasks = [sync_server_db_info(s) for s in servers]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            ok = sum(1 for r in results if not isinstance(r, Exception))
            errors = sum(1 for r in results if isinstance(r, Exception))
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    logger.error(f"[db_info] Ошибка для {servers[i].name}: {r}")
            logger.info(f"[db_info] Завершено: {ok} успешно, {errors} ошибок")
        except Exception as e:
            logger.error(f"[db_info] Критическая ошибка в цикле: {e}")
        await asyncio.sleep(DB_CHECK_INTERVAL)


async def maintenance_loop():
    """Ежедневное обслуживание: создание/удаление партиций."""
    await asyncio.sleep(10)
    while True:
        try:
            logger.info("[maintenance] Запуск обслуживания партиций")
            await ensure_partitions()
            logger.info("[maintenance] Партиции на будущие месяцы созданы")
            await cleanup_old_partitions()
            logger.info("[maintenance] Старые партиции очищены")
        except Exception as e:
            logger.error(f"[maintenance] Ошибка обслуживания: {e}")
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
