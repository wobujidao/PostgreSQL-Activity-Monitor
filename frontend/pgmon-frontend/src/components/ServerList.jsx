import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, Button, Modal, Form, Card, Alert, Row, Col, OverlayTrigger, Tooltip, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import './ServerList.css';

function ServerList() {
  const navigate = useNavigate();
  const [servers, setServers] = useState([]);
  const [sshKeys, setSSHKeys] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newServer, setNewServer] = useState({
    name: '',
    host: '',
    user: '',
    password: '',
    port: 5432,
    ssh_user: '',
    ssh_password: '',
    ssh_port: 22,
    ssh_auth_type: 'password',
    ssh_key_id: '',
    ssh_key_passphrase: '',
    stats_db: ''
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(60000);
  const [timeLeft, setTimeLeft] = useState(refreshInterval / 1000);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [testingSSH, setTestingSSH] = useState(false);
  const [sshTestResult, setSSHTestResult] = useState(null);

  // Загрузка серверов
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Токен отсутствует, требуется авторизация');
        }
        const response = await axios.get('https://pam.cbmo.mosreg.ru/servers', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setServers(response.data);
        setLoading(false);
      } catch (error) {
        setErrorMessage('Ошибка загрузки серверов: ' + (error.message || 'Неизвестная ошибка'));
        setLoading(false);
      }
    };

    fetchServers();
    const interval = setInterval(() => {
      // Не обновляем данные если открыто модальное окно
      if (!showAddModal) {
        fetchServers();
        setTimeLeft(refreshInterval / 1000);
      }
    }, refreshInterval);

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : refreshInterval / 1000));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [refreshInterval, showAddModal]);

  // Загрузка SSH-ключей
  useEffect(() => {
    const fetchSSHKeys = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('https://pam.cbmo.mosreg.ru/ssh-keys', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSSHKeys(response.data);
      } catch (error) {
      }
    };

    fetchSSHKeys();
  }, []);

  const handleAdd = () => {
    setErrorMessage('');
    setShowAddModal(true);
    setSSHTestResult(null);
  };

  const handleSaveAdd = async () => {
    try {
      // Подготавливаем данные для отправки
      const dataToSend = {
        ...newServer
      };
      
      // Если используется ключ, добавляем passphrase если он указан
      if (newServer.ssh_auth_type === 'key' && newServer.ssh_key_passphrase) {
        dataToSend.ssh_key_passphrase = newServer.ssh_key_passphrase;
      }
      
      const response = await axios.post(
        'https://pam.cbmo.mosreg.ru/servers',
        dataToSend,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.status !== "ok" && response.data.status !== undefined) {
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
          ssh_port: 22,
          ssh_auth_type: 'password',
          ssh_key_id: '',
          ssh_key_passphrase: '',
          stats_db: ''
        });
        setShowAddModal(false);
        setSSHTestResult(null);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message || 'Неизвестная ошибка';
      setErrorMessage('Ошибка при добавлении сервера: ' + errorMsg);
    }
  };

  const handleTestSSH = async (server) => {
    setTestingSSH(true);
    setSSHTestResult(null);
    try {
      const response = await axios.post(
        `https://pam.cbmo.mosreg.ru/servers/${server.name}/test-ssh`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setSSHTestResult(response.data);
    } catch (error) {
      setSSHTestResult({
        success: false,
        message: error.response?.data?.detail || error.message
      });
    } finally {
      setTestingSSH(false);
    }
  };

  const handleIntervalChange = (e) => {
    const value = parseInt(e.target.value);
    setRefreshInterval(value);
    setTimeLeft(value / 1000);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
  };

  const formatUptime = (hours) => {
    if (!hours) return 'N/A';
    const totalSeconds = hours * 3600;
    const days = Math.floor(totalSeconds / 86400);
    const hoursLeft = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days} д. ${hoursLeft} ч. ${minutes} мин.`;
  };

  const getServerStatus = (server) => {
    if (!server.status || server.status === 'failed' || server.status.includes('error')) {
      return {
        class: 'error',
        text: 'Connection Failed',
        tooltip: 'Не удается подключиться к серверу. Проверьте сетевое соединение и настройки подключения.'
      };
    }
    if (server.status === 'ok' || server.status.includes('ok')) {
      const totalConnections = (server.connections?.active || 0) + (server.connections?.idle || 0);
      if (totalConnections > 50) {
        return {
          class: 'warning',
          text: 'High Load',
          tooltip: `Высокая нагрузка: ${totalConnections} активных соединений. Рекомендуется мониторинг производительности.`
        };
      }
      return {
        class: 'online',
        text: 'Online',
        tooltip: `Сервер работает нормально. Соединений: ${totalConnections}`
      };
    }
    return {
      class: 'offline',
      text: 'Unknown',
      tooltip: 'Статус сервера неизвестен. Возможны проблемы с мониторингом.'
    };
  };

  const getDiskUsageClass = (freeSpace, totalSpace) => {
    if (!freeSpace || !totalSpace) return 'danger';
    const usedPercent = ((totalSpace - freeSpace) / totalSpace) * 100;
    if (usedPercent < 70) return 'good';
    if (usedPercent < 85) return 'warning';
    return 'danger';
  };

  const getDiskUsagePercent = (freeSpace, totalSpace) => {
    if (!freeSpace || !totalSpace) return 0;
    return ((totalSpace - freeSpace) / totalSpace) * 100;
  };

  const getSortValue = (server, field) => {
    switch (field) {
      case 'name':
        return server.name || '';
      case 'host':
        return server.host || '';
      case 'version':
        return server.version || '';
      case 'connections':
        return (server.connections?.active || 0) + (server.connections?.idle || 0);
      case 'free_space':
        return server.free_space || 0;
      case 'uptime':
        return server.uptime_hours || 0;
      case 'status':
        return getServerStatus(server).text;
      default:
        return '';
    }
  };

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         server.host.toLowerCase().includes(searchTerm.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'online') return matchesSearch && getServerStatus(server).class === 'online';
    if (statusFilter === 'error') return matchesSearch && getServerStatus(server).class === 'error';

    return matchesSearch;
  }).sort((a, b) => {
    const aValue = getSortValue(a, sortField);
    const bValue = getSortValue(b, sortField);

    if (typeof aValue === 'string') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    } else {
      return sortDirection === 'asc'
        ? aValue - bValue
        : bValue - aValue;
    }
  });

  const progress = (timeLeft / (refreshInterval / 1000)) * 100;

  const getSortClass = (field) => {
    if (sortField !== field) return 'sortable';
    return `sortable sorted-${sortDirection}`;
  };

  // Показываем LoadingSpinner при первой загрузке
  if (loading) {
    return <LoadingSpinner text="Загрузка серверов..." subtext="Подключение к базам данных" />;
  }

  // Компонент для SSH настроек в модальном окне
  const SSHAuthSettings = ({ server, onChange, isEdit = false }) => {
    // Находим информацию о выбранном ключе
    const selectedKey = server.ssh_key_id ? sshKeys.find(k => k.id === server.ssh_key_id) : null;
    
    return (
      <>
        <Form.Group className="mb-3">
          <Form.Label>SSH Аутентификация</Form.Label>
          <div>
            <Form.Check
              inline
              type="radio"
              label="По паролю"
              name={`sshAuth-${isEdit ? 'edit' : 'add'}`}
              value="password"
              checked={server.ssh_auth_type === 'password'}
              onChange={(e) => onChange({ ...server, ssh_auth_type: e.target.value })}
            />
            <Form.Check
              inline
              type="radio"
              label="По SSH-ключу"
              name={`sshAuth-${isEdit ? 'edit' : 'add'}`}
              value="key"
              checked={server.ssh_auth_type === 'key'}
              onChange={(e) => onChange({ ...server, ssh_auth_type: e.target.value })}
            />
          </div>
        </Form.Group>

        {server.ssh_auth_type === 'password' ? (
          <Form.Group className="mb-3">
            <Form.Label>Пароль SSH</Form.Label>
            <Form.Control
              type="password"
              value={server.ssh_password || ''}
              onChange={(e) => onChange({ ...server, ssh_password: e.target.value })}
              placeholder={isEdit ? "Оставьте пустым, если не меняете" : "Введите пароль SSH"}
            />
          </Form.Group>
        ) : (
          <>
            <Form.Group className="mb-3">
              <Form.Label>SSH-ключ</Form.Label>
              <Form.Select
                value={server.ssh_key_id || ''}
                onChange={(e) => onChange({ ...server, ssh_key_id: e.target.value })}
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
                  value={server.ssh_key_passphrase || ''}
                  onChange={(e) => onChange({ ...server, ssh_key_passphrase: e.target.value })}
                  placeholder="Введите пароль от ключа"
                />
                <Form.Text className="text-muted">
                  Этот ключ защищен паролем
                </Form.Text>
              </Form.Group>
            )}
          </>
        )}

        {server.name && server.ssh_auth_type && (
          <Form.Group className="mb-3">
            <Button
              variant="outline-success"
              size="sm"
              onClick={() => handleTestSSH(server)}
              disabled={testingSSH}
            >
              {testingSSH ? <Spinner size="sm" /> : '🔧 Тест SSH подключения'}
            </Button>
            {sshTestResult && (
              <Alert 
                variant={sshTestResult.success ? 'success' : 'danger'} 
                className="mt-2 mb-0"
              >
                {sshTestResult.success ? '✅' : '❌'} {sshTestResult.message}
              </Alert>
            )}
          </Form.Group>
        )}
      </>
    );
  };

  return (
    <div className="container mt-4">
      {/* Панель фильтров */}
      <Card className="mb-4">
        <Card.Body className="py-3">
          <Row className="align-items-center">
            <Col md={4}>
              <div className="d-flex align-items-center gap-2">
                <label className="mb-0 font-weight-medium">Статус:</label>
                <div className="select-wrapper">
                  <Form.Select
                    size="sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ width: 'auto' }}
                  >
                    <option value="all">Все серверы</option>
                    <option value="online">Только активные</option>
                    <option value="error">С ошибками</option>
                  </Form.Select>
                  <svg className="select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 10l5 5 5-5z"/>
                  </svg>
                </div>
              </div>
            </Col>
            <Col md={4}>
              <div className="d-flex align-items-center gap-2">
                <label className="mb-0 font-weight-medium">Поиск:</label>
                <Form.Control
                  size="sm"
                  type="text"
                  placeholder="Имя сервера..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </Col>
            <Col md={4}>
              <div className="d-flex align-items-center justify-content-end gap-3">
                <div className="d-flex align-items-center gap-2">
                  <label className="mb-0 font-weight-medium">Обновление:</label>
                  <div className="select-wrapper">
                    <Form.Select
                      size="sm"
                      value={refreshInterval}
                      onChange={handleIntervalChange}
                      style={{ width: 'auto' }}
                    >
                      <option value={5000}>5 сек</option>
                      <option value={10000}>10 сек</option>
                      <option value={15000}>15 сек</option>
                      <option value={30000}>30 сек</option>
                      <option value={60000}>1 мин</option>
                    </Form.Select>
                    <svg className="select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 10l5 5 5-5z"/>
                    </svg>
                  </div>
                </div>
                <div className="progress-circle-wrapper">
                  <svg className="progress-circle" viewBox="0 0 36 36">
                    <path className="progress-circle-bg"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path className="progress-circle-fill"
                      d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                      style={{
                        strokeDasharray: `${progress}, 100`
                      }}
                    />
                  </svg>
                  <span className="progress-text">{timeLeft}с</span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.location.reload()}
                >
                  Обновить
                </Button>
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Таблица серверов */}
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0">Серверы PostgreSQL</h5>
          <Button variant="success" size="sm" onClick={handleAdd}>
            + Добавить сервер
          </Button>
        </Card.Header>
        <Card.Body className="p-0">
          {errorMessage && (
            <Alert variant="danger" className="m-3 mb-0">
              {errorMessage}
            </Alert>
          )}
          <div className="table-responsive">
            <Table className="mb-0" hover>
              <thead>
                <tr>
                  <th className={getSortClass('name')} onClick={() => handleSort('name')}>
                    Сервер
                  </th>
                  <th className={getSortClass('host')} onClick={() => handleSort('host')}>
                    IP адрес
                  </th>
                  <th className={getSortClass('version')} onClick={() => handleSort('version')}>
                    Версия PG
                  </th>
                  <th className={getSortClass('connections')} onClick={() => handleSort('connections')}>
                    Соединения
                  </th>
                  <th className={getSortClass('free_space')} onClick={() => handleSort('free_space')}>
                    Свободное место
                  </th>
                  <th className={getSortClass('uptime')} onClick={() => handleSort('uptime')}>
                    Uptime
                  </th>
                  <th className={getSortClass('status')} onClick={() => handleSort('status')}>
                    Статус
                  </th>
                  <th>SSH</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredServers.map(server => {
                  const status = getServerStatus(server);
                  const diskClass = getDiskUsageClass(server.free_space, server.total_space);
                  const diskPercent = getDiskUsagePercent(server.free_space, server.total_space);
                  const sshKeyInfo = server.ssh_key_info;

                  return (
                    <tr key={server.name}>
                      <td>
                        <Link to={`/server/${server.name}`} className="server-link">
                          {server.name}
                        </Link>
                      </td>
                      <td>
                        <code className="server-ip">{server.host}</code>
                      </td>
                      <td className="text-sm">{server.version || 'N/A'}</td>
                      <td className="text-sm">
                        {server.connections ? (
                          <>
                            <span className="connections-active">{server.connections.active || 0} активных</span>
                            {' / '}
                            <span className="connections-idle">{server.connections.idle || 0} idle</span>
                          </>
                        ) : 'N/A'}
                      </td>
                      <td>
                        <div className="disk-space-cell">
                          <div className="disk-space-info">
                            <div className="disk-space-text">
                              <strong style={{ color: diskClass === 'danger' ? 'var(--danger)' : diskClass === 'warning' ? 'var(--warning)' : 'var(--success)' }}>
                                {formatBytes(server.free_space)}
                              </strong>
                              {server.total_space && ` из ${formatBytes(server.total_space)} (${(100 - diskPercent).toFixed(1)}%)`}
                            </div>
                            {server.total_space && (
                              <OverlayTrigger
                                placement="top"
                                overlay={
                                  <Tooltip>
                                    Использовано: {diskPercent.toFixed(1)}%
                                    ({formatBytes(server.total_space - server.free_space)} из {formatBytes(server.total_space)})
                                  </Tooltip>
                                }
                              >
                                <div className="disk-progress">
                                  <div
                                    className={`disk-progress-bar ${diskClass}`}
                                    style={{ width: `${diskPercent}%` }}
                                  ></div>
                                </div>
                              </OverlayTrigger>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="uptime-info">{formatUptime(server.uptime_hours)}</td>
                      <td>
                        <OverlayTrigger
                          placement="top"
                          overlay={<Tooltip>{status.tooltip}</Tooltip>}
                        >
                          <span className={`status-badge status-${status.class === 'online' ? 'ok' : status.class}`}>
                            {status.text === 'Online' ? 'Активен' : 
                             status.text === 'High Load' ? 'Нагрузка' :
                             status.text === 'Connection Failed' ? 'Недоступен' :
                             'Неизвестно'}
                          </span>
                        </OverlayTrigger>
                      </td>
                      <td>
                        <span className="text-sm">
                          {server.ssh_auth_type === 'key' ? '🔑' : '🔒'} 
                          {server.ssh_auth_type === 'key' && sshKeyInfo ? (
                            <OverlayTrigger
                              placement="top"
                              overlay={
                                <Tooltip>
                                  Ключ: {sshKeyInfo.name}<br/>
                                  Fingerprint: {sshKeyInfo.fingerprint}
                                </Tooltip>
                              }
                            >
                              <span> {sshKeyInfo.name}</span>
                            </OverlayTrigger>
                          ) : (
                            ' пароль'
                          )}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => navigate(`/server/${server.name}/edit`)}
                        >
                          Управление
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>

      {/* Модальное окно добавления (остается только для добавления новых серверов) */}
      <Modal show={showAddModal} onHide={() => { setShowAddModal(false); setSSHTestResult(null); }} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Добавить сервер</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
          <Form className="modal-form">
            <Form.Group className="mb-3">
              <Form.Label>Название</Form.Label>
              <Form.Control
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Хост</Form.Label>
              <Form.Control
                type="text"
                value={newServer.host}
                onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>База для статистики</Form.Label>
              <Form.Control
                type="text"
                value={newServer.stats_db || ''}
                onChange={(e) => setNewServer({ ...newServer, stats_db: e.target.value })}
                placeholder="stats_db (опционально)"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Пользователь PostgreSQL</Form.Label>
              <Form.Control
                type="text"
                value={newServer.user}
                onChange={(e) => setNewServer({ ...newServer, user: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Пароль PostgreSQL</Form.Label>
              <Form.Control
                type="password"
                value={newServer.password}
                onChange={(e) => setNewServer({ ...newServer, password: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Порт PostgreSQL</Form.Label>
              <Form.Control
                type="number"
                value={newServer.port}
                onChange={(e) => setNewServer({ ...newServer, port: parseInt(e.target.value) })}
              />
            </Form.Group>
            
            <hr />
            
            <Form.Group className="mb-3">
              <Form.Label>Пользователь SSH</Form.Label>
              <Form.Control
                type="text"
                value={newServer.ssh_user}
                onChange={(e) => setNewServer({ ...newServer, ssh_user: e.target.value })}
              />
            </Form.Group>

            <SSHAuthSettings 
              server={newServer} 
              onChange={setNewServer}
              isEdit={false}
            />

            <Form.Group className="mb-3">
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
          <Button variant="secondary" onClick={() => { setShowAddModal(false); setSSHTestResult(null); }}>
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
