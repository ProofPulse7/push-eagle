import { getRequestGeo } from '@/lib/server/request-geo';

type GeoInput = {
  country?: string | null;
  city?: string | null;
  deviceContext?: Record<string, unknown> | null;
};

export const isShopifyAppProxyRequest = (request: Request) => {
  const url = new URL(request.url);
  return url.searchParams.has('signature');
};

const normalizeCountry = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (/^[a-z]{2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed;
};

const normalizeCity = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

export const resolveSubscriberGeo = (request: Request, body: GeoInput) => {
  const requestGeo = getRequestGeo(request);
  const viaProxy = isShopifyAppProxyRequest(request);
  const clientCountry = normalizeCountry(
    body.country
      ?? (typeof body.deviceContext?.country === 'string' ? body.deviceContext.country : null),
  );
  const clientCity = normalizeCity(
    body.city ?? (typeof body.deviceContext?.city === 'string' ? body.deviceContext.city : null),
  );

  // Direct browser requests to Vercel include the visitor IP geo headers.
  if (!viaProxy && requestGeo.country) {
    return {
      country: normalizeCountry(requestGeo.country),
      city: normalizeCity(requestGeo.city) ?? clientCity,
    };
  }

  // App proxy requests come from Shopify servers — use geo fetched client-side from our geo API.
  if (clientCountry) {
    return {
      country: clientCountry,
      city: clientCity,
    };
  }

  return {
    country: normalizeCountry(requestGeo.country),
    city: normalizeCity(requestGeo.city),
  };
};
