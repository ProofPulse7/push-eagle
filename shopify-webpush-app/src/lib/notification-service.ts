'use client';

import { requestBrowserPushToken } from '@/lib/services/web-push/push-service';


type LivePreviewPayload = {
    title: string;
    body: string;
    url?: string | null;
    icon?: string | null;
    image?: string | null;
};

export async function handleSendLivePreview(payload: LivePreviewPayload) {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error("Push notifications are not supported by this browser.");
    }

    const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

    if (!VAPID_PUBLIC_KEY) {
        throw new Error("Firebase VAPID key is not configured. Please add NEXT_PUBLIC_FIREBASE_VAPID_KEY.");
    }

    const token = await requestBrowserPushToken();
    if (!token) {
        throw new Error('Notification permission denied or token could not be generated.');
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
}
