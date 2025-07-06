import React, { useState } from 'react';
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
    <div className="login-container">
      {/* Feature Cards */}
      <div className="features">
        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <div className="feature-title">Мониторинг в реальном времени</div>
          <div className="feature-desc">Отслеживайте активность PostgreSQL серверов</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔍</div>
          <div className="feature-title">Анализ активности</div>
          <div className="feature-desc">Находите неактивные базы данных</div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <div className="feature-title">Быстрый доступ</div>
          <div className="feature-desc">Управляйте пользователями и серверами</div>
        </div>
      </div>

      {/* Login Box */}
      <div className="login-box">
        {/* Logo Section */}
        <div className="login-logo">
          <div className="login-logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
            </svg>
          </div>
          <h1 className="login-title">PostgreSQL Monitor</h1>
          <p className="login-subtitle">Система мониторинга активности баз</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="login-error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            {error}
          </div>
        )}

        {/* Login Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Логин</label>
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

          <div className="form-group">
            <label className="form-label" htmlFor="password">Пароль</label>
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

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? (
              <>
                <div className="login-spinner"></div>
                <span>Вход...</span>
              </>
            ) : (
              <span>Войти в систему</span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          PostgreSQL Activity Monitor v2.0
        </div>
      </div>
    </div>
  );
}

export default Login;
