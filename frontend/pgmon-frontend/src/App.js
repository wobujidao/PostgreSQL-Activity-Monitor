import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Navbar, Button, Modal, Spinner } from 'react-bootstrap';
import ServerList from './components/ServerList';
import ServerDetails from './components/ServerDetails';
import DatabaseDetails from './components/DatabaseDetails';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function AppContent() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('unknown');
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 минут в секундах для отсчёта
  const [isRefreshing, setIsRefreshing] = useState(false); // Индикатор загрузки
  const navigate = useNavigate();

  const TOKEN_EXPIRATION_MS = 60 * 60 * 1000; // 60 минут
  const WARNING_TIME_MS = 5 * 60 * 1000; // 5 минут до истечения

  // Декодирование JWT-токена
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

  // Продление токена
  const refreshToken = async () => {
    setIsRefreshing(true);
    try {
      const currentToken = localStorage.getItem('token');
      const response = await axios.post('http://10.110.20.55:8000/token', {}, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const newToken = response.data.access_token;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setShowSessionModal(false);
      setTimeLeft(300);
      setBackendStatus('available');
      console.log('Токен успешно продлён:', newToken);
    } catch (error) {
      console.error('Ошибка продления токена:', error);
      handleLogout();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Выход
  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setShowSessionModal(false);
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
          const timeRemaining = Math.floor((expTime - now) / 1000); // В секундах
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

    // Автоматическое продление при активности
    const handleActivity = () => {
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        const decoded = decodeToken(currentToken);
        if (decoded && decoded.exp) {
          const expTime = decoded.exp * 1000;
          const now = Date.now();
          if (expTime - now < WARNING_TIME_MS) {
            refreshToken();
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
  }, [timeLeft, showSessionModal]);

  const login = async () => {
    try {
      const response = await axios.post(
        'http://10.110.20.55:8000/token',
        `username=${username}&password=${password}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      setToken(response.data.access_token);
      localStorage.setItem('token', response.data.access_token);
      setError(null);
    } catch (err) {
      setError('Ошибка авторизации: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
    }
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
          <h1 className="text-center my-4">Вход</h1>
          <div className="login-form">
            <input
              type="text"
              className="form-control mb-3"
              placeholder="Логин"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              className="form-control mb-3"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button variant="primary" onClick={login}>
              Войти
            </Button>
            {error && <p className="text-danger mt-3">{error}</p>}
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand>
            PostgreSQL Monitor
            <span className={`backend-status ml-2 ${backendStatus === 'available' ? 'available' : 'unavailable'}`}>
              {backendStatus === 'available' ? 'Бэкэнд доступен' : 'Бэкэнд недоступен'}
            </span>
          </Navbar.Brand>
          <Button variant="secondary" onClick={handleLogout}>
            Выход
          </Button>
        </Container>
      </Navbar>
      <Container className="mt-5">
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