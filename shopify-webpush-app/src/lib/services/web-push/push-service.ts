import { getToken, onMessage } from 'firebase/messaging';

import { firebaseVapidKey, getFirebaseMessaging } from '@/lib/integrations/firebase/client';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

export const requestVapidSubscription = async () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  if (!firebaseVapidKey) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }

  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
  });

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(firebaseVapidKey),
  });
};

export const requestBrowserPushToken = async () => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!('serviceWorker' in navigator)) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return null;
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/',
  });

  const token = await getToken(messaging, {
    vapidKey: firebaseVapidKey,
    serviceWorkerRegistration: registration,
  });

  return token;
};

export const listenForegroundPush = async (onPayload: (payload: unknown) => void) => {
  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return () => undefined;
  }

  return onMessage(messaging, onPayload);
};
