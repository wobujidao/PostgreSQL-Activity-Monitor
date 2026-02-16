import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Card, 
  Table, 
  Button, 
  Modal, 
  Form, 
  Alert
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';
import './UserManagement.css';

const API_BASE_URL = 'https://pam.cbmo.mosreg.ru';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    role: 'viewer',
    email: ''
  });
  const [successMessage, setSuccessMessage] = useState('');

  const currentUser = localStorage.getItem('username');
  const token = localStorage.getItem('token');

  // Загрузка списка пользователей
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (err) {
      console.error('Ошибка загрузки:', err);
      const errorMessage = err.response?.data?.detail || 
                          err.response?.data?.message || 
                          err.message || 
                          'Неизвестная ошибка';
      setError('Ошибка загрузки пользователей: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Создание пользователя
  const handleCreateUser = async () => {
    try {
      // Подготавливаем данные, отправляем null если email пустой
      const userData = {
        login: formData.login,
        password: formData.password,
        role: formData.role,
        email: formData.email.trim() || null
      };

      const response = await axios.post(
        `${API_BASE_URL}/users`,
        userData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      setUsers([...users, response.data]);
      setShowAddModal(false);
      setFormData({ login: '', password: '', role: 'viewer', email: '' });
      showSuccess('Пользователь успешно создан');
      fetchUsers(); // Обновляем список
    } catch (err) {
      console.error('Ошибка создания:', err);
      const errorMessage = err.response?.data?.detail || 
                          err.response?.data?.message || 
                          err.message || 
                          'Неизвестная ошибка';
      setError('Ошибка создания пользователя: ' + errorMessage);
    }
  };

  // Обновление пользователя
  const handleUpdateUser = async () => {
    try {
      const updateData = {
        role: formData.role,
        email: formData.email.trim() || null
      };
      
      // Добавляем пароль только если он указан
      if (formData.password) {
        updateData.password = formData.password;
      }

      const response = await axios.put(
        `${API_BASE_URL}/users/${editingUser.login}`,
        updateData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );
      
      setUsers(users.map(u => u.login === editingUser.login ? response.data : u));
      setShowEditModal(false);
      setEditingUser(null);
      setFormData({ login: '', password: '', role: 'viewer', email: '' });
      showSuccess('Пользователь успешно обновлен');
      fetchUsers(); // Обновляем список
    } catch (err) {
      console.error('Ошибка обновления:', err);
      const errorMessage = err.response?.data?.detail || 
                          err.response?.data?.message || 
                          err.message || 
                          'Неизвестная ошибка';
      setError('Ошибка обновления пользователя: ' + errorMessage);
    }
  };

  // Удаление пользователя
  const handleDeleteUser = async (login) => {
    if (!window.confirm(`Вы уверены, что хотите удалить пользователя ${login}?`)) {
      return;
    }

    try {
      await axios.delete(
        `${API_BASE_URL}/users/${login}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers(users.filter(u => u.login !== login));
      showSuccess('Пользователь успешно удален');
    } catch (err) {
      console.error('Ошибка удаления:', err);
      const errorMessage = err.response?.data?.detail || 
                          err.response?.data?.message || 
                          err.message || 
                          'Неизвестная ошибка';
      setError('Ошибка удаления пользователя: ' + errorMessage);
    }
  };

  // Открытие модального окна редактирования
  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      login: user.login,
      password: '',
      role: user.role,
      email: user.email || ''
    });
    setShowEditModal(true);
  };

  // Показ сообщения об успехе
  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Получение названия роли на русском
  const getRoleName = (role) => {
    switch (role) {
      case 'admin': return '👑 Администратор';
      case 'operator': return '⚙️ Оператор';
      case 'viewer': return '👁️ Просмотр';
      default: return role;
    }
  };

  // Форматирование даты
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Валидация формы
  const isFormValid = () => {
    return formData.login.trim() && formData.password && formData.password.length >= 8;
  };

  // Очистка формы
  const resetForm = () => {
    setFormData({ login: '', password: '', role: 'viewer', email: '' });
    setError(null);
  };

  // Закрытие модального окна добавления
  const handleCloseAddModal = () => {
    setShowAddModal(false);
    resetForm();
  };

  // Закрытие модального окна редактирования
  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
    resetForm();
  };

  if (loading) {
    return <LoadingSpinner text="Загрузка пользователей..." subtext="Получение списка" />;
  }

  return (
    <Container className="mt-4">
      {/* Заголовок страницы */}
      <div className="page-header">
        <h1 className="page-title">Управление пользователями</h1>
        <div className="breadcrumb">
          <Link to="/">Главная</Link>
          <span>/</span>
          <Link to="/">Серверы</Link>
          <span>/</span>
          <span>Пользователи</span>
        </div>
      </div>

      {/* Статистика пользователей */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Card style={{ textAlign: 'center', padding: '1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>ВСЕГО ПОЛЬЗОВАТЕЛЕЙ</div>
          <div style={{ fontSize: '2rem', fontWeight: '700' }}>{users.length}</div>
        </Card>
        <Card style={{ textAlign: 'center', padding: '1.5rem', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👑</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>АДМИНИСТРАТОРЫ</div>
          <div style={{ fontSize: '2rem', fontWeight: '700' }}>{users.filter(u => u.role === 'admin').length}</div>
        </Card>
        <Card style={{ textAlign: 'center', padding: '1.5rem', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>ОПЕРАТОРЫ</div>
          <div style={{ fontSize: '2rem', fontWeight: '700' }}>{users.filter(u => u.role === 'operator').length}</div>
        </Card>
        <Card style={{ textAlign: 'center', padding: '1.5rem', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👁️</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>ПРОСМОТР</div>
          <div style={{ fontSize: '2rem', fontWeight: '700' }}>{users.filter(u => u.role === 'viewer').length}</div>
        </Card>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {successMessage && (
        <div style={{ background: '#d4edda', color: '#155724', padding: '1rem 1.25rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          ✅ {successMessage}
        </div>
      )}

      {/* Таблица пользователей */}
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span className="card-title">Список пользователей</span>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="outline-secondary" size="sm" onClick={() => window.history.back()}>
              ← Назад к серверам
            </Button>
            <Button variant="success" onClick={() => setShowAddModal(true)}>
              + Добавить пользователя
            </Button>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <Table hover responsive className="mb-0">
            <thead>
              <tr>
                <th>Логин</th>
                <th>Роль</th>
                <th>Email</th>
                <th>Создан</th>
                <th>Последний вход</th>
                <th>Статус</th>
                <th style={{ textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.login}>
                  <td>
                    <strong>{user.login}</strong>
                    {user.login === currentUser && (
                      <span style={{ background: 'var(--accent)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', marginLeft: '8px' }}>Вы</span>
                    )}
                  </td>
                  <td>
                    <span style={{
                      background: user.role === 'admin' ? '#ef444419' : user.role === 'operator' ? '#f59e0b19' : '#0ea5e919',
                      color: user.role === 'admin' ? 'var(--danger)' : user.role === 'operator' ? 'var(--warning)' : 'var(--accent)',
                      padding: '4px 12px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {getRoleName(user.role)}
                    </span>
                  </td>
                  <td>{user.email || '-'}</td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>{formatDate(user.last_login)}</td>
                  <td>
                    <span className={`status-badge status-${user.is_active ? 'ok' : 'error'}`}>
                      {user.is_active ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      style={{ marginRight: '0.5rem' }}
                      onClick={() => openEditModal(user)}
                    >
                      ✏️
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => handleDeleteUser(user.login)}
                      disabled={user.login === currentUser || user.login === 'admin'}
                      style={{ opacity: user.login === currentUser || user.login === 'admin' ? 0.5 : 1 }}
                    >
                      🗑️
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Модальное окно добавления пользователя */}
      <Modal show={showAddModal} onHide={handleCloseAddModal}>
        <Modal.Header closeButton>
          <Modal.Title>Новый пользователь</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Логин <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={formData.login}
                onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                placeholder="Введите логин"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Пароль <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Введите пароль"
                required
              />
              <Form.Text className={formData.password && formData.password.length < 8 ? 'text-danger' : 'text-muted'}>
                Минимум 8 символов {formData.password && formData.password.length < 8 && `(сейчас: ${formData.password.length})`}
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Роль <span className="text-danger">*</span></Form.Label>
              <Form.Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                <option value="viewer">Просмотр</option>
                <option value="operator">Оператор</option>
                <option value="admin">Администратор</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@example.com (необязательно)"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseAddModal}>
            Отмена
          </Button>
          <Button 
            variant="primary" 
            onClick={handleCreateUser}
            disabled={!isFormValid()}
          >
            Создать пользователя
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Модальное окно редактирования пользователя */}
      <Modal show={showEditModal} onHide={handleCloseEditModal}>
        <Modal.Header closeButton>
          <Modal.Title>Редактировать пользователя</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Логин</Form.Label>
              <Form.Control
                type="text"
                value={formData.login}
                disabled
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Новый пароль</Form.Label>
              <Form.Control
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Оставьте пустым, чтобы не менять"
              />
              {formData.password && formData.password.length < 8 && (
                <Form.Text className="text-danger">
                  Минимум 8 символов (сейчас: {formData.password.length})
                </Form.Text>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Роль</Form.Label>
              <Form.Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                disabled={editingUser?.login === 'admin'}
              >
                <option value="viewer">Просмотр</option>
                <option value="operator">Оператор</option>
                <option value="admin">Администратор</option>
              </Form.Select>
              {editingUser?.login === 'admin' && (
                <Form.Text className="text-muted">
                  Роль администратора admin изменить нельзя
                </Form.Text>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@example.com (необязательно)"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseEditModal}>
            Отмена
          </Button>
          <Button 
            variant="primary" 
            onClick={handleUpdateUser}
            disabled={formData.password && formData.password.length < 8}
          >
            Сохранить изменения
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default UserManagement;
