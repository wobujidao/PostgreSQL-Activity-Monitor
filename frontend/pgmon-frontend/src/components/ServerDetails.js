import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Table, Form, Card } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, TimeScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import 'chartjs-adapter-date-fns';

ChartJS.register(TimeScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function ServerDetails() {
  const { name } = useParams();
  const [stats, setStats] = useState([]);
  const [activity, setActivity] = useState({});
  const [period, setPeriod] = useState('7 days');
  const [searchDb, setSearchDb] = useState('');
  const [sort, setSort] = useState({ column: 'avg_numbackends', dir: 'DESC' });

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, activityRes] = await Promise.all([
        axios.get(`http://10.110.20.55:8000/servers/${name}/stats`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          params: { period, search_db: searchDb, sort: sort.column, dir: sort.dir }
        }),
        axios.get(`http://10.110.20.55:8000/servers/${name}/activity`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);
      setStats(statsRes.data);
      setActivity(activityRes.data);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
  }, [name, period, searchDb, sort]); // Зависимости fetchData

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Автообновление каждые 10 секунд
    return () => clearInterval(interval);
  }, [fetchData]); // Теперь только fetchData как зависимость

  const handleSort = (column) => {
    setSort({
      column,
      dir: sort.column === column && sort.dir === 'ASC' ? 'DESC' : 'ASC'
    });
  };

  const chartOptions = {
    responsive: true,
    scales: {
      x: { type: 'time', time: { unit: 'hour' }, title: { display: true, text: 'Время' } },
      y: { beginAtZero: true, title: { display: true, text: 'Подключения' } }
    }
  };

  return (
    <div>
      <h2 className="mb-4">Сервер: {name}</h2>
      <Link to="/" className="btn btn-secondary mb-4">Назад к серверам</Link>

      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <h3>Текущая активность</h3>
          <div className="row">
            {Object.entries(activity).map(([state, data]) => (
              <div key={state} className="col-md-4">
                <p><strong>Состояние:</strong> {state || 'Неизвестно'}</p>
                <p>Сессий: {data.count}</p>
                <p>Время простоя: {data.idle_seconds ? `${Math.floor(data.idle_seconds / 3600)} ч.` : '0'}</p>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>

      <div className="row mb-4">
        <div className="col-md-6">
          <Form.Group>
            <Form.Label>Период:</Form.Label>
            <Form.Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="1 day">1 день</option>
              <option value="7 days">7 дней</option>
              <option value="30 days">30 дней</option>
              <option value="all">Всё время</option>
            </Form.Select>
          </Form.Group>
        </div>
        <div className="col-md-6">
          <Form.Group>
            <Form.Label>Поиск по базе:</Form.Label>
            <Form.Control
              type="text"
              value={searchDb}
              onChange={(e) => setSearchDb(e.target.value)}
              placeholder="Введите имя базы"
            />
          </Form.Group>
        </div>
      </div>

      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <h3>Активность баз (за {period})</h3>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th onClick={() => handleSort('datname')} className={sort.column === 'datname' ? `sorted-${sort.dir.toLowerCase()}` : ''}>База</th>
                <th onClick={() => handleSort('avg_numbackends')} className={sort.column === 'avg_numbackends' ? `sorted-${sort.dir.toLowerCase()}` : ''}>Среднее подключений</th>
                <th onClick={() => handleSort('total_commits')} className={sort.column === 'total_commits' ? `sorted-${sort.dir.toLowerCase()}` : ''}>Всего коммитов</th>
                <th onClick={() => handleSort('latest_size')} className={sort.column === 'latest_size' ? `sorted-${sort.dir.toLowerCase()}` : ''}>Размер (ГБ)</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(row => (
                <tr key={row.datname}>
                  <td>{row.datname}</td>
                  <td>{row.avg_numbackends || '-'}</td>
                  <td>{row.total_commits || '-'}</td>
                  <td>{row.latest_size ? (row.latest_size / 1073741824).toFixed(2) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card className="shadow-sm">
        <Card.Body>
          <h3>История подключений</h3>
          {stats.map(row => (
            <div key={row.datname} className="chart-container mb-4">
              <h4>{row.datname}</h4>
              <Line
                data={{
                  labels: row.ts_history || [],
                  datasets: [{
                    label: `${row.datname} - Подключения`,
                    data: row.numbackends_history || [],
                    borderColor: '#4CAF50',
                    backgroundColor: 'rgba(76, 175, 80, 0.2)',
                    fill: true
                  }]
                }}
                options={chartOptions}
              />
            </div>
          ))}
        </Card.Body>
      </Card>
    </div>
  );
}

export default ServerDetails;