import { cookies } from 'next/headers';

import { normalizeShopDomain } from '@/lib/server/shop-context';

const pickParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const persistShopCookie = async (shopDomain: string) => {
  const cookieStore = await cookies();
  cookieStore.set('pe_shop', shopDomain, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    secure: true,
    sameSite: 'lax',
  });
};

export const resolveShopDomain = async (
  searchParams: Record<string, string | string[] | undefined>,
) => {
  const queryShop = pickParam(searchParams.shop);
  if (queryShop) {
    try {
      return normalizeShopDomain(queryShop);
    } catch {
      return null;
    }
  }

  const cookieStore = await cookies();
  const cookieShop = cookieStore.get('pe_shop')?.value;
  if (!cookieShop) {
    return null;
  }

  try {
    return normalizeShopDomain(cookieShop);
  } catch {
    return null;
  }
};
