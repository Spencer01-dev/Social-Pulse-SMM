import apiClient from './api';
import { AuthTokens, User } from '../types';

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  full_name?: string;
  phone_number?: string;
}

export interface LoginPayload {
  email_or_username: string;
  password: string;
}

export const authService = {
  register: async (data: RegisterPayload): Promise<User> => {
    const response = await apiClient.post<User>('/auth/register', data);
    return response.data;
  },

  login: async (data: LoginPayload): Promise<AuthTokens> => {
    const response = await apiClient.post<AuthTokens>('/auth/login', data);
    return response.data;
  },

  refreshToken: async (refreshToken: string): Promise<AuthTokens> => {
    const response = await apiClient.post<AuthTokens>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  updateProfile: async (data: { full_name?: string; phone_number?: string }): Promise<User> => {
    const response = await apiClient.patch<User>('/users/me', data);
    return response.data;
  },

  changePassword: async (data: { current_password: string; new_password: string }): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/users/me/change-password', data);
    return response.data;
  },

  addSandboxFunds: async (amount: number = 1000): Promise<User> => {
    const response = await apiClient.post<User>('/users/me/add-sandbox-funds', { amount });
    return response.data;
  },
};
