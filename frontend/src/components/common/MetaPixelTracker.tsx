import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { initMetaPixel, trackPageView } from '../../utils/metaPixel';

/**
 * MetaPixelTracker component
 * Listens to React Router location changes and automatically sends PageView events to Meta Pixel.
 */
export const MetaPixelTracker: React.FC = () => {
  const location = useLocation();
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!isInitialized.current) {
      initMetaPixel();
      isInitialized.current = true;
    }
    // Track PageView on route navigation
    trackPageView();
  }, [location.pathname, location.search]);

  return null;
};
