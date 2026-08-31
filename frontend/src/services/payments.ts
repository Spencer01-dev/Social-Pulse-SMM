import apiClient from './api';
import {
  CurrenciesResponse,
  FlutterwaveInitRequest,
  FlutterwaveInitResponse,
  MpesaSTKPushRequest,
  MpesaSTKPushResponse,
  MpesaSTKStatusResponse,
  PaymentVerifyResponse,
  PaystackInitRequest,
  PaystackInitResponse,
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../types';

export const paymentsService = {
  // M-Pesa STK Push
  initiateMpesaSTK: async (payload: MpesaSTKPushRequest): Promise<MpesaSTKPushResponse> => {
    const response = await apiClient.post<MpesaSTKPushResponse>('/payments/mpesa/stk-push', payload);
    return response.data;
  },

  // Query STK Status
  queryMpesaStatus: async (checkoutRequestId: string): Promise<MpesaSTKStatusResponse> => {
    const response = await apiClient.get<MpesaSTKStatusResponse>(`/payments/mpesa/status/${checkoutRequestId}`);
    return response.data;
  },

  // Supported Multi-Currencies & Live Rates
  getCurrencies: async (): Promise<CurrenciesResponse> => {
    const response = await apiClient.get<CurrenciesResponse>('/payments/currencies');
    return response.data;
  },

  // Flutterwave Pan-African Engine
  initiateFlutterwave: async (payload: FlutterwaveInitRequest): Promise<FlutterwaveInitResponse> => {
    const response = await apiClient.post<FlutterwaveInitResponse>('/payments/flutterwave/initialize', payload);
    return response.data;
  },

  verifyFlutterwave: async (txRef: string): Promise<PaymentVerifyResponse> => {
    const response = await apiClient.get<PaymentVerifyResponse>(`/payments/flutterwave/verify/${txRef}`);
    return response.data;
  },

  // Paystack 1-Click Engine
  initiatePaystack: async (payload: PaystackInitRequest): Promise<PaystackInitResponse> => {
    const response = await apiClient.post<PaystackInitResponse>('/payments/paystack/initialize', payload);
    return response.data;
  },

  verifyPaystack: async (reference: string): Promise<PaymentVerifyResponse> => {
    const response = await apiClient.get<PaymentVerifyResponse>(`/payments/paystack/verify/${reference}`);
    return response.data;
  },

  // User Wallet Statement
  getMyTransactions: async (params?: { type?: TransactionType; status?: TransactionStatus; skip?: number; limit?: number }): Promise<Transaction[]> => {
    const response = await apiClient.get<Transaction[]>('/wallet/transactions', { params });
    return response.data;
  },

  // Admin Wallet Audit
  getAdminTransactions: async (params?: { user_id?: string; type?: TransactionType; skip?: number; limit?: number }): Promise<Transaction[]> => {
    const response = await apiClient.get<Transaction[]>('/admin/wallet/transactions', { params });
    return response.data;
  },

  // Admin Manual Adjust
  adjustUserBalance: async (data: { user_id: string; amount: number; reason: string }): Promise<Transaction> => {
    const response = await apiClient.post<Transaction>('/admin/wallet/adjust', data);
    return response.data;
  },
};
