import apiClient from './api';

export interface CryptoDepositIntent {
  deposit_id: string;
  network: string;
  currency: string;
  deposit_address: string;
  memo_or_tag?: string;
  amount_usdt: number;
  amount_kes: number;
  exchange_rate: number;
  qr_code_uri: string;
  expires_at_timestamp: number;
}

export interface CryptoVerifyResult {
  is_valid: boolean;
  tx_hash: string;
  amount_kes: number;
  new_balance: number;
  message: string;
}

export interface BinancePayOrder {
  prepay_id: string;
  checkout_url: string;
  qr_content: string;
  amount_usdt: number;
  amount_kes: number;
  currency: string;
  expire_time: number;
}

export const cryptoService = {
  createCryptoDeposit: async (data: { network: string; amount_kes?: number; amount_usdt?: number }): Promise<CryptoDepositIntent> => {
    const response = await apiClient.post<CryptoDepositIntent>('/payments/crypto/create-deposit', data);
    return response.data;
  },

  verifyCryptoTx: async (data: { deposit_id: string; tx_hash: string; network: string; amount_usdt: number }): Promise<CryptoVerifyResult> => {
    const response = await apiClient.post<CryptoVerifyResult>('/payments/crypto/verify', data);
    return response.data;
  },

  createBinanceOrder: async (data: { amount_kes: number }): Promise<BinancePayOrder> => {
    const response = await apiClient.post<BinancePayOrder>('/payments/binance/create-order', data);
    return response.data;
  },
};
