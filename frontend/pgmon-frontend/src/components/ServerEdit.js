import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Container, Card, Form, Button, Alert, Spinner, Row, Col } from 'react-bootstrap';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';
import './ServerEdit.css';

const API_BASE_URL = 'https://pam.cbmo.mosreg.ru';

function ServerEdit() {
  const { serverName } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [sshKeys, setSSHKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testingSSH, setTestingSSH] = useState(false);
  const [sshTestResult, setSSHTestResult] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const token = localStorage.getItem('token');

  // Загрузка данных сервера
  useEffect(() => {
    const fetchServerData = async () => {
      try {
        const [serversResponse, keysResponse] = await Promise.all([
          axios.get(`${API_BASE_URL}/servers`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/ssh-keys`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        const serverData = serversResponse.data.find(s => s.name === serverName);
        if (!serverData) {
          throw new Error('Сервер не найден');
        }

        setServer({
          ...serverData,
          password: '',
          ssh_password: '',
          ssh_auth_type: serverData.ssh_auth_type || 'password',
          ssh_key_id: serverData.ssh_key_id || '',
          ssh_key_passphrase: '',
          stats_db: serverData.stats_db || ''
        });
        setSSHKeys(keysResponse.data);
        setLoading(false);
      } catch (err) {
        console.error('Ошибка загрузки:', err);
        setError(err.message || 'Ошибка загрузки данных сервера');
        setLoading(false);
      }
    };

    fetchServerData();
  }, [serverName, token]);

  // Сохранение изменений
  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const dataToSend = { ...server };
      
      // Если используется ключ, добавляем passphrase если он указан
      if (server.ssh_auth_type === 'key' && server.ssh_key_passphrase) {
        dataToSend.ssh_key_passphrase = server.ssh_key_passphrase;
      }
      
      await axios.put(
        `${API_BASE_URL}/servers/${serverName}`,
        dataToSend,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSuccess('Изменения успешно сохранены');
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      console.error('Ошибка сохранения:', err);
      setError('Ошибка при сохранении: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  // Удаление сервера
  const handleDelete = async () => {
    try {
      await axios.delete(
        `${API_BASE_URL}/servers/${serverName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setSuccess('Сервер успешно удален');
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      console.error('Ошибка удаления:', err);
      setError('Ошибка при удалении: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Тест SSH подключения
  const handleTestSSH = async () => {
    setTestingSSH(true);
    setSSHTestResult(null);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/servers/${serverName}/test-ssh`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSSHTestResult(response.data);
    } catch (err) {
      setSSHTestResult({
        success: false,
        message: err.response?.data?.detail || err.message
      });
    } finally {
      setTestingSSH(false);
    }
  };

  // Обновление поля сервера
  const updateServerField = (field, value) => {
    setServer(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return <LoadingSpinner text="Загрузка данных сервера..." subtext="Получение информации" />;
  }

  if (!server) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          Сервер не найден
          <div className="mt-2">
            <Button variant="outline-secondary" onClick={() => navigate('/')}>
              ← Вернуться к списку
            </Button>
          </div>
        </Alert>
      </Container>
    );
  }

  const selectedKey = server.ssh_key_id ? sshKeys.find(k => k.id === server.ssh_key_id) : null;

  return (
    <Container className="mt-4 server-edit-page">
      {/* Заголовок страницы */}
      <div className="page-header">
        <h1 className="page-title">Редактирование сервера</h1>
        <div className="breadcrumb">
          <Link to="/">Главная</Link>
          <span>/</span>
          <Link to="/">Серверы</Link>
          <span>/</span>
          <span>{serverName}</span>
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Row>
        {/* Основные настройки */}
        <Col lg={8}>
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Основные настройки</h5>
            </Card.Header>
            <Card.Body>
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Название сервера</Form.Label>
                  <Form.Control
                    type="text"
                    value={server.name}
                    onChange={(e) => updateServerField('name', e.target.value)}
                    disabled
                  />
                  <Form.Text className="text-muted">
                    Название сервера нельзя изменить
                  </Form.Text>
                </Form.Group>

                <Row>
                  <Col md={8}>
                    <Form.Group className="mb-3">
                      <Form.Label>Хост</Form.Label>
                      <Form.Control
                        type="text"
                        value={server.host}
                        onChange={(e) => updateServerField('host', e.target.value)}
                        placeholder="192.168.1.100"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Порт PostgreSQL</Form.Label>
                      <Form.Control
                        type="number"
                        value={server.port}
                        onChange={(e) => updateServerField('port', parseInt(e.target.value))}
                        placeholder="5432"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label>База данных для статистики</Form.Label>
                  <Form.Control
                    type="text"
                    value={server.stats_db}
                    onChange={(e) => updateServerField('stats_db', e.target.value)}
                    placeholder="stats_db (опционально)"
                  />
                  <Form.Text className="text-muted">
                    Укажите имя базы данных для хранения статистики
                  </Form.Text>
                </Form.Group>

                <hr />

                <h6 className="mb-3">Учетные данные PostgreSQL</h6>

                <Form.Group className="mb-3">
                  <Form.Label>Пользователь PostgreSQL</Form.Label>
                  <Form.Control
                    type="text"
                    value={server.user}
                    onChange={(e) => updateServerField('user', e.target.value)}
                    placeholder="postgres"
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Пароль PostgreSQL</Form.Label>
                  <Form.Control
                    type="password"
                    value={server.password}
                    onChange={(e) => updateServerField('password', e.target.value)}
                    placeholder="Оставьте пустым, если не меняете"
                    autoComplete="new-password"
                  />
                </Form.Group>
              </Form>
            </Card.Body>
          </Card>

          {/* SSH настройки */}
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Настройки SSH</h5>
            </Card.Header>
            <Card.Body>
              <Form>
                <Row>
                  <Col md={8}>
                    <Form.Group className="mb-3">
                      <Form.Label>Пользователь SSH</Form.Label>
                      <Form.Control
                        type="text"
                        value={server.ssh_user}
                        onChange={(e) => updateServerField('ssh_user', e.target.value)}
                        placeholder="root"
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group className="mb-3">
                      <Form.Label>Порт SSH</Form.Label>
                      <Form.Control
                        type="number"
                        value={server.ssh_port}
                        onChange={(e) => updateServerField('ssh_port', parseInt(e.target.value))}
                        placeholder="22"
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Form.Group className="mb-3">
                  <Form.Label>Метод аутентификации</Form.Label>
                  <div>
                    <Form.Check
                      inline
                      type="radio"
                      label="По паролю"
                      name="sshAuth"
                      value="password"
                      checked={server.ssh_auth_type === 'password'}
                      onChange={(e) => updateServerField('ssh_auth_type', e.target.value)}
                    />
                    <Form.Check
                      inline
                      type="radio"
                      label="По SSH-ключу"
                      name="sshAuth"
                      value="key"
                      checked={server.ssh_auth_type === 'key'}
                      onChange={(e) => updateServerField('ssh_auth_type', e.target.value)}
                    />
                  </div>
                </Form.Group>

                {server.ssh_auth_type === 'password' ? (
                  <Form.Group className="mb-3">
                    <Form.Label>Пароль SSH</Form.Label>
                    <Form.Control
                      type="password"
                      value={server.ssh_password}
                      onChange={(e) => updateServerField('ssh_password', e.target.value)}
                      placeholder="Оставьте пустым, если не меняете"
                      autoComplete="new-password"
                    />
                  </Form.Group>
                ) : (
                  <>
                    <Form.Group className="mb-3">
                      <Form.Label>SSH-ключ</Form.Label>
                      <Form.Select
                        value={server.ssh_key_id}
                        onChange={(e) => updateServerField('ssh_key_id', e.target.value)}
                      >
                        <option value="">Выберите ключ...</option>
                        {sshKeys.map(key => (
                          <option key={key.id} value={key.id}>
                            {key.name} ({key.key_type.toUpperCase()}) - {key.fingerprint.substring(0, 16)}...
                          </option>
                        ))}
                      </Form.Select>
                      {selectedKey && (
                        <div className="mt-2">
                          <small className="text-muted">
                            Fingerprint: <code>{selectedKey.fingerprint}</code>
                          </small>
                        </div>
                      )}
                      {sshKeys.length === 0 && (
                        <Form.Text className="text-muted">
                          Нет доступных SSH-ключей. 
                          <Link to="/ssh-keys"> Перейти к управлению ключами</Link>
                        </Form.Text>
                      )}
                    </Form.Group>
                    
                    {selectedKey && selectedKey.has_passphrase && (
                      <Form.Group className="mb-3">
                        <Form.Label>Пароль от SSH-ключа</Form.Label>
                        <Form.Control
                          type="password"
                          value={server.ssh_key_passphrase}
                          onChange={(e) => updateServerField('ssh_key_passphrase', e.target.value)}
                          placeholder="Введите пароль от ключа"
                          autoComplete="new-password"
                        />
                        <Form.Text className="text-muted">
                          Этот ключ защищен паролем
                        </Form.Text>
                      </Form.Group>
                    )}
                  </>
                )}

                <div className="mt-3">
                  <Button
                    variant="outline-success"
                    onClick={handleTestSSH}
                    disabled={testingSSH}
                  >
                    {testingSSH ? <Spinner size="sm" /> : '🔧 Тест SSH подключения'}
                  </Button>
                  {sshTestResult && (
                    <Alert 
                      variant={sshTestResult.success ? 'success' : 'danger'} 
                      className="mt-3"
                    >
                      {sshTestResult.success ? '✅' : '❌'} {sshTestResult.message}
                    </Alert>
                  )}
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>

        {/* Боковая панель */}
        <Col lg={4}>
          {/* Информация о сервере */}
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Информация о сервере</h5>
            </Card.Header>
            <Card.Body>
              <div className="server-info-item">
                <span className="info-label">Статус:</span>
                <span className={`status-badge status-${server.status === 'ok' ? 'ok' : 'error'}`}>
                  {server.status === 'ok' ? 'Активен' : 'Недоступен'}
                </span>
              </div>
              {server.version && (
                <div className="server-info-item">
                  <span className="info-label">Версия PostgreSQL:</span>
                  <span>{server.version}</span>
                </div>
              )}
              {server.uptime_hours && (
                <div className="server-info-item">
                  <span className="info-label">Uptime:</span>
                  <span>{Math.floor(server.uptime_hours / 24)} дней</span>
                </div>
              )}
              {server.free_space && server.total_space && (
                <div className="server-info-item">
                  <span className="info-label">Свободное место:</span>
                  <span>
                    {(server.free_space / 1073741824).toFixed(1)} ГБ из {(server.total_space / 1073741824).toFixed(1)} ГБ
                  </span>
                </div>
              )}
            </Card.Body>
          </Card>

          {/* Действия */}
          <Card className="mb-4">
            <Card.Header>
              <h5 className="mb-0">Действия</h5>
            </Card.Header>
            <Card.Body>
              <div className="d-grid gap-2">
                <Button 
                  variant="primary" 
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Spinner size="sm" className="me-2" />
                      Сохранение...
                    </>
                  ) : (
                    '💾 Сохранить изменения'
                  )}
                </Button>
                <Button 
                  variant="outline-secondary" 
                  onClick={() => navigate('/')}
                >
                  ← Вернуться к списку
                </Button>
              </div>
            </Card.Body>
          </Card>

          {/* Опасная зона */}
          <Card className="border-danger">
            <Card.Header className="bg-danger text-white">
              <h5 className="mb-0">⚠️ Опасная зона</h5>
            </Card.Header>
            <Card.Body>
              <p className="text-muted small">
                Удаление сервера приведет к потере всей истории мониторинга. 
                Это действие необратимо.
              </p>
              {!showDeleteConfirm ? (
                <Button 
                  variant="outline-danger" 
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  🗑️ Удалить сервер
                </Button>
              ) : (
                <div>
                  <Alert variant="danger" className="mb-2">
                    Вы уверены? Это действие нельзя отменить!
                  </Alert>
                  <div className="d-flex gap-2">
                    <Button 
                      variant="danger" 
                      size="sm"
                      onClick={handleDelete}
                    >
                      Да, удалить
                    </Button>
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

export default ServerEdit;
