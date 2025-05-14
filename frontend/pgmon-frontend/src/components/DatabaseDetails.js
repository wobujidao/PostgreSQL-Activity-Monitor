import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Card, Table, Alert, Button, Dropdown, Spinner } from 'react-bootstrap';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';
import './DatabaseDetails.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, ChartTooltip, Legend);

function DatabaseDetails() {
  const { name, db_name } = useParams();
  const navigate = useNavigate();
  const [dbStats, setDbStats] = useState(null);
  const [dbHistory, setDbHistory] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(new Date());
  const [dateRangeLabel, setDateRangeLabel] = useState('7 дней');
  const connectionsChartRef = useRef(null);
  const sizeChartRef = useRef(null);
  const commitsChartRef = useRef(null);
  const connectionsCanvasRef = useRef(null);
  const sizeCanvasRef = useRef(null);
  const commitsCanvasRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    const fetchDbStats = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.error('No token found in localStorage');
          setError('Токен отсутствует, пожалуйста, войдите заново');
          navigate('/');
          return;
        }

        console.log('Fetching stats for:', name, db_name);
        const statsResponse = await axios.get(`http://10.110.20.55:8000/server/${name}/db/${db_name}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Stats response:', statsResponse.data);

        const historyResponse = await axios.get(`http://10.110.20.55:8000/server/${name}/db/${db_name}/stats`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString()
          }
        });
        console.log('History response:', historyResponse.data);

        if (isMounted.current) {
          setDbStats(statsResponse.data);
          setDbHistory(historyResponse.data);
          setError(null);
        }
      } catch (err) {
        console.error('Fetch error:', err);
        if (isMounted.current) {
          const errorMessage = err.response?.status === 401 ? 'Недействительный токен, пожалуйста, войдите заново' : (err.response?.data?.detail || err.message);
          setError('Ошибка загрузки статистики базы: ' + errorMessage);
          if (err.response?.status === 401) {
            localStorage.removeItem('token');
            navigate('/');
          }
          setDbStats(dbStats || {});
          setDbHistory(dbHistory || { timeline: [], creation_time: null });
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    fetchDbStats();
    const interval = setInterval(fetchDbStats, 60000);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [name, db_name, startDate, endDate, navigate]);

  useEffect(() => {
    if (!dbHistory || !dbHistory.timeline || !connectionsCanvasRef.current || !sizeCanvasRef.current || !commitsCanvasRef.current) {
      console.log('Skipping chart render: incomplete data or canvas refs');
      return;
    }

    if (connectionsChartRef.current) {
      connectionsChartRef.current.destroy();
      connectionsChartRef.current = null;
    }
    if (sizeChartRef.current) {
      sizeChartRef.current.destroy();
      sizeChartRef.current = null;
    }
    if (commitsChartRef.current) {
      commitsChartRef.current.destroy();
      commitsChartRef.current = null;
    }

    connectionsChartRef.current = new ChartJS(connectionsCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: 'Подключения',
          data: dbHistory.timeline.map(data => ({
            x: new Date(data.ts),
            y: data.connections
          })),
          fill: false,
          borderColor: 'rgba(75, 192, 192, 1)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: `Подключения к базе ${db_name}` }
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
      }
    });

    sizeChartRef.current = new ChartJS(sizeCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: 'Размер (МБ)',
          data: dbHistory.timeline.map(data => ({
            x: new Date(data.ts),
            y: data.size_mb
          })),
          fill: false,
          borderColor: 'rgba(153, 102, 255, 1)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: `Размер базы ${db_name}` }
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
            title: { display: true, text: 'Размер (МБ)' }
          }
        },
        animation: false
      }
    });

    commitsChartRef.current = new ChartJS(commitsCanvasRef.current.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: 'Коммиты',
          data: dbHistory.timeline.map(data => ({
            x: new Date(data.ts),
            y: data.commits
          })),
          fill: false,
          borderColor: 'rgba(255, 99, 132, 1)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: `Коммиты в базе ${db_name}` }
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
            title: { display: true, text: 'Количество коммитов' }
          }
        },
        animation: false
      }
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
      if (commitsChartRef.current) {
        commitsChartRef.current.destroy();
        commitsChartRef.current = null;
      }
    };
  }, [dbHistory, db_name]);

  const setDateRange = (days, label) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start);
    setEndDate(end);
    setDateRangeLabel(label);
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

  return (
    <div className="container mt-5">
      <h2>База данных: {db_name} (Сервер: {name})</h2>
      <Link to={`/server/${name}`} className="btn btn-secondary mb-4">Назад к серверу</Link>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="mb-4">
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <span>Статистика базы данных {loading && <Spinner animation="border" size="sm" className="ml-2" />}</span>
            <Dropdown>
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
        </Card.Header>
        <Card.Body>
          <Table striped bordered hover>
            <tbody>
              <tr><td>Размер (МБ)</td><td>{dbStats?.size_mb ? dbStats.size_mb.toFixed(2) : 'N/A'}</td></tr>
              <tr><td>Активные подключения</td><td>{dbStats?.connections ?? 'N/A'}</td></tr>
              <tr><td>Выполненные коммиты</td><td>{dbStats?.commits ?? 'N/A'}</td></tr>
              <tr><td>Последнее обновление</td><td>{formatTimestamp(dbStats?.last_update)}</td></tr>
              <tr><td>Время создания</td><td>{formatTimestamp(dbHistory?.creation_time)}</td></tr>
              <tr><td>Общее количество подключений (период)</td><td>{dbHistory?.total_connections ?? 'N/A'}</td></tr>
              <tr><td>Максимальное количество подключений</td><td>{dbHistory?.max_connections ?? 'N/A'}</td></tr>
              <tr><td>Минимальное количество подключений</td><td>{dbHistory?.min_connections ?? 'N/A'}</td></tr>
              <tr><td>Общее количество коммитов (период)</td><td>{dbHistory?.total_commits ?? 'N/A'}</td></tr>
            </tbody>
          </Table>

          {dbHistory?.timeline?.length > 0 ? (
            <div className="charts-container">
              <div className="chart">
                <canvas ref={connectionsCanvasRef} id="connectionsChart" />
              </div>
              <div className="chart">
                <canvas ref={sizeCanvasRef} id="sizeChart" />
              </div>
              <div className="chart">
                <canvas ref={commitsCanvasRef} id="commitsChart" />
              </div>
            </div>
          ) : (
            <Alert variant="warning">Нет данных для отображения графиков за выбранный период</Alert>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

export default DatabaseDetails;
