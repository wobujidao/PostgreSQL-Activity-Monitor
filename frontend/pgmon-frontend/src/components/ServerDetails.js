import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Card, Table, Form, Alert, Button, ProgressBar, OverlayTrigger, Tooltip, Dropdown, Spinner, Pagination } from 'react-bootstrap';
import { Chart } from 'chart.js';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useParams, Link } from 'react-router-dom';
import debounce from 'lodash/debounce';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, ChartTooltip, Legend);

function ServerDetails() {
  const { name } = useParams();
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
  const [filterType, setFilterType] = useState('contains');
  const [dateRangeLabel, setDateRangeLabel] = useState('7 дней');
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const connectionsChartRef = useRef(null);
  const sizeChartRef = useRef(null);
  const connectionsCanvasRef = useRef(null);
  const sizeCanvasRef = useRef(null);
  const isMounted = useRef(true);

  const serverCacheKey = `serverData_${name}`;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Токен отсутствует');

      // Всегда запрашиваем свежие данные с сервера
      const serverResponse = await axios.get('http://10.110.20.55:8000/servers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const server = serverResponse.data.find(s => s.name === name);
      if (!server) throw new Error(`Сервер ${name} не найден`);
      if (isMounted.current) {
        setServerData(server);
        localStorage.setItem(serverCacheKey, JSON.stringify(server)); // Сохраняем, но не используем как кэш
      }

      const statsResponse = await axios.get(`http://10.110.20.55:8000/server/${name}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString()
        }
      });
      if (isMounted.current) setStats(statsResponse.data);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      if (isMounted.current) setError(error.response?.data?.detail || error.message || 'Неизвестная ошибка');
    } finally {
      if (isMounted.current) setLoading(false);
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

    connectionsChartRef.current = new Chart(connectionsCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: connectionsChartData,
      options: connectionsChartOptions
    });

    sizeChartRef.current = new Chart(sizeCanvasRef.current.getContext('2d'), {
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
  }, [stats]);

  const formatBytes = (bytes) => bytes ? `${(bytes / 1073741824).toFixed(2)} ГБ` : 'N/A';

  const formatUptime = (hours) => {
    if (!hours) return 'N/A';
    const totalSeconds = hours * 3600;
    const days = Math.floor(totalSeconds / 86400);
    const hoursLeft = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days} д. ${hoursLeft} ч. ${minutes} мин.`;
  };

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

  const isDataStale = (timestamp) => {
    if (!timestamp) return false;
    const lastUpdate = new Date(timestamp).getTime();
    const now = Date.now();
    const oneHourInMs = 60 * 60 * 1000;
    return (now - lastUpdate) > oneHourInMs;
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
      .slice(-1)[0]; // Берем последнюю запись с size_gb > 0
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
    setDateRangeLabel(label);
  };

  const handlePerPageChange = (e) => {
    const value = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  if (error) return <Alert variant="danger">Ошибка: {error}</Alert>;
  if (!serverData || !stats) return (
    <div className="text-center mt-5">
      <Spinner animation="border" role="status">
        <span className="sr-only">Загрузка...</span>
      </Spinner>
    </div>
  );

  const aggregatedTimeline = getAggregatedTimeline();
  const allDatabases = stats.databases;
  const filteredDatabases = allDatabases.filter(db => {
    const connections = getDatabaseConnections(db.name);
    const nameLower = db.name.toLowerCase();
    const filterLower = nameFilter.toLowerCase();
    let nameMatch = true;

    if (nameFilter) {
      if (filterType === 'startsWith') nameMatch = nameLower.startsWith(filterLower);
      else if (filterType === 'contains') nameMatch = nameLower.includes(filterLower);
      else if (filterType === 'endsWith') nameMatch = nameLower.endsWith(filterLower);
      else if (filterType === 'exact') nameMatch = nameLower === filterLower;
    }

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

  const activeCount = filteredDatabases.filter(db => getDatabaseConnections(db.name).length > 0).length;
  const unusedCount = filteredDatabases.filter(db => getDatabaseConnections(db.name).length === 0).length;

  const totalPages = itemsPerPage === 'all' ? 1 : Math.ceil(filteredDatabases.length / itemsPerPage);
  const paginatedDatabases = itemsPerPage === 'all' ? filteredDatabases : filteredDatabases.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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

  const currentConnections = serverData.connections ? (serverData.connections.active || 0) + (serverData.connections.idle || 0) : 'N/A';
  const lastNonZeroSize = aggregatedTimeline.slice().reverse().find(entry => entry.size_gb > 0);
  const currentSizeGB = lastNonZeroSize ? lastNonZeroSize.size_gb.toFixed(2) : 'N/A';
  const sizeTimestamp = lastNonZeroSize ? formatTimestamp(lastNonZeroSize.ts) : 'N/A';
  const lastUpdateFormatted = formatTimestamp(stats.last_stat_update);
  const isLastUpdateStale = isDataStale(stats.last_stat_update);
  const freeSpacePercent = serverData.free_space && serverData.total_space
    ? (serverData.free_space / serverData.total_space * 100).toFixed(2)
    : 0;

  return (
    <div className="container mt-5">
      <h2>Сервер: {serverData.name}</h2>
      <Link to="/" className="btn btn-secondary mb-4">Назад к серверам</Link>

      <Card className="mb-4">
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <span>Статистика {name} {loading && <Spinner animation="border" size="sm" className="ml-2" />}</span>
            <Button variant="outline-primary" size="sm" onClick={fetchData}>
              Обновить данные
            </Button>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="mb-3">
            <label>Диапазон дат: </label>
            <DatePicker
              selected={startDate}
              onChange={date => setStartDate(date)}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              className="form-control d-inline-block mx-2"
              dateFormat="dd.MM.yyyy"
            />
            <DatePicker
              selected={endDate}
              onChange={date => setEndDate(date)}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate}
              className="form-control d-inline-block mx-2"
              dateFormat="dd.MM.yyyy"
            />
            <Dropdown className="d-inline-block mx-2">
              <Dropdown.Toggle variant="outline-secondary" size="sm">
                {dateRangeLabel}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item onClick={() => setDateRange(7, '7 дней')}>7 дней</Dropdown.Item>
                <Dropdown.Item onClick={() => setDateRange(14, '2 недели')}>2 недели</Dropdown.Item>
                <Dropdown.Item onClick={() => setDateRange(30, 'Месяц')}>Месяц</Dropdown.Item>
                <Dropdown.Item onClick={() => setDateRange(90, '3 месяца')}>3 месяца</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
          <p style={{ color: isLastUpdateStale ? 'red' : 'inherit' }}>
            Последнее обновление stat_db: ({lastUpdateFormatted})
          </p>
          <p>Текущие подключения: {currentConnections}</p>
          <p>Текущий размер баз (ГБ): {currentSizeGB} (на {sizeTimestamp})</p>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ width: '48%' }}>
              <canvas ref={connectionsCanvasRef} id="connectionsChart" />
            </div>
            <div style={{ width: '48%' }}>
              <canvas ref={sizeCanvasRef} id="sizeChart" />
            </div>
          </div>
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header>Текущая активность</Card.Header>
        <Card.Body>
          <Table striped bordered hover>
            <tbody>
              <tr><td>IP</td><td>{serverData.host}</td></tr>
              <tr><td>Версия PostgreSQL</td><td>{serverData.version || 'N/A'}</td></tr>
              <tr>
                <td>Свободное место</td>
                <td>
                  {serverData.free_space && serverData.total_space ? (
                    <OverlayTrigger
                      placement="top"
                      overlay={<Tooltip>{formatBytes(serverData.free_space)} свободно из {formatBytes(serverData.total_space)}</Tooltip>}
                    >
                      <ProgressBar style={{ height: '20px' }}>
                        <ProgressBar
                          variant="danger"
                          now={100 - freeSpacePercent}
                          label={`${formatBytes(serverData.total_space - serverData.free_space)} занято`}
                        />
                        <ProgressBar
                          variant="success"
                          now={freeSpacePercent}
                          label={`${formatBytes(serverData.free_space)} свободно`}
                        />
                      </ProgressBar>
                    </OverlayTrigger>
                  ) : (
                    formatBytes(serverData.free_space) || 'N/A'
                  )}
                </td>
              </tr>
              <tr><td>Соединения</td><td>{serverData.connections ? `${serverData.connections.active || 0} активных, ${serverData.connections.idle || 0} простаивающих` : 'N/A'}</td></tr>
              <tr><td>Uptime</td><td>{formatUptime(serverData.uptime_hours)}</td></tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <span style={{ color: nameFilter ? 'blue' : 'inherit' }}>
              Список баз данных ({allDatabases.length} всего, {filteredDatabases.length} отфильтровано)
            </span>
            <div>
              <OverlayTrigger placement="top" overlay={<Tooltip>Скрыть удалённые базы</Tooltip>}>
                <Form.Check
                  inline
                  type="checkbox"
                  label="Не показывать удалённые базы"
                  checked={hideDeleted}
                  onChange={(e) => setHideDeleted(e.target.checked)}
                  className="ml-2"
                />
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={<Tooltip>Показать базы без активных подключений</Tooltip>}>
                <Button
                  variant={showNoConnections ? 'primary' : 'outline-primary'}
                  size="sm"
                  className="ml-2"
                  onClick={() => {
                    setShowNoConnections(!showNoConnections);
                    setShowStaticConnections(false);
                    setCurrentPage(1);
                  }}
                  style={{ color: showNoConnections ? 'white' : 'inherit' }}
                >
                  Без подключений
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={<Tooltip>Показать базы с неизменным числом подключений</Tooltip>}>
                <Button
                  variant={showStaticConnections ? 'primary' : 'outline-primary'}
                  size="sm"
                  className="ml-2"
                  onClick={() => {
                    setShowStaticConnections(!showStaticConnections);
                    setShowNoConnections(false);
                    setCurrentPage(1);
                  }}
                  style={{ color: showStaticConnections ? 'white' : 'inherit' }}
                >
                  Неизменные подключения
                </Button>
              </OverlayTrigger>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="mb-3">
            <p>Итоги: Всего баз: {filteredDatabases.length}, Активных: {activeCount}, Неиспользуемых: {unusedCount}</p>
            <Form inline className="d-flex align-items-center mb-2">
              <OverlayTrigger placement="top" overlay={<Tooltip>Введите имя базы для фильтрации</Tooltip>}>
                <Form.Control
                  type="text"
                  placeholder="Фильтр по имени"
                  value={nameFilter}
                  onChange={(e) => { setNameFilter(e.target.value); setCurrentPage(1); }}
                  style={{ width: '200px', marginRight: '10px' }}
                />
              </OverlayTrigger>
              <Dropdown>
                <Dropdown.Toggle variant="outline-secondary" size="sm">
                  {filterType === 'startsWith' ? 'Начинается с' : 
                   filterType === 'contains' ? 'Содержит' : 
                   filterType === 'endsWith' ? 'Заканчивается на' : 'Точное совпадение'}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => { setFilterType('startsWith'); setCurrentPage(1); }}>Начинается с</Dropdown.Item>
                  <Dropdown.Item onClick={() => { setFilterType('contains'); setCurrentPage(1); }}>Содержит</Dropdown.Item>
                  <Dropdown.Item onClick={() => { setFilterType('endsWith'); setCurrentPage(1); }}>Заканчивается на</Dropdown.Item>
                  <Dropdown.Item onClick={() => { setFilterType('exact'); setCurrentPage(1); }}>Точное совпадение</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
              <OverlayTrigger placement="top" overlay={<Tooltip>Очистить фильтр по имени</Tooltip>}>
                <Button
                  variant="outline-danger"
                  size="sm"
                  className="ml-2"
                  onClick={() => { setNameFilter(''); setCurrentPage(1); }}
                >
                  Очистить
                </Button>
              </OverlayTrigger>
            </Form>
            <Form.Group controlId="itemsPerPage" className="d-flex align-items-center">
              <Form.Label className="mr-2">На странице:</Form.Label>
              <Form.Select value={itemsPerPage} onChange={handlePerPageChange} style={{ width: '100px' }}>
                <option value={20}>20</option>
                <option value={40}>40</option>
                <option value={80}>80</option>
                <option value={160}>160</option>
                <option value="all">Все</option>
              </Form.Select>
            </Form.Group>
          </div>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                  Название базы {sortColumn === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('size')} style={{ cursor: 'pointer' }}>
                  Размер {sortColumn === 'size' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('creation_time')} style={{ cursor: 'pointer' }}>
                  Дата создания {sortColumn === 'creation_time' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                  Статус {sortColumn === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedDatabases.map(db => (
                <tr key={db.name}>
                  <td><Link to={`/server/${name}/db/${db.name}`}>{db.name}</Link></td>
                  <td>{formatSize(getDatabaseSize(db.name))}</td>
                  <td>{formatCreationTime(db.creation_time)}</td>
                  <td>{db.exists ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {totalPages > 1 && (
            <Pagination className="justify-content-center mt-3">
              <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
              <Pagination.Prev onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} />
              {[...Array(totalPages)].map((_, i) => (
                <Pagination.Item
                  key={i + 1}
                  active={i + 1 === currentPage}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </Pagination.Item>
              ))}
              <Pagination.Next onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages} />
              <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
            </Pagination>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

export default ServerDetails;
