import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  Table,
  Button,
  Modal,
  Form,
  Alert,
  Nav,
  Tab,
  Spinner,
  Badge
} from 'react-bootstrap';
import { Link } from 'react-router-dom';
import axios from 'axios';
import LoadingSpinner from './LoadingSpinner';
import './SSHKeyManagement.css';

const API_BASE_URL = 'https://pam.cbmo.mosreg.ru';

function SSHKeyManagement() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('generate'); // 'generate' или 'import'
  const [selectedKey, setSelectedKey] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: ''
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // Форма для генерации ключа
  const [keyName, setKeyName] = useState('');
  const [keyType, setKeyType] = useState('rsa');
  const [keySize, setKeySize] = useState('2048');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [description, setDescription] = useState('');
  
  // Форма для импорта ключа
  const [importKeyName, setImportKeyName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importDescription, setImportDescription] = useState('');

  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole') || 'viewer';

  // Загрузка списка ключей
  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_BASE_URL}/ssh-keys`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setKeys(response.data);
    } catch (err) {
      console.error('Ошибка загрузки ключей:', err);
      setError('Ошибка загрузки SSH-ключей: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  // Генерация нового ключа
  const handleGenerateKey = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/ssh-keys/generate`,
        {
          name: keyName,
          key_type: keyType,
          key_size: keyType === 'rsa' ? parseInt(keySize) : null,
          passphrase: passphrase || null,
          description: description || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setKeys([...keys, response.data]);
      setShowModal(false);
      resetForms();
      setSuccess('SSH-ключ успешно сгенерирован');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Ошибка генерации ключа: ' + (err.response?.data?.detail || err.message));
    } finally {
      setIsGenerating(false);
    }
  };

  // Импорт существующего ключа
  const handleImportKey = async () => {
    setIsImporting(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/ssh-keys/import`,
        {
          name: importKeyName,
          private_key: privateKey,
          passphrase: importPassphrase || null,
          description: importDescription || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setKeys([...keys, response.data]);
      setShowModal(false);
      resetForms();
      setSuccess('SSH-ключ успешно импортирован');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const errorMessage = err.response?.data?.detail || err.message;
      // Проверяем, является ли это ошибкой дубликата
      if (errorMessage.includes('уже существует в системе')) {
        setError(errorMessage);
      } else {
        setError('Ошибка импорта ключа: ' + errorMessage);
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Открыть модальное окно редактирования
  const openEditModal = (key) => {
    setEditingKey(key);
    setEditFormData({
      name: key.name,
      description: key.description || ''
    });
    setShowEditModal(true);
  };

  // Сохранить изменения ключа
  const handleUpdateKey = async () => {
    try {
      const response = await axios.put(
        `${API_BASE_URL}/ssh-keys/${editingKey.id}`,
        editFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Обновляем список ключей
      setKeys(keys.map(k => k.id === editingKey.id ? response.data : k));
      setShowEditModal(false);
      setEditingKey(null);
      setSuccess('SSH-ключ успешно обновлен');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Ошибка обновления ключа: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Удаление ключа
  const handleDeleteKey = async (keyId, keyNameToDelete) => {
    if (!window.confirm(`Вы уверены, что хотите удалить ключ "${keyNameToDelete}"?`)) {
      return;
    }

    try {
      await axios.delete(
        `${API_BASE_URL}/ssh-keys/${keyId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setKeys(keys.filter(k => k.id !== keyId));
      setSuccess('SSH-ключ успешно удален');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Ошибка удаления ключа: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Загрузка публичного ключа
  const handleDownloadPublicKey = async (key) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/ssh-keys/${key.id}/download-public`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const blob = new Blob([response.data.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Ошибка загрузки ключа: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Показать детали ключа
  const showKeyDetails = (key) => {
    setSelectedKey(key);
    setShowDetailsModal(true);
  };

  // Открыть модальное окно для генерации
  const openGenerateModal = () => {
    setModalMode('generate');
    setShowModal(true);
  };

  // Открыть модальное окно для импорта
  const openImportModal = () => {
    setModalMode('import');
    setShowModal(true);
  };

  // Сброс форм
  const resetForms = () => {
    // Генерация
    setKeyName('');
    setKeyType('rsa');
    setKeySize('2048');
    setPassphrase('');
    setConfirmPassphrase('');
    setDescription('');
    
    // Импорт
    setImportKeyName('');
    setPrivateKey('');
    setImportPassphrase('');
    setImportDescription('');
  };

  // Обработка загрузки файла
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPrivateKey(e.target.result);
      };
      reader.readAsText(file);
    }
  };

  // Форматирование даты
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Копирование в буфер обмена
  const copyToClipboard = (text) => {
    // Проверяем доступность Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => alert('Скопировано в буфер обмена'))
        .catch(() => fallbackCopyToClipboard(text));
    } else {
      // Используем fallback метод для HTTP
      fallbackCopyToClipboard(text);
    }
  };

  // Fallback метод копирования для HTTP
  const fallbackCopyToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      alert('Скопировано в буфер обмена');
    } catch (err) {
      alert('Не удалось скопировать. Выделите текст и нажмите Ctrl+C');
    }
    document.body.removeChild(textArea);
  };

  if (loading) {
    return <LoadingSpinner text="Загрузка SSH-ключей..." subtext="Получение списка" />;
  }

  return (
    <Container className="mt-4">
      {/* Заголовок страницы */}
      <div className="page-header">
        <h1 className="page-title">Управление SSH-ключами</h1>
        <div className="breadcrumb">
          <Link to="/">Главная</Link>
          <span>/</span>
          <span>SSH-ключи</span>
        </div>
      </div>

      {/* Статистика */}
      <div className="stats-grid">
        <Card className="stat-card">
          <Card.Body>
            <div className="stat-icon">🔑</div>
            <div className="stat-label">ВСЕГО КЛЮЧЕЙ</div>
            <div className="stat-value">{keys.length}</div>
          </Card.Body>
        </Card>
        <Card className="stat-card">
          <Card.Body>
            <div className="stat-icon">🔐</div>
            <div className="stat-label">RSA КЛЮЧЕЙ</div>
            <div className="stat-value">{keys.filter(k => k.key_type === 'rsa').length}</div>
          </Card.Body>
        </Card>
        <Card className="stat-card">
          <Card.Body>
            <div className="stat-icon">🗝️</div>
            <div className="stat-label">ED25519 КЛЮЧЕЙ</div>
            <div className="stat-value">{keys.filter(k => k.key_type === 'ed25519').length}</div>
          </Card.Body>
        </Card>
        <Card className="stat-card">
          <Card.Body>
            <div className="stat-icon">🖥️</div>
            <div className="stat-label">ИСПОЛЬЗУЕТСЯ</div>
            <div className="stat-value">{keys.reduce((sum, k) => sum + k.servers_count, 0)}</div>
          </Card.Body>
        </Card>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess('')}>
          ✅ {success}
        </Alert>
      )}

      {/* Таблица ключей */}
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span className="card-title">SSH-ключи</span>
          <div>
            <Button 
              variant="outline-secondary" 
              size="sm" 
              onClick={() => window.history.back()}
              className="me-2"
            >
              ← Назад
            </Button>
            {userRole === 'admin' && (
              <>
                <Button 
                  variant="success" 
                  onClick={openGenerateModal}
                >
                  + Сгенерировать ключ
                </Button>
                <Button 
                  variant="primary" 
                  onClick={openImportModal}
                  className="ms-2"
                >
                  📥 Импортировать
                </Button>
              </>
            )}
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <Table hover responsive className="mb-0">
            <thead>
              <tr>
                <th>Название</th>
                <th>Тип</th>
                <th>Fingerprint</th>
                <th>Создан</th>
                <th>Автор</th>
                <th>Серверов</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(key => {
                // Проверяем, есть ли другие ключи с таким же fingerprint
                const duplicateKeys = keys.filter(k => k.fingerprint === key.fingerprint && k.id !== key.id);
                const hasDuplicates = duplicateKeys.length > 0;
                
                return (
                  <tr key={key.id} className={hasDuplicates ? 'table-warning' : ''}>
                    <td>
                      <strong>{key.name}</strong>
                      {key.description && (
                        <div className="text-muted small">{key.description}</div>
                      )}
                      {hasDuplicates && (
                        <div className="text-warning small mt-1">
                          ⚠️ Дубликат ключа (используется также как: {duplicateKeys.map(k => k.name).join(', ')})
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge bg={key.key_type === 'rsa' ? 'primary' : 'success'}>
                        {key.key_type.toUpperCase()}
                      </Badge>
                    </td>
                    <td>
                      <code className="fingerprint">{key.fingerprint}</code>
                    </td>
                    <td>{formatDate(key.created_at)}</td>
                    <td>{key.created_by}</td>
                    <td>
                      {key.servers_count > 0 ? (
                        <Badge bg="info">{key.servers_count}</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {userRole === 'admin' && (
                        <>
                          <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={() => openEditModal(key)}
                            className="me-1"
                            title="Редактировать"
                          >
                            ✏️
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline-info"
                        size="sm"
                        onClick={() => showKeyDetails(key)}
                        className="me-1"
                        title="Просмотр"
                      >
                        👁️
                      </Button>
                      {userRole === 'admin' && (
                        <>
                          <Button
                            variant="outline-success"
                            size="sm"
                            onClick={() => handleDownloadPublicKey(key)}
                            className="me-1"
                            title="Скачать публичный ключ"
                          >
                            💾
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDeleteKey(key.id, key.name)}
                            disabled={key.servers_count > 0}
                            title={key.servers_count > 0 ? 'Ключ используется на серверах' : 'Удалить'}
                          >
                            🗑️
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {keys.length === 0 && (
            <div className="text-center py-5">
              <p className="text-muted">Нет SSH-ключей</p>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Модальное окно для генерации/импорта */}
      <Modal show={showModal} onHide={() => { setShowModal(false); resetForms(); }} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {modalMode === 'generate' ? '🔑 Генерация SSH-ключа' : '📥 Импорт SSH-ключа'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Nav variant="tabs" className="mb-3">
            <Nav.Item>
              <Nav.Link 
                active={modalMode === 'generate'} 
                onClick={() => setModalMode('generate')}
              >
                Сгенерировать новый
              </Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link 
                active={modalMode === 'import'} 
                onClick={() => setModalMode('import')}
              >
                Импортировать существующий
              </Nav.Link>
            </Nav.Item>
          </Nav>

          <Tab.Container activeKey={modalMode}>
            <Tab.Content>
              {/* Вкладка генерации */}
              <Tab.Pane eventKey="generate">
                <Form>
                  <Form.Group className="mb-3">
                    <Form.Label>Название <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="Например: prod-servers-key"
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Тип ключа</Form.Label>
                    <div>
                      <Form.Check
                        inline
                        type="radio"
                        label="RSA (совместимо со старыми системами)"
                        name="keyType"
                        value="rsa"
                        checked={keyType === 'rsa'}
                        onChange={(e) => setKeyType(e.target.value)}
                      />
                      <Form.Check
                        inline
                        type="radio"
                        label="Ed25519 (рекомендуется)"
                        name="keyType"
                        value="ed25519"
                        checked={keyType === 'ed25519'}
                        onChange={(e) => setKeyType(e.target.value)}
                      />
                    </div>
                  </Form.Group>

                  {keyType === 'rsa' && (
                    <Form.Group className="mb-3">
                      <Form.Label>Размер ключа</Form.Label>
                      <Form.Select
                        value={keySize}
                        onChange={(e) => setKeySize(e.target.value)}
                      >
                        <option value="2048">2048 бит (стандартный)</option>
                        <option value="3072">3072 бит (усиленный)</option>
                        <option value="4096">4096 бит (максимальный)</option>
                      </Form.Select>
                    </Form.Group>
                  )}

                  <Form.Group className="mb-3">
                    <Form.Label>Пароль для ключа (опционально)</Form.Label>
                    <Form.Control
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      placeholder="Оставьте пустым для ключа без пароля"
                    />
                  </Form.Group>

                  {passphrase && (
                    <Form.Group className="mb-3">
                      <Form.Label>Подтвердите пароль</Form.Label>
                      <Form.Control
                        type="password"
                        value={confirmPassphrase}
                        onChange={(e) => setConfirmPassphrase(e.target.value)}
                        placeholder="Введите пароль еще раз"
                        isInvalid={confirmPassphrase && passphrase !== confirmPassphrase}
                      />
                      <Form.Control.Feedback type="invalid">
                        Пароли не совпадают
                      </Form.Control.Feedback>
                    </Form.Group>
                  )}

                  <Form.Group className="mb-3">
                    <Form.Label>Описание</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Опишите назначение ключа"
                    />
                  </Form.Group>
                </Form>
              </Tab.Pane>

              {/* Вкладка импорта */}
              <Tab.Pane eventKey="import">
                <Form>
                  <Form.Group className="mb-3">
                    <Form.Label>Название <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      type="text"
                      value={importKeyName}
                      onChange={(e) => setImportKeyName(e.target.value)}
                      placeholder="Например: legacy-server-key"
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Приватный ключ <span className="text-danger">*</span></Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={10}
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Или загрузите файл</Form.Label>
                    <Form.Control
                      type="file"
                      accept=".pem,.key,id_rsa,id_ed25519"
                      onChange={handleFileUpload}
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Пароль от ключа (если есть)</Form.Label>
                    <Form.Control
                      type="password"
                      value={importPassphrase}
                      onChange={(e) => setImportPassphrase(e.target.value)}
                      placeholder="Оставьте пустым если ключ без пароля"
                    />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label>Описание</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      value={importDescription}
                      onChange={(e) => setImportDescription(e.target.value)}
                      placeholder="Опишите назначение ключа"
                    />
                  </Form.Group>
                </Form>
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowModal(false); resetForms(); }}>
            Отмена
          </Button>
          {modalMode === 'generate' ? (
            <Button
              variant="primary"
              onClick={handleGenerateKey}
              disabled={isGenerating || !keyName.trim() || (passphrase && passphrase !== confirmPassphrase)}
            >
              {isGenerating ? <Spinner size="sm" /> : '🔑 Сгенерировать ключ'}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleImportKey}
              disabled={isImporting || !importKeyName.trim() || !privateKey.trim()}
            >
              {isImporting ? <Spinner size="sm" /> : '📥 Импортировать ключ'}
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      {/* Модальное окно редактирования ключа */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Редактировать SSH-ключ</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Название <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                placeholder="Например: prod-servers-key"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Описание</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                placeholder="Опишите назначение ключа"
              />
            </Form.Group>

            {editingKey && (
              <div className="alert alert-info">
                <strong>Тип ключа:</strong> {editingKey.key_type.toUpperCase()}<br/>
                <strong>Fingerprint:</strong> <code>{editingKey.fingerprint}</code><br/>
                <strong>Создан:</strong> {formatDate(editingKey.created_at)}
              </div>
            )}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={handleUpdateKey}
            disabled={!editFormData.name.trim()}
          >
            Сохранить изменения
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Модальное окно деталей ключа */}
      <Modal show={showDetailsModal} onHide={() => setShowDetailsModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Детали SSH-ключа</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedKey && (
            <>
              <h5>{selectedKey.name}</h5>
              {selectedKey.description && (
                <p className="text-muted">{selectedKey.description}</p>
              )}
              
              <div className="mb-3">
                <strong>Тип:</strong> <Badge bg={selectedKey.key_type === 'rsa' ? 'primary' : 'success'}>{selectedKey.key_type.toUpperCase()}</Badge>
              </div>
              
              <div className="mb-3">
                <strong>Fingerprint:</strong>
                <code className="d-block mt-1">{selectedKey.fingerprint}</code>
                <Button size="sm" variant="outline-secondary" onClick={() => copyToClipboard(selectedKey.fingerprint)} className="mt-1">
                  📋 Копировать
                </Button>
              </div>
              
              <div className="mb-3">
                <strong>Публичный ключ:</strong>
                {userRole === 'admin' ? (
                  <>
                    <Form.Control
                      as="textarea"
                      rows={6}
                      value={selectedKey.public_key}
                      readOnly
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                      className="mt-1"
                    />
                    <Button size="sm" variant="outline-secondary" onClick={() => copyToClipboard(selectedKey.public_key)} className="mt-1">
                      📋 Копировать
                    </Button>
                  </>
                ) : (
                  <div className="alert alert-info mt-2">
                    <small>Публичный ключ доступен только администраторам</small>
                  </div>
                )}
              </div>
              
              <div className="mb-3">
                <strong>Создан:</strong> {formatDate(selectedKey.created_at)} пользователем {selectedKey.created_by}
              </div>
              
              <div className="mb-3">
                <strong>Используется на серверах:</strong> {selectedKey.servers_count || 0}
              </div>
              
              <div className="d-flex gap-2">
                {userRole === 'admin' && (
                  <Button variant="success" onClick={() => handleDownloadPublicKey(selectedKey)}>
                    💾 Скачать публичный ключ
                  </Button>
                )}
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDetailsModal(false)}>
            Закрыть
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default SSHKeyManagement;
