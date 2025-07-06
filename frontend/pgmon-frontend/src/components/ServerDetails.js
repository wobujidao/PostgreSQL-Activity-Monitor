import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Card, Table, Form, Alert, Button, Pagination, Tabs, Tab, Badge } from 'react-bootstrap';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useParams, Link, useNavigate } from 'react-router-dom';
import debounce from 'lodash/debounce';
import LoadingSpinner from './LoadingSpinner';
import './ServerDetails.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, ChartTooltip, Legend);

// Константы критериев анализа
const DB_ANALYSIS_CRITERIA = {
  deadDays: 90,              // 3 месяца без подключений
  staticConnectionsDays: 30,  // 1 месяц без изменений
  lowActivityThreshold: 5     // порог низкой активности
};

function ServerDetails() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [serverData, setServerData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [hideDeleted, setHideDeleted] = useState(true);
  const [showNoConnections, setShowNoConnections] = useState(false);
  const [showStaticConnections, setShowStaticConnections] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(new Date());
  const [sortColumn, setSortColumn] = useState('size');
  const [sortDirection, setSortDirection] = useState('desc');
  const [nameFilter, setNameFilter] = useState('');
  const [filterType] = useState('contains');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [activeTab, setActiveTab] = useState('overview');
  const [analysisFilter, setAnalysisFilter] = useState('all');
  const connectionsChartRef = useRef(null);
  const sizeChartRef = useRef(null);
  const connectionsCanvasRef = useRef(null);
  const sizeCanvasRef = useRef(null);
  const isMounted = useRef(true);

  const serverCacheKey = `serverData_${name}`;

  // Функция анализа баз данных
  const analyzeDatabases = useCallback(() => {
    if (!stats || !stats.databases) return null;

    const now = new Date();
    const analyzed = stats.databases.map(db => {
      // Получаем историю подключений для БД
      const dbTimeline = stats.connection_timeline?.filter(
        entry => entry.datname === db.name
      ) || [];

      // Считаем дни с последней активности
      const lastEntry = dbTimeline[dbTimeline.length - 1];
      const lastActivity = lastEntry?.ts;
      const daysSinceActivity = lastActivity 
        ? Math.floor((now - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
        : Infinity;

      // Проверяем статичность подключений
      let isStatic = false;
      let avgConnections = 0;
      
      if (dbTimeline.length > 10) {
        const last10 = dbTimeline.slice(-10);
        const connections = last10.map(e => e.connections || 0);
        const uniqueValues = new Set(connections);
        isStatic = uniqueValues.size === 1 && connections[0] > 0;
        avgConnections = connections.reduce((a, b) => a + b, 0) / connections.length;
      } else if (dbTimeline.length > 0) {
        avgConnections = dbTimeline.reduce((sum, e) => sum + (e.connections || 0), 0) / dbTimeline.length;
      }

      // Определяем статус
      let status = 'healthy';
      let reason = '';
      
      if (daysSinceActivity >= DB_ANALYSIS_CRITERIA.deadDays) {
        status = 'dead';
        reason = `Нет активности ${daysSinceActivity} дней`;
      } else if (isStatic && daysSinceActivity >= DB_ANALYSIS_CRITERIA.staticConnectionsDays) {
        status = 'static';
        reason = `Статичные подключения (${avgConnections.toFixed(0)}) более ${DB_ANALYSIS_CRITERIA.staticConnectionsDays} дней`;
      } else if (avgConnections > 0 && avgConnections < DB_ANALYSIS_CRITERIA.lowActivityThreshold) {
        status = 'warning';
        reason = `Низкая активность (среднее: ${avgConnections.toFixed(1)} подключений)`;
      }

      // Размер БД
      const sizeGB = dbTimeline.find(e => e.size_gb > 0)?.size_gb || 0;

      return {
        ...db,
        status,
        reason,
        daysSinceActivity,
        avgConnections,
        sizeGB,
        isStatic,
        lastActivity
      };
    });

    return {
      all: analyzed,
      dead: analyzed.filter(db => db.status === 'dead'),
      static: analyzed.filter(db => db.status === 'static'),
      warning: analyzed.filter(db => db.status === 'warning'),
      healthy: analyzed.filter(db => db.status === 'healthy')
    };
  }, [stats]);

  const dbAnalysis = analyzeDatabases();

  // Функция экспорта
  const exportDeadDatabases = () => {
    if (!dbAnalysis || dbAnalysis.dead.length === 0) return;

    const csv = [
      ['База данных', 'Размер (ГБ)', 'Дней без активности', 'Последняя активность', 'Дата создания'],
      ...dbAnalysis.dead.map(db => [
        db.name,
        db.sizeGB.toFixed(2),
        db.daysSinceActivity === Infinity ? 'Никогда' : db.daysSinceActivity,
        db.lastActivity ? new Date(db.lastActivity).toLocaleDateString() : 'Никогда',
        db.creation_time ? new Date(db.creation_time).toLocaleDateString() : 'Неизвестно'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dead_databases_${name}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Токен отсутствует');

      const serverResponse = await axios.get('http://10.110.20.55:8000/servers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const server = serverResponse.data.find(s => s.name === name);
      if (!server) throw new Error(`Сервер ${name} не найден`);
      if (isMounted.current) {
        setServerData(server);
        localStorage.setItem(serverCacheKey, JSON.stringify(server));
      }

      const statsResponse = await axios.get(`http://10.110.20.55:8000/server/${name}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString()
        }
      });
      if (isMounted.current) {
        setStats(statsResponse.data);
        setError(null);
      }
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      if (isMounted.current) {
        setError(error.response?.data?.detail || error.message || 'Неизвестная ошибка');
      }
    }
  }, [name, startDate, endDate, serverCacheKey]);

  const debouncedFetchData = useCallback(debounce(fetchData, 500), [fetchData]);

  useEffect(() => {
    isMounted.current = true;
    debouncedFetchData();

    return () => {
      isMounted.current = false;
      debouncedFetchData.cancel();
    };
  }, [debouncedFetchData]);

  useEffect(() => {
    if (!stats || !connectionsCanvasRef.current || !sizeCanvasRef.current) return;

    if (connectionsChartRef.current) {
      connectionsChartRef.current.destroy();
      connectionsChartRef.current = null;
    }
    if (sizeChartRef.current) {
      sizeChartRef.current.destroy();
      sizeChartRef.current = null;
    }

    const aggregatedTimeline = getAggregatedTimeline();
    
    const connectionsChartData = {
      datasets: [
        {
          label: 'Общие подключения',
          data: aggregatedTimeline.map(data => ({
            x: new Date(data.ts),
            y: data.connections
          })),
          fill: false,
          borderColor: 'rgba(75, 192, 192, 1)',
          tension: 0.1
        }
      ]
    };

    const sizeChartData = {
      datasets: [
        {
          label: 'Общий размер баз (ГБ)',
          data: aggregatedTimeline
            .filter(data => data.size_gb > 0)
            .map(data => ({
              x: new Date(data.ts),
              y: data.size_gb
            })),
          fill: false,
          borderColor: 'rgba(153, 102, 255, 1)',
          tension: 0.1
        }
      ]
    };

    const connectionsChartOptions = {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: `Подключения к серверу ${name} за период` }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
            tooltipFormat: 'dd.MM.yyyy HH:mm'
          },
          title: { display: true, text: 'Дата и время' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'Количество подключений' }
        }
      },
      animation: false
    };

    const sizeChartOptions = {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: `Общий размер баз ${name} за период` }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
            tooltipFormat: 'dd.MM.yyyy HH:mm'
          },
          title: { display: true, text: 'Дата и время' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'Размер (ГБ)' }
        }
      },
      animation: false
    };

    connectionsChartRef.current = new ChartJS(connectionsCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: connectionsChartData,
      options: connectionsChartOptions
    });

    sizeChartRef.current = new ChartJS(sizeCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: sizeChartData,
      options: sizeChartOptions
    });

    return () => {
      if (connectionsChartRef.current) {
        connectionsChartRef.current.destroy();
        connectionsChartRef.current = null;
      }
      if (sizeChartRef.current) {
        sizeChartRef.current.destroy();
        sizeChartRef.current = null;
      }
    };
  }, [stats, activeTab, name]);

  const formatBytes = (bytes) => bytes ? `${(bytes / 1073741824).toFixed(2)} ГБ` : 'N/A';

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Moscow'
    });
  };

  const formatSize = (sizeGb) => sizeGb !== null && sizeGb !== undefined ? `${sizeGb.toFixed(2)} ГБ` : 'N/A';

  const formatCreationTime = (creationTime) => {
    if (!creationTime) return 'N/A';
    const date = new Date(creationTime);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow'
    });
  };

  const getAggregatedTimeline = () => {
    if (!stats || !stats.connection_timeline) return [];
    const timelineMap = new Map();
    stats.connection_timeline.forEach(entry => {
      const ts = entry.ts;
      if (!timelineMap.has(ts)) {
        timelineMap.set(ts, { connections: 0, size_gb: 0 });
      }
      const agg = timelineMap.get(ts);
      agg.connections += entry.connections || 0;
      agg.size_gb += entry.size_gb || 0;
    });
    return Array.from(timelineMap.entries()).map(([ts, data]) => ({
      ts,
      connections: data.connections,
      size_gb: data.size_gb
    }));
  };

  const getDatabaseConnections = (dbName) => {
    if (!stats || !stats.connection_timeline) return [];
    return stats.connection_timeline
      .filter(entry => entry.datname === dbName)
      .map(entry => entry.connections);
  };

  const getDatabaseSize = (dbName) => {
    if (!stats || !stats.connection_timeline) return null;
    const lastSizeEntry = stats.connection_timeline
      .filter(entry => entry.datname === dbName && entry.size_gb > 0)
      .slice(-1)[0];
    return lastSizeEntry ? lastSizeEntry.size_gb : null;
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const setDateRange = (days, label) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
  };

  if (error) return <Alert variant="danger">Ошибка: {error}</Alert>;
  if (!serverData || !stats) return (
    <LoadingSpinner text="Загрузка данных сервера..." subtext="Получение статистики" />
  );

  const allDatabases = stats.databases;
  const filteredDatabases = allDatabases.filter(db => {
    const connections = getDatabaseConnections(db.name);
    const nameLower = db.name.toLowerCase();
    const filterLower = nameFilter.toLowerCase();
    let nameMatch = nameLower.includes(filterLower);

    return (
      nameMatch &&
      (!hideDeleted || db.exists) &&
      (!showNoConnections || (connections.length === 0 || connections.every(conn => conn === 0))) &&
      (!showStaticConnections || (connections.length > 0 && connections.every(conn => conn === connections[0] && conn > 0)))
    );
  }).sort((a, b) => {
    if (sortColumn === 'name') {
      return sortDirection === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    } else if (sortColumn === 'size') {
      const sizeA = getDatabaseSize(a.name) || 0;
      const sizeB = getDatabaseSize(b.name) || 0;
      return sortDirection === 'asc' ? sizeA - sizeB : sizeB - sizeA;
    } else if (sortColumn === 'status') {
      return sortDirection === 'asc' ? (a.exists === b.exists ? 0 : a.exists ? -1 : 1) : (a.exists === b.exists ? 0 : a.exists ? 1 : -1);
    } else if (sortColumn === 'creation_time') {
      const timeA = a.creation_time ? new Date(a.creation_time).getTime() : 0;
      const timeB = b.creation_time ? new Date(b.creation_time).getTime() : 0;
      return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
    }
    return 0;
  });

  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(filteredDatabases.length / itemsPerPage);
  const paginatedDatabases = itemsPerPage === 'all' ? filteredDatabases : filteredDatabases.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const freeSpacePercent = serverData.free_space && serverData.total_space
    ? (serverData.free_space / serverData.total_space * 100).toFixed(2)
    : 0;

  return (
    <div className="container mt-5">
      {/* Заголовок страницы как в артефакте */}
      <div className="page-header">
        <h1 className="page-title">Сервер: {name}</h1>
        <div className="breadcrumb">
          <Link to="/">Главная</Link>
          <span>/</span>
          <Link to="/">Серверы</Link>
          <span>/</span>
          <span>{name}</span>
        </div>
      </div>

      {/* Информация о сервере */}
      <div className="server-info-card">
        <div className="server-info-grid">
          <div className="info-block">
            <span className="info-label">IP адрес</span>
            <span className="info-value">{serverData.host}</span>
          </div>
          <div className="info-block">
            <span className="info-label">Версия</span>
            <span className="info-value">{serverData.version || 'N/A'}</span>
          </div>
          <div className="info-block">
            <span className="info-label">Подключения</span>
            <span className="info-value">
              {serverData.connections ? `${serverData.connections.active || 0} / ${(serverData.connections.active || 0) + (serverData.connections.idle || 0)} max` : 'N/A'}
            </span>
          </div>
          <div className="info-block">
            <span className="info-label">Свободно на диске</span>
            <span className="info-value" style={{ color: freeSpacePercent < 10 ? 'var(--danger)' : 'inherit' }}>
              {serverData.free_space && serverData.total_space ? 
                `${formatBytes(serverData.free_space)} из ${formatBytes(serverData.total_space)} (${freeSpacePercent}%)` : 
                'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Выбор периода */}
      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Период:</label>
          <button className="btn btn-sm btn-primary" onClick={() => setDateRange(1, '24ч')}>24ч</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setDateRange(7, '7д')}>7д</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setDateRange(30, '30д')}>30д</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setDateRange(90, '90д')}>90д</button>
        </div>
        <div className="filter-group" style={{ marginLeft: 'auto' }}>
          <DatePicker
            selected={startDate}
            onChange={date => setStartDate(date)}
            selectsStart
            startDate={startDate}
            endDate={endDate}
            className="form-control form-control-sm"
            dateFormat="dd.MM.yyyy"
            style={{ minWidth: 'auto' }}
          />
          <span>—</span>
          <DatePicker
            selected={endDate}
            onChange={date => setEndDate(date)}
            selectsEnd
            startDate={startDate}
            endDate={endDate}
            minDate={startDate}
            className="form-control form-control-sm"
            dateFormat="dd.MM.yyyy"
            style={{ minWidth: 'auto' }}
          />
        </div>
      </div>

      {/* Графики */}
      <div className="charts-container">
        <div className="chart-card">
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '1rem' }}>Подключения к серверу</h3>
          <canvas ref={connectionsCanvasRef} id="connectionsChart" />
        </div>
        <div className="chart-card">
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '1rem' }}>Размер баз данных</h3>
          <canvas ref={sizeCanvasRef} id="sizeChart" />
        </div>
      </div>

      {/* Фильтры баз данных */}
      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Поиск:</label>
          <input type="text" className="form-control form-control-sm" placeholder="Имя базы..." value={nameFilter} onChange={(e) => { setNameFilter(e.target.value); setCurrentPage(1); }} style={{ maxWidth: '200px' }} />
        </div>
        <div className="filter-group">
          <label className="filter-label">Показать:</label>
          <select className="form-select form-select-sm" value={`${showNoConnections ? 'no-conn' : ''}${showStaticConnections ? 'static' : ''}`} onChange={(e) => {
            const val = e.target.value;
            setShowNoConnections(val === 'no-conn');
            setShowStaticConnections(val === 'static');
            setCurrentPage(1);
          }} style={{ width: 'auto' }}>
            <option value="">Все базы</option>
            <option value="no-conn">Только активные</option>
            <option value="static">Неактивные > 30 дней</option>
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setHideDeleted(!hideDeleted)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
          </svg>
          Без подключений
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-outline-secondary btn-sm" onClick={exportDeadDatabases}>Экспорт списка</button>
        </div>
      </div>

      <Tabs activeKey={activeTab} onSelect={setActiveTab} className="mb-4">
        <Tab eventKey="overview" title="Обзор">
          {/* Таблица баз данных */}
          <Card>
            <Card.Header>
              <span className="card-title">Базы данных (всего: {allDatabases.length}, показано: {filteredDatabases.length})</span>
            </Card.Header>
            <div className="table-responsive">
              <Table className="mb-0">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('name')}>База данных</th>
                    <th className="sortable" onClick={() => handleSort('size')}>Размер</th>
                    <th>Подключения</th>
                    <th>Последняя активность</th>
                    <th className="sortable" onClick={() => handleSort('creation_time')}>Создана</th>
                    <th className="sortable" onClick={() => handleSort('status')}>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDatabases.map(db => {
                    const connections = getDatabaseConnections(db.name);
                    const isInactive = connections.length === 0 || connections.every(conn => conn === 0);
                    const lastActivity = stats.connection_timeline
                      ?.filter(entry => entry.datname === db.name)
                      ?.slice(-1)[0]?.ts;
                    
                    return (
                      <tr key={db.name} className={isInactive ? 'table-warning' : ''}>
                        <td>
                          <Link to={`/server/${name}/db/${db.name}`} className="server-link">
                            {db.name}
                          </Link>
                        </td>
                        <td><strong>{formatSize(getDatabaseSize(db.name))}</strong></td>
                        <td>
                          <span style={{ color: isInactive ? 'var(--danger)' : 'var(--success)' }}>
                            {connections.length > 0 ? connections[connections.length - 1] : 0}
                          </span>
                        </td>
                        <td style={{ color: isInactive ? 'var(--danger)' : 'inherit' }}>
                          {lastActivity ? formatTimestamp(lastActivity) : 'Никогда'}
                        </td>
                        <td>{formatCreationTime(db.creation_time)}</td>
                        <td>
                          <span className={`status-badge status-${db.exists ? 'ok' : 'error'}`}>
                            {db.exists ? 'Активна' : 'Удалена'}
                          </span>
                        </td>
                        <td>
                          <Button 
                            variant="outline-primary" 
                            size="sm"
                            onClick={() => navigate(`/server/${name}/db/${db.name}`)}
                          >
                            Анализ
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            {totalPages > 1 && (
              <Card.Body>
                <Pagination className="justify-content-center mb-0">
                  <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                  <Pagination.Prev onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} />
                  {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <Pagination.Item
                        key={pageNum}
                        active={pageNum === currentPage}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Pagination.Item>
                    );
                  })}
                  <Pagination.Next onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages} />
                  <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                </Pagination>
              </Card.Body>
            )}
          </Card>
        </Tab>

        <Tab 
          eventKey="analysis" 
          title={
            <span>
              Анализ активности
              {dbAnalysis && dbAnalysis.dead.length > 0 && (
                <Badge bg="danger" className="ms-2">
                  {dbAnalysis.dead.length}
                </Badge>
              )}
            </span>
          }
        >
          {dbAnalysis && (
            <>
              {/* Метрики */}
              <div className="analysis-metrics">
                <div className="metric-card danger">
                  <div className="metric-label">Неактивные &gt; 3 месяцев</div>
                  <div className="metric-value">{dbAnalysis.dead.length}</div>
                  <div className="metric-sublabel">
                    {dbAnalysis.dead.reduce((sum, db) => sum + db.sizeGB, 0).toFixed(1)} ГБ
                  </div>
                </div>
                <div className="metric-card warning">
                  <div className="metric-label">Низкая активность</div>
                  <div className="metric-value">{dbAnalysis.warning.length}</div>
                  <div className="metric-sublabel">&lt; 5 подключений</div>
                </div>
                <div className="metric-card info">
                  <div className="metric-label">Статичные подключения</div>
                  <div className="metric-value">{dbAnalysis.static.length}</div>
                  <div className="metric-sublabel">Без изменений &gt; 30 дней</div>
                </div>
                <div className="metric-card success">
                  <div className="metric-label">Активные базы</div>
                  <div className="metric-value">{dbAnalysis.healthy.length}</div>
                  <div className="metric-sublabel">Используются регулярно</div>
                </div>
              </div>

              {/* Визуализация баз */}
              <Card className="mb-4">
                <Card.Header>
                  <div className="d-flex justify-content-between align-items-center">
                    <span>Карта активности баз данных</span>
                    <div className="filter-toolbar">
                      <Form.Select 
                        className="filter-select"
                        value={analysisFilter} 
                        onChange={(e) => setAnalysisFilter(e.target.value)}
                      >
                        <option value="all">Все базы ({dbAnalysis.all.length})</option>
                        <option value="dead">Неактивные ({dbAnalysis.dead.length})</option>
                        <option value="warning">Низкая активность ({dbAnalysis.warning.length})</option>
                        <option value="static">Статичные ({dbAnalysis.static.length})</option>
                        <option value="healthy">Активные ({dbAnalysis.healthy.length})</option>
                      </Form.Select>
                    </div>
                  </div>
                </Card.Header>
                <Card.Body>
                  <div className="db-grid">
                    {(analysisFilter === 'all' ? dbAnalysis.all :
                      analysisFilter === 'dead' ? dbAnalysis.dead :
                      analysisFilter === 'warning' ? dbAnalysis.warning :
                      analysisFilter === 'static' ? dbAnalysis.static :
                      dbAnalysis.healthy
                    ).map(db => (
                      <div 
                        key={db.name}
                        className={`db-tile ${db.status}`}
                        title={db.reason}
                        onClick={() => navigate(`/server/${name}/db/${db.name}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="db-name">{db.name}</div>
                        <div className="db-info">{db.sizeGB.toFixed(1)} ГБ</div>
                        <div className="db-info">
                          {db.daysSinceActivity === Infinity ? 'Никогда' : `${db.daysSinceActivity}д назад`}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card.Body>
              </Card>

              {/* Таблица анализа */}
              <Card>
                <Card.Header>
                  <div className="d-flex justify-content-between align-items-center">
                    <span>Детальный анализ неактивных баз</span>
                    <button 
                      className="export-btn"
                      onClick={exportDeadDatabases}
                      disabled={dbAnalysis.dead.length === 0}
                    >
                      Экспорт CSV ({dbAnalysis.dead.length} баз)
                    </button>
                  </div>
                </Card.Header>
                <Card.Body>
                  {dbAnalysis.dead.length > 0 || dbAnalysis.static.length > 0 ? (
                    <Table striped hover className="analysis-table">
                      <thead>
                        <tr>
                          <th>База данных</th>
                          <th>Размер</th>
                          <th>Последняя активность</th>
                          <th>Статус</th>
                          <th>Причина</th>
                          <th>Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...dbAnalysis.dead, ...dbAnalysis.static]
                          .sort((a, b) => b.sizeGB - a.sizeGB)
                          .map(db => (
                            <tr key={db.name}>
                              <td>
                                <Link to={`/server/${name}/db/${db.name}`}>{db.name}</Link>
                              </td>
                              <td>{db.sizeGB.toFixed(2)} ГБ</td>
                              <td>
                                {db.daysSinceActivity === Infinity 
                                  ? 'Никогда' 
                                  : `${db.daysSinceActivity} дней назад`}
                              </td>
                              <td>
                                <span className={`status-badge ${db.status}`}>
                                  {db.status === 'dead' ? 'Неактивна' : 'Статична'}
                                </span>
                              </td>
                              <td className="reason">{db.reason}</td>
                              <td>
                                <Button 
                                  variant="outline-primary" 
                                  size="sm"
                                  onClick={() => navigate(`/server/${name}/db/${db.name}`)}
                                >
                                  Анализ
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </Table>
                  ) : (
                    <div className="empty-state">
                      <h5>🎉 Отлично!</h5>
                      <p>Нет баз данных требующих внимания</p>
                    </div>
                  )}
                </Card.Body>
              </Card>
            </>
          )}
        </Tab>

        <Tab eventKey="settings" title="Настройки критериев">
          <Card>
            <Card.Header>Критерии определения неактивных баз</Card.Header>
            <Card.Body>
              <Form className="criteria-form">
                <Form.Group className="mb-3">
                  <Form.Label>Считать базу неактивной если нет подключений (дней):</Form.Label>
                  <Form.Control 
                    type="number" 
                    value={DB_ANALYSIS_CRITERIA.deadDays}
                    min="30"
                    max="365"
                    disabled
                  />
                  <Form.Text className="text-muted">
                    По умолчанию: 90 дней (3 месяца)
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Считать подключения статичными если нет изменений (дней):</Form.Label>
                  <Form.Control 
                    type="number" 
                    value={DB_ANALYSIS_CRITERIA.staticConnectionsDays}
                    min="7"
                    max="90"
                    disabled
                  />
                  <Form.Text className="text-muted">
                    База с постоянным числом подключений без изменений
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Порог низкой активности (подключений):</Form.Label>
                  <Form.Control 
                    type="number" 
                    value={DB_ANALYSIS_CRITERIA.lowActivityThreshold}
                    min="1"
                    max="20"
                    disabled
                  />
                  <Form.Text className="text-muted">
                    Среднее количество подключений для предупреждения
                  </Form.Text>
                </Form.Group>

                <Alert variant="info">
                  Для изменения критериев обратитесь к администратору системы
                </Alert>
              </Form>
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>
    </div>
  );
}

export default ServerDetails;
