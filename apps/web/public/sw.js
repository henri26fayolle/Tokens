/* Kaiden service worker: installability + web push. No content ever passes
 * through here beyond notification metadata. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network passthrough; presence of a fetch handler enables installability.
self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let data = { title: 'Kaiden', body: '', url: '/home' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* non-JSON push — show defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/home';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
