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
  whatsapp_channel_url?: string | null;
  default_markup_percent: number;
  nameserver1?: string;
  nameserver2?: string;
  expires_at?: string | null;
  payment_account_name?: string;
  payment_paybill?: string;
  payment_account_number?: string;
}

interface TenantContextType {
  isTenantMode: boolean;
  tenant: TenantData | null;
  isLoading: boolean;
  isSimulation: boolean;
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

export const MAIN_PLATFORM_DOMAINS = [
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

export function isMainDomain(hostname: string): boolean {
  if (!hostname) return true;
  const clean = hostname.split(':')[0].toLowerCase().trim().replace(/^www\./, '');
  return MAIN_PLATFORM_DOMAINS.some(d => clean === d || clean.endsWith(`.${d}`));
}

export function isCustomDomain(hostname: string): boolean {
  return !isMainDomain(hostname);
}

export const SKAKEGAINS_PRESET: TenantData = {
  is_custom_tenant: true,
  tenant_id: 'd4391dfb-b89e-439a-9ee1-04ae56fcb9fe',
  domain: 'skakegains.com',
  status: 'active',
  is_active: true,
  site_name: 'Skakegains SMM',
  tagline: 'More Followers • More Likes',
  logo_url: '/skakegains-logo.png',
  theme_color: '#10b981',
  currency: 'KES',
  contact_email: 'support@skakegains.com',
  whatsapp_support: '+254703917794',
  whatsapp_channel_url: 'https://whatsapp.com/channel/0029Vb8c54F0bIdka4i2Xh2M',
  default_markup_percent: 0,
  nameserver1: 'ns1.socialpulse.io',
  nameserver2: 'ns2.socialpulse.io',
  payment_account_name: 'shakegains',
  payment_paybill: '997960',
  payment_account_number: '0010542'
};

export function getInitialTenant(): { initialTenant: TenantData | null; isCustomHost: boolean } {
  if (typeof window === 'undefined') {
    return { initialTenant: null, isCustomHost: false };
  }

  const currentHost = window.location.hostname.split(':')[0].toLowerCase().trim().replace(/^www\./, '');
  const isMain = isMainDomain(currentHost);
  const params = new URLSearchParams(window.location.search);
  const tenantParam = params.get('tenant');
  const storedDomain = sessionStorage.getItem(TENANT_STORAGE_KEY);

  const target = tenantParam || storedDomain || (!isMain ? currentHost : null);
  if (!target) {
    return { initialTenant: null, isCustomHost: false };
  }

  const cleanTarget = target.toLowerCase().trim().replace(/^www\./, '');

  // 1. If it matches skakegains / shakegains
  if (cleanTarget.includes('skakegains') || cleanTarget.includes('shakegains')) {
    return { initialTenant: SKAKEGAINS_PRESET, isCustomHost: true };
  }

  // 2. Persistent local storage cache
  try {
    const cached = localStorage.getItem(`tenant_cache_${cleanTarget}`);
    if (cached) {
      const parsed = JSON.parse(cached) as TenantData;
      if (parsed && parsed.is_custom_tenant) {
        return { initialTenant: parsed, isCustomHost: true };
      }
    }
  } catch {
    // Ignore cache error
  }

  // 3. For any other custom child panel domain
  if (!isMain) {
    const brand = cleanTarget.split('.')[0];
    const brandTitle = brand.charAt(0).toUpperCase() + brand.slice(1) + ' SMM';
    const isTargetSkake = cleanTarget.includes('shakegains') || cleanTarget.includes('skakegains');
    return {
      initialTenant: {
        is_custom_tenant: true,
        tenant_id: null,
        domain: cleanTarget,
        status: 'active',
        is_active: true,
        site_name: brandTitle,
        tagline: 'Premium Social Media Growth Panel',
        logo_url: null,
        theme_color: '#10b981',
        currency: 'KES',
        contact_email: `support@${cleanTarget}`,
        default_markup_percent: 0,
        payment_account_name: isTargetSkake ? 'shakegains' : brandTitle,
        payment_paybill: '997960',
        payment_account_number: isTargetSkake ? '0010542' : '0010529',
      },
      isCustomHost: true,
    };
  }

  return { initialTenant: null, isCustomHost: false };
}

// Immediate synchronous theme execution on module load
if (typeof window !== 'undefined') {
  const { initialTenant } = getInitialTenant();
  if (initialTenant && initialTenant.is_custom_tenant) {
    document.title = `${initialTenant.site_name} | Premium SMM Panel`;
    const color = initialTenant.theme_color || '#10b981';
    document.documentElement.style.setProperty('--tenant-accent', color);
    document.documentElement.style.setProperty('--tenant-accent-rgb', hexToRgb(color));
    document.documentElement.setAttribute('data-tenant-active', 'true');
    const faviconElements = document.querySelectorAll<HTMLLinkElement>(
      "link[rel*='icon'], link[rel='apple-touch-icon'], link[rel='shortcut icon']"
    );
    const iconUrl = initialTenant.logo_url || '/skakegains-logo.png';
    faviconElements.forEach((el) => {
      el.href = iconUrl;
    });
  }
}

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialState] = useState(() => getInitialTenant());
  const [tenant, setTenant] = useState<TenantData | null>(initialState.initialTenant);
  const [isLoading, setIsLoading] = useState<boolean>(!initialState.initialTenant && initialState.isCustomHost);

