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

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

function parseActions(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item) => item && item.action && item.title).slice(0, 2);
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && item.action && item.title).slice(0, 2)
      : [];
  } catch (_error) {
    return [];
  }
}

messaging.onBackgroundMessage(function(payload) {
  console.log('Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.data?.title || payload.notification?.title || 'Push Eagle';

  const actions = parseActions(payload.data?.actionsJson || payload.notification?.actions);

  const url = payload.data?.url || payload.fcmOptions?.link || '/';
  const button1Url = payload.data?.button1Url || url;
  const button2Url = payload.data?.button2Url || '';

  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body,
    icon: payload.data?.iconUrl || payload.notification?.icon,
    image: payload.data?.imageUrl || payload.notification?.image,
    actions: actions.length > 0 ? actions : undefined,
    data: {
      url,
      button1Url,
      button2Url,
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification?.data || {};
  let targetUrl;
  if (event.action === 'btn_1') {
    targetUrl = data.button1Url || data.url || '/';
  } else if (event.action === 'btn_2') {
    targetUrl = data.button2Url || data.url || '/';
  } else {
    targetUrl = data.url || '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i += 1) {
        const client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
