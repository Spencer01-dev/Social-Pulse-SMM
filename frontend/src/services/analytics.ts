import apiClient from './api';
import { Role, User } from '../types';

export interface AnalyticsOverview {
  total_revenue: number;
  total_provider_cost: number;
  total_gross_profit: number;
  profit_margin_percent: number;
  total_orders_count: number;
  total_completed_orders: number;
  total_active_users: number;
  total_deposits_volume: number;
  currency: string;
}

export interface DailyRevenue {
  date_label: string;
  revenue: number;
  profit: number;
  orders_count: number;
}

export interface PlatformMetric {
  platform: string;
  name: string;
  orders_count: number;
  revenue: number;
  profit: number;
}

export interface TopService {
  service_id: string;
  name: string;
  platform: string;
  orders_count: number;
  total_revenue: number;
  total_profit: number;
}

export interface RecentActivity {
  id: string;
  event_type: 'order' | 'deposit' | 'user_registered';
  title: string;
  subtitle: string;
  amount?: number;
  currency: string;
  timestamp: string;
}

export interface PlatformSettings {
  project_name: string;
  environment: string;
  primary_currency: string;
  debug_mode: boolean;
  use_mock_providers: boolean;
  providers: {
    delix: {
      name?: string;
      api_url: string;
      has_api_key: boolean;
    };
    exonums?: {
      name?: string;
      api_url: string;
      has_api_key: boolean;
    };
    [key: string]: {
      name?: string;
      api_url: string;
      has_api_key: boolean;
    } | undefined;
  };
  payments: {
    mpesa: {
      environment: string;
      shortcode: string;
      has_consumer_key: boolean;
      callback_url: string;
    };
    okx: {
      has_api_key: boolean;
      supported_chains: string[];
    };
    binance: {
      has_api_key: boolean;
      base_url: string;
    };
  };
  exchange_rates: {
    default_usd_to_kes: number;
    default_usdt_to_kes: number;
    markup_percent: number;
  };
}

export const analyticsService = {
  getOverview: async (): Promise<AnalyticsOverview> => {
    const response = await apiClient.get<AnalyticsOverview>('/admin/analytics/overview');
    return response.data;
  },

  getDailyRevenue: async (days: number = 14): Promise<DailyRevenue[]> => {
    const response = await apiClient.get<DailyRevenue[]>('/admin/analytics/daily-revenue', { params: { days } });
    return response.data;
  },

  getPlatformMetrics: async (): Promise<PlatformMetric[]> => {
    const response = await apiClient.get<PlatformMetric[]>('/admin/analytics/platform-breakdown');
    return response.data;
  },

  getTopServices: async (limit: number = 5): Promise<TopService[]> => {
    const response = await apiClient.get<TopService[]>('/admin/analytics/top-services', { params: { limit } });
    return response.data;
  },

  getRecentActivity: async (limit: number = 10): Promise<RecentActivity[]> => {
    const response = await apiClient.get<RecentActivity[]>('/admin/analytics/recent-activity', { params: { limit } });
    return response.data;
  },

  getUsers: async (params?: { role?: Role; search?: string; skip?: number; limit?: number }): Promise<User[]> => {
    const response = await apiClient.get<User[]>('/users', { params });
    return response.data;
  },

  updateUserRole: async (userId: string, role: Role): Promise<User> => {
    const response = await apiClient.patch<User>(`/users/${userId}/role`, { role });
    return response.data;
  },

  updateUserStatus: async (userId: string, is_active: boolean): Promise<User> => {
    const response = await apiClient.patch<User>(`/users/${userId}/status`, { is_active });
    return response.data;
  },

  getSettings: async (): Promise<PlatformSettings> => {
    const response = await apiClient.get<PlatformSettings>('/admin/settings');
    return response.data;
  },
};
