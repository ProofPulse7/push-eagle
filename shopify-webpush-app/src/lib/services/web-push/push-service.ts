import { getToken, onMessage } from 'firebase/messaging';

import { firebaseVapidKey, getFirebaseMessaging } from '@/lib/integrations/firebase/client';

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
