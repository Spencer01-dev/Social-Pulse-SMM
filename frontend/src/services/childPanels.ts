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

  // Panel Owner Management APIs
  getPanelOrders: async (
    panelId: string,
    params?: { status?: string; search?: string; skip?: number; limit?: number }
  ): Promise<ChildPanelOrder[]> => {
    const response = await apiClient.get<ChildPanelOrder[]>(`/child-panels/${panelId}/orders`, { params });
    return response.data;
  },

  getPanelOrderStats: async (panelId: string): Promise<ChildPanelOrderStats> => {
    const response = await apiClient.get<ChildPanelOrderStats>(`/child-panels/${panelId}/orders/stats`);
    return response.data;
  },

  cancelPanelOrder: async (panelId: string, orderId: string): Promise<ChildPanelOrder> => {
    const response = await apiClient.post<ChildPanelOrder>(`/child-panels/${panelId}/orders/${orderId}/cancel`);
    return response.data;
  },

  getPanelTickets: async (
    panelId: string,
    params?: { status?: string; priority?: string }
  ): Promise<ChildPanelTicket[]> => {
    const response = await apiClient.get<ChildPanelTicket[]>(`/child-panels/${panelId}/tickets`, { params });
    return response.data;
  },

  getPanelTicketDetail: async (panelId: string, ticketId: string): Promise<ChildPanelTicketDetail> => {
    const response = await apiClient.get<ChildPanelTicketDetail>(`/child-panels/${panelId}/tickets/${ticketId}`);
    return response.data;
  },

  replyPanelTicket: async (panelId: string, ticketId: string, message: string): Promise<ChildPanelTicketDetail> => {
    const response = await apiClient.post<ChildPanelTicketDetail>(`/child-panels/${panelId}/tickets/${ticketId}/reply`, {
      message,
    });
    return response.data;
  },

  updatePanelTicketStatus: async (
    panelId: string,
    ticketId: string,
    status: string
  ): Promise<ChildPanelTicketDetail> => {
    const response = await apiClient.patch<ChildPanelTicketDetail>(`/child-panels/${panelId}/tickets/${ticketId}/status`, {
      status,
    });
    return response.data;
  },

  getPanelUsers: async (panelId: string, params?: { search?: string }): Promise<ChildPanelUser[]> => {
    const response = await apiClient.get<ChildPanelUser[]>(`/child-panels/${panelId}/users`, { params });
    return response.data;
  },

  updatePanelUserStatus: async (
    panelId: string,
    userId: string,
    is_active: boolean
  ): Promise<ChildPanelUser> => {
    const response = await apiClient.patch<ChildPanelUser>(`/child-panels/${panelId}/users/${userId}/status`, {
      is_active,
    });
    return response.data;
  },

  adjustPanelUserBalance: async (
    panelId: string,
    userId: string,
    amount: number,
    reason?: string
  ): Promise<ChildPanelUser> => {
    const response = await apiClient.post<ChildPanelUser>(`/child-panels/${panelId}/users/${userId}/adjust-balance`, {
      amount,
      reason,
    });
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

  // Payment Gateway (PayHero Till / Paybill, Paystack)
  getPanelPaymentGateway: async (panelId: string): Promise<ChildPanelPaymentGatewayConfig> => {
    const response = await apiClient.get<ChildPanelPaymentGatewayConfig>(`/child-panels/${panelId}/payment-gateway`);
    return response.data;
  },

  updatePanelPaymentGateway: async (
    panelId: string,
    config: ChildPanelPaymentGatewayConfig
  ): Promise<ChildPanelPaymentGatewayConfig> => {
    const response = await apiClient.patch<ChildPanelPaymentGatewayConfig>(
      `/child-panels/${panelId}/payment-gateway`,
      config
    );
    return response.data;
  },
};

export interface ChildPanelPaymentGatewayConfig {
  gateway_provider: 'payhero' | 'paystack' | 'manual';
  payhero_channel_id?: string;
  payhero_api_key?: string;
  payhero_api_secret?: string;
  payhero_account_name?: string;
  paystack_public_key?: string;
  paystack_secret_key?: string;
  manual_till_number?: string;
  manual_account_name?: string;
  manual_instructions?: string;
  is_active: boolean;
}

export interface ChildPanelOrder {
  id: string;
  order_number?: number;
  user_id: string;
  username: string;
  service_id: string;
  service_name: string;
  target_link: string;
  quantity: number;
  charge: number;
  profit: number;
  status: string;
  remains: number;
  start_count: number;
  created_at: string;
}

export interface ChildPanelOrderStats {
  total_orders: number;
  pending_orders: number;
  processing_orders: number;
  in_progress_orders: number;
  completed_orders: number;
  canceled_orders: number;
  total_revenue: number;
  total_profit: number;
}

export interface ChildPanelTicket {
  id: string;
  user_id: string;
  username: string;
  order_id?: string;
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'answered' | 'customer_reply' | 'closed';
  last_message?: string;
  created_at: string;
  updated_at: string;
}

export interface ChildPanelTicketDetail extends ChildPanelTicket {
  messages: Array<{
    id: string;
    ticket_id: string;
    sender_id: string;
    sender_username: string;
    message: string;
    is_admin_reply: boolean;
    created_at: string;
  }>;
}

export interface ChildPanelUser {
  id: string;
  username: string;
  email: string;
  phone_number?: string;
  balance: number;
  currency: string;
  is_active: boolean;
  total_orders: number;
  total_spent: number;
  created_at: string;
}

export const childPanelsService = childPanelService;


