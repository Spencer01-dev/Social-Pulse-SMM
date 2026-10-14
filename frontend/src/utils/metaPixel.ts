/**
 * Meta (Facebook) Pixel Integration Utility
 * Supports single-page app (SPA) route changes and standard conversion events.
 */

// Fallback or configured Meta Pixel ID from environment
export const META_PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID || '').trim();

let isInitialized = false;

/**
 * Dynamically initialize the official Meta Pixel snippet
 */
export const initMetaPixel = (pixelId: string = META_PIXEL_ID): boolean => {
  const targetId = pixelId?.trim();

  if (!targetId || targetId === 'YOUR_META_PIXEL_ID') {
    if (import.meta.env.DEV) {
      console.warn(
        '[Meta Pixel] No valid Pixel ID configured. Add VITE_META_PIXEL_ID to your frontend .env file.'
      );
    }
    return false;
  }

  if (isInitialized) {
    return true;
  }

  try {
    /* eslint-disable */
    (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(
      window,
      document,
      'script',
      'https://connect.facebook.net/en_US/fbevents.js'
    );
    /* eslint-enable */

    if (window.fbq) {
      window.fbq('init', targetId);
      isInitialized = true;
      if (import.meta.env.DEV) {
        console.log(`[Meta Pixel] Initialized successfully with ID: ${targetId}`);
      }
      return true;
    }
  } catch (err) {
    console.warn('[Meta Pixel] Initialization error (likely adblocker):', err);
  }

  return false;
};

/**
 * Tracks a PageView event in Meta Pixel.
 * Crucial for React Router SPAs where route transitions happen client-side.
 */
export const trackPageView = (): void => {
  if (typeof window !== 'undefined' && window.fbq) {
    try {
      window.fbq('track', 'PageView');
      if (import.meta.env.DEV) {
        console.log(`[Meta Pixel] PageView tracked: ${window.location.pathname}`);
      }
    } catch (err) {
      // Graceful fail in case of browser extensions/blockers
    }
  }
};

/**
 * Tracks a standard Meta Pixel event.
 */
export const trackEvent = (
  eventName: string,
  parameters?: Record<string, unknown>,
  eventId?: string
): void => {
  if (typeof window !== 'undefined' && window.fbq) {
    try {
      if (eventId) {
        window.fbq('track', eventName, parameters, { eventID: eventId });
      } else {
        window.fbq('track', eventName, parameters);
      }
      if (import.meta.env.DEV) {
        console.log(`[Meta Pixel] Event tracked: ${eventName}`, parameters);
      }
    } catch (err) {
      // Graceful fail
    }
  }
};

/**
 * Tracks a custom event in Meta Pixel.
 */
export const trackCustomEvent = (
  eventName: string,
  parameters?: Record<string, unknown>,
  eventId?: string
): void => {
  if (typeof window !== 'undefined' && window.fbq) {
    try {
      if (eventId) {
        window.fbq('trackCustom', eventName, parameters, { eventID: eventId });
      } else {
        window.fbq('trackCustom', eventName, parameters);
      }
      if (import.meta.env.DEV) {
        console.log(`[Meta Pixel] Custom event tracked: ${eventName}`, parameters);
      }
    } catch (err) {
      // Graceful fail
    }
  }
};

// ==========================================
// Pre-configured Standard Conversion Helpers
// ==========================================

/**
 * Track user sign up / account creation
 */
export const trackCompleteRegistration = (params?: {
  method?: string;
  status?: string;
}): void => {
  trackEvent('CompleteRegistration', {
    content_name: 'User Registration',
    status: params?.status || 'success',
    registration_method: params?.method || 'email',
  });
};

/**
 * Track user lead generation (e.g. WhatsApp inquiries, contact requests)
 */
export const trackLead = (params?: {
  content_name?: string;
  value?: number;
  currency?: string;
}): void => {
  trackEvent('Lead', {
    content_name: params?.content_name || 'WhatsApp Inquiry',
    value: params?.value,
    currency: params?.currency || 'KES',
  });
};

/**
 * Track checkout / deposit initiation
 */
export const trackInitiateCheckout = (params?: {
  value?: number;
  currency?: string;
  num_items?: number;
  content_name?: string;
}): void => {
  trackEvent('InitiateCheckout', {
    content_name: params?.content_name || 'Deposit / Checkout',
    value: params?.value,
    currency: params?.currency || 'KES',
    num_items: params?.num_items || 1,
  });
};

/**
 * Track successful order / purchase or deposit completion
 */
export const trackPurchase = (params: {
  value: number;
  currency?: string;
  order_id?: string | number;
  content_name?: string;
  content_type?: string;
}): void => {
  trackEvent(
    'Purchase',
    {
      value: params.value,
      currency: params.currency || 'KES',
      content_name: params.content_name || 'SMM Order',
      content_type: params.content_type || 'product',
      order_id: params.order_id ? String(params.order_id) : undefined,
    },
    params.order_id ? String(params.order_id) : undefined
  );
};

/**
 * Track service views or category browsing
 */
export const trackViewContent = (params?: {
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
}): void => {
  trackEvent('ViewContent', {
    content_name: params?.content_name,
    content_category: params?.content_category,
    value: params?.value,
    currency: params?.currency || 'KES',
  });
};
