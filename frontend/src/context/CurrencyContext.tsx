import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { CurrencyMetadata, SupportedCurrency } from '../types';
import { paymentsService } from '../services/payments';

const DEFAULT_CURRENCIES: Record<string, CurrencyMetadata> = {
  KES: {
    code: 'KES',
    name: 'Kenyan Shilling',
    symbol: 'Ksh',
    flag: 'KE',
    country: 'Kenya',
    decimals: 2,
    rate_per_kes: 1.0,
    kes_per_unit: 1.0,
  },
  NGN: {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    flag: 'NG',
    country: 'Nigeria',
    decimals: 2,
    rate_per_kes: 11.5,
    kes_per_unit: 0.087,
  },
  GHS: {
    code: 'GHS',
    name: 'Ghanaian Cedi',
    symbol: 'GH₵',
    flag: 'GH',
    country: 'Ghana',
    decimals: 2,
    rate_per_kes: 0.12,
    kes_per_unit: 8.333,
  },
  TZS: {
    code: 'TZS',
    name: 'Tanzanian Shilling',
    symbol: 'TSh',
    flag: 'TZ',
    country: 'Tanzania',
    decimals: 0,
    rate_per_kes: 20.0,
    kes_per_unit: 0.05,
  },
  BIF: {
    code: 'BIF',
    name: 'Burundian Franc',
    symbol: 'FBu',
    flag: 'BI',
    country: 'Burundi',
    decimals: 0,
    rate_per_kes: 22.5,
    kes_per_unit: 0.0444,
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    flag: 'US',
    country: 'United States',
    decimals: 2,
    rate_per_kes: 0.00769,
    kes_per_unit: 130.0,
  },
  USDT: {
    code: 'USDT',
    name: 'Tether USD',
    symbol: '₮',
    flag: 'WEB3',
    country: 'Global Web3',
    decimals: 2,
    rate_per_kes: 0.0076,
    kes_per_unit: 131.5,
  },
};

interface CurrencyContextType {
  currency: SupportedCurrency;
  setCurrency: (code: SupportedCurrency) => void;
  currencies: Record<string, CurrencyMetadata>;
  currentMetadata: CurrencyMetadata;
  convertFromKes: (kesAmount: number, targetCurrency?: SupportedCurrency) => number;
  convertToKes: (amount: number, fromCurrency?: SupportedCurrency) => number;
  formatCurrency: (kesAmount: number, options?: { showCode?: boolean; customCurrency?: SupportedCurrency }) => string;
  refreshRates: () => Promise<void>;
  isLoading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const STORAGE_KEY = 'socialpulse_selected_currency';

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<SupportedCurrency>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DEFAULT_CURRENCIES[saved]) {
      return saved as SupportedCurrency;
    }
    return 'KES';
  });

  const [currencies, setCurrencies] = useState<Record<string, CurrencyMetadata>>(DEFAULT_CURRENCIES);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchRates = async () => {
    try {
      setIsLoading(true);
      const res = await paymentsService.getCurrencies();
      if (res && res.currencies) {
        setCurrencies(res.currencies);
      }
    } catch (err) {
      console.warn('Using default currency rates due to fetch failure', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const setCurrency = (code: SupportedCurrency) => {
    setCurrencyState(code);
    localStorage.setItem(STORAGE_KEY, code);
  };

  const currentMetadata = useMemo(() => {
    return currencies[currency] || DEFAULT_CURRENCIES[currency] || DEFAULT_CURRENCIES.KES;
  }, [currencies, currency]);

  const convertFromKes = (kesAmount: number, targetCurrency?: SupportedCurrency): number => {
    const target = targetCurrency || currency;
    const meta = currencies[target] || DEFAULT_CURRENCIES[target] || DEFAULT_CURRENCIES.KES;
    const rate = meta.rate_per_kes || 1.0;
    const converted = kesAmount * rate;
    const decimals = meta.decimals ?? 2;
    return Number(converted.toFixed(decimals));
  };

  const convertToKes = (amount: number, fromCurrency?: SupportedCurrency): number => {
    const from = fromCurrency || currency;
    const meta = currencies[from] || DEFAULT_CURRENCIES[from] || DEFAULT_CURRENCIES.KES;
    const rate = meta.rate_per_kes || 1.0;
    if (rate <= 0) return amount;
    return Number((amount / rate).toFixed(2));
  };

  const formatCurrency = (
    kesAmount: number,
    options?: { showCode?: boolean; customCurrency?: SupportedCurrency }
  ): string => {
    const target = options?.customCurrency || currency;
    const meta = currencies[target] || DEFAULT_CURRENCIES[target] || DEFAULT_CURRENCIES.KES;
    const converted = convertFromKes(kesAmount, target);
    const decimals = meta.decimals ?? 2;
    const formattedNum = converted.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

    if (options?.showCode) {
      return `${meta.symbol} ${formattedNum} ${meta.code}`;
    }
    return `${meta.symbol} ${formattedNum}`;
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        currencies,
        currentMetadata,
        convertFromKes,
        convertToKes,
        formatCurrency,
        refreshRates: fetchRates,
        isLoading,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};
