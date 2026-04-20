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

function parseActions(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(function(action) { return action && action.action && action.title; }).slice(0, 2);
  }

  try {
    var parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(function(action) { return action && action.action && action.title; }).slice(0, 2)
      : [];
  } catch (_error) {
    return [];
  }
}

function openOrFocus(targetUrl) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
    for (var i = 0; i < clientList.length; i += 1) {
      var client = clientList[i];
      if (client.url === targetUrl && 'focus' in client) {
        return client.focus();
      }
    }

    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }

    return Promise.resolve();
  });
}

messaging.onBackgroundMessage(function(payload) {
  const title = payload.data?.title || payload.notification?.title || 'Push Eagle';
  const actions = parseActions(payload.data?.actionsJson || payload.notification?.actions);
  const url = payload.data?.url || payload.fcmOptions?.link || '/';
  const button1Url = payload.data?.button1Url || url;
  const button2Url = payload.data?.button2Url || '';
  const options = {
    body: payload.data?.body || payload.notification?.body,
    icon: payload.data?.iconUrl || payload.notification?.icon,
    image: payload.data?.imageUrl || payload.notification?.image,
    actions: actions.length > 0 ? actions : undefined,
    data: {
      url: url,
      button1Url: button1Url,
      button2Url: button2Url
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

  event.waitUntil(openOrFocus(target));
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
  const actions = parseActions((payload.data && payload.data.actionsJson) || payload.actions || (payload.notification && payload.notification.actions));
  const url = payload.url || payload.data?.url || '/';
  const button1Url = payload.data?.button1Url || url;
  const button2Url = payload.data?.button2Url || '';
  const options = {
    body: payload.body || payload.notification?.body,
    icon: payload.icon || payload.notification?.icon,
    image: payload.image || payload.notification?.image,
    actions: actions.length > 0 ? actions : undefined,
    data: {
      url: url,
      button1Url: button1Url,
      button2Url: button2Url
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
