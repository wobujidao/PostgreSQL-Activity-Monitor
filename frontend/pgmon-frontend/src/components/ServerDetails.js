import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Table, Form, Alert, Button } from 'react-bootstrap';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useParams, Link } from 'react-router-dom';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function ServerDetails() {
  const { name } = useParams();
  const [serverData, setServerData] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [hideDeleted, setHideDeleted] = useState(true);

  useEffect(() => {
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

        // Загрузка данных сервера
        console.log('Загрузка данных сервера...');
        const serverResponse = await axios.get('http://10.110.20.55:8000/servers', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const server = serverResponse.data.find(s => s.name === name);
        if (!server) throw new Error(`Сервер ${name} не найден`);
        setServerData(server);
        console.log('Данные сервера:', server);

        // Загрузка статистики из stat_db
        console.log('Загрузка статистики для', name);
        const statsResponse = await axios.get(`http://10.110.20.55:8000/server/${name}/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStats(statsResponse.data);
        console.log('Статистика:', statsResponse.data);
      } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        setError(error.message || 'Неизвестная ошибка');
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [name]);

  const formatBytes = (bytes) => bytes ? `${(bytes / 1073741824).toFixed(2)} ГБ` : 'N/A';

  const formatUptime = (hours) => {
    const totalSeconds = hours * 3600;
    const days = Math.floor(totalSeconds / 86400);
    const hoursLeft = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days} д. ${hoursLeft} ч. ${minutes} мин.`;
  };

  if (error) return <Alert variant="danger">Ошибка: {error}</Alert>;
  if (!serverData || !stats) return <div>Загрузка...</div>;

  const filteredDatabases = hideDeleted ? stats.databases.filter(db => db.exists) : stats.databases;

  const chartData = {
    labels: ['Соединения', 'Размер (МБ)'],
    datasets: [
      {
        label: 'Статистика сервера',
        data: [stats.total_connections, stats.total_size_mb],
        backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(153, 102, 255, 0.6)'],
        borderColor: ['rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)'],
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: `Общая статистика ${name}` },
    },
  };

  return (
    <div className="container mt-5">
      <h2>Сервер: {serverData.name}</h2>
      <Link to="/" className="btn btn-secondary mb-4">Назад к серверам</Link>

      <Card className="mb-4">
        <Card.Header>Статистика {name}</Card.Header>
        <Card.Body>
          <p>Последнее обновление stat_db: {stats.last_stat_update || 'Нет данных'}</p>
          <Bar data={chartData} options={chartOptions} />
        </Card.Body>
      </Card>

      <Card className="mb-4">
        <Card.Header>Текущая активность</Card.Header>
        <Card.Body>
          <Table striped bordered hover>
            <tbody>
              <tr><td>IP</td><td>{serverData.host}</td></tr>
              <tr><td>Версия PostgreSQL</td><td>{serverData.version || 'N/A'}</td></tr>
              <tr><td>Свободное место</td><td>{formatBytes(serverData.free_space)}</td></tr>
              <tr><td>Соединения</td><td>{serverData.connections ? `${serverData.connections.active} активных, ${serverData.connections.idle} простаивающих` : 'N/A'}</td></tr>
              <tr><td>Uptime</td><td>{formatUptime(serverData.uptime_hours)}</td></tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
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
                  <td>{db.name}</td>
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