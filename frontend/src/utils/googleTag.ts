/**
 * Google Tag (gtag.js) & Google Ads Pixel Utility
 * Supports Google Ads Remarketing (AW-XXXXXXXX), Google Analytics 4 (G-XXXXXXXX),
 * and Google Tag Manager (GT-XXXXXXXX).
 * 
 * Enables audience retargeting so when visitors browse SocialPulse or child panels,
 * Google Ads can target them with remarketing campaigns (Search, Display, YouTube).
 */

// Fallback or configured Google Tag ID from environment for SocialPulse
export const GOOGLE_TAG_ID = (
  import.meta.env.VITE_GOOGLE_TAG_ID ||
  import.meta.env.VITE_GOOGLE_ADS_ID ||
  import.meta.env.VITE_GOOGLE_PIXEL_ID ||
  ''
).trim();

// Track initialized IDs to prevent duplicate script injection or config
const initializedTagIds = new Set<string>();

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

/**
 * Dynamically initialize the official Google Tag (gtag.js) snippet
 */
export const initGoogleTag = (tagId: string = GOOGLE_TAG_ID): boolean => {
  const targetId = tagId?.trim();

  if (!targetId || targetId === 'YOUR_GOOGLE_TAG_ID' || targetId === 'AW-XXXXXXXXX') {
    if (import.meta.env.DEV) {
      console.warn(
        '[Google Tag] No valid Google Tag / Ads ID configured. Add VITE_GOOGLE_TAG_ID to your frontend .env file.'
      );
    }
    return false;
  }

  try {
    // 1. Ensure window.dataLayer and window.gtag exist
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag('js', new Date());
    }

    // 2. Inject script tag if not already in document
    const scriptId = 'google-tag-script';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.async = true;
      scriptEl.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(targetId)}`;
      document.head.appendChild(scriptEl);
    }

    // 3. Configure the specific tag ID (supports multiple simultaneous IDs e.g. SocialPulse + Child Panel)
    if (!initializedTagIds.has(targetId)) {
      window.gtag('config', targetId, {
        send_page_view: false, // We manually trigger page_view on React Router navigation
      });
      initializedTagIds.add(targetId);

      if (import.meta.env.DEV) {
        console.log(`[Google Tag] Initialized successfully with ID: ${targetId}`);
      }
    }

    return true;
  } catch (err) {
    console.warn('[Google Tag] Initialization error (likely adblocker):', err);
    return false;
  }
};

/**
 * Track page view in Google Tag (gtag.js) for remarketing audience creation.
 * Essential for React Router SPAs to capture client-side route transitions.
 */
export const trackGooglePageView = (pagePath?: string, pageTitle?: string): void => {
  if (typeof window !== 'undefined' && window.gtag) {
    try {
      const path = pagePath || (window.location.pathname + window.location.search);
      const title = pageTitle || document.title;
      window.gtag('event', 'page_view', {
        page_path: path,
        page_title: title,
        page_location: window.location.href,
      });
      if (import.meta.env.DEV) {
        console.log(`[Google Tag] page_view tracked: ${path}`);
      }
    } catch {
      // Graceful fail
    }
  }
};

/**
 * Track generic event in Google Tag
 */
export const trackGoogleEvent = (eventName: string, params?: Record<string, unknown>): void => {
  if (typeof window !== 'undefined' && window.gtag) {
    try {
      window.gtag('event', eventName, params);
      if (import.meta.env.DEV) {
        console.log(`[Google Tag] Event tracked: ${eventName}`, params);
      }
    } catch {
      // Graceful fail
    }
  }
};

/**
 * Track user sign up / account creation in Google Tag
 */
export const trackGoogleSignUp = (params?: { method?: string }): void => {
  trackGoogleEvent('sign_up', {
    method: params?.method || 'email',
  });
};

/**
 * Track user lead / contact / WhatsApp in Google Tag
 */
export const trackGoogleLead = (params?: {
  value?: number;
  currency?: string;
  content_name?: string;
}): void => {
  trackGoogleEvent('generate_lead', {
    currency: params?.currency || 'KES',
    value: params?.value || 0,
    lead_source: params?.content_name || 'WhatsApp Inquiry',
  });
};

/**
 * Track checkout / deposit initiation in Google Tag
 */
export const trackGoogleBeginCheckout = (params?: {
  value?: number;
  currency?: string;
  items?: any[];
}): void => {
  trackGoogleEvent('begin_checkout', {
    currency: params?.currency || 'KES',
    value: params?.value || 0,
    items: params?.items || [
      {
        item_name: 'Deposit / Wallet Topup',
        quantity: 1,
        price: params?.value || 0,
      },
    ],
  });
};

/**
 * Track purchase / successful order or deposit in Google Tag
 */
export const trackGooglePurchase = (params: {
  value: number;
  currency?: string;
  order_id?: string | number;
  content_name?: string;
}): void => {
  trackGoogleEvent('purchase', {
    transaction_id: params.order_id ? String(params.order_id) : undefined,
    value: params.value,
    currency: params.currency || 'KES',
    items: [
      {
        item_id: params.order_id ? String(params.order_id) : undefined,
        item_name: params.content_name || 'SMM Service Order',
        quantity: 1,
        price: params.value,
      },
    ],
  });
};
