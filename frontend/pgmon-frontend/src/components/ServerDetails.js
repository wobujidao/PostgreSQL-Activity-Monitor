import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import { Table } from 'react-bootstrap';

function ServerDetails() {
  const { name } = useParams(); // Изменено с serverName на name
  const [serverData, setServerData] = useState(null);
  const [stats, setStats] = useState({ queries: [] });
  const [error, setError] = useState(null);

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

        console.log('Загрузка данных сервера...');
        const serverResponse = await axios.get('http://10.110.20.55:8000/servers', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const server = serverResponse.data.find(s => s.name === name); // Изменено serverName на name
        if (!server) throw new Error(`Сервер ${name} не найден`);
        setServerData(server);
        console.log('Данные сервера:', server);

        console.log('Загрузка статистики для', name);
        const statsResponse = await axios.get(`http://10.110.20.55:8000/server_stats/${name}`, { // Изменено serverName на name
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
  }, [name]); // Изменено serverName на name

  const formatBytes = (bytes) => bytes ? `${(bytes / 1073741824).toFixed(2)} ГБ` : 'N/A';

  const formatUptime = (hours) => {
    const totalSeconds = hours * 3600;
    const days = Math.floor(totalSeconds / 86400);
    const hoursLeft = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days} д. ${hoursLeft} ч. ${minutes} мин.`;
  };

  if (error) return <div>Ошибка: {error}</div>;
  if (!serverData) return <div>Загрузка...</div>;

  return (
    <div className="container mt-5">
      <h2>Сервер: {serverData.name}</h2>
      <a href="/" className="btn btn-secondary mb-4">Назад к серверам</a>

      <h3>Текущая активность</h3>
      <Table striped bordered hover>
        <tbody>
          <tr><td>IP</td><td>{serverData.host}</td></tr>
          <tr><td>Версия PostgreSQL</td><td>{serverData.version || 'N/A'}</td></tr>
          <tr><td>Свободное место</td><td>{formatBytes(serverData.free_space)}</td></tr>
          <tr><td>Соединения</td><td>{serverData.connections ? `${serverData.connections.active} активных, ${serverData.connections.idle} простаивающих` : 'N/A'}</td></tr>
          <tr><td>Uptime</td><td>{formatUptime(serverData.uptime_hours)}</td></tr>
        </tbody>
      </Table>

      <h3>Активные запросы</h3>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>PID</th>
            <th>Пользователь</th>
            <th>База</th>
            <th>Запрос</th>
            <th>Состояние</th>
          </tr>
        </thead>
        <tbody>
          {stats.queries.map(query => (
            <tr key={query.pid}>
              <td>{query.pid}</td>
              <td>{query.usename}</td>
              <td>{query.datname}</td>
              <td>{query.query}</td>
              <td>{query.state}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default ServerDetails;