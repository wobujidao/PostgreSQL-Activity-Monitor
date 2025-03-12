import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, Button, Modal, Form, Card, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import './ServerList.css';

function ServerList() {
  const [servers, setServers] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editServer, setEditServer] = useState(null);
  const [newServer, setNewServer] = useState({
    name: '',
    host: '',
    user: '',
    password: '',
    port: 5432,
    ssh_user: '',
    ssh_password: '',
    ssh_port: 22
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(10000);
  const [timeLeft, setTimeLeft] = useState(refreshInterval / 1000);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          const loginResponse = await axios.post(
            'http://10.110.20.55:8000/token',
            'username=admin&password=admin',
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
          );
          localStorage.setItem('token', loginResponse.data.access_token);
        }
        const response = await axios.get('http://10.110.20.55:8000/servers', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setServers(response.data);
      } catch (error) {
        console.error('Ошибка загрузки серверов:', error);
      }
    };

    fetchServers();
    const interval = setInterval(() => {
      fetchServers();
      setTimeLeft(refreshInterval / 1000);
    }, refreshInterval);

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : refreshInterval / 1000));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [refreshInterval]);

  const handleEdit = (server) => {
    setEditServer({ ...server, password: '', ssh_password: '' });
    setShowEditModal(true);
  };

  const handleDelete = async (serverName) => {
    try {
      await axios.delete(`http://10.110.20.55:8000/servers/${serverName}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setServers(servers.filter(server => server.name !== serverName));
      console.log(`Сервер ${serverName} успешно удалён`);
    } catch (error) {
      console.error('Ошибка удаления сервера:', error);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const response = await axios.put(
        `http://10.110.20.55:8000/servers/${editServer.name}`,
        editServer,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setServers(servers.map(server => server.name === editServer.name ? response.data : server));
      setShowEditModal(false);
      console.log('Сервер успешно обновлён:', response.data);
    } catch (error) {
      console.error('Ошибка обновления сервера:', error);
      setErrorMessage('Ошибка при сохранении изменений');
    }
  };

  const handleAdd = () => {
    setErrorMessage('');
    setShowAddModal(true);
  };

  const handleSaveAdd = async () => {
    try {
      const response = await axios.post(
        'http://10.110.20.55:8000/servers',
        newServer,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.status !== "ok") {
        setErrorMessage(`Ошибка: ${response.data.status}`);
      } else {
        setServers([...servers, response.data]);
        setNewServer({
          name: '',
          host: '',
          user: '',
          password: '',
          port: 5432,
          ssh_user: '',
          ssh_password: '',
          ssh_port: 22
        });
        setShowAddModal(false);
        console.log('Сервер успешно добавлен:', response.data);
      }
    } catch (error) {
      console.error('Ошибка добавления сервера:', error);
      setErrorMessage('Ошибка при добавлении сервера');
    }
  };

  const handleIntervalChange = (e) => {
    const value = parseInt(e.target.value);
    setRefreshInterval(value);
    setTimeLeft(value / 1000);
  };

  const formatBytes = (bytes) => bytes ? `${(bytes / 1073741824).toFixed(2)} ГБ` : 'N/A';

  const formatUptime = (hours) => {
    const totalSeconds = hours * 3600;
    const days = Math.floor(totalSeconds / 86400);
    const hoursLeft = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days} д. ${hoursLeft} ч. ${minutes} мин.`;
  };

  const progress = (timeLeft / (refreshInterval / 1000)) * 100;

  return (
    <div className="container mt-5">
      <Card className="mb-4">
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <span>Сервера</span>
            <Form.Group controlId="refreshInterval" className="d-flex align-items-center">
              <Form.Label className="refresh-label mr-2">Обновление каждые:</Form.Label>
              <Form.Select
                value={refreshInterval}
                onChange={handleIntervalChange}
                style={{ width: 'auto' }}
                className="mr-3"
              >
                <option value={5000}>5 сек</option>
                <option value={10000}>10 сек</option>
                <option value={15000}>15 сек</option>
                <option value={30000}>30 сек</option>
                <option value={60000}>1 мин</option>
              </Form.Select>
              <div className="progress-circle" style={{ '--progress': `${progress}%` }}>
                <span>{timeLeft} с</span>
              </div>
            </Form.Group>
          </div>
        </Card.Header>
        <Card.Body>
          <Table striped bordered hover>
            <thead>
              <tr>
                <th>Сервер</th>
                <th>IP</th>
                <th>Версия PostgreSQL</th>
                <th>Свободное место</th>
                <th>Соединения</th>
                <th>Uptime</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {servers.map(server => (
                <tr key={server.name}>
                  <td><Link to={`/server/${server.name}`}>{server.name}</Link></td>
                  <td>{server.host}</td>
                  <td>{server.version || 'N/A'}</td>
                  <td>{formatBytes(server.free_space)}</td>
                  <td>{server.connections ? `${server.connections.active} активных, ${server.connections.idle} простаивающих` : 'N/A'}</td>
                  <td>{server.uptime_hours ? formatUptime(server.uptime_hours) : 'N/A'}</td>
                  <td>{server.status}</td>
                  <td>
                    <Button variant="primary" className="mr-2" onClick={() => handleEdit(server)}>
                      Редактировать
                    </Button>
                    <Button variant="danger" onClick={() => handleDelete(server.name)}>
                      Удалить
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Button variant="success" onClick={handleAdd}>
        Добавить сервер
      </Button>

      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Редактировать сервер</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
          {editServer && (
            <Form>
              <Form.Group>
                <Form.Label>Название</Form.Label>
                <Form.Control
                  type="text"
                  value={editServer.name}
                  onChange={(e) => setEditServer({ ...editServer, name: e.target.value })}
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Хост</Form.Label>
                <Form.Control
                  type="text"
                  value={editServer.host}
                  onChange={(e) => setEditServer({ ...editServer, host: e.target.value })}
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Пользователь PostgreSQL</Form.Label>
                <Form.Control
                  type="text"
                  value={editServer.user || ''}
                  onChange={(e) => setEditServer({ ...editServer, user: e.target.value })}
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Пароль PostgreSQL</Form.Label>
                <Form.Control
                  type="password"
                  value={editServer.password || ''}
                  onChange={(e) => setEditServer({ ...editServer, password: e.target.value })}
                  placeholder="Оставьте пустым, если не меняете"
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Порт PostgreSQL</Form.Label>
                <Form.Control
                  type="number"
                  value={editServer.port || 5432}
                  onChange={(e) => setEditServer({ ...editServer, port: parseInt(e.target.value) })}
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Пользователь SSH</Form.Label>
                <Form.Control
                  type="text"
                  value={editServer.ssh_user || ''}
                  onChange={(e) => setEditServer({ ...editServer, ssh_user: e.target.value })}
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Пароль SSH</Form.Label>
                <Form.Control
                  type="password"
                  value={editServer.ssh_password || ''}
                  onChange={(e) => setEditServer({ ...editServer, ssh_password: e.target.value })}
                  placeholder="Оставьте пустым, если не меняете"
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Порт SSH</Form.Label>
                <Form.Control
                  type="number"
                  value={editServer.ssh_port || 22}
                  onChange={(e) => setEditServer({ ...editServer, ssh_port: parseInt(e.target.value) })}
                />
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Закрыть
          </Button>
          <Button variant="primary" onClick={handleSaveEdit}>
            Сохранить
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Добавить сервер</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
          <Form>
            <Form.Group>
              <Form.Label>Название</Form.Label>
              <Form.Control
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Хост</Form.Label>
              <Form.Control
                type="text"
                value={newServer.host}
                onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Пользователь PostgreSQL</Form.Label>
              <Form.Control
                type="text"
                value={newServer.user}
                onChange={(e) => setNewServer({ ...newServer, user: e.target.value })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Пароль PostgreSQL</Form.Label>
              <Form.Control
                type="password"
                value={newServer.password}
                onChange={(e) => setNewServer({ ...newServer, password: e.target.value })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Порт PostgreSQL</Form.Label>
              <Form.Control
                type="number"
                value={newServer.port}
                onChange={(e) => setNewServer({ ...newServer, port: parseInt(e.target.value) })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Пользователь SSH</Form.Label>
              <Form.Control
                type="text"
                value={newServer.ssh_user}
                onChange={(e) => setNewServer({ ...newServer, ssh_user: e.target.value })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Пароль SSH</Form.Label>
              <Form.Control
                type="password"
                value={newServer.ssh_password}
                onChange={(e) => setNewServer({ ...newServer, ssh_password: e.target.value })}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Порт SSH</Form.Label>
              <Form.Control
                type="number"
                value={newServer.ssh_port}
                onChange={(e) => setNewServer({ ...newServer, ssh_port: parseInt(e.target.value) })}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>
            Закрыть
          </Button>
          <Button variant="primary" onClick={handleSaveAdd}>
            Добавить
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default ServerList;