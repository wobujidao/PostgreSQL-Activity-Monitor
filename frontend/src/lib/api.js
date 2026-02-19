import axios from 'axios';
import { API_BASE_URL, LS_TOKEN } from './constants';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Request interceptor — добавляет Authorization header
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(LS_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — обработка 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = localStorage.getItem(LS_TOKEN);
      if (hadToken) {
        localStorage.removeItem(LS_TOKEN);
        // Уведомляем AuthContext через событие вместо жёсткой перезагрузки
        window.dispatchEvent(new CustomEvent('tokenExpired'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
