// Scripts for Firebase v9 compat libraries
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker with the provided config
const firebaseConfig = {
  apiKey: "AIzaSyCdvIUZWdBYVySpYjoh1uW7ceEq-JRyRYs",
  authDomain: "push-eagle7.firebaseapp.com",
  projectId: "push-eagle7",
  storageBucket: "push-eagle7.firebasestorage.app",
  messagingSenderId: "398105125549",
  appId: "1:398105125549:web:18005a5cbb324f329fdc24",
  measurementId: "G-JSNXN0BFCP"
};

firebase.initializeApp(firebaseConfig);

// Ensure Firebase messaging is initialized in this worker context.
firebase.messaging();

const sendTrackingBeacon = (trackUrl) => {
  if (!trackUrl) {
    return Promise.resolve();
  }

  return fetch(trackUrl, {
    method: 'GET',
    mode: 'no-cors',
    credentials: 'omit',
    cache: 'no-store',
    keepalive: true,
  }).catch(() => {
    // Ignore tracking errors to keep click-through instant.
  });
};

const buildPushEagleActions = (payload) => {
  const notificationActions = Array.isArray(payload.notification?.actions)
    ? payload.notification.actions
    : [];

  if (notificationActions.length > 0) {
    return notificationActions.slice(0, 2).filter((a) => a && a.action && a.title);
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
};

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification?.data || {};
  let targetUrl;
  let trackUrl;
  if (event.action === 'btn_1') {
    targetUrl = data.button1Url || data.url || '/';
    trackUrl = data.trackButton1Url || data.trackPrimaryUrl || '';
  } else if (event.action === 'btn_2') {
    targetUrl = data.button2Url || data.url || '/';
    trackUrl = data.trackButton2Url || data.trackPrimaryUrl || '';
  } else {
    targetUrl = data.url || '/';
    trackUrl = data.trackPrimaryUrl || '';
  }

  clients.openWindow(targetUrl);
  event.waitUntil(sendTrackingBeacon(trackUrl));
});

// Unified renderer for both Firebase and VAPID/native web push payloads.
self.addEventListener('push', function(event) {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = {};
  }

  const title = payload.data?.title || payload.title || payload.notification?.title || 'Push Eagle';
  const url = payload.fcmOptions?.link || payload.url || payload.data?.url || '/';
  const button1Url = payload.data?.button1Url || url;
  const button2Url = payload.data?.button2Url || '';
  const trackPrimaryUrl = payload.data?.trackPrimaryUrl || '';
  const trackButton1Url = payload.data?.trackButton1Url || '';
  const trackButton2Url = payload.data?.trackButton2Url || '';

  const options = {
    body: payload.data?.body || payload.body || payload.notification?.body,
    icon: payload.data?.icon || payload.icon || payload.notification?.icon,
    image: payload.data?.image || payload.image || payload.notification?.image,
    actions: buildPushEagleActions(payload),
    data: {
      url,
      button1Url,
      button2Url,
      trackPrimaryUrl,
      trackButton1Url,
      trackButton2Url,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
