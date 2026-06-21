'use client';

import { requestBrowserPushToken } from '@/lib/services/web-push/push-service';
import { isFirebaseClientMessagingConfigured } from '@/lib/integrations/firebase/client';

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

const MERCHANT_PREVIEW_TOKEN_KEY = 'pe:merchant-preview-token';

const readCachedMerchantPreviewToken = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        return sessionStorage.getItem(MERCHANT_PREVIEW_TOKEN_KEY);
    } catch {
        return null;
    }
};

const cacheMerchantPreviewToken = (token: string) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        sessionStorage.setItem(MERCHANT_PREVIEW_TOKEN_KEY, token);
    } catch {
        // Ignore storage quota errors.
    }
};

const toRemotePreviewUrl = (value?: string | null) => {
    const raw = String(value ?? '').trim();
    if (!raw) {
        return undefined;
    }

    return raw.startsWith('https://') || raw.startsWith('http://') ? raw : undefined;
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

const sendRemotePreview = async (token: string, payload: LivePreviewPayload) => {
    const response = await fetch('/api/notifications/preview', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            token,
            payload: {
                title: payload.title,
                body: payload.body,
                url: payload.url ?? undefined,
                icon: toRemotePreviewUrl(payload.icon),
                image: toRemotePreviewUrl(payload.image),
            },
        }),
    });

    const result = await response.json();
    if (!response.ok || !result?.ok) {
        throw new Error(result?.error ?? 'Failed to send live preview notification.');
    }
};

export async function handleSendLivePreview(payload: LivePreviewPayload) {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error("Push notifications are not supported by this browser.");
    }

    if (Notification.permission === 'denied') {
        throw new Error('Notification permission denied. Enable notifications for this site in your browser settings.');
    }

    if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Allow notifications in your browser to see a live preview on this device.');
        }
    }

    if (!isFirebaseClientMessagingConfigured()) {
        await showLocalPreview(payload);
        return;
    }

    const cachedToken = readCachedMerchantPreviewToken();
    if (cachedToken) {
        try {
            await sendRemotePreview(cachedToken, payload);
            return;
        } catch {
            // Fall through to refresh token / local preview.
        }
    }

    try {
        const token = await requestBrowserPushToken();
        if (!token) {
            throw new Error('Token unavailable');
        }

        cacheMerchantPreviewToken(token);
        await sendRemotePreview(token, payload);
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
