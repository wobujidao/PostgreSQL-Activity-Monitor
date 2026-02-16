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
      localStorage.removeItem(LS_TOKEN);
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
