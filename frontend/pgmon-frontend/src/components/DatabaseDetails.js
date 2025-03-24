import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Table, Alert } from 'react-bootstrap';
import { useParams, Link } from 'react-router-dom';

function DatabaseDetails() {
  const { name, db_name } = useParams();
  const [dbStats, setDbStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDbStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`http://10.110.20.55:8000/server/${name}/db/${db_name}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDbStats(response.data);
      } catch (err) {
        setError('Ошибка загрузки статистики базы: ' + (err.response?.data?.detail || err.message));
      }
    };
    fetchDbStats();
    const interval = setInterval(fetchDbStats, 10000);
    return () => clearInterval(interval);
  }, [name, db_name]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!dbStats) return <div>Загрузка...</div>;

  return (
    <div className="container mt-5">
      <h2>База данных: {db_name} (Сервер: {name})</h2>
      <Link to={`/server/${name}`} className="btn btn-secondary mb-4">Назад к серверу</Link>

      <Card>
        <Card.Header>Статистика базы данных</Card.Header>
        <Card.Body>
          <Table striped bordered hover>
            <tbody>
              <tr><td>Размер (МБ)</td><td>{dbStats.size_mb.toFixed(2)}</td></tr>
              <tr><td>Активные подключения</td><td>{dbStats.connections}</td></tr>
              <tr><td>Выполненные коммиты</td><td>{dbStats.commits}</td></tr>
              <tr><td>Последнее обновление</td><td>{dbStats.last_update || 'Нет данных'}</td></tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
}

export default DatabaseDetails;