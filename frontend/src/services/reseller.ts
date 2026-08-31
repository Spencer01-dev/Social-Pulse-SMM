import apiClient from './api';
import { User } from '../types';

export const resellerService = {
  generateApiKey: async (): Promise<User> => {
    const response = await apiClient.post<User>('/users/me/generate-api-key');
    return response.data;
  },

  revokeApiKey: async (): Promise<User> => {
    const response = await apiClient.post<User>('/users/me/revoke-api-key');
    return response.data;
  },
};
