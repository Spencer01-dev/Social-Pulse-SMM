import apiClient from './api';
import { AdminService, CustomerService, PlatformSummary, PlatformType } from '../types';

export interface ServiceFilterParams {
  platform?: PlatformType;
  category?: string;
  search?: string;
}

export const servicesService = {
  // Customer methods
  getPublicServices: async (params?: ServiceFilterParams): Promise<CustomerService[]> => {
    const response = await apiClient.get<CustomerService[]>('/services', { params });
    return response.data;
  },

  getPlatforms: async (): Promise<PlatformSummary[]> => {
    const response = await apiClient.get<PlatformSummary[]>('/services/platforms');
    return response.data;
  },

  getServiceById: async (serviceId: string): Promise<CustomerService> => {
    const response = await apiClient.get<CustomerService>(`/services/${serviceId}`);
    return response.data;
  },

  // Admin methods
  getAdminServices: async (params?: ServiceFilterParams & { is_active?: boolean }): Promise<AdminService[]> => {
    const response = await apiClient.get<AdminService[]>('/admin/services', { params });
    return response.data;
  },

  syncFromProvider: async (providerSlug: string = 'delix', defaultMarkup: number = 80): Promise<{ message: string; total_fetched: number; created: number; updated: number }> => {
    const response = await apiClient.post('/admin/services/sync', null, {
      params: { provider_slug: providerSlug, default_markup: defaultMarkup },
    });
    return response.data;
  },

  updateService: async (serviceId: string, data: Partial<AdminService>): Promise<AdminService> => {
    const response = await apiClient.patch<AdminService>(`/admin/services/${serviceId}`, data);
    return response.data;
  },

  applyBulkMarkup: async (data: { platform?: PlatformType; category?: string; markup_type: string; markup_value: number }) => {
    const response = await apiClient.post('/admin/services/bulk-markup', data);
    return response.data;
  },

  getProviderBalance: async (providerSlug: string = 'delix'): Promise<{ provider: string; balance: number; currency: string }> => {
    const response = await apiClient.get('/admin/services/provider-balance', {
      params: { provider_slug: providerSlug },
    });
    return response.data;
  },
};
