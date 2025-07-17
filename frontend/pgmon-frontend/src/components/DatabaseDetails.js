import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Card, Table, Alert, Dropdown, Button } from 'react-bootstrap';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, LineController, TimeScale, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';
import LoadingSpinner from './LoadingSpinner';
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

  const fetchDbStats = useCallback(async () => {
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
      const statsResponse = await axios.get(`https://pam.cbmo.mosreg.ru/server/${name}/db/${db_name}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Stats response:', statsResponse.data);

      const historyResponse = await axios.get(`https://pam.cbmo.mosreg.ru/server/${name}/db/${db_name}/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString()
        }
      });
      console.log('History response:', historyResponse.data);

      setDbStats(statsResponse.data);
      setDbHistory(historyResponse.data);
      setError(null);
      console.log('States updated:', { dbStats: statsResponse.data, dbHistory: historyResponse.data });
    } catch (err) {
      console.error('Fetch error:', err);
      const errorMessage = err.response?.status === 401 ? 'Недействительный токен, пожалуйста, войдите заново' : (err.response?.data?.detail || err.message);
      setError('Ошибка загрузки статистики базы: ' + errorMessage);
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        navigate('/');
      }
      setDbStats(null);
      setDbHistory(null);
    } finally {
      setLoading(false);
    }
  }, [name, db_name, startDate, endDate, navigate]);

  useEffect(() => {
    fetchDbStats();
    const interval = setInterval(fetchDbStats, 60000);
    return () => clearInterval(interval);
  }, [fetchDbStats]);

  useEffect(() => {
    if (!dbHistory || !dbHistory.timeline || !connectionsCanvasRef.current || !sizeCanvasRef.current || !commitsCanvasRef.current) {
      console.log('Skipping chart render: incomplete data or canvas refs', { dbHistory, connectionsCanvasRef: !!connectionsCanvasRef.current });
      return;
    }

    console.log('Rendering charts with timeline:', dbHistory.timeline);

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

  console.log('Rendering with states:', { dbStats, dbHistory, error, loading });

  return (
    <div className="container mt-5">
      {/* Заголовок страницы как в артефакте */}
      <div className="page-header">
        <h1 className="page-title">База данных: {db_name}</h1>
        <div className="breadcrumb">
          <Link to="/">Главная</Link>
          <span>/</span>
          <Link to="/">Серверы</Link>
          <span>/</span>
          <Link to={`/server/${name}`}>{name}</Link>
          <span>/</span>
          <span>{db_name}</span>
        </div>
      </div>

      {/* Информация о базе данных */}
      <div className="server-info-card">
        <div className="server-info-grid">
          <div className="info-block">
            <span className="info-label">Размер базы</span>
            <span className="info-value">
              {dbStats && dbStats.size_mb ? `${(dbStats.size_mb / 1024).toFixed(1)} ГБ` : 'N/A'}
            </span>
          </div>
          <div className="info-block">
            <span className="info-label">Активные подключения</span>
            <span className="info-value">{dbStats?.connections ?? 'N/A'}</span>
          </div>
          <div className="info-block">
            <span className="info-label">Транзакций выполнено</span>
            <span className="info-value">
              {dbHistory?.total_commits ? dbHistory.total_commits.toLocaleString() : 'N/A'}
            </span>
          </div>
          <div className="info-block">
            <span className="info-label">Создана</span>
            <span className="info-value">
              {dbHistory?.creation_time ? formatTimestamp(dbHistory.creation_time) : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Выбор периода */}
      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Период анализа:</label>
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
        <Button variant="primary" size="sm" onClick={fetchDbStats} style={{ marginLeft: 'auto' }}>
          Обновить данные
        </Button>
      </div>

      {loading ? (
        <LoadingSpinner text="Загрузка статистики базы..." subtext="Анализ данных" />
      ) : dbStats && dbHistory ? (
        <>
          {/* Статистика базы данных */}
          <Card className="mb-4">
            <Card.Header>
              <span className="card-title">Статистика базы данных</span>
            </Card.Header>
            <Card.Body>
              <Table striped bordered hover>
                <tbody>
                  <tr>
                    <td>Размер (МБ)</td>
                    <td>{dbStats.size_mb ? dbStats.size_mb.toFixed(2) : 'N/A'}</td>
                  </tr>
                  <tr>
                    <td>Активные подключения</td>
                    <td>{dbStats.connections ?? 'N/A'}</td>
                  </tr>
                  <tr>
                    <td>Выполненные коммиты</td>
                    <td>{dbStats.commits ? dbStats.commits.toLocaleString() : 'N/A'}</td>
                  </tr>
                  <tr>
                    <td>Последнее обновление</td>
                    <td>{formatTimestamp(dbStats.last_update)}</td>
                  </tr>
                  <tr>
                    <td>Время создания</td>
                    <td>{formatTimestamp(dbHistory.creation_time)}</td>
                  </tr>
                  <tr>
                    <td>Общее количество подключений (период)</td>
                    <td>{dbHistory.total_connections ? dbHistory.total_connections.toLocaleString() : 'N/A'}</td>
                  </tr>
                  <tr>
                    <td>Максимальное количество подключений</td>
                    <td>{dbHistory.max_connections ?? 'N/A'}</td>
                  </tr>
                  <tr>
                    <td>Минимальное количество подключений</td>
                    <td>{dbHistory.min_connections ?? 'N/A'}</td>
                  </tr>
                </tbody>
              </Table>

              {/* Графики */}
              {dbHistory.timeline?.length > 0 ? (
                <div className="charts-container" style={{ marginTop: '2rem' }}>
                  <div className="chart-card">
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '1rem' }}>
                      Подключения к базе {db_name}
                    </h3>
                    <canvas ref={connectionsCanvasRef} id="connectionsChart" />
                  </div>
                  <div className="chart-card">
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '1rem' }}>
                      Размер базы {db_name}
                    </h3>
                    <canvas ref={sizeCanvasRef} id="sizeChart" />
                  </div>
                  <div className="chart-card">
                    <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '1rem' }}>
                      Коммиты в базе {db_name}
                    </h3>
                    <canvas ref={commitsCanvasRef} id="commitsChart" />
                  </div>
                </div>
              ) : (
                <Alert variant="warning" className="mt-3">
                  Нет данных для отображения графиков за выбранный период
                </Alert>
              )}
            </Card.Body>
          </Card>
        </>
      ) : (
        <Alert variant="warning">Ожидание данных...</Alert>
      )}
    </div>
  );
}

export default DatabaseDetails;
