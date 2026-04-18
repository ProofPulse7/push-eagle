/**
 * VAPID Web Push helper for cross-browser notification delivery.
 *
 * Used for browsers that do NOT support Firebase Cloud Messaging tokens:
 *   - Firefox (uses Mozilla Push Service)
 *   - Safari 16.4+ on macOS / iOS 16.4+ (uses Apple Push Notification Service)
 *
 * FCM is used for: Chrome, Edge, Opera, Samsung Internet.
 *
 * Environment variables required:
 *   VAPID_PUBLIC_KEY   - base64url encoded ECDH P-256 public key
 *   VAPID_PRIVATE_KEY  - base64url encoded ECDH P-256 private key
 *   VAPID_SUBJECT      - mailto: or https: contact URL
 *
 * Generate keys once:
 *   node -e "const wp=require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys()))"
 */

import webpush from 'web-push';

import { env } from '@/lib/config/env';

type VapidSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type PushPayload = {
  title: string;
  body: string;
  icon?: string | null;
  image?: string | null;
  badge?: string | null;
  url?: string | null;
};

let vapidConfigured = false;

const configureVapid = () => {
  if (vapidConfigured) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    throw new Error(
      'VAPID keys are not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.',
    );
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || 'mailto:support@push-eagle.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  vapidConfigured = true;
};

/**
 * Send a push notification via the Web Push Protocol (VAPID).
 * Returns a unique delivery ID (generated from endpoint hash).
 */
export const sendVapidPushNotification = async (
  subscription: VapidSubscription,
  payload: PushPayload,
): Promise<string> => {
  configureVapid();

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icon-192.png',
    image: payload.image ?? undefined,
    badge: payload.badge ?? '/badge-72.png',
    url: payload.url ?? '/',
    // Data field mirrors what firebase-messaging-sw.js expects
    data: { url: payload.url ?? '/' },
  });

  await webpush.sendNotification(subscription, notificationPayload, {
    TTL: 86400, // 24 hours
    urgency: 'normal',
  });

  // Return a synthetic message ID based on endpoint (no real ID from Web Push)
  const { createHash } = await import('crypto');
  return `vapid:${createHash('sha1').update(subscription.endpoint).digest('hex').slice(0, 16)}`;
};

/**
 * Is VAPID configured? Returns false if env vars are missing.
 */
export const isVapidConfigured = () => {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
};
