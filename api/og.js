export const config = {
  runtime: 'edge',
};

const MAIN_DOMAINS = [
  'socialpulse.io',
  'www.socialpulse.io',
  'socialpulsesmm.com',
  'www.socialpulsesmm.com',
  'social-pulse-smm.vercel.app',
  'social-pulse-smm.onrender.com',
  'social-pulse-smm-0geu.onrender.com',
  'localhost',
  '127.0.0.1',
];

export default async function handler(request) {
  const url = new URL(request.url);
  const host = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    url.host ||
    ''
  )
    .toLowerCase()
    .trim();

  const cleanHost = host.replace(/^www\./, '').split(':')[0];
  const isMain =
    MAIN_DOMAINS.includes(cleanHost) ||
    MAIN_DOMAINS.includes(host) ||
    MAIN_DOMAINS.some((d) => cleanHost.endsWith(`.${d}`));

  let siteName = 'SocialPulse';
  let tagline = 'Wholesale Social Media Marketing Platform';
  let description =
    'Wholesale Social Media Marketing Reseller and Child Panel SaaS Platform.';
  let imageUrl = 'https://www.socialpulsesmm.com/socialpulse-logo.png';
  let canonicalUrl = `https://${host}${url.pathname === '/' ? '' : url.pathname}`;

  if (!isMain) {
    if (cleanHost.includes('skakegains') || cleanHost.includes('shakegains')) {
      siteName = 'Skakegains SMM';
      tagline = 'More Followers • More Likes';
      description =
        'Order at our new website skakegains.com for cheapest and fastest services. Boost followers, likes, views, and engagement instantly.';
      imageUrl = `https://${host}/skakegains-logo.png`;
    } else {
      const brand = cleanHost.split('.')[0];
      siteName = brand.charAt(0).toUpperCase() + brand.slice(1) + ' SMM';
      tagline = 'Premium Social Media Growth Panel';
      description = `Order at ${cleanHost} for cheapest and fastest social media growth services.`;
      imageUrl = `https://${host}/skakegains-logo.png`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(
          `https://social-pulse-smm-0geu.onrender.com/api/v1/tenant/resolve?domain=${encodeURIComponent(
            cleanHost
          )}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (res.ok) {
          const tenant = await res.json();
          if (tenant && tenant.is_custom_tenant) {
            if (tenant.site_name) siteName = tenant.site_name;
            if (tenant.tagline) tagline = tenant.tagline;
            description = `${tenant.site_name} - ${tenant.tagline || 'Premium SMM Panel'}. Cheapest and fastest social media growth services.`;
            if (tenant.logo_url) {
              imageUrl = tenant.logo_url.startsWith('http')
                ? tenant.logo_url
                : `https://${host}${tenant.logo_url.startsWith('/') ? '' : '/'}${tenant.logo_url}`;
            }
          }
        }
      } catch {
        // Fallback already assigned
      }
    }
  } else {
    siteName = 'SocialPulse';
    tagline = 'Wholesale Social Media Marketing Platform';
    description =
      'Wholesale Social Media Marketing Reseller and Child Panel SaaS Platform.';
    imageUrl = 'https://www.socialpulsesmm.com/socialpulse-logo.png';
  }

  // Ensure absolute image URL
  if (imageUrl.startsWith('/')) {
    imageUrl = `https://${host}${imageUrl}`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${siteName} | ${tagline}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${description}">

  <!-- Open Graph / Facebook / Messenger / WhatsApp -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${siteName}">
  <meta property="og:title" content="${siteName} - ${tagline}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:secure_url" content="${imageUrl}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:alt" content="${siteName}">
  <meta property="og:url" content="${canonicalUrl}">

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${siteName} - ${tagline}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">

  <link rel="canonical" href="${canonicalUrl}">
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}">
</head>
<body style="background:#0b0f19;color:#f8fafc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;padding:20px;">
    <h2>${siteName}</h2>
    <p>${description}</p>
    <p><a href="${canonicalUrl}" style="color:#10b981;text-decoration:none;font-weight:bold;">Click here to continue to ${siteName}</a></p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
