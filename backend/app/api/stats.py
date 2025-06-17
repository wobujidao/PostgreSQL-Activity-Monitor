# app/api/stats.py
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timedelta, timezone
import logging
from app.auth import get_current_user
from app.services import load_servers
from app.database import db_pool

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stats"])

@router.get("/server_stats/{server_name}")
async def get_server_stats(server_name: str, current_user: dict = Depends(get_current_user)):
    """Получить текущую активность на сервере"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    try:
        with db_pool.get_connection(server) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT pid, usename, datname, query, state FROM pg_stat_activity WHERE state IS NOT NULL;")
                queries = [{"pid": row[0], "usename": row[1], "datname": row[2], "query": row[3], "state": row[4]} 
                          for row in cur.fetchall()]
        return {"queries": queries}
    except Exception as e:
        logger.error(f"Ошибка получения активности для {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/server/{server_name}/stats")
async def get_server_stats_details(
    server_name: str, 
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    current_user: dict = Depends(get_current_user)
):
    """Получить детальную статистику сервера за период"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    stats_db = server.stats_db or "stats_db"
    result = {
        "last_stat_update": None,
        "total_connections": 0,
        "total_size_gb": 0,
        "databases": [],
        "connection_timeline": []
    }
    
    try:
        # Получаем статистику из stats_db
        with db_pool.get_connection(server, stats_db) as conn:
            with conn.cursor() as cur:
                start_date_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else datetime.now(timezone.utc) - timedelta(days=7)
                end_date_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else datetime.now(timezone.utc)
                
                # Последнее обновление
                cur.execute("SELECT MAX(ts) FROM pg_statistics;")
                last_update = cur.fetchone()[0]
                result["last_stat_update"] = last_update.isoformat() if last_update else None
                
                # Агрегированные данные
                cur.execute("""
                    SELECT SUM(numbackends), SUM(db_size::float / (1048576 * 1024))
                    FROM pg_statistics
                    WHERE ts BETWEEN %s AND %s;
                """, (start_date_dt, end_date_dt))
                stats = cur.fetchone()
                result["total_connections"] = stats[0] or 0
                result["total_size_gb"] = stats[1] or 0
                
                # Список БД
                cur.execute("""
                    SELECT DISTINCT p.datname, d.creation_time
                    FROM pg_statistics p
                    LEFT JOIN db_creation d ON p.datname = d.datname
                    WHERE p.ts BETWEEN %s AND %s;
                """, (start_date_dt, end_date_dt))
                stats_dbs = [{"name": row[0], "creation_time": row[1].isoformat() if row[1] else None} 
                            for row in cur.fetchall()]
                
                # Timeline
                cur.execute("""
                    SELECT date_trunc('hour', ts) as ts, datname, 
                           AVG(numbackends) as avg_connections, 
                           AVG(db_size::float / (1048576 * 1024)) as avg_size_gb
                    FROM pg_statistics
                    WHERE ts BETWEEN %s AND %s
                    GROUP BY date_trunc('hour', ts), datname
                    ORDER BY date_trunc('hour', ts);
                """, (start_date_dt, end_date_dt))
                timeline = [
                    {
                        "ts": row[0].isoformat(),
                        "datname": row[1],
                        "connections": round(row[2] or 0),
                        "size_gb": row[3] or 0
                    }
                    for row in cur.fetchall()
                ]
                result["connection_timeline"] = timeline
        
        # Проверяем существующие БД
        with db_pool.get_connection(server) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT datname FROM pg_database WHERE datistemplate = false;")
                active_dbs = [row[0] for row in cur.fetchall()]
        
        result["databases"] = [
            {"name": db["name"], "exists": db["name"] in active_dbs, "creation_time": db["creation_time"]}
            for db in stats_dbs
        ]
        
        return result
        
    except Exception as e:
        logger.error(f"Ошибка получения статистики для {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/server/{server_name}/db/{db_name}")
