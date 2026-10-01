import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { childPanelService } from '../services/childPanels';
import apiClient from '../services/api';

export interface TenantData {
  is_custom_tenant: boolean;
  tenant_id: string | null;
  domain: string;
  status: string;
  is_active?: boolean;
  site_name: string;
  tagline: string;
  logo_url: string | null;
  theme_color: string;
  currency: string;
  contact_email: string;
  whatsapp_support?: string | null;
  default_markup_percent: number;
  nameserver1?: string;
  nameserver2?: string;
  expires_at?: string | null;
}

interface TenantContextType {
  isTenantMode: boolean;
  tenant: TenantData | null;
  isLoading: boolean;
  enterTenantMode: (domain: string) => Promise<boolean>;
  exitTenantMode: () => void;
  calculateMarkedUpPrice: (retailPrice: number, wholesaleRate?: number) => number;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const TENANT_STORAGE_KEY = 'active_tenant_domain';

function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }
  return '245, 158, 11';
}

const MAIN_PLATFORM_DOMAINS = [
  'socialpulse.io',
  'www.socialpulse.io',
  'socialpulsesmm.com',
  'www.socialpulsesmm.com',
  'social-pulse-smm.vercel.app',
  'social-pulse-smm.onrender.com',
  'social-pulse-smm-0geu.onrender.com',
  'localhost',
  '127.0.0.1'
];

function isMainDomain(hostname: string): boolean {
  const clean = hostname.split(':')[0].toLowerCase().trim();
  return MAIN_PLATFORM_DOMAINS.some(d => clean === d || clean.endsWith(`.${d}`));
}

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applyTenantTheme = (tenantData: TenantData | null) => {
    if (tenantData && tenantData.is_custom_tenant) {
      document.title = `${tenantData.site_name} | Premium SMM Panel`;
      const color = tenantData.theme_color || '#f59e0b';
      const rgb = hexToRgb(color);
      document.documentElement.style.setProperty('--tenant-accent', color);
      document.documentElement.style.setProperty('--tenant-accent-rgb', rgb);
      document.documentElement.setAttribute('data-tenant-active', 'true');
      apiClient.defaults.headers.common['X-Tenant-Domain'] = tenantData.domain;
    } else {
      document.title = 'SocialPulse | Wholesale SMM Platform';
      document.documentElement.removeAttribute('data-tenant-active');
      document.documentElement.style.removeProperty('--tenant-accent');
      document.documentElement.style.removeProperty('--tenant-accent-rgb');
      delete apiClient.defaults.headers.common['X-Tenant-Domain'];
    }
  };

  const resolveTenantForDomain = useCallback(async (domainToResolve: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const data: TenantData = await childPanelService.resolveTenant(domainToResolve);
      if (data && data.is_custom_tenant) {
        setTenant(data);
        sessionStorage.setItem(TENANT_STORAGE_KEY, data.domain);
        applyTenantTheme(data);
        return true;
      } else {
        setTenant(null);
        sessionStorage.removeItem(TENANT_STORAGE_KEY);
        applyTenantTheme(null);
        return false;
      }
    } catch (err) {
      console.error('Failed to resolve tenant for domain:', domainToResolve, err);
      setTenant(null);
      sessionStorage.removeItem(TENANT_STORAGE_KEY);
      applyTenantTheme(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const enterTenantMode = async (domain: string): Promise<boolean> => {
    return await resolveTenantForDomain(domain);
  };

  const exitTenantMode = () => {
    setTenant(null);
    sessionStorage.removeItem(TENANT_STORAGE_KEY);
    applyTenantTheme(null);
    // Remove tenant query param from URL if present without page reload
    const url = new URL(window.location.href);
    if (url.searchParams.has('tenant')) {
      url.searchParams.delete('tenant');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  };

  const refreshTenant = async () => {
    if (tenant?.domain) {
      await resolveTenantForDomain(tenant.domain);
    }
  };

  const calculateMarkedUpPrice = useCallback(
    (retailPrice: number, _wholesaleRate?: number): number => {
      // Child panels sell at the exact same retail price as the parent panel.
      // Their profit comes from the wholesale gap:
      //   Customer pays selling_rate (3.86) → same as parent
      //   Wholesale deduction from child panel balance = wholesale_rate (3.29)
      //   Child panel profit = 3.86 - 3.29 = 0.57 per 1,000
      return retailPrice;
    },
    [tenant]
  );

  useEffect(() => {
    const currentHost = window.location.hostname.toLowerCase();
    const isMain = isMainDomain(currentHost);

    // 1. Check URL query params for explicit tenant override, e.g. ?tenant=testpanel.com
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get('tenant');

    if (tenantParam) {
      resolveTenantForDomain(tenantParam);
      return;
    }

    if (isMain) {
      // Main platform: never enter tenant mode; clear any residual test session
      sessionStorage.removeItem(TENANT_STORAGE_KEY);
      setTenant(null);
      applyTenantTheme(null);
      setIsLoading(false);
      return;
    }

    // 2. Custom domain for a child panel (e.g. mypanel.com)
    const storedDomain = sessionStorage.getItem(TENANT_STORAGE_KEY);
    const targetDomain = storedDomain || currentHost;
    resolveTenantForDomain(targetDomain);
  }, [resolveTenantForDomain]);

  return (
    <TenantContext.Provider
      value={{
        isTenantMode: Boolean(tenant && tenant.is_custom_tenant),
        tenant,
        isLoading,
        enterTenantMode,
        exitTenantMode,
        calculateMarkedUpPrice,
        refreshTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
