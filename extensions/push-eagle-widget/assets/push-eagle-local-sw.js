importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCdvIUZWdBYVySpYjoh1uW7ceEq-JRyRYs',
  authDomain: 'push-eagle7.firebaseapp.com',
  projectId: 'push-eagle7',
  storageBucket: 'push-eagle7.firebasestorage.app',
  messagingSenderId: '398105125549',
  appId: '1:398105125549:web:18005a5cbb324f329fdc24',
  measurementId: 'G-JSNXN0BFCP',
});

firebase.messaging();

function sendTrackingBeacon(trackUrl) {
  if (!trackUrl) {
    return Promise.resolve();
  }

  return fetch(trackUrl, {
    method: 'GET',
    mode: 'no-cors',
    credentials: 'omit',
    cache: 'no-store',
    keepalive: true,
  }).catch(function () {
    // Ignore tracking errors.
  });
}

function buildPushEagleActions(payload) {
  var notificationActions = Array.isArray(payload.notification && payload.notification.actions)
    ? payload.notification.actions
    : [];

  if (notificationActions.length > 0) {
    return notificationActions.slice(0, 2).filter(function (action) {
      return action && action.action && action.title;
    });
  }

  var data = payload.data || {};
  var fallbackActions = [];
  if (data.action1Title && data.button1Url) {
    fallbackActions.push({ action: 'btn_1', title: String(data.action1Title) });
  }
  if (data.action2Title && data.button2Url) {
    fallbackActions.push({ action: 'btn_2', title: String(data.action2Title) });
  }
  return fallbackActions;
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var data = (event.notification && event.notification.data) || {};
  var target = data.url || '/';
  var trackUrl = data.trackPrimaryUrl || '';

  if (event.action === 'btn_1') {
    target = data.button1Url || data.url || '/';
    trackUrl = data.trackButton1Url || data.trackPrimaryUrl || '';
  } else if (event.action === 'btn_2') {
    target = data.button2Url || data.url || '/';
    trackUrl = data.trackButton2Url || data.trackPrimaryUrl || '';
  }

  clients.openWindow(target);
  event.waitUntil(sendTrackingBeacon(trackUrl));
});

self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = {};
  }

  var title = (payload.data && payload.data.title) || payload.title || (payload.notification && payload.notification.title) || 'Push Eagle';
  var url = (payload.fcmOptions && payload.fcmOptions.link) || payload.url || (payload.data && payload.data.url) || '/';
  var button1Url = (payload.data && payload.data.button1Url) || url;
  var button2Url = (payload.data && payload.data.button2Url) || '';
  var trackPrimaryUrl = (payload.data && payload.data.trackPrimaryUrl) || '';
  var trackButton1Url = (payload.data && payload.data.trackButton1Url) || '';
  var trackButton2Url = (payload.data && payload.data.trackButton2Url) || '';

  var options = {
    body: (payload.data && payload.data.body) || payload.body || (payload.notification && payload.notification.body),
    icon: (payload.data && payload.data.icon) || payload.icon || (payload.notification && payload.notification.icon),
    image: (payload.data && payload.data.image) || payload.image || (payload.notification && payload.notification.image),
    actions: buildPushEagleActions(payload),
    data: {
      url: url,
      button1Url: button1Url,
      button2Url: button2Url,
      trackPrimaryUrl: trackPrimaryUrl,
      trackButton1Url: trackButton1Url,
      trackButton2Url: trackButton2Url,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
