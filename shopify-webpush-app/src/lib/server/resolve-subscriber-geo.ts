import { inferRegionFromCityCountry, normalizeRegion } from '@/lib/server/infer-subscriber-region';
import { getRequestGeo } from '@/lib/server/request-geo';

type GeoInput = {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  deviceContext?: Record<string, unknown> | null;
};

export type ResolvedSubscriberGeo = {
  country: string | null;
  city: string | null;
  region: string | null;
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

const pickClientRegion = (body: GeoInput) =>
  normalizeRegion(
    body.region
      ?? (typeof body.deviceContext?.region === 'string' ? body.deviceContext.region : null),
  );

const finalizeGeo = (input: {
  country: string | null;
  city: string | null;
  region: string | null;
}): ResolvedSubscriberGeo => {
  const country = normalizeCountry(input.country);
  const city = normalizeCity(input.city);
  const region =
    normalizeRegion(input.region)
    ?? inferRegionFromCityCountry(city, country);

  return { country, city, region };
};

export const resolveSubscriberGeo = (request: Request, body: GeoInput): ResolvedSubscriberGeo => {
  const requestGeo = getRequestGeo(request);
  const viaProxy = isShopifyAppProxyRequest(request);
  const clientCountry = normalizeCountry(
    body.country
      ?? (typeof body.deviceContext?.country === 'string' ? body.deviceContext.country : null),
  );
  const clientCity = normalizeCity(
    body.city ?? (typeof body.deviceContext?.city === 'string' ? body.deviceContext.city : null),
  );
  const clientRegion = pickClientRegion(body);

  // The storefront resolves the visitor's geo from their own IP (our geo endpoint
  // or a keyless public fallback), so a client-provided country is trustworthy and
  // stays correct even when the token save is relayed through the Shopify app proxy.
  if (clientCountry) {
    return finalizeGeo({
      country: clientCountry,
      city: clientCity,
      region: clientRegion,
    });
  }

  // Direct browser requests to Vercel expose the visitor IP geo headers. Proxy
  // requests carry Shopify's server IP, so we must not trust those headers there.
  if (!viaProxy && requestGeo.country) {
    return finalizeGeo({
      country: normalizeCountry(requestGeo.country),
      city: normalizeCity(requestGeo.city) ?? clientCity,
      region: clientRegion ?? requestGeo.region,
    });
  }

  return finalizeGeo({
    country: null,
    city: clientCity,
    region: clientRegion,
  });
};
