self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil(self.registration.showNotification(payload.title || 'School announcement', {
    body: payload.body || 'You have a new update from your school.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.tag || 'radx-school-update',
    data: { url: payload.url || '/parent-notifications' },
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/parent-notifications', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const existing = windows.find(client => client.url === target);
    return existing ? existing.focus() : clients.openWindow(target);
  }));
});
