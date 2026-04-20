import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { verifyShopifyAppProxySignature } from '@/lib/integrations/shopify/verify';

export const runtime = 'nodejs';

const serviceWorkerSource = `
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: '${env.NEXT_PUBLIC_FIREBASE_API_KEY}',
  authDomain: '${env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}',
  projectId: '${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}',
  storageBucket: '${env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}',
  messagingSenderId: '${env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}',
  appId: '${env.NEXT_PUBLIC_FIREBASE_APP_ID}',
  measurementId: '${env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID}'
});

const messaging = firebase.messaging();

function buildPushEagleActions(payload) {
  const notificationActions = Array.isArray(payload.notification?.actions)
    ? payload.notification.actions
    : [];

  if (notificationActions.length > 0) {
    return notificationActions.slice(0, 2).filter(function(action) {
      return action && action.action && action.title;
    });
  }

  const data = payload.data || {};
  const fallbackActions = [];
  if (data.action1Title && data.button1Url) {
    fallbackActions.push({ action: 'btn_1', title: String(data.action1Title) });
  }
  if (data.action2Title && data.button2Url) {
    fallbackActions.push({ action: 'btn_2', title: String(data.action2Title) });
  }
  return fallbackActions;
}

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification?.title || 'Push Eagle';
  const url = payload.fcmOptions?.link || payload.data?.url || '/';
  const button1Url = payload.data?.button1Url || url;
  const button2Url = payload.data?.button2Url || '';
  const options = {
    body: payload.notification?.body,
    icon: payload.notification?.icon,
    image: payload.notification?.image,
    actions: buildPushEagleActions(payload),
    data: {
      url,
      button1Url,
      button2Url
    }
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification?.data || {};
  let target = data.url || '/';
  if (event.action === 'btn_1') {
    target = data.button1Url || data.url || '/';
  } else if (event.action === 'btn_2') {
    target = data.button2Url || data.url || '/';
  }

  event.waitUntil(clients.openWindow(target));
});

// Fallback for VAPID/browser-native push payloads (Firefox/Safari).
self.addEventListener('push', function(event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = {};
  }

  const title = payload.title || payload.notification?.title || 'Push Eagle';
  const url = payload.url || payload.data?.url || '/';
  const button1Url = payload.data?.button1Url || url;
  const button2Url = payload.data?.button2Url || '';
  const options = {
    body: payload.body || payload.notification?.body,
    icon: payload.icon || payload.notification?.icon,
    image: payload.image || payload.notification?.image,
    actions: buildPushEagleActions(payload),
    data: {
      url,
      button1Url,
      button2Url
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
`;

const handleRequest = async (request: Request) => {
  const url = new URL(request.url);
  if (!verifyShopifyAppProxySignature(url.searchParams)) {
    return NextResponse.json({ ok: false, error: 'Invalid Shopify app proxy signature.' }, { status: 401 });
  }

  return new NextResponse(serviceWorkerSource, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, must-revalidate',
      'Service-Worker-Allowed': '/apps/push-eagle/',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
};

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
