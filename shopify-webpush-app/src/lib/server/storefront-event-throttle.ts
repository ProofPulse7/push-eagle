import { createHash } from 'crypto';

import {
  isCloudflareKvEnabled,
  readKvJson,
  writeKvJson,
} from '@/lib/server/cache/cloudflare-kv';

const throttleKey = (shopDomain: string, bucket: string) =>
  `pe:evt:${shopDomain}:${bucket}`;

type ThrottleState = { until: number };

/**
 * Returns true when the event should be skipped (recent duplicate).
 * Uses KV when configured; otherwise allows the event through.
 */
export const shouldThrottleStorefrontEvent = async (input: {
  shopDomain: string;
  externalId: string;
  eventType: string;
  productId?: string | null;
  cartToken?: string | null;
  pageUrl?: string | null;
  windowSeconds: number;
}) => {
  // Never throttle add_to_cart — each cart add must enqueue/refresh reminders.
  if (input.eventType === 'add_to_cart') {
    return false;
  }

  const windowMs = Math.max(5, input.windowSeconds) * 1000;
  const fingerprint = createHash('sha256')
    .update(
      [
        input.shopDomain,
        input.externalId,
        input.eventType,
        input.productId ?? '',
        input.cartToken ?? '',
        input.pageUrl ?? '',
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 24);

  if (!isCloudflareKvEnabled()) {
    return false;
  }

  const key = throttleKey(input.shopDomain, `${input.eventType}:${fingerprint}`);
  const now = Date.now();

  try {
    const existing = await readKvJson<ThrottleState>(key);
    if (existing?.until && existing.until > now) {
      return true;
    }

    void writeKvJson(key, { until: now + windowMs }, Math.ceil(windowMs / 1000) + 30).catch(
      () => undefined,
    );
  } catch {
    return false;
  }

  return false;
};

/** page_view has no automation triggers — skip activity API entirely. */
export const isLowValueStorefrontActivityEvent = (eventType: string) => eventType === 'page_view';
