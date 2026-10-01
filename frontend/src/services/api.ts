import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { HealthStatus } from '../types';

let rawBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'https://social-pulse-smm-0geu.onrender.com/api/v1';

if (rawBaseUrl && rawBaseUrl.includes('social-pulse-smm.onrender.com')) {
  rawBaseUrl = rawBaseUrl.replace('social-pulse-smm.onrender.com', 'social-pulse-smm-0geu.onrender.com');
}

const API_BASE_URL =
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000/api/v1'
    : rawBaseUrl);

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 45000,
});

// Request interceptor to attach JWT auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for automatic error handling & token refresh handling in Phase 2
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and handle session expiry
      // In Phase 2 this will trigger refresh token flow
    }
    return Promise.reject(error);
  }
);

export const systemService = {
  getHealth: async (): Promise<HealthStatus> => {
    const response = await apiClient.get<HealthStatus>('/health');
    return response.data;
  },
};

export default apiClient;
