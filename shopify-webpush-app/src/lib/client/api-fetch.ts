export class ApiError extends Error {
  status: number;
  reauthorizeUrl?: string;

  constructor(message: string, status: number, reauthorizeUrl?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reauthorizeUrl = reauthorizeUrl;
  }
}

export type ApiEnvelope<T> = { ok: true } & T;

export async function fetchJson<T extends Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  let payload: Record<string, unknown> | null = null;

  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.ok === false) {
    const message =
      (typeof payload?.error === 'string' && payload.error) ||
      `Request failed (${response.status})`;
    const reauthorizeUrl =
      typeof payload?.reauthorizeUrl === 'string' ? payload.reauthorizeUrl : undefined;
    throw new ApiError(message, response.status, reauthorizeUrl);
  }

  return payload as T;
}

export async function fetchJsonWithShop<T extends Record<string, unknown>>(
  path: string,
  shopDomain: string,
  init?: RequestInit,
): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  return fetchJson<T>(`${path}${separator}shop=${encodeURIComponent(shopDomain)}`, {
    credentials: 'include',
    ...init,
  });
}
