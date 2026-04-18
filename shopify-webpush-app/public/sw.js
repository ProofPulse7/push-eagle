self.addEventListener('push', function (event) {
    var payload = {};

    try {
        payload = event.data ? event.data.json() : {};
    } catch (_error) {
        try {
            payload = { body: event.data ? event.data.text() : '' };
        } catch (_nestedError) {
            payload = {};
        }
    }

    var title = payload.title || (payload.notification && payload.notification.title) || 'Push Eagle';
    var body = payload.body || (payload.notification && payload.notification.body) || '';
    var icon = payload.icon || (payload.notification && payload.notification.icon) || '/icon-192.png';
    var image = payload.image || (payload.notification && payload.notification.image) || undefined;
    var url = payload.url || (payload.data && payload.data.url) || '/';

    var options = {
        body: body,
        icon: icon,
        image: image,
        data: {
            url: url,
        },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
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
        }),
    );
});
