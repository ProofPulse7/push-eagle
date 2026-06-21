'use client';

import {
  getBrowserPushTokenIfGranted,
  requestBrowserPushToken,
} from '@/lib/services/web-push/push-service';
import { isFirebaseClientMessagingConfigured } from '@/lib/integrations/firebase/client';
import { readMerchantPushToken, writeMerchantPushToken } from '@/lib/client/merchant-push-token';

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

const sendPreviewWithToken = async (token: string, payload: LivePreviewPayload) => {
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

export async function handleSendLivePreview(payload: LivePreviewPayload, shopDomain?: string) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported by this browser.');
  }

  const shop = shopDomain?.trim() ?? '';
  const cachedToken = shop ? readMerchantPushToken(shop) : null;

  if (cachedToken) {
    try {
      await sendPreviewWithToken(cachedToken, payload);
      return;
    } catch {
      // Fall through to refresh token.
    }
  }

  if (Notification.permission === 'granted') {
    const existingToken = await getBrowserPushTokenIfGranted();
    if (existingToken) {
      if (shop) {
        writeMerchantPushToken(shop, existingToken);
      }
      try {
        await sendPreviewWithToken(existingToken, payload);
        return;
      } catch {
        // Fall through to local preview when Firebase is unavailable.
      }
    }
  }

  if (!isFirebaseClientMessagingConfigured()) {
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Allow notifications in your browser to see live previews.');
    }
    await showLocalPreview(payload);
    return;
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error('Allow notifications in your browser to see live previews.');
  }

  try {
    const token = await requestBrowserPushToken();
    if (!token) {
      throw new Error('Could not register this device for push previews.');
    }

    if (shop) {
      writeMerchantPushToken(shop, token);
    }

    await sendPreviewWithToken(token, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('missing-app-config-values') ||
      message.includes('projectId') ||
      message.includes('Token unavailable')
    ) {
      await showLocalPreview(payload);
      return;
    }

    throw error;
  }
}
