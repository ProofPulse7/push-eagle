'use client';

import { ApiError, fetchJson, type ApiEnvelope } from '@/lib/client/api-fetch';

/** Debounce before flushing optimistic background saves (ms). */
export const BACKGROUND_SAVE_DEBOUNCE_MS = 120;

/** Max attempts for background API saves (initial try + retries). */
export const BACKGROUND_SAVE_MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.status === 0 || error.status === 429 || error.status >= 500;
  }

  return true;
};

export async function runWithBackgroundRetries<T>(
  operation: () => Promise<T>,
  maxAttempts = BACKGROUND_SAVE_MAX_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt >= maxAttempts) {
        break;
      }

      await sleep(120 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Background save failed.');
}

export async function fetchJsonWithRetry<T extends Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  maxAttempts = BACKGROUND_SAVE_MAX_ATTEMPTS,
): Promise<T> {
  return runWithBackgroundRetries(() => fetchJson<T>(url, init), maxAttempts);
}

export async function fetchJsonWithShopRetry<T extends ApiEnvelope<Record<string, unknown>>>(
  path: string,
  shopDomain: string,
  init?: RequestInit,
  maxAttempts = BACKGROUND_SAVE_MAX_ATTEMPTS,
): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  return fetchJsonWithRetry<T>(
    `${path}${separator}shop=${encodeURIComponent(shopDomain)}`,
    init,
    maxAttempts,
  );
}
