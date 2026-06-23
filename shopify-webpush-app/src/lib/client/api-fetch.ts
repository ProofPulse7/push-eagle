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

const DEFAULT_FETCH_TIMEOUT_MS = 45_000;

const fetchWithTimeout = async (url: string, init?: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId =
    typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      credentials: 'include',
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Request timed out.', 0);
    }

    throw error;
  } finally {
    if (typeof window !== 'undefined') {
      window.clearTimeout(timeoutId);
    } else {
      clearTimeout(timeoutId);
    }
  }
};

export async function fetchJson<T extends Record<string, unknown>>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithTimeout(url, init);
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
