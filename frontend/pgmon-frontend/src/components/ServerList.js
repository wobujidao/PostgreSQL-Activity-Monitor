import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Table, Button, Modal, Form } from 'react-bootstrap';

function ServerList() {
  const [servers, setServers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editServer, setEditServer] = useState(null);
  const [formData, setFormData] = useState({
    name: '', host: '', user: '', password: '', port: 5432
  });

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 10000); // Автообновление каждые 10 секунд
    return () => clearInterval(interval);
  }, []);

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
      setFormData({ name: '', host: '', user: '', password: '', port: 5432 });
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

  return (
    <div>
      <h2 className="mb-4">Список серверов</h2>
      <Table striped bordered hover className="shadow-sm">
        <thead>
          <tr>
            <th>Сервер</th>
            <th>IP</th>
            <th>Свободное место</th>
            <th>Uptime</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {servers.map(server => (
            <tr key={server.name}>
              <td><Link to={`/server/${server.name}`}>{server.name}</Link></td>
              <td>{server.host}</td>
              <td>{server.free_space || 'N/A'}</td>
              <td>{server.uptime_hours ? `${server.uptime_hours} ч.` : 'N/A'}</td>
              <td>
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() => {
                    setEditServer(server);
                    setFormData({ ...server, port: server.port || 5432 });
                    setShowModal(true);
                  }}
               DET>Редактировать</Button>{' '}
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
              <Form.Label>Пользователь</Form.Label>
              <Form.Control
                name="user"
                value={formData.user}
                onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Пароль</Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Порт</Form.Label>
              <Form.Control
                type="number"
                name="port"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
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