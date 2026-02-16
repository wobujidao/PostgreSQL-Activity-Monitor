import React, { createContext, useState, useEffect, useCallback } from 'react';
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
  const [backendStatus, setBackendStatus] = useState('unknown');
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showRefreshLoginModal, setShowRefreshLoginModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(SESSION_WARNING_SEC);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [refreshPassword, setRefreshPassword] = useState('');

  const logout = useCallback(() => {
    setToken(null);
    setCurrentUser('');
    setUserRole('');
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USERNAME);
    localStorage.removeItem(LS_USER_ROLE);
    setShowSessionModal(false);
    setShowRefreshLoginModal(false);
    setBackendStatus('unavailable');
  }, []);

  const login = useCallback(async (username, password) => {
    try {
      const response = await api.post(
        '/token',
        `username=${username}&password=${password}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const newToken = response.data.access_token;
      localStorage.setItem(LS_TOKEN, newToken);
      localStorage.setItem(LS_USERNAME, username);
      setToken(newToken);
      setCurrentUser(username);
      setError(null);
      setRefreshPassword(password);
    } catch (err) {
      setError('Ошибка авторизации: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
    }
  }, []);

  const refreshToken = useCallback(async () => {
    const storedUsername = localStorage.getItem(LS_USERNAME);
    if (!storedUsername || !refreshPassword) {
      setShowSessionModal(false);
      setShowRefreshLoginModal(true);
      return;
    }
    setIsRefreshing(true);
    try {
      const response = await api.post(
        '/token',
        `username=${storedUsername}&password=${refreshPassword}`,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const newToken = response.data.access_token;
      localStorage.setItem(LS_TOKEN, newToken);
      setToken(newToken);
      setShowSessionModal(false);
      setShowRefreshLoginModal(false);
      setTimeLeft(SESSION_WARNING_SEC);
      setBackendStatus('available');
    } catch (err) {
      setError('Ошибка продления сессии: ' + (err.response?.data?.detail || 'Неизвестная ошибка'));
      setShowRefreshLoginModal(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshPassword]);

  // Проверка backend status
  useEffect(() => {
    if (!token) return;
    const check = async () => {
      try {
        await api.get('/servers');
        setBackendStatus('available');
      } catch {
        setBackendStatus('unavailable');
      }
    };
    check();
    const interval = setInterval(check, BACKEND_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [token]);

  // Получение роли пользователя
  useEffect(() => {
    if (!token) return;
    api.get('/users/me').then(res => {
      setUserRole(res.data.role);
      localStorage.setItem(LS_USER_ROLE, res.data.role);
    }).catch(() => {});
  }, [token]);

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
      if (showSessionModal && timeLeft > 0) {
        setTimeLeft(prev => prev - 1);
      }
    }, TOKEN_CHECK_INTERVAL);

    const handleActivity = () => {
      const currentToken = localStorage.getItem(LS_TOKEN);
      if (!currentToken) return;
      const decoded = decodeToken(currentToken);
      if (!decoded?.exp) return;
      const remaining = decoded.exp * 1000 - Date.now();
      if (remaining < SESSION_WARNING_MS && !showSessionModal && !showRefreshLoginModal) {
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
  }, [token, timeLeft, showSessionModal, showRefreshLoginModal, logout]);

  const value = {
    token,
    currentUser,
    userRole,
    backendStatus,
    showSessionModal,
    showRefreshLoginModal,
    timeLeft,
    isRefreshing,
    error,
    refreshPassword,
    setRefreshPassword,
    setError,
    login,
    logout,
    refreshToken,
    setShowSessionModal,
    setShowRefreshLoginModal,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
