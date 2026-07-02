import { verifyShopifyAppProxySignature } from '@/lib/integrations/shopify/verify';
import { parseShopDomain } from '@/lib/server/shop-context';
import { getMerchantStorefrontHosts } from '@/lib/server/storefront-merchant-hosts-cache';

const normalizeOrigin = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
};

const normalizeHost = (value: string | null) => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return new URL(trimmed).hostname.toLowerCase();
    }
  } catch {
    return null;
  }

  return trimmed.replace(/\/+$/, '').split('/')[0] ?? null;
};

export const isTrustedStorefrontOrigin = async (shopDomainInput: string, origin: string | null) => {
  const shopDomain = parseShopDomain(shopDomainInput);
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  const originHost = normalizeHost(normalizedOrigin);
  if (!originHost) {
    return false;
  }

  const allowedHosts = await getMerchantStorefrontHosts(shopDomain);
  return allowedHosts.has(originHost);
};

export const verifyStorefrontRequest = async (
  request: Request,
  shopDomainInput: string,
  options?: { requireShopParamMatch?: boolean },
) => {
  const shopDomain = parseShopDomain(shopDomainInput);
  const url = new URL(request.url);
  const hasProxySignature = url.searchParams.has('signature');

  if (hasProxySignature) {
    if (!verifyShopifyAppProxySignature(url.searchParams)) {
      return { ok: false as const, reason: 'invalid_proxy_signature' };
    }

    if (options?.requireShopParamMatch !== false && url.searchParams.has('shop')) {
      const proxiedShop = parseShopDomain(url.searchParams.get('shop'));
      if (proxiedShop !== shopDomain) {
        return { ok: false as const, reason: 'shop_mismatch' };
      }
    }

    return { ok: true as const, via: 'proxy' as const };
  }

  const origin = request.headers.get('origin');
  if (await isTrustedStorefrontOrigin(shopDomain, origin)) {
    return { ok: true as const, via: 'origin' as const };
  }

  return { ok: false as const, reason: 'untrusted_origin' };
};

export const verifyStorefrontBootstrapRequest = async (request: Request, shopDomainInput: string) => {
  const shopDomain = parseShopDomain(shopDomainInput);
  const url = new URL(request.url);

  if (url.searchParams.has('signature')) {
    if (!verifyShopifyAppProxySignature(url.searchParams)) {
      return { ok: false as const, reason: 'invalid_proxy_signature' };
    }

    if (url.searchParams.has('shop')) {
      const proxiedShop = parseShopDomain(url.searchParams.get('shop'));
      if (proxiedShop !== shopDomain) {
        return { ok: false as const, reason: 'shop_mismatch' };
      }
    }

    return { ok: true as const, via: 'proxy' as const };
  }

  const origin = request.headers.get('origin');
  if (await isTrustedStorefrontOrigin(shopDomain, origin)) {
    return { ok: true as const, via: 'origin' as const };
  }

  return { ok: false as const, reason: 'untrusted_origin' };
};
