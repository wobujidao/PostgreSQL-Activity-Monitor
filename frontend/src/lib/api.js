import axios from 'axios';
import { API_BASE_URL, LS_TOKEN } from './constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,  // Отправлять cookies (refresh_token)
});

// Request interceptor — добавляет Authorization header
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(LS_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Queue-based refresh: при 401 автоматически обновляет access token
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Не пытаемся refresh для /token, /refresh и повторных запросов
    const skipUrls = ['/token', '/refresh'];
    const isSkipUrl = skipUrls.some(url => originalRequest.url?.includes(url));

    if (error.response?.status === 401 && !originalRequest._retry && !isSkipUrl) {
      if (isRefreshing) {
        // Refresh уже идёт — ставим запрос в очередь
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await api.post('/refresh');
        const newToken = response.data.access_token;

        localStorage.setItem(LS_TOKEN, newToken);
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`;

        // Уведомляем AuthContext
        window.dispatchEvent(new CustomEvent('tokenRefreshed', { detail: { token: newToken } }));

        processQueue(null, newToken);

        // Повторяем оригинальный запрос
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Refresh не удался — сессия потеряна
        localStorage.removeItem(LS_TOKEN);
        window.dispatchEvent(new CustomEvent('tokenExpired'));

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Для /token и /refresh — просто отдаём ошибку без retry
    if (error.response?.status === 401 && isSkipUrl) {
      const hadToken = localStorage.getItem(LS_TOKEN);
      if (hadToken && !originalRequest.url?.includes('/token')) {
        localStorage.removeItem(LS_TOKEN);
        window.dispatchEvent(new CustomEvent('tokenExpired'));
      }
    }

    return Promise.reject(error);
  }
);

export default api;
