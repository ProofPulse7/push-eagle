import { env } from '@/lib/config/env';

export const buildBillingReturnUrl = (
  shopDomain: string,
  options?: { host?: string | null; embedded?: string | null },
) => {
  const returnUrl = new URL('/plans', env.NEXT_PUBLIC_APP_URL);
  returnUrl.searchParams.set('shop', shopDomain);
  returnUrl.searchParams.set('billing', 'return');

  if (options?.host) {
    returnUrl.searchParams.set('host', options.host);
  }
  if (options?.embedded) {
    returnUrl.searchParams.set('embedded', options.embedded);
  }

  return returnUrl.toString();
};
