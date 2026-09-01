import apiClient from './api';
import { AdminOrder, CustomerOrder, OrderCreatePayload, OrderStatus } from '../types';

export interface OrderFilterParams {
  status?: OrderStatus;
  search?: string;
  all_orders?: boolean;
  skip?: number;
  limit?: number;
}

export const ordersService = {
  // Customer methods
  createOrder: async (payload: OrderCreatePayload): Promise<CustomerOrder> => {
    const response = await apiClient.post<CustomerOrder>('/orders', payload);
    return response.data;
  },

  getMyOrders: async (params?: OrderFilterParams): Promise<CustomerOrder[]> => {
    const response = await apiClient.get<CustomerOrder[]>('/orders', { params });
    return response.data;
  },

  getOrderById: async (orderId: string): Promise<CustomerOrder> => {
    const response = await apiClient.get<CustomerOrder>(`/orders/${orderId}`);
    return response.data;
  },

  // Admin methods
  getAdminOrders: async (params?: OrderFilterParams): Promise<AdminOrder[]> => {
    const response = await apiClient.get<AdminOrder[]>('/admin/orders', { params });
    return response.data;
  },

  overrideOrderStatus: async (
    orderId: string,
    data: { status: OrderStatus; start_count?: number; remains?: number; error_message?: string }
  ): Promise<AdminOrder> => {
    const response = await apiClient.patch<AdminOrder>(`/admin/orders/${orderId}/status`, data);
    return response.data;
  },

  syncActiveOrders: async (): Promise<{ message: string; checked: number; updated: number }> => {
    const response = await apiClient.post('/admin/orders/sync-active');
    return response.data;
  },

  retryOrderDispatch: async (orderId: string): Promise<AdminOrder> => {
    const response = await apiClient.post<AdminOrder>(`/admin/orders/${orderId}/retry`);
    return response.data;
  },
};
