import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Card, Table, Form, Alert, Button, ProgressBar, OverlayTrigger, Tooltip, Dropdown } from 'react-bootstrap';
import { Chart } from 'chart.js';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useParams, Link } from 'react-router-dom';

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
  const connectionsChartRef = useRef(null);
  const sizeChartRef = useRef(null);
  const connectionsCanvasRef = useRef(null);
  const sizeCanvasRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const fetchData = async () => {
      try {
        console.log('Полученный name:', name);
        if (!name) throw new Error('name не определён');

        const token = localStorage.getItem('token');
        if (!token) throw new Error('Токен отсутствует');

        console.log('Загрузка данных сервера...');
        const serverResponse = await axios.get('http://10.110.20.55:8000/servers', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const server = serverResponse.data.find(s => s.name === name);
        if (!server) throw new Error(`Сервер ${name} не найден`);
        if (isMounted.current) setServerData(server);
        console.log('Данные сервера:', server);

        console.log('Загрузка статистики для', name);
        const statsResponse = await axios.get(`http://10.110.20.55:8000/server/${name}/stats`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString()
          }
        });
        if (isMounted.current) setStats(statsResponse.data);
        console.log('Статистика:', statsResponse.data);
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        if (isMounted.current) setError(error.response?.data?.detail || error.message || 'Неизвестная ошибка');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [name, startDate, endDate]);

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
    const sizes = stats.connection_timeline
      .filter(entry => entry.datname === dbName)
      .map(entry => entry.size_gb);
    return sizes.length > 0 ? Math.max(...sizes) : null;
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Быстрые диапазоны дат
  const setDateRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
  };

  if (error) return <Alert variant="danger">Ошибка: {error}</Alert>;
  if (!serverData || !stats) return <div>Загрузка...</div>;

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
    }
    return 0;
  });

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
        <Card.Header>Статистика {name}</Card.Header>
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
            <Button variant="outline-secondary" size="sm" className="ml-2" onClick={() => setDateRange(7)}>7 дней</Button>
            <Button variant="outline-secondary" size="sm" className="ml-2" onClick={() => setDateRange(14)}>2 недели</Button>
            <Button variant="outline-secondary" size="sm" className="ml-2" onClick={() => setDateRange(30)}>Месяц</Button>
            <Button variant="outline-secondary" size="sm" className="ml-2" onClick={() => setDateRange(90)}>3 месяца</Button>
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
                      overlay={
                        <Tooltip>
                          {formatBytes(serverData.free_space)} свободно из {formatBytes(serverData.total_space)}
                        </Tooltip>
                      }
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
              <Form.Check
                inline
                type="checkbox"
                label="Не показывать удалённые базы"
                checked={hideDeleted}
                onChange={(e) => setHideDeleted(e.target.checked)}
                className="ml-2"
              />
              <Button
                variant={showNoConnections ? 'primary' : 'outline-primary'}
                size="sm"
                className="ml-2"
                onClick={() => {
                  setShowNoConnections(!showNoConnections);
                  setShowStaticConnections(false);
                }}
              >
                Без подключений
              </Button>
              <Button
                variant={showStaticConnections ? 'primary' : 'outline-primary'}
                size="sm"
                className="ml-2"
                onClick={() => {
                  setShowStaticConnections(!showStaticConnections);
                  setShowNoConnections(false);
                }}
              >
                Неизменные подключения
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
          <Form inline className="mb-3 d-flex align-items-center">
            <Form.Control
              type="text"
              placeholder="Фильтр по имени"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              style={{ width: '200px', marginRight: '10px' }}
            />
            <Dropdown>
              <Dropdown.Toggle variant="outline-secondary" size="sm">
                {filterType === 'startsWith' ? 'Начинается с' : 
                 filterType === 'contains' ? 'Содержит' : 
                 filterType === 'endsWith' ? 'Заканчивается на' : 'Точное совпадение'}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item onClick={() => setFilterType('startsWith')}>Начинается с</Dropdown.Item>
                <Dropdown.Item onClick={() => setFilterType('contains')}>Содержит</Dropdown.Item>
                <Dropdown.Item onClick={() => setFilterType('endsWith')}>Заканчивается на</Dropdown.Item>
                <Dropdown.Item onClick={() => setFilterType('exact')}>Точное совпадение</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
            <Button
              variant="outline-danger"
              size="sm"
              className="ml-2"
              onClick={() => setNameFilter('')}
            >
              Очистить
            </Button>
          </Form>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                  Название базы {sortColumn === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('size')} style={{ cursor: 'pointer' }}>
                  Размер {sortColumn === 'size' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                  Статус {sortColumn === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDatabases.map(db => (
                <tr key={db.name}>
                  <td><Link to={`/server/${name}/db/${db.name}`}>{db.name}</Link></td>
                  <td>{formatSize(getDatabaseSize(db.name))}</td>
                  <td>{db.exists ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
}

export default ServerDetails;