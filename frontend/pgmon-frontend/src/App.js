import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Navbar, Button, Modal } from 'react-bootstrap';
import ServerList from './components/ServerList';
import ServerDetails from './components/ServerDetails';
import DatabaseDetails from './components/DatabaseDetails';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [backendStatus, setBackendStatus] = useState('unknown');
  const [showSessionModal, setShowSessionModal] = useState(false);
  const navigate = useNavigate();

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
    try {
      const response = await axios.post(
        'http://10.110.20.55:8000/token',
        `username=${username}&password=${password}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const newToken = response.data.access_token;
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setShowSessionModal(false);
      setBackendStatus('available');
      console.log('Токен успешно продлён:', newToken);
    } catch (error) {
      console.error('Ошибка продления токена:', error);
      handleLogout();
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

    const checkTokenExpiration = () => {
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        const decoded = decodeToken(currentToken);
        if (decoded && decoded.exp) {
          const expTime = decoded.exp * 1000;
          const now = Date.now();
          const fiveMinutes = 5 * 60 * 1000;
          if (expTime - now <= fiveMinutes && expTime > now) {
            setShowSessionModal(true);
          } else if (expTime <= now) {
            handleLogout();
          }
        }
      }
    };

    checkTokenExpiration();
    const tokenCheckInterval = setInterval(checkTokenExpiration, 60000);

    return () => clearInterval(tokenCheckInterval);
  }, [token, navigate]);

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

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
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
    <Router>
      <div className="App">
        <Navbar bg="dark" variant="dark">
          <Container>
            <Navbar.Brand>
              PostgreSQL Monitor
              <span className={`backend-status ml-2 ${backendStatus === 'available' ? 'available' : 'unavailable'}`}>
                {backendStatus === 'available' ? 'Бэкэнд доступен' : 'Бэкэнд недоступен'}
              </span>
            </Navbar.Brand>
            <Button variant="secondary" onClick={logout}>
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

        {/* Модальное окно для сессии */}
        <Modal show={showSessionModal} onHide={() => {}} backdrop="static" keyboard={false}>
          <Modal.Header>
            <Modal.Title>Сессия истекает</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            Время вашей сессии истекает через 5 минут. Хотите продлить сессию или выйти?
          </Modal.Body>
          <Modal.Footer>
            <Button variant="primary" onClick={refreshToken}>
              Продолжить
            </Button>
            <Button variant="secondary" onClick={handleLogout}>
              Выйти
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </Router>
  );
}

export default App;