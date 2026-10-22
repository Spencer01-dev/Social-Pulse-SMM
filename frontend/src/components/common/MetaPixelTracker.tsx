import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { initMetaPixel, trackPageView, META_PIXEL_ID } from '../../utils/metaPixel';
import { initGoogleTag, GOOGLE_TAG_ID } from '../../utils/googleTag';
import { useTenant } from '../../context/TenantContext';

/**
 * MetaPixelTracker & Google Tag (AnalyticsTracker) component
 * Listens to React Router location changes and tenant context to automatically
 * initialize tracking scripts and send PageView events for audience remarketing.
 */
export const MetaPixelTracker: React.FC = () => {
  const location = useLocation();
  const { tenant } = useTenant();
  const activeTagsRef = useRef<Set<string>>(new Set());

  // Initialize pixels & tags based on tenant/child panel configuration
  useEffect(() => {
    // 1. Google Tag / Google Ads Remarketing
    // If child panel has configured its own Google Tag ID:
    if (tenant?.google_tag_id) {
      const childGoogleId = tenant.google_tag_id.trim();
      if (!activeTagsRef.current.has(childGoogleId)) {
        initGoogleTag(childGoogleId);
        activeTagsRef.current.add(childGoogleId);
      }
    }
    // Main platform Google Tag ID (from VITE_GOOGLE_TAG_ID):
    if (GOOGLE_TAG_ID && !activeTagsRef.current.has(GOOGLE_TAG_ID)) {
      initGoogleTag(GOOGLE_TAG_ID);
      activeTagsRef.current.add(GOOGLE_TAG_ID);
    }

    // 2. Meta (Facebook) Pixel
    // If child panel has configured its own Meta Pixel ID:
    if (tenant?.meta_pixel_id) {
      const childMetaId = tenant.meta_pixel_id.trim();
      if (!activeTagsRef.current.has(childMetaId)) {
        initMetaPixel(childMetaId);
        activeTagsRef.current.add(childMetaId);
      }
    } else if (META_PIXEL_ID && !activeTagsRef.current.has(META_PIXEL_ID)) {
      initMetaPixel(META_PIXEL_ID);
      activeTagsRef.current.add(META_PIXEL_ID);
    }
  }, [tenant]);

  // Track PageView on route navigation across both Meta Pixel & Google Ads Remarketing
  useEffect(() => {
    trackPageView(
      location.pathname + location.search,
      tenant?.site_name ? `${tenant.site_name} | Premium SMM Panel` : document.title
    );
  }, [location.pathname, location.search, tenant]);

  return null;
};
