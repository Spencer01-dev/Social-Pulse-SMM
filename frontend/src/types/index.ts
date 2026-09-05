export type Role = 'customer' | 'reseller' | 'admin' | 'super_admin';

export type PlatformType =
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'tiktok'
  | 'twitter'
  | 'telegram'
  | 'spotify'
  | 'discord'
  | 'twitch'
  | 'other';

export type MarkupType = 'percentage' | 'fixed_amount' | 'manual';

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'canceled'
  | 'failed';

export type TransactionType =
  | 'deposit'
  | 'order_payment'
  | 'order_refund'
  | 'manual_adjustment'
  | 'bonus';

export type PaymentMethod = 'mpesa' | 'paystack' | 'manual' | 'internal';

export type SupportedCurrency = 'KES' | 'NGN' | 'GHS' | 'ZAR' | 'USD';

export interface CurrencyMetadata {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  country: string;
  decimals: number;
  rate_per_kes: number;
  kes_per_unit: number;
}

export interface CurrenciesResponse {
  base_currency: string;
  currencies: Record<string, CurrencyMetadata>;
}

export interface PaystackInitRequest {
  amount: number;
  currency: string;
  callback_url?: string;
}

export interface PaystackInitResponse {
  status: boolean;
  message: string;
  reference: string;
  authorization_url: string;
  access_code?: string;
  is_simulator: boolean;
}

export interface PaymentVerifyResponse {
  success: boolean;
  status: string;
  message: string;
  tx_ref?: string;
  amount_paid?: number;
  currency_paid?: string;
  credited_kes?: number;
  new_balance?: number;
}

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  phone_number?: string;
  role: Role;
  balance: number;
  currency: string;
  is_active: boolean;
  is_verified: boolean;
  api_key?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerService {
  id: string;
  platform: PlatformType;
  name: string;
  description?: string;
  service_type: string;
  category: string;
  rate: number; // Selling rate per 1,000 in KES
  min_quantity: number;
  max_quantity: number;
  refill_available: boolean;
  cancel_available: boolean;
}

export interface AdminService extends CustomerService {
  provider_id?: string;
  provider_service_id: string;
  provider_rate: number;
  selling_rate: number;
  profit_margin: number;
  markup_type: MarkupType;
  markup_value: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformSummary {
  platform: PlatformType;
  name: string;
  icon: string;
  service_count: number;
}

export interface CustomerOrder {
  id: string;
  order_number?: number;
  service_id: string;
  service_name: string;
  platform: PlatformType;
  target_link: string;
  quantity: number;
  start_count: number;
  remains: number;
  charge: number;
  currency: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminOrder extends CustomerOrder {
  user_id: string;
  user_email: string;
  username: string;
  provider_name?: string;
  provider_order_id?: string;
  provider_cost: number;
  profit: number;
  error_message?: string;
}

export interface OrderCreatePayload {
  service_id: string;
  target_link: string;
  quantity: number;
  custom_comments?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  order_id?: string;
  type: TransactionType;
  amount: number;
  balance_before: number;
  balance_after: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_reference?: string;
  status: TransactionStatus;
  description?: string;
  created_at: string;
}

export interface MpesaSTKPushRequest {
  phone_number: string;
  amount: number;
}

export interface MpesaSTKPushResponse {
  checkout_request_id: string;
  merchant_request_id: string;
  customer_message: string;
  status: string;
}

export interface MpesaSTKStatusResponse {
  checkout_request_id: string;
  status: TransactionStatus;
  result_code?: string;
  result_desc?: string;
  mpesa_receipt?: string;
  amount?: number;
  new_balance?: number;
}

export interface PalPlussSTKResponse {
  transaction_id: string;
  status: string;
  amount: number;
  phone: string;
  account_reference: string;
  provider_checkout_id?: string;
  message: string;
}

export interface PalPlussBalanceResponse {
  currency: string;
  available_balance: number;
  ledger_balance: number;
  error?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface HealthStatus {
  app_name: string;
  environment: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  database: {
    status: string;
    message?: string;
    latency_ms?: number;
  };
  redis: {
    status: string;
    message?: string;
    latency_ms?: number;
  };
}
