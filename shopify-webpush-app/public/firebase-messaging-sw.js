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

messaging.onBackgroundMessage(function(payload) {
  console.log('Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification?.title || 'Push Eagle';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: payload.notification?.icon,
    image: payload.notification?.image,
    data: {
      url: payload.fcmOptions?.link || payload.data?.url || '/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || '/';
  event.waitUntil(clients.openWindow(targetUrl));
});
