type RequestGeo = {
  city: string | null;
  country: string | null;
  region: string | null;
};

const decodeHeaderValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
};

const pickHeader = (headers: Headers, keys: string[]): string | null => {
  for (const key of keys) {
    const value = headers.get(key);
    if (value && value.trim()) {
      return decodeHeaderValue(value);
    }
  }
  return null;
};

export const getRequestGeo = (request: Request): RequestGeo => {
  const city = pickHeader(request.headers, [
    'x-vercel-ip-city',
    'cf-ipcity',
    'x-appengine-city',
  ]);

  const country = pickHeader(request.headers, [
    'x-vercel-ip-country',
    'cf-ipcountry',
    'x-country-code',
    'x-appengine-country',
  ]);

  const region = pickHeader(request.headers, [
    'x-vercel-ip-country-region',
    'cf-region',
    'x-appengine-region',
  ]);

  return {
    city,
    country,
    region,
  };
};
