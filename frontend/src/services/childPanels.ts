import apiClient from './api';

export type ChildPanelStatusType =
  | 'pending'
  | 'payment_confirmed'
  | 'creating_tenant'
  | 'configuring_database'
  | 'configuring_domain'
  | 'configuring_branding'
  | 'configuring_api'
  | 'ssl_pending'
  | 'active'
  | 'provisioning_failed'
  | 'suspended'
  | 'expired'
  | 'terminated';

export interface ChildPanelData {
  id: string;
  user_id: string;
  domain: string;
  admin_username: string;
  currency: string;
  price_per_month: number;
  status: ChildPanelStatusType;
  provisioning_step?: string;
  last_error?: string;
  branding_json?: Record<string, any>;
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

  verifyDns: async (panelId: string, force: boolean = false): Promise<{ success: boolean; message: string; status: string }> => {
    const response = await apiClient.post(`/child-panels/${panelId}/verify-dns?force=${force}`);
    return response.data;
  },

  retryProvisioning: async (panelId: string): Promise<ChildPanelData> => {
    const response = await apiClient.post<ChildPanelData>(`/child-panels/${panelId}/retry`);
    return response.data;
  },

  updateBranding: async (panelId: string, branding: Record<string, any>): Promise<ChildPanelData> => {
    const response = await apiClient.patch<ChildPanelData>(`/child-panels/${panelId}/branding`, branding);
    return response.data;
  },

  resolveTenant: async (domain?: string): Promise<any> => {
    const url = domain ? `/tenant/resolve?domain=${encodeURIComponent(domain)}` : '/tenant/resolve';
    const response = await apiClient.get(url);
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

export const childPanelsService = childPanelService;