async def get_database_stats(
    server_name: str, 
    db_name: str, 
    current_user: dict = Depends(get_current_user)
):
    """Получить краткую статистику по базе данных"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    stats_db = server.stats_db or "stats_db"
    result = {
        "size_mb": 0,
        "connections": 0,
        "commits": 0,
        "last_update": None
    }
    
    try:
        # Пробуем получить из статистики
        with db_pool.get_connection(server, stats_db) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT numbackends, db_size::float / 1048576, xact_commit, ts
                    FROM pg_statistics
                    WHERE datname = %s AND db_size IS NOT NULL
                    ORDER BY ts DESC
                    LIMIT 1;
                """, (db_name,))
                stats = cur.fetchone()
                if stats:
                    result["connections"] = stats[0] or 0
                    result["size_mb"] = stats[1] or 0
                    result["commits"] = stats[2] or 0
                    result["last_update"] = stats[3].isoformat() if stats[3] else None
        
        # Если размер не найден, получаем напрямую
        if result["size_mb"] == 0:
            with db_pool.get_connection(server) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_database_size(%s) / 1048576.0 AS size_mb;", (db_name,))
                    real_size = cur.fetchone()[0]
                    result["size_mb"] = real_size or 0
        
        return result
        
    except Exception as e:
        logger.error(f"Ошибка получения статистики БД {db_name} на {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/server/{server_name}/db/{db_name}/stats")
async def get_database_stats_details(
    server_name: str, 
    db_name: str, 
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    current_user: dict = Depends(get_current_user)
):
    """Получить детальную статистику по базе данных за период"""
    servers = load_servers()
    server = next((s for s in servers if s.name == server_name), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    stats_db = server.stats_db or "stats_db"
    result = {
        "last_stat_update": None,
        "total_connections": 0,
        "total_commits": 0,
        "total_size_mb": 0,
        "creation_time": None,
        "max_connections": 0,
        "min_connections": 0,
        "timeline": []
    }
    
    try:
        with db_pool.get_connection(server, stats_db) as conn:
            with conn.cursor() as cur:
                start_date_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else datetime.now(timezone.utc) - timedelta(days=7)
                end_date_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else datetime.now(timezone.utc)
                
                # Последнее обновление
                cur.execute("SELECT MAX(ts) FROM pg_statistics WHERE datname = %s;", (db_name,))
                last_update = cur.fetchone()[0]
                result["last_stat_update"] = last_update.isoformat() if last_update else None
                
                # Агрегированные метрики
                cur.execute("""
                    SELECT SUM(numbackends), SUM(xact_commit), SUM(db_size::float / 1048576),
                           MAX(numbackends), MIN(numbackends)
                    FROM pg_statistics
                    WHERE datname = %s AND ts BETWEEN %s AND %s;
                """, (db_name, start_date_dt, end_date_dt))
                stats = cur.fetchone()
                result["total_connections"] = stats[0] or 0
                result["total_commits"] = stats[1] or 0
                result["total_size_mb"] = stats[2] or 0
                result["max_connections"] = stats[3] or 0
                result["min_connections"] = stats[4] or 0
                
                # Время создания базы
                cur.execute("SELECT creation_time FROM db_creation WHERE datname = %s;", (db_name,))
                creation_time = cur.fetchone()
                result["creation_time"] = creation_time[0].isoformat() if creation_time else None
                
                # Timeline для графиков
                cur.execute("""
                    SELECT date_trunc('hour', ts) as ts, 
                           AVG(numbackends) as avg_connections,
                           AVG(db_size::float / 1048576) as avg_size_mb, 
                           SUM(xact_commit) as total_commits
                    FROM pg_statistics
                    WHERE datname = %s AND ts BETWEEN %s AND %s
                    GROUP BY date_trunc('hour', ts)
                    ORDER BY date_trunc('hour', ts);
                """, (db_name, start_date_dt, end_date_dt))
                timeline = [
                    {
                        "ts": row[0].isoformat(),
                        "connections": round(row[1] or 0),
                        "size_mb": row[2] or 0,
                        "commits": row[3] or 0
                    }
                    for row in cur.fetchall()
                ]
                result["timeline"] = timeline
        
        return result
        
    except Exception as e:
        logger.error(f"Ошибка получения детальной статистики БД {db_name} на {server_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
