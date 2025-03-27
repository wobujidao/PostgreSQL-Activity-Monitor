import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Card, Table, Form, Alert, Button, ProgressBar, OverlayTrigger, Tooltip } from 'react-bootstrap'; // Добавляем OverlayTrigger и Tooltip
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
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // 7 дней назад
  const [endDate, setEndDate] = useState(new Date());
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

        let token = localStorage.getItem('token');
        if (!token) {
          console.log('Токен отсутствует, получаем новый...');
          const loginResponse = await axios.post(
            'http://10.110.20.55:8000/token',
            'username=admin&password=admin',
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
          );
          token = loginResponse.data.access_token;
          localStorage.setItem('token', token);
          console.log('Новый токен получен:', token);
        }

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
        if (isMounted.current) setError(error.message || 'Неизвестная ошибка');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);

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

  const isDataStale = (timestamp) => {
    if (!timestamp) return false;
    const lastUpdate = new Date(timestamp).getTime();
    const now = new Date().getTime();
    const oneHourInMs = 60 * 60 * 1000;
    return (now - lastUpdate) > oneHourInMs;
  };

  if (error) return <Alert variant="danger">Ошибка: {error}</Alert>;
  if (!serverData || !stats) return <div>Загрузка...</div>;

  const filteredDatabases = hideDeleted ? stats.databases.filter(db => db.exists) : stats.databases;

  const connectionsChartData = {
    datasets: [
      {
        label: 'Общие подключения',
        data: stats.connection_timeline.map(data => ({
          x: new Date(data.ts),
          y: data.total_connections
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
        data: stats.connection_timeline
          .filter(data => data.total_size_gb > 0)
          .map(data => ({
            x: new Date(data.ts),
            y: data.total_size_gb
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
  const lastNonZeroSize = stats.connection_timeline.slice().reverse().find(entry => entry.total_size_gb > 0);
  const currentSizeGB = lastNonZeroSize ? lastNonZeroSize.total_size_gb.toFixed(2) : 'N/A';
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
              <tr><td>Соединения</td><td>{serverData.connections ? `${serverData.connections.active} активных, ${serverData.connections.idle} простаивающих` : 'N/A'}</td></tr>
              <tr><td>Uptime</td><td>{formatUptime(serverData.uptime_hours)}</td></tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <div className="d-flex justifyContent-between align-items-center">
            <span>Список баз данных</span>
            <Form.Check
              type="checkbox"
              label="Не показывать удалённые базы"
              checked={hideDeleted}
              onChange={(e) => setHideDeleted(e.target.checked)}
            />
          </div>
        </Card.Header>
        <Card.Body>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th>Название базы</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredDatabases.map(db => (
                <tr key={db.name}>
                  <td><Link to={`/server/${name}/db/${db.name}`}>{db.name}</Link></td>
                  <td>{db.exists ? 'Существует' : 'Удалена'}</td>
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