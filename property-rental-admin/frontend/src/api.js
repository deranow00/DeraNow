import axios from 'axios';

const configuredBase = (import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://property-rental-admin.onrender.com/api/admin')
  .trim()
  .replace(/\/+$/, '');

const API = axios.create({
  baseURL: configuredBase,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAdminSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const clearAdminSession = () => {
  localStorage.removeItem('adminToken');
};

export default API;
