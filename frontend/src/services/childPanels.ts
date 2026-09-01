import apiClient from './api';

export interface ChildPanelData {
  id: string;
  user_id: string;
  domain: string;
  admin_username: string;
  currency: string;
  price_per_month: number;
  status: 'pending' | 'active' | 'suspended' | 'expired' | 'terminated';
  nameserver1: string;
  nameserver2: string;
  expires_at: string;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChildPanelCreatePayload {
  domain: string;
  admin_username: string;
  admin_password: string;
  currency?: string;
  auto_renew?: boolean;
}

export const childPanelService = {
  orderPanel: async (payload: ChildPanelCreatePayload): Promise<ChildPanelData> => {
    const response = await apiClient.post<ChildPanelData>('/child-panels', payload);
    return response.data;
  },

  getMyPanels: async (): Promise<ChildPanelData[]> => {
    const response = await apiClient.get<ChildPanelData[]>('/child-panels/my');
    return response.data;
  },

  renewPanel: async (panelId: string): Promise<ChildPanelData> => {
    const response = await apiClient.post<ChildPanelData>(`/child-panels/${panelId}/renew`);
    return response.data;
  },

  // Admin
  getAllPanels: async (): Promise<ChildPanelData[]> => {
    const response = await apiClient.get<ChildPanelData[]>('/child-panels/admin/all');
    return response.data;
  },

  updatePanelStatus: async (
    panelId: string,
    data: { status: string; notes?: string }
  ): Promise<ChildPanelData> => {
    const response = await apiClient.patch<ChildPanelData>(`/child-panels/admin/${panelId}/status`, data);
    return response.data;
  },
};
