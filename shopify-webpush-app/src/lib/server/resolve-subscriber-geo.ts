import {
  enrichSubscriberGeo,
  extractCountryFromLocale,
  normalizeCity,
  normalizeRegion,
  resolveCountryDisplayName,
} from '@/lib/server/geo/subscriber-geo';
import { getRequestGeo } from '@/lib/server/request-geo';

type GeoInput = {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  locale?: string | null;
  deviceContext?: Record<string, unknown> | null;
};

export const isShopifyAppProxyRequest = (request: Request) => {
  const url = new URL(request.url);
  return url.searchParams.has('signature');
};

export const resolveSubscriberGeo = (request: Request, body: GeoInput) => {
  const requestGeo = getRequestGeo(request);
  const viaProxy = isShopifyAppProxyRequest(request);
  const deviceContext = body.deviceContext ?? null;

  const clientCountry = resolveCountryDisplayName(
    body.country
      ?? (typeof deviceContext?.country === 'string' ? deviceContext.country : null),
  );
  const clientCity = normalizeCity(
    body.city ?? (typeof deviceContext?.city === 'string' ? deviceContext.city : null),
  );
  const clientRegion = normalizeRegion(
    body.region ?? (typeof deviceContext?.region === 'string' ? deviceContext.region : null),
  );
  const timezone =
    typeof deviceContext?.timezone === 'string' ? deviceContext.timezone : null;
  const locale =
    body.locale
    ?? (typeof deviceContext?.language === 'string' ? deviceContext.language : null)
    ?? (typeof deviceContext?.shopifyLocale === 'string' ? deviceContext.shopifyLocale : null);

  // The storefront resolves the visitor's geo from their own IP (our geo endpoint
  // or a keyless public fallback), so a client-provided country is trustworthy and
  // stays correct even when the token save is relayed through the Shopify app proxy.
  if (clientCountry || clientCity || clientRegion) {
    return enrichSubscriberGeo({
      country: clientCountry ?? extractCountryFromLocale(locale),
      city: clientCity,
      region: clientRegion,
      timezone,
      locale,
    });
  }

  // Direct browser requests to Vercel expose the visitor IP geo headers. Proxy
  // requests carry Shopify's server IP, so we must not trust those headers there.
  if (!viaProxy && (requestGeo.country || requestGeo.city || requestGeo.region)) {
    return enrichSubscriberGeo({
      country: requestGeo.country,
      city: requestGeo.city ?? clientCity,
      region: requestGeo.region ?? clientRegion,
      timezone,
      locale,
    });
  }

  return enrichSubscriberGeo({
    country: extractCountryFromLocale(locale),
    city: clientCity,
    region: clientRegion,
    timezone,
    locale,
  });
};
