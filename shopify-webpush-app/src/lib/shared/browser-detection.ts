/**
 * Shared user-agent browser detection for storefront token saves and admin APIs.
 * Keep in sync with extensions/push-eagle-widget/assets/push-eagle-storefront.js
 */

export const detectBrowserFromUserAgent = (userAgent: string | null): string => {
  const ua = String(userAgent || '');
  if (!ua) return 'unknown';

  if (/SamsungBrowser\//i.test(ua)) return 'samsung';
  if (/DuckDuckGo\//i.test(ua)) return 'duckduckgo';
  if (/UCBrowser|UCWEB/i.test(ua)) return 'uc';
  if (/MiuiBrowser|Mi Browser/i.test(ua)) return 'mi';
  if (/Phoenix\//i.test(ua)) return 'phoenix';
  if (/BingWeb|BingBrowser/i.test(ua)) return 'bing';
  if (/Brave\//i.test(ua)) return 'brave';
  if (/EdgA?\/|EdgiOS\//i.test(ua)) return 'edge';
  if (/OPR\/|Opera\//i.test(ua)) return 'opera';
  if (/FxiOS\/|Firefox\//i.test(ua)) return 'firefox';
  if (/\bwv\b/i.test(ua) && /Chrome\//i.test(ua)) return 'webview';
  if (/CriOS\/|Chrome\//i.test(ua)) return 'chrome';
  if (/Version\/[\d.]+.+Safari/i.test(ua)) return 'safari';
  return 'unknown';
};

export const detectPlatformFromUserAgent = (userAgent: string | null): string => {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod') || ua.includes('ios')) {
    return 'ios';
  }
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('cros')) return 'chromeos';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
};
