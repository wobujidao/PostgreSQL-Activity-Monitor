import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import axios from 'axios';
import { Container, Navbar, Button } from 'react-bootstrap';
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
      </div>
    </Router>
  );
}

export default App;