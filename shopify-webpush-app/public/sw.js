self.buildPushEagleActions = function (payload) {
    var fromNotification = (payload.notification && Array.isArray(payload.notification.actions))
        ? payload.notification.actions
        : (Array.isArray(payload.actions) ? payload.actions : []);

    if (fromNotification.length > 0) {
        return fromNotification.slice(0, 2).filter(function (a) { return a && a.action && a.title; });
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
};

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
    var button1Url = (payload.data && payload.data.button1Url) || url;
    var button2Url = (payload.data && payload.data.button2Url) || '';

    var actions = self.buildPushEagleActions(payload);

    var options = {
        body: body,
        icon: icon,
        image: image,
        actions: actions.length > 0 ? actions : undefined,
        data: {
            url: url,
            button1Url: button1Url,
            button2Url: button2Url,
        },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    var data = event.notification.data || {};
    var targetUrl;
    if (event.action === 'btn_1') {
        targetUrl = data.button1Url || data.url || '/';
    } else if (event.action === 'btn_2') {
        targetUrl = data.button2Url || data.url || '/';
    } else {
        targetUrl = data.url || '/';
    }

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
