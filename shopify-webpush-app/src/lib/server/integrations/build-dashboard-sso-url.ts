import { createHmac } from 'crypto';

import { env } from '@/lib/config/env';

export const buildDashboardSsoUrl = (
  shopDomain: string,
  redirectPath = '/dashboard',
  options?: { host?: string | null; embedded?: string | null },
) => {
  const ssoUrl = new URL('/api/integrations/shopify/sso', env.NEXT_PUBLIC_APP_URL);
  ssoUrl.searchParams.set('shop', shopDomain);
  ssoUrl.searchParams.set('redirect', redirectPath.startsWith('/') ? redirectPath : '/dashboard');

  if (options?.host) {
    ssoUrl.searchParams.set('host', options.host);
  }
  if (options?.embedded || options?.host) {
    ssoUrl.searchParams.set('embedded', options?.embedded || '1');
  }

  const secret = env.SHOPIFY_DASHBOARD_SSO_SECRET || env.SHOPIFY_API_SECRET;
  if (secret) {
    const ts = String(Date.now());
    const sig = createHmac('sha256', secret).update(`${shopDomain}.${ts}`).digest('hex');
    ssoUrl.searchParams.set('ts', ts);
    ssoUrl.searchParams.set('sig', sig);
  }

  return ssoUrl.toString();
};
