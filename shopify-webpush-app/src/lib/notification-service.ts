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

const showLocalPreview = async (payload: LivePreviewPayload) => {
    const registration = await navigator.serviceWorker.getRegistration();

    if (registration) {
        await registration.showNotification(payload.title, {
            body: payload.body,
            icon: payload.icon ?? undefined,
            data: {
                url: payload.url ?? undefined,
            },
        });
        return;
    }

    new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon ?? undefined,
    });
};

export async function handleSendLivePreview(payload: LivePreviewPayload) {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error("Push notifications are not supported by this browser.");
    }

    const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();

    if (permission !== 'granted') {
        throw new Error('Notification permission denied.');
    }

    if (!isFirebaseClientMessagingConfigured()) {
        await showLocalPreview(payload);
        return;
    }

    try {
        const token = await requestBrowserPushToken();
        if (!token) {
            throw new Error('Token unavailable');
        }

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
