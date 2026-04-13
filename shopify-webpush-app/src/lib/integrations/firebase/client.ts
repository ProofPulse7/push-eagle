import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as isAnalyticsSupported, type Analytics } from 'firebase/analytics';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

import { env } from '@/lib/config/env';

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseClientMessagingConfigured = () => {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  );
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

let analyticsPromise: Promise<Analytics | null> | null = null;

export const getFirebaseAnalytics = async (): Promise<Analytics | null> => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!analyticsPromise) {
    analyticsPromise = isAnalyticsSupported()
      .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
      .catch(() => null);
  }

  return analyticsPromise;
};

export const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return null;
  }
  return getMessaging(firebaseApp);
};

export const firebaseVapidKey = env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
