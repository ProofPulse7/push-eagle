'use client';

import { requestBrowserPushToken } from '@/lib/services/web-push/push-service';
import { isFirebaseClientMessagingConfigured } from '@/lib/integrations/firebase/client';
import {
  readCachedMerchantPreviewToken,
  writeCachedMerchantPreviewToken,
} from '@/lib/client/merchant-preview-token';

type LivePreviewPayload = {
  title: string;
  body: string;
  url?: string | null;
  icon?: string | null;
  image?: string | null;
};

type NotificationOptionsWithImage = NotificationOptions & {
  image?: string;
};

const showLocalPreview = async (payload: LivePreviewPayload) => {
  const registration = await navigator.serviceWorker.getRegistration();
  const options: NotificationOptionsWithImage = {
    body: payload.body,
    icon: payload.icon ?? undefined,
    image: payload.image ?? undefined,
    data: {
      url: payload.url ?? undefined,
    },
  };

  if (registration) {
    await registration.showNotification(payload.title, options);
    return;
  }

  new Notification(payload.title, options);
};

const sendPreviewToToken = async (token: string, payload: LivePreviewPayload) => {
  const response = await fetch('/api/notifications/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, payload }),
  });

  const result = await response.json();
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error ?? 'Failed to send live preview notification.');
  }
};

const resolveMerchantPreviewToken = async (shopDomain?: string) => {
  if (Notification.permission === 'granted' && shopDomain) {
    const cached = readCachedMerchantPreviewToken(shopDomain);
    if (cached) {
      return cached;
    }
  }

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied. Allow notifications to see a live preview.');
    }
  }

  const token = await requestBrowserPushToken();
  if (!token) {
    throw new Error('Could not get a push token for this browser.');
  }

  if (shopDomain) {
    writeCachedMerchantPreviewToken(shopDomain, token);
  }

  return token;
};

export async function handleSendLivePreview(payload: LivePreviewPayload, shopDomain?: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported by this browser.');
  }

  if (!isFirebaseClientMessagingConfigured()) {
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied. Allow notifications to see a live preview.');
      }
    }

    await showLocalPreview(payload);
    return;
  }

  try {
    const cachedToken =
      shopDomain && Notification.permission === 'granted'
        ? readCachedMerchantPreviewToken(shopDomain)
        : null;

    if (cachedToken) {
      try {
        await sendPreviewToToken(cachedToken, payload);
        return;
      } catch {
        // Cached token may have expired — fetch a fresh one below.
      }
    }

    const token = await resolveMerchantPreviewToken(shopDomain);
    await sendPreviewToToken(token, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('missing-app-config-values') ||
      message.includes('projectId') ||
      message.includes('Could not get a push token')
    ) {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error('Notification permission denied. Allow notifications to see a live preview.');
        }
      }

      await showLocalPreview(payload);
      return;
    }

    throw error;
  }
}
