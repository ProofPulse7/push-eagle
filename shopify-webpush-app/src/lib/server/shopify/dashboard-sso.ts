import { createHmac } from 'crypto';

import { env } from '@/lib/config/env';

type DashboardSsoOptions = {
  host?: string | null;
  embedded?: string | null;
};

export const buildDashboardSsoRedirectUrl = (
  requestOrigin: string,
  shopDomain: string,
  redirectPath = '/dashboard',
  options?: DashboardSsoOptions,
) => {
  const shop = shopDomain.trim().toLowerCase();
  const safeRedirect = redirectPath.startsWith('/') ? redirectPath : '/dashboard';

  const ssoUrl = new URL('/api/integrations/shopify/sso', requestOrigin);
  ssoUrl.searchParams.set('shop', shop);
  ssoUrl.searchParams.set('redirect', safeRedirect);

  if (options?.host) {
    ssoUrl.searchParams.set('host', options.host);
  }
  if (options?.embedded) {
    ssoUrl.searchParams.set('embedded', options.embedded);
  }

  const secret = env.SHOPIFY_DASHBOARD_SSO_SECRET?.trim() || env.SHOPIFY_API_SECRET?.trim() || '';
  if (secret) {
    const ts = String(Date.now());
    const sig = createHmac('sha256', secret).update(`${shop}.${ts}`).digest('hex');
    ssoUrl.searchParams.set('ts', ts);
    ssoUrl.searchParams.set('sig', sig);
  }

  return ssoUrl.toString();
};
