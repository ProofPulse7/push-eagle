const STORAGE_PREFIX = 'pe_pending_settings_v1';

export type PendingSettingsScope = 'privacy' | 'attribution' | 'branding' | 'optIn';

type PendingStore = Partial<Record<PendingSettingsScope, Record<string, unknown>>>;

const storageKey = (shop: string) => `${STORAGE_PREFIX}:${shop}`;

const readStore = (shop: string): PendingStore => {
  if (!shop || typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = sessionStorage.getItem(storageKey(shop));
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as PendingStore;
  } catch {
    return {};
  }
};

const writeStore = (shop: string, store: PendingStore) => {
  if (!shop || typeof window === 'undefined') {
    return;
  }

  const hasValues = Object.keys(store).length > 0;
  if (!hasValues) {
    sessionStorage.removeItem(storageKey(shop));
    return;
  }

  sessionStorage.setItem(storageKey(shop), JSON.stringify(store));
};

export const mergePendingSettings = <T extends Record<string, unknown>>(
  shop: string,
  scope: PendingSettingsScope,
  server: T | null | undefined,
): T => {
  const pending = readStore(shop)[scope];
  if (!pending) {
    return (server ?? {}) as T;
  }
  return { ...(server ?? {}), ...pending } as T;
};

export const writePendingSettings = (
  shop: string,
  scope: PendingSettingsScope,
  patch: Record<string, unknown>,
) => {
  if (!shop) {
    return;
  }

  const store = readStore(shop);
  store[scope] = { ...(store[scope] ?? {}), ...patch };
  writeStore(shop, store);
};

export const clearPendingSettings = (shop: string, scope: PendingSettingsScope) => {
  if (!shop) {
    return;
  }

  const store = readStore(shop);
  delete store[scope];
  writeStore(shop, store);
};

export const hasPendingSettings = (shop: string, scope: PendingSettingsScope) => {
  const pending = readStore(shop)[scope];
  return Boolean(pending && Object.keys(pending).length > 0);
};
