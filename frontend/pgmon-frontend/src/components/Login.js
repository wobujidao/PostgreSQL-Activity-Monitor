import React, { useState } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import './Login.css';

function Login({ onLogin, error: parentError }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    
    if (!username.trim() || !password) {
      setLocalError('Пожалуйста, заполните все поля');
      return;
    }

    setLoading(true);
    await onLogin(username, password);
    setLoading(false);
  };

  const error = parentError || localError;

  return (
    <div className="login-page">
      {/* Animated background pattern */}
      <div className="login-background"></div>

      {/* Feature Cards */}
      <div className="features">
        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <div className="feature-title">Мониторинг в реальном времени</div>
          <div>Отслеживайте активность PostgreSQL серверов</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔍</div>
          <div className="feature-title">Анализ активности</div>
          <div>Находите неактивные базы данных</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <div className="feature-title">Быстрый доступ</div>
          <div>Управляйте пользователями и серверами</div>
        </div>
      </div>

      {/* Login Container */}
      <div className="login-container">
        {/* Logo Section */}
        <div className="logo-section">
          <div className="logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
            </svg>
          </div>
          <h1 className="logo-title">PostgreSQL Monitor</h1>
          <p className="logo-subtitle">Система мониторинга активности</p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="danger" className="login-alert">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="me-2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            {error}
          </Alert>
        )}

        {/* Login Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Логин</label>
            <div className="input-group">
              <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              <input 
                type="text" 
                className="form-control" 
                id="username" 
                placeholder="Введите ваш логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Пароль</label>
            <div className="input-group">
              <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
              <input 
                type="password" 
                className="form-control" 
                id="password" 
                placeholder="Введите ваш пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? (
              <div className="loading show">
                <Spinner animation="border" size="sm" className="me-2" />
                <span>Вход...</span>
              </div>
            ) : (
              <span className="btn-text">Войти в систему</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <div>
            <strong>Доступные роли:</strong><br/>
            👑 Администратор • ⚙️ Оператор • 👁️ Просмотр
          </div>
          <div className="version-info">
            PostgreSQL Activity Monitor v2.0
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