  const applyTenantTheme = (tenantData: TenantData | null) => {
    const faviconElements = document.querySelectorAll<HTMLLinkElement>(
      "link[rel*='icon'], link[rel='apple-touch-icon'], link[rel='shortcut icon']"
    );

    if (tenantData && tenantData.is_custom_tenant) {
      document.title = `${tenantData.site_name} | Premium SMM Panel`;
      const color = tenantData.theme_color || '#10b981';
      const rgb = hexToRgb(color);
      document.documentElement.style.setProperty('--tenant-accent', color);
      document.documentElement.style.setProperty('--tenant-accent-rgb', rgb);
      document.documentElement.setAttribute('data-tenant-active', 'true');
      apiClient.defaults.headers.common['X-Tenant-Domain'] = tenantData.domain;

      // Update favicon in browser search bar, tab, and bookmarks
      const iconUrl = tenantData.logo_url || '/skakegains-logo.png';
      faviconElements.forEach((el) => {
        el.href = iconUrl;
      });
    } else {
      document.title = 'SocialPulse | Wholesale SMM Platform';
      document.documentElement.removeAttribute('data-tenant-active');
      document.documentElement.style.removeProperty('--tenant-accent');
      document.documentElement.style.removeProperty('--tenant-accent-rgb');
      delete apiClient.defaults.headers.common['X-Tenant-Domain'];

      // Restore default platform favicons
      faviconElements.forEach((el) => {
        if (el.getAttribute('sizes') === '32x32') el.href = '/favicon-32x32.png';
        else if (el.getAttribute('sizes') === '16x16') el.href = '/favicon-16x16.png';
        else if (el.rel.includes('apple-touch-icon')) el.href = '/apple-touch-icon.png';
        else el.href = '/favicon.ico';
      });
    }
  };

  const resolveTenantForDomain = useCallback(async (domainToResolve: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const data: TenantData = await childPanelService.resolveTenant(domainToResolve);
      if (data && data.is_custom_tenant) {
        setTenant(data);
        sessionStorage.setItem(TENANT_STORAGE_KEY, data.domain);
        try {
          localStorage.setItem(`tenant_cache_${data.domain.toLowerCase().trim()}`, JSON.stringify(data));
        } catch {
          // ignore storage error
        }
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
      // If we already have a synchronous preset (e.g. skakegains), retain it rather than erasing
      if (!tenant) {
        setTenant(null);
        sessionStorage.removeItem(TENANT_STORAGE_KEY);
        applyTenantTheme(null);
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [tenant]);

  const enterTenantMode = async (domain: string): Promise<boolean> => {
    return await resolveTenantForDomain(domain);
  };

  const exitTenantMode = () => {
    // If the visitor is browsing on a real custom domain (e.g. skakegains.com), never exit to SocialPulse!
    if (!isMainDomain(window.location.hostname)) {
      return;
    }
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
    (retailPrice: number, wholesaleRate?: number): number => {
      // If child panel has configured their custom markup %, calculate price over wholesale rate (1.30x provider rate)
      if (tenant?.default_markup_percent && tenant.default_markup_percent > 0) {
        const base = wholesaleRate && wholesaleRate > 0 ? wholesaleRate : retailPrice;
        return Number((base * (1 + tenant.default_markup_percent / 100)).toFixed(2));
      }
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
      const normalizedDomain = tenantParam.includes('shake') ? 'skakegains.com' : tenantParam;
      resolveTenantForDomain(normalizedDomain);
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

    // 2. Custom domain for a child panel (e.g. skakegains.com)
    let storedDomain = sessionStorage.getItem(TENANT_STORAGE_KEY);
    if (storedDomain && storedDomain.includes('shake')) {
      storedDomain = 'skakegains.com';
    }
    const cleanHost = currentHost.startsWith('www.') ? currentHost.slice(4) : currentHost;
    let targetDomain = storedDomain || cleanHost;
    if (targetDomain.includes('shake')) {
      targetDomain = 'skakegains.com';
    }
    resolveTenantForDomain(targetDomain);
  }, [resolveTenantForDomain]);

  const isSimulation = Boolean(tenant && tenant.is_custom_tenant && isMainDomain(window.location.hostname));

  // If visitor is browsing on a custom child panel domain and tenant data hasn't loaded yet,
  // NEVER render SocialPulse layout. Render a clean domain loader.
  if (initialState.isCustomHost && !tenant) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        <span className="text-sm font-semibold text-slate-400">Loading {window.location.hostname}...</span>
      </div>
    );
  }

  return (
    <TenantContext.Provider
      value={{
        isTenantMode: Boolean(tenant && tenant.is_custom_tenant),
        tenant,
        isLoading,
        isSimulation,
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
