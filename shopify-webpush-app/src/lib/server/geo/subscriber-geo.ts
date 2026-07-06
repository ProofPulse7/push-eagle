const countryDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export const resolveCountryDisplayName = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (/^[a-z]{2}$/i.test(trimmed) && countryDisplayNames) {
    return countryDisplayNames.of(trimmed.toUpperCase()) ?? trimmed.toUpperCase();
  }

  return trimmed;
};

export const normalizeCountryKey = (value: string | null | undefined) => {
  const displayName = resolveCountryDisplayName(value);
  return displayName ? displayName.toLowerCase() : '';
};

export const deriveCityFromTimezone = (timezone: string | null | undefined) => {
  const zone = String(timezone ?? '').trim();
  if (!zone || !zone.includes('/')) {
    return null;
  }

  const parts = zone.split('/');
  const cityPart = parts[parts.length - 1] || '';
  if (!cityPart) {
    return null;
  }

  return cityPart.replace(/_/g, ' ');
};

export const extractCountryFromLocale = (locale: string | null | undefined) => {
  const value = String(locale ?? '').trim();
  if (!value) {
    return null;
  }

  const normalized = value.replace('_', '-');
  const parts = normalized.split('-');
  for (let index = 1; index < parts.length; index += 1) {
    const part = parts[index];
    if (/^[A-Za-z]{2}$/.test(part)) {
      return resolveCountryDisplayName(part.toUpperCase());
    }
  }

  return null;
};

export const normalizeCity = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

export const normalizeRegion = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
};

type EnrichSubscriberGeoInput = {
  country?: string | null;
  city?: string | null;
  region?: string | null;
  timezone?: string | null;
  locale?: string | null;
};

export const enrichSubscriberGeo = (input: EnrichSubscriberGeoInput) => {
  const country =
    resolveCountryDisplayName(input.country)
    ?? extractCountryFromLocale(input.locale);
  const city = normalizeCity(input.city) ?? deriveCityFromTimezone(input.timezone);
  const region = normalizeRegion(input.region);

  return {
    country,
    city,
    region,
  };
};

export const formatSubscriberLocation = (input: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}) => {
  const city = normalizeCity(input.city);
  const region = normalizeRegion(input.region);
  const country = resolveCountryDisplayName(input.country);

  const parts = [city, region, country].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(', ') : 'Unknown';
};

export const uniqueCountryDisplayNames = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const displayName = resolveCountryDisplayName(value);
    if (!displayName) {
      continue;
    }
    const key = normalizeCountryKey(displayName);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(displayName);
  }

  return result.sort((left, right) => left.localeCompare(right));
};
