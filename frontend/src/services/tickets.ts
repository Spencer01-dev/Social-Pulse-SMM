import apiClient from './api';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'answered' | 'customer_reply' | 'closed';

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_username: string;
  message: string;
  is_admin_reply: boolean;
  created_at: string;
}

export interface TicketSummary {
  id: string;
  user_id: string;
  username: string;
  order_id?: string;
  subject: string;
  priority: TicketPriority;
  status: TicketStatus;
  last_message?: string;
  created_at: string;
  updated_at: string;
}

export interface TicketDetail extends TicketSummary {
  messages: TicketMessage[];
}

export interface TicketCreatePayload {
  subject: string;
  priority: TicketPriority;
  order_id?: string;
  message: string;
}

export const ticketsService = {
  // Customer APIs
  getMyTickets: async (): Promise<TicketSummary[]> => {
    const response = await apiClient.get<TicketSummary[]>('/tickets');
    return response.data;
  },

  getTicketDetails: async (ticketId: string): Promise<TicketDetail> => {
    const response = await apiClient.get<TicketDetail>(`/tickets/${ticketId}`);
    return response.data;
  },

  createTicket: async (data: TicketCreatePayload): Promise<TicketDetail> => {
    const response = await apiClient.post<TicketDetail>('/tickets', data);
    return response.data;
  },

  replyToTicket: async (ticketId: string, message: string): Promise<TicketDetail> => {
    const response = await apiClient.post<TicketDetail>(`/tickets/${ticketId}/reply`, { message });
    return response.data;
  },

  closeTicket: async (ticketId: string): Promise<TicketDetail> => {
    const response = await apiClient.patch<TicketDetail>(`/tickets/${ticketId}/close`);
    return response.data;
  },

  // Admin APIs
  getAllTickets: async (params?: { status_filter?: TicketStatus; priority_filter?: TicketPriority }): Promise<TicketSummary[]> => {
    const response = await apiClient.get<TicketSummary[]>('/admin/tickets', { params });
    return response.data;
  },

  getAdminTicketDetails: async (ticketId: string): Promise<TicketDetail> => {
    const response = await apiClient.get<TicketDetail>(`/admin/tickets/${ticketId}`);
    return response.data;
  },

  adminReplyToTicket: async (ticketId: string, message: string): Promise<TicketDetail> => {
    const response = await apiClient.post<TicketDetail>(`/admin/tickets/${ticketId}/reply`, { message });
    return response.data;
  },

  updateTicketStatus: async (ticketId: string, status: TicketStatus): Promise<TicketDetail> => {
    const response = await apiClient.patch<TicketDetail>(`/admin/tickets/${ticketId}/status`, { status });
    return response.data;
  },
};
