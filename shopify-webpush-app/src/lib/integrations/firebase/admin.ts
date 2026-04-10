import { getApp, getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import { env } from '@/lib/config/env';

type NotificationPayload = {
  title: string;
  body: string;
  icon?: string | null;
  image?: string | null;
  url?: string | null;
};

const parseServiceAccount = () => {
  const raw = env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON?.trim();
  const b64 = env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64?.trim();

  if (!raw && !b64) {
    throw new Error(
      'Missing Firebase admin credentials. Set FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON or FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64.',
    );
  }

  try {
    const decoded = raw || Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(decoded) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
  } catch {
    throw new Error('Invalid Firebase admin service account value.');
  }
};

const getFirebaseAdminApp = () => {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccount = parseServiceAccount();

  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
  });
};

export const getFirebaseAdminMessaging = () => {
  const app = getFirebaseAdminApp();
  return getMessaging(app);
};

export const sendWebPushToToken = async (token: string, payload: NotificationPayload) => {
  const messaging = getFirebaseAdminMessaging();

  const messageId = await messaging.send({
    token,
    notification: {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.image ?? undefined,
    },
    webpush: {
      fcmOptions: {
        link: payload.url ?? undefined,
      },
      notification: {
        icon: payload.icon ?? undefined,
        image: payload.image ?? undefined,
      },
    },
  });

  return messageId;
};
