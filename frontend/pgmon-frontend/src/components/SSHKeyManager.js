import React, { useState } from 'react';
import { Modal, Button, Form, Alert, Spinner, Nav, Tab } from 'react-bootstrap';
import axios from 'axios';
import './SSHKeyManager.css';

function SSHKeyManager({ 
  show, 
  onHide, 
  onKeyGenerated, 
  onKeyValidated,
  serverName,
  serverHost,
  sshUser
}) {
  const [activeTab, setActiveTab] = useState('generate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Для генерации ключей
  const [keyType, setKeyType] = useState('rsa');
  const [keySize, setKeySize] = useState('2048');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [generatedKeys, setGeneratedKeys] = useState(null);
  const [showInstruction, setShowInstruction] = useState(false);
  
  // Для загрузки существующего ключа
  const [privateKey, setPrivateKey] = useState('');
  const [keyPassphrase, setKeyPassphrase] = useState('');
  const [validationResult, setValidationResult] = useState(null);

  const handleGenerateKey = async () => {
    setError('');
    setSuccess('');
    
    if (passphrase && passphrase !== confirmPassphrase) {
      setError('Пароли не совпадают');
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://10.110.20.55:8000/servers/generate-ssh-key',
        {
          key_type: keyType,
          key_size: keyType === 'rsa' ? parseInt(keySize) : null,
          passphrase: passphrase || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setGeneratedKeys(response.data);
      setShowInstruction(true);
      setSuccess('SSH-ключ успешно сгенерирован!');
      
      if (onKeyGenerated) {
        onKeyGenerated({
          privateKey: response.data.private_key,
          passphrase: passphrase || null,
          fingerprint: response.data.fingerprint
        });
      }
    } catch (err) {
      setError(`Ошибка генерации ключа: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateKey = async () => {
    setError('');
    setSuccess('');
    setValidationResult(null);
    
    if (!privateKey.trim()) {
      setError('Введите приватный ключ');
      return;
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://10.110.20.55:8000/servers/validate-ssh-key',
        {
          private_key: privateKey,
          passphrase: keyPassphrase || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setValidationResult(response.data);
      
      if (response.data.valid) {
        setSuccess('Ключ валиден!');
        if (onKeyValidated) {
          onKeyValidated({
            privateKey: privateKey,
            passphrase: keyPassphrase || null,
            fingerprint: response.data.fingerprint
          });
        }
      } else {
        setError(response.data.error);
      }
    } catch (err) {
      setError(`Ошибка валидации: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Скопировано в буфер обмена');
  };

  const downloadPublicKey = () => {
    if (!generatedKeys) return;
    
    const blob = new Blob([generatedKeys.public_key], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${serverName || 'server'}_id_${keyType}.pub`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadSetupScript = () => {
    if (!generatedKeys) return;
    
    const script = `#!/bin/bash
# Автоматическая установка SSH-ключа для pgmon
# Сгенерировано: ${new Date().toLocaleString()}

SERVER_HOST="${serverHost || 'your-server'}"
SERVER_USER="${sshUser || 'your-user'}"
PUBLIC_KEY="${generatedKeys.public_key}"

echo "🔐 Установка SSH-ключа для PostgreSQL Activity Monitor"
echo "Сервер: $SERVER_USER@$SERVER_HOST"
echo ""

# Проверка подключения
echo "1. Проверка подключения к серверу..."
ssh -o ConnectTimeout=5 $SERVER_USER@$SERVER_HOST "echo 'Подключение успешно'" || {
    echo "❌ Ошибка подключения. Проверьте доступность сервера."
    exit 1
}

# Установка ключа
echo "2. Установка публичного ключа..."
ssh $SERVER_USER@$SERVER_HOST "
    mkdir -p ~/.ssh && chmod 700 ~/.ssh
    echo '$PUBLIC_KEY' >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    echo '✅ Ключ установлен успешно'
"

# Тест подключения по ключу
echo "3. Тест подключения по ключу..."
ssh -o PasswordAuthentication=no $SERVER_USER@$SERVER_HOST "echo '✅ Подключение по ключу работает'" || {
    echo "❌ Ошибка подключения по ключу"
    exit 1
}

echo ""
echo "🎉 Установка завершена успешно!"
`;
    
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `setup-ssh-${serverName || 'server'}.sh`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal show={show} onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>🔐 Управление SSH-ключами</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}
        
        <Tab.Container activeKey={activeTab} onSelect={setActiveTab}>
          <Nav variant="tabs" className="mb-3">
            <Nav.Item>
              <Nav.Link eventKey="generate">Сгенерировать новый</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="upload">Загрузить существующий</Nav.Link>
            </Nav.Item>
          </Nav>
          
          <Tab.Content>
            {/* Вкладка генерации ключа */}
            <Tab.Pane eventKey="generate">
              {!showInstruction ? (
                <Form>
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
                      <Form.Select value={keySize} onChange={(e) => setKeySize(e.target.value)}>
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
                      placeholder="Оставьте пустым для ключа без пароля"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                  </Form.Group>
                  
                  {passphrase && (
                    <Form.Group className="mb-3">
                      <Form.Label>Подтвердите пароль</Form.Label>
                      <Form.Control
                        type="password"
                        placeholder="Введите пароль еще раз"
                        value={confirmPassphrase}
                        onChange={(e) => setConfirmPassphrase(e.target.value)}
                        isInvalid={confirmPassphrase && passphrase !== confirmPassphrase}
                      />
                      <Form.Control.Feedback type="invalid">
                        Пароли не совпадают
                      </Form.Control.Feedback>
                    </Form.Group>
                  )}
                  
                  <div className="d-flex justify-content-end">
                    <Button 
                      variant="primary" 
                      onClick={handleGenerateKey}
                      disabled={loading || (passphrase && passphrase !== confirmPassphrase)}
                    >
                      {loading ? <Spinner size="sm" /> : '🔑 Сгенерировать ключ'}
                    </Button>
                  </div>
                </Form>
              ) : (
                <div className="ssh-key-instruction">
                  <h5>📋 Инструкция по установке ключа на сервер</h5>
                  
                  <div className="step">
                    <span className="step-number">1</span>
                    <div className="step-content">
                      <strong>Подключитесь к серверу</strong>
                      <code>ssh {sshUser || 'user'}@{serverHost || 'server'}</code>
                    </div>
                  </div>

                  <div className="step">
                    <span className="step-number">2</span>
                    <div className="step-content">
                      <strong>Создайте директорию .ssh (если нет)</strong>
                      <code>mkdir -p ~/.ssh && chmod 700 ~/.ssh</code>
                    </div>
                  </div>

                  <div className="step">
                    <span className="step-number">3</span>
                    <div className="step-content">
                      <strong>Добавьте публичный ключ</strong>
                      <code>echo "{generatedKeys?.public_key}" >> ~/.ssh/authorized_keys</code>
                      <Button size="sm" onClick={() => copyToClipboard(generatedKeys?.public_key)}>
                        📋 Копировать
                      </Button>
                    </div>
                  </div>

                  <div className="step">
                    <span className="step-number">4</span>
                    <div className="step-content">
                      <strong>Установите правильные права</strong>
                      <code>chmod 600 ~/.ssh/authorized_keys</code>
                    </div>
                  </div>

                  <Alert variant="info" className="mt-3">
                    <strong>💡 Совет:</strong> Вы можете скачать готовый скрипт для автоматической установки
                  </Alert>

                  <div className="key-display">
                    <label>Публичный ключ:</label>
                    <textarea 
                      readOnly 
                      value={generatedKeys?.public_key || ''}
                      className="form-control"
                      rows="4"
                    />
                    <div className="mt-2">
                      <Button onClick={downloadPublicKey} className="me-2">
                        💾 Скачать публичный ключ
                      </Button>
                      <Button onClick={downloadSetupScript} variant="success">
                        📄 Скачать скрипт установки
                      </Button>
                    </div>
                  </div>

                  <div className="fingerprint-info mt-3">
                    <strong>Fingerprint:</strong> <code>{generatedKeys?.fingerprint}</code>
                  </div>
                  
                  <div className="mt-3">
                    <Button variant="secondary" onClick={() => setShowInstruction(false)}>
                      ← Сгенерировать еще один
                    </Button>
                  </div>
                </div>
              )}
            </Tab.Pane>
            
            {/* Вкладка загрузки существующего ключа */}
            <Tab.Pane eventKey="upload">
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Приватный SSH-ключ</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={8}
                    placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                  />
                  <Form.Text className="text-muted">
                    Вставьте содержимое приватного ключа или загрузите файл
                  </Form.Text>
                </Form.Group>
                
                <Form.Group className="mb-3">
                  <Form.Label>Загрузить из файла</Form.Label>
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
                    placeholder="Оставьте пустым если ключ без пароля"
                    value={keyPassphrase}
                    onChange={(e) => setKeyPassphrase(e.target.value)}
                  />
                </Form.Group>
                
                {validationResult && validationResult.valid && (
                  <Alert variant="success">
                    <div>✅ Ключ валиден!</div>
                    <div><strong>Fingerprint:</strong> <code>{validationResult.fingerprint}</code></div>
                    {validationResult.public_key && (
                      <div className="mt-2">
                        <strong>Публичный ключ:</strong>
                        <textarea 
                          readOnly 
                          value={validationResult.public_key}
                          className="form-control mt-1"
                          rows="3"
                        />
                      </div>
                    )}
                  </Alert>
                )}
                
                <div className="d-flex justify-content-end">
                  <Button 
                    variant="primary" 
                    onClick={handleValidateKey}
                    disabled={loading || !privateKey.trim()}
                  >
                    {loading ? <Spinner size="sm" /> : '✓ Проверить ключ'}
                  </Button>
                </div>
              </Form>
            </Tab.Pane>
          </Tab.Content>
        </Tab.Container>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Закрыть
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default SSHKeyManager;
