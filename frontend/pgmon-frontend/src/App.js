import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Navbar, Button, Modal, Spinner, Form } from 'react-bootstrap';
import ServerList from './components/ServerList';
import ServerDetails from './components/ServerDetails';
import DatabaseDetails from './components/DatabaseDetails';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function AppContent() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('username') || '');
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
        'http://10.110.20.55:8000/token',
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
    localStorage.removeItem('token');
    localStorage.removeItem('username');
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
          await axios.get('http://10.110.20.55:8000/servers', {
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

  const login = async () => {
    try {
      const response = await axios.post(
        'http://10.110.20.55:8000/token',
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
    return (
      <div className="App">
        <Container>
          <div className="login-form">
            <h1>Вход в систему</h1>
            <input
              type="text"
              className="form-control"
              placeholder="Логин"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              className="form-control"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button variant="primary" onClick={login} className="w-100 mt-3">
              Войти
            </Button>
            {error && <p className="text-danger mt-3">{error}</p>}
          </div>
        </Container>
      </div>
    );
  }

  const storedUsername = localStorage.getItem('username') || '';

  return (
    <div className="App">
      <Navbar bg="dark" variant="dark" className="px-0">
        <Container>
          <Navbar.Brand>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="me-2">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
            PostgreSQL Activity Monitor
            <span className={`backend-status ${backendStatus === 'available' ? 'available' : 'unavailable'}`}>
              {backendStatus === 'available' ? 'Backend Active' : 'Backend Unavailable'}
            </span>
          </Navbar.Brand>
          <div className="d-flex align-items-center">
            {currentUser && (
              <span className="user-info">
                {currentUser}@pgmon
              </span>
            )}
            <Button variant="secondary" onClick={handleLogout}>
              Выход
            </Button>
          </div>
        </Container>
      </Navbar>
      
      <Container className="mt-4">
        <Routes>
          <Route exact path="/" element={<ServerList />} />
          <Route path="/server/:name" element={<ServerDetails />} />
          <Route path="/server/:name/db/:db_name" element={<DatabaseDetails />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Container>

      <Modal show={showSessionModal} onHide={() => {}} backdrop="static" keyboard={false}>
        <Modal.Header>
          <Modal.Title>Сессия истекает</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Время вашей сессии истекает через {formatTimeLeft(timeLeft)}. Хотите продлить сессию или выйти?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="success" onClick={refreshToken} disabled={isRefreshing}>
            {isRefreshing ? <Spinner as="span" animation="border" size="sm" /> : 'Продолжить'}
          </Button>
          <Button variant="danger" onClick={handleLogout}>
            Выйти
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showRefreshLoginModal} onHide={() => {}} backdrop="static" keyboard={false}>
        <Modal.Header>
          <Modal.Title>Продление сессии</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div>
            <p>Введите пароль для пользователя {storedUsername}:</p>
            <Form.Control
              type="password"
              className="mb-3"
              placeholder="Пароль"
              value={refreshPassword}
              onChange={(e) => setRefreshPassword(e.target.value)}
            />
            {error && <p className="text-danger">{error}</p>}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="success" onClick={handleRefreshLogin} disabled={isRefreshing}>
            {isRefreshing ? <Spinner as="span" animation="border" size="sm" /> : 'Войти'}
          </Button>
          <Button variant="danger" onClick={handleLogout}>
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
