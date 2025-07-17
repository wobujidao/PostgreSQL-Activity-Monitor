import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Navbar, Button, Modal, Spinner, Form, Dropdown } from 'react-bootstrap';
import Login from './components/Login';
import ServerList from './components/ServerList';
import ServerDetails from './components/ServerDetails';
import ServerEdit from './components/ServerEdit';
import DatabaseDetails from './components/DatabaseDetails';
import UserManagement from './components/UserManagement';
import SSHKeyManagement from './components/SSHKeyManagement';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function AppContent() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('username') || '');
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole') || '');
  const [refreshPassword, setRefreshPassword] = useState('');
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('unknown');
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showRefreshLoginModal, setShowRefreshLoginModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 минут в секундах
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  const WARNING_TIME_MS = 5 * 60 * 1000; // 5 минут до истечения

  const decodeToken = (token) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Ошибка декодирования токена:', e);
      return null;
    }
  };

  const refreshToken = async () => {
    const storedUsername = localStorage.getItem('username');
    if (!storedUsername || !refreshPassword) {
      setShowSessionModal(false);
      setShowRefreshLoginModal(true);
      return;
    }
    setIsRefreshing(true);
    try {
      const response = await axios.post(
        'https://pam.cbmo.mosreg.ru/token',
        `username=${storedUsername}&password=${refreshPassword}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const newToken = response.data.access_token;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setShowSessionModal(false);
      setShowRefreshLoginModal(false);
      setRefreshPassword('');
      setTimeLeft(300);
      setBackendStatus('available');
      console.log('Токен успешно продлён:', newToken);
    } catch (error) {
      console.error('Ошибка продления токена:', error);
      setError('Ошибка продления сессии: ' + (error.response?.data?.detail || 'Неизвестная ошибка'));
      setShowRefreshLoginModal(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setCurrentUser('');
    setUserRole('');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    setShowSessionModal(false);
    setShowRefreshLoginModal(false);
    setBackendStatus('unavailable');
    navigate('/');
  };

  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
          await axios.get('https://pam.cbmo.mosreg.ru/servers', {
            headers: { Authorization: `Bearer ${storedToken}` }
          });
          setBackendStatus('available');
        }
      } catch (error) {
        setBackendStatus('unavailable');
      }
    };

    if (token) {
      checkBackendStatus();
      const interval = setInterval(checkBackendStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [token]);

  // Получение информации о текущем пользователе
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (token) {
        try {
          const response = await axios.get('https://pam.cbmo.mosreg.ru/users/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUserRole(response.data.role);
          localStorage.setItem('userRole', response.data.role);
        } catch (error) {
          console.error('Ошибка получения информации о пользователе:', error);
        }
      }
    };

    fetchUserInfo();
  }, [token]);

  useEffect(() => {
    const checkTokenExpiration = () => {
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        const decoded = decodeToken(currentToken);
        if (decoded && decoded.exp) {
          const expTime = decoded.exp * 1000;
          const now = Date.now();
          const timeRemaining = Math.floor((expTime - now) / 1000);
          if (timeRemaining <= 300 && timeRemaining > 0) {
            setShowSessionModal(true);
            setTimeLeft(timeRemaining);
          } else if (timeRemaining <= 0) {
            handleLogout();
          }
        }
      }
    };

    checkTokenExpiration();
    const tokenCheckInterval = setInterval(() => {
      checkTokenExpiration();
      if (showSessionModal && timeLeft > 0) {
        setTimeLeft(prev => prev - 1);
      }
    }, 1000);

    const handleActivity = () => {
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        const decoded = decodeToken(currentToken);
        if (decoded && decoded.exp) {
          const expTime = decoded.exp * 1000;
          const now = Date.now();
          if (expTime - now < WARNING_TIME_MS && !showSessionModal && !showRefreshLoginModal) {
            setShowSessionModal(true);
            setTimeLeft(Math.floor((expTime - now) / 1000));
          }
        }
      }
    };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      clearInterval(tokenCheckInterval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [timeLeft, showSessionModal, showRefreshLoginModal, WARNING_TIME_MS]);

  const login = async (username, password) => {
    try {
      const response = await axios.post(
        'https://pam.cbmo.mosreg.ru/token',
        `username=${username}&password=${password}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      setToken(response.data.access_token);
      setCurrentUser(username);
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('username', username);
      setError(null);
    } catch (err) {
      setError('Ошибка авторизации: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
    }
  };

  const handleRefreshLogin = async () => {
    await refreshToken();
  };

  const formatTimeLeft = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' + secs : secs}`;
  };

  if (!token) {
    return <Login onLogin={login} error={error} />;
  }

  const storedUsername = localStorage.getItem('username') || '';

  return (
    <div className="App">
      <Navbar bg="dark" variant="dark" className="px-0">
        <Container>
          <Navbar.Brand>
            <div className="logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
            </div>
            PostgreSQL Activity Monitor
            <span className={`backend-status ${backendStatus === 'available' ? 'available' : 'unavailable'}`}>
              {backendStatus === 'available' ? 'Backend Active' : 'Backend Unavailable'}
            </span>
          </Navbar.Brand>
          <div className="d-flex align-items-center">
            {currentUser && (
              <>
                <span className="user-info">
                  {currentUser}@pgmon
                </span>
                <Dropdown align="end" className="ms-2">
                  <Dropdown.Toggle variant="secondary" size="sm" id="user-dropdown">
                    👤
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 10l5 5 5-5z"/>
                    </svg>
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    <Dropdown.Header>
                      {currentUser}
                      <div className="text-muted small">
                        {userRole === 'admin' ? '👑 Администратор' : 
                         userRole === 'operator' ? '⚙️ Оператор' : 
                         '👁️ Просмотр'}
                      </div>
                    </Dropdown.Header>
                    <Dropdown.Divider />
                    {/* Показываем управление пользователями только админам */}
                    {userRole === 'admin' && (
                      <>
                        <Dropdown.Item onClick={() => navigate('/users')}>
                          ⚙️ Управление пользователями
                        </Dropdown.Item>
                        <Dropdown.Divider />
                      </>
                    )}
                    {/* Показываем SSH-ключи админам и операторам */}
                    {(userRole === 'admin' || userRole === 'operator') && (
                      <>
                        <Dropdown.Item onClick={() => navigate('/ssh-keys')}>
                          🔑 Управление SSH-ключами
                        </Dropdown.Item>
                        <Dropdown.Divider />
                      </>
                    )}
                    <Dropdown.Item onClick={handleLogout}>
                      🚪 Выход
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </>
            )}
          </div>
        </Container>
      </Navbar>

      <Container className="mt-4">
        <Routes>
          <Route exact path="/" element={<ServerList />} />
          <Route path="/server/:name" element={<ServerDetails />} />
          <Route path="/server/:serverName/edit" element={<ServerEdit />} />
          <Route path="/server/:name/db/:db_name" element={<DatabaseDetails />} />
          <Route path="/users" element={userRole === 'admin' ? <UserManagement /> : <Navigate to="/" />} />
          <Route path="/ssh-keys" element={(userRole === 'admin' || userRole === 'operator') ? <SSHKeyManagement /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Container>

      {/* Модальное окно продления сессии с новым дизайном */}
      <Modal show={showSessionModal} onHide={() => {}} backdrop="static" keyboard={false} centered className="session-modal">
        <Modal.Header className="border-0">
          <Modal.Title className="d-flex align-items-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="me-2 text-warning">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            Сессия истекает
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center">
            <div className="session-timer mb-3">
              <h2 className="mb-1">{formatTimeLeft(timeLeft)}</h2>
              <p className="text-muted">Время вашей сессии истекает</p>
            </div>
            <p>Хотите продлить сессию или выйти?</p>
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0 justify-content-center">
          <Button 
            variant="success" 
            onClick={refreshToken} 
            disabled={isRefreshing}
            className="px-4"
          >
            {isRefreshing ? <Spinner as="span" animation="border" size="sm" /> : 'Продолжить'}
          </Button>
          <Button variant="danger" onClick={handleLogout} className="px-4">
            Выйти
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Модальное окно ввода пароля для продления сессии */}
      <Modal show={showRefreshLoginModal} onHide={() => {}} backdrop="static" keyboard={false} centered className="refresh-modal">
        <Modal.Header className="border-0">
          <Modal.Title className="d-flex align-items-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="me-2 text-primary">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            </svg>
            Продление сессии
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div>
            <p className="mb-3">Введите пароль для пользователя <strong>{storedUsername}</strong>:</p>
            <Form.Control
              type="password"
              className="mb-3 form-control-styled"
              placeholder="Пароль"
              value={refreshPassword}
              onChange={(e) => setRefreshPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleRefreshLogin()}
            />
            {error && <div className="alert alert-danger py-2">{error}</div>}
          </div>
        </Modal.Body>
        <Modal.Footer className="border-0 justify-content-center">
          <Button 
            variant="success" 
            onClick={handleRefreshLogin} 
            disabled={isRefreshing || !refreshPassword}
            className="px-4"
          >
            {isRefreshing ? <Spinner as="span" animation="border" size="sm" /> : 'Войти'}
          </Button>
          <Button variant="danger" onClick={handleLogout} className="px-4">
            Выйти
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
