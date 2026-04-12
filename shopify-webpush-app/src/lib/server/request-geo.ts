type RequestGeo = {
  city: string | null;
  country: string | null;
};

const pickHeader = (headers: Headers, keys: string[]): string | null => {
  for (const key of keys) {
    const value = headers.get(key);
    if (value && value.trim()) {
      return value.trim();
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

  return {
    city,
    country,
  };
};
