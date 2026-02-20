import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import {
  SESSION_WARNING_SEC,
  SESSION_WARNING_MS,
  TOKEN_CHECK_INTERVAL,
  BACKEND_CHECK_INTERVAL,
  LS_TOKEN,
  LS_USERNAME,
  LS_USER_ROLE,
} from '@/lib/constants';

export const AuthContext = createContext(null);

function decodeToken(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem(LS_TOKEN));
  const [currentUser, setCurrentUser] = useState(localStorage.getItem(LS_USERNAME) || '');
  const [userRole, setUserRole] = useState(localStorage.getItem(LS_USER_ROLE) || '');
  const [backendStatus, setBackendStatus] = useState('checking');
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SESSION_WARNING_SEC);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const logout = useCallback(async () => {
    // Серверный logout — blacklist токенов и удаление cookie
    try {
      await api.post('/logout');
    } catch {
      // Ошибка logout не критична
    }
    setToken(null);
    setCurrentUser('');
    setUserRole('');
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USERNAME);
    localStorage.removeItem(LS_USER_ROLE);
    setShowSessionModal(false);
    setBackendStatus('unavailable');
  }, []);

  const login = useCallback(async (username, password) => {
    try {
      const response = await api.post(
        '/token',
        `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const newToken = response.data.access_token;
      localStorage.setItem(LS_TOKEN, newToken);
      localStorage.setItem(LS_USERNAME, username);
      setToken(newToken);
      setCurrentUser(username);
      setError(null);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 401 || detail === 'Invalid credentials') {
        setError('Неверный логин или пароль');
      } else if (!err.response) {
        setError('Сервер недоступен');
      } else {
        setError('Ошибка авторизации: ' + (detail || 'Неизвестная ошибка'));
      }
    }
  }, []);

  const refreshToken = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await api.post('/refresh');
      const newToken = response.data.access_token;
      localStorage.setItem(LS_TOKEN, newToken);
      setToken(newToken);
      setShowSessionModal(false);
      setTimeLeft(SESSION_WARNING_SEC);
      setBackendStatus('available');
    } catch {
      // Refresh не удался — нужен повторный логин
      logout();
    } finally {
      setIsRefreshing(false);
    }
  }, [logout]);

  // Обработка событий из api interceptor
  useEffect(() => {
    const handleTokenExpired = () => logout();
    const handleTokenRefreshed = (e) => {
      const newToken = e.detail?.token;
      if (newToken) {
        setToken(newToken);
        setShowSessionModal(false);
        setTimeLeft(SESSION_WARNING_SEC);
      }
    };
    window.addEventListener('tokenExpired', handleTokenExpired);
    window.addEventListener('tokenRefreshed', handleTokenRefreshed);
    return () => {
      window.removeEventListener('tokenExpired', handleTokenExpired);
      window.removeEventListener('tokenRefreshed', handleTokenRefreshed);
    };
  }, [logout]);

  // Проверка backend status (работает и до логина)
  useEffect(() => {
    const check = async () => {
      try {
        await api.get('/health', { timeout: 3000 });
        setBackendStatus('available');
      } catch {
        setBackendStatus('unavailable');
      }
    };
    check();
    const interval = setInterval(check, BACKEND_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Получение роли пользователя
  useEffect(() => {
    if (!token) return;
    api.get('/users/me').then(res => {
      setUserRole(res.data.role);
      localStorage.setItem(LS_USER_ROLE, res.data.role);
    }).catch(() => {});
  }, [token]);

  // Ref для актуального значения в замыканиях
  const showSessionModalRef = useRef(showSessionModal);
  useEffect(() => { showSessionModalRef.current = showSessionModal; }, [showSessionModal]);

  // Проверка истечения токена
  useEffect(() => {
    if (!token) return;

    const checkExpiration = () => {
      const currentToken = localStorage.getItem(LS_TOKEN);
      if (!currentToken) return;
      const decoded = decodeToken(currentToken);
      if (!decoded?.exp) return;
      const remaining = Math.floor((decoded.exp * 1000 - Date.now()) / 1000);
      if (remaining <= 0) {
        logout();
      } else if (remaining <= SESSION_WARNING_SEC) {
        setShowSessionModal(true);
        setTimeLeft(remaining);
      }
    };

    checkExpiration();
    const interval = setInterval(() => {
      checkExpiration();
      setTimeLeft(prev => {
        if (showSessionModalRef.current && prev > 0) return prev - 1;
        return prev;
      });
    }, TOKEN_CHECK_INTERVAL);

    // Throttled activity handler (не чаще раза в 2 сек)
    let lastActivityCheck = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityCheck < 2000) return;
      lastActivityCheck = now;

      const currentToken = localStorage.getItem(LS_TOKEN);
      if (!currentToken) return;
      const decoded = decodeToken(currentToken);
      if (!decoded?.exp) return;
      const remaining = decoded.exp * 1000 - now;
      if (remaining < SESSION_WARNING_MS && !showSessionModalRef.current) {
        setShowSessionModal(true);
        setTimeLeft(Math.floor(remaining / 1000));
      }
    };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [token, logout]);

  const value = {
    token,
    currentUser,
    userRole,
    backendStatus,
    showSessionModal,
    timeLeft,
    isRefreshing,
    error,
    setError,
    login,
    logout,
    refreshToken,
    setShowSessionModal,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
