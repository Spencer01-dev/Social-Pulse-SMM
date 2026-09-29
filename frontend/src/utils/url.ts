import { PlatformType } from '../types';

/**
 * Resolves an order's target link into an absolute external URL.
 * Prevents relative URL navigation inside the SPA (which causes redirection to Dashboard / Create Order).
 *
 * Handles:
 * - Full URLs: https://www.tiktok.com/@user, http://...
 * - Protocol-relative URLs: //tiktok.com/...
 * - Domains without scheme: tiktok.com/@user, instagram.com/..., youtu.be/...
 * - Usernames / handles: itsshengs1, @itsshengs1 (based on platform / service name)
 */
export function formatExternalUrl(
  link?: string | null,
  platform?: PlatformType | string | null,
  serviceName?: string | null
): string {
  if (!link || typeof link !== 'string') return '#';
  const trimmed = link.trim();
  if (!trimmed) return '#';

  // 1. If it already starts with http:// or https://
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // 2. Protocol-relative URL
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  // 3. Known social media domain or generic domain without protocol
  // e.g. "tiktok.com/@user", "www.tiktok.com/@user", "instagram.com/p/123", "youtu.be/abc"
  if (
    /^(www\.|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|fb\.me|youtube\.com|youtu\.be|x\.com|twitter\.com|t\.me|wa\.me|spotify\.com|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$)/i.test(
      trimmed
    )
  ) {
    return `https://${trimmed.replace(/^\/+/, '')}`;
  }

  // 4. Handle usernames / handles (e.g. "itsshengs1", "@itsshengs1")
  const cleanHandle = trimmed.replace(/^@+/, '');

  // Detect platform
  const lowerPlat = (platform || '').toLowerCase();
  const lowerService = (serviceName || '').toLowerCase();

  const isTikTok =
    lowerPlat === 'tiktok' ||
    lowerService.includes('tiktok') ||
    lowerService.includes('tik tok');

  const isInstagram =
    lowerPlat === 'instagram' ||
    lowerService.includes('instagram') ||
    lowerService.includes('ig ') ||
    lowerService.includes('ig:');

  const isTwitter =
    lowerPlat === 'twitter' ||
    lowerService.includes('twitter') ||
    lowerService.includes('x.com');

  const isFacebook =
    lowerPlat === 'facebook' ||
    lowerService.includes('facebook') ||
    lowerService.includes('fb ') ||
    lowerService.includes('fb:');

  const isYouTube =
    lowerPlat === 'youtube' ||
    lowerService.includes('youtube') ||
    lowerService.includes('yt ');

  const isTelegram =
    lowerPlat === 'telegram' ||
    lowerService.includes('telegram') ||
    lowerService.includes('tg ');

  const isWhatsApp =
    lowerPlat === 'whatsapp' ||
    lowerService.includes('whatsapp');

  if (isTikTok) {
    return `https://www.tiktok.com/@${cleanHandle}`;
  }
  if (isInstagram) {
    return `https://www.instagram.com/${cleanHandle}`;
  }
  if (isTwitter) {
    return `https://x.com/${cleanHandle}`;
  }
  if (isYouTube) {
    return `https://www.youtube.com/@${cleanHandle}`;
  }
  if (isFacebook) {
    return `https://www.facebook.com/${cleanHandle}`;
  }
  if (isTelegram) {
    return `https://t.me/${cleanHandle}`;
  }
  if (isWhatsApp) {
    const digitsOnly = cleanHandle.replace(/\D/g, '');
    return digitsOnly ? `https://wa.me/${digitsOnly}` : `https://wa.me/${cleanHandle}`;
  }

  // If link contains a dot, assume it's an external domain
  if (trimmed.includes('.')) {
    return `https://${trimmed}`;
  }

  // Default fallback when username is provided for common platforms
  return `https://www.tiktok.com/@${cleanHandle}`;
}
