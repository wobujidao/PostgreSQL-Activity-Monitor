import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Table, Button, Modal, Form } from 'react-bootstrap';

function ServerList() {
  const [servers, setServers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editServer, setEditServer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    user: '',
    password: '',
    port: 5432,
    ssh_user: '',
    ssh_password: '',
    ssh_port: 22
  });

  useEffect(() => {
    const loginAndFetch = async () => {
      try {
        // Получение токена
        const loginResponse = await axios.post(
          'http://10.110.20.55:8000/token',
          'username=admin&password=admin',
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        localStorage.setItem('token', loginResponse.data.access_token);

        // Запрос серверов
        const fetchServers = async () => {
          try {
            const response = await axios.get('http://10.110.20.55:8000/servers', {
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            setServers(response.data);
          } catch (error) {
            console.error('Ошибка загрузки серверов:', error);
          }
        };

        fetchServers();
        const interval = setInterval(fetchServers, 10000); // Обновление каждые 10 секунд
        return () => clearInterval(interval);
      } catch (error) {
        console.error('Ошибка авторизации:', error);
      }
    };
    loginAndFetch();
  }, []);

  const handleAddEdit = async (e) => {
    e.preventDefault();
    try {
      if (editServer) {
        await axios.put(`http://10.110.20.55:8000/servers/${editServer.name}`, formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      } else {
        await axios.post('http://10.110.20.55:8000/servers', formData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      }
      fetchServers();
      setShowModal(false);
      setEditServer(null);
      setFormData({
        name: '',
        host: '',
        user: '',
        password: '',
        port: 5432,
        ssh_user: '',
        ssh_password: '',
        ssh_port: 22
      });
    } catch (error) {
      console.error('Ошибка при сохранении сервера:', error);
    }
  };

  const handleDelete = async (name) => {
    if (window.confirm(`Удалить сервер ${name}?`)) {
      try {
        await axios.delete(`http://10.110.20.55:8000/servers/${name}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        fetchServers();
      } catch (error) {
        console.error('Ошибка удаления сервера:', error);
      }
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return 'N/A';
    const gb = bytes / 1073741824; // Перевод в ГБ
    return `${gb.toFixed(2)} ГБ`;
  };

  return (
    <div>
      <h2 className="mb-4">Список серверов</h2>
      <Table striped bordered hover className="shadow-sm">
        <thead>
          <tr>
            <th>Сервер</th>
            <th>IP</th>
            <th>Версия PostgreSQL</th>
            <th>Свободное место</th>
            <th>Соединения</th>
            <th>Uptime</th>
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
              <td>{server.uptime_hours ? `${server.uptime_hours} ч.` : 'N/A'}</td>
              <td>
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() => {
                    setEditServer(server);
                    setFormData({
                      name: server.name,
                      host: server.host,
                      user: server.user,
                      password: server.password,
                      port: server.port || 5432,
                      ssh_user: server.ssh_user || '',
                      ssh_password: server.ssh_password || '',
                      ssh_port: server.ssh_port || 22
                    });
                    setShowModal(true);
                  }}
                >
                  Редактировать
                </Button>{' '}
                <Button variant="danger" size="sm" onClick={() => handleDelete(server.name)}>
                  Удалить
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Button variant="primary" onClick={() => setShowModal(true)}>
        Добавить сервер
      </Button>

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>{editServer ? 'Редактировать сервер' : 'Добавить сервер'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleAddEdit}>
            <Form.Group className="mb-3">
              <Form.Label>Название</Form.Label>
              <Form.Control
                name="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Хост</Form.Label>
              <Form.Control
                name="host"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Пользователь PostgreSQL</Form.Label>
              <Form.Control
                name="user"
                value={formData.user}
                onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Пароль PostgreSQL</Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Порт PostgreSQL</Form.Label>
              <Form.Control
                type="number"
                name="port"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Пользователь SSH</Form.Label>
              <Form.Control
                name="ssh_user"
                value={formData.ssh_user}
                onChange={(e) => setFormData({ ...formData, ssh_user: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Пароль SSH</Form.Label>
              <Form.Control
                type="password"
                name="ssh_password"
                value={formData.ssh_password}
                onChange={(e) => setFormData({ ...formData, ssh_password: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Порт SSH</Form.Label>
              <Form.Control
                type="number"
                name="ssh_port"
                value={formData.ssh_port}
                onChange={(e) => setFormData({ ...formData, ssh_port: parseInt(e.target.value) })}
                required
              />
            </Form.Group>
            <Button type="submit" variant="primary">Сохранить</Button>
          </Form>
        </Modal.Body>
      </Modal>
    </div>
  );
}

export default ServerList;