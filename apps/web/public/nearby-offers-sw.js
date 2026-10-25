/* Narrow-scope notification display worker for foreground geofence checks only.
 * It cannot detect a geofence entry while the web app is closed. */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = "/account/nearby-offers";
  event.waitUntil((async () => {
    const matches = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = matches.find(client => new URL(client.url).pathname.startsWith(target));
    if (existing) return existing.focus();
    return clients.openWindow(target);
  })());
});
