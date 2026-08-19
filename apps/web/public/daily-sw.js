self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "KONTA MOY Daily";
  const body = typeof data.body === "string" && data.body ? data.body : "Υπάρχει νέα ενέργεια που χρειάζεται την προσοχή σου.";
  const url = typeof data.url === "string" && data.url.startsWith("/daily") ? data.url : "/daily";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: typeof data.tag === "string" ? data.tag : "kontamou-daily",
    renotify: true,
    data: { url }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification && event.notification.data && typeof event.notification.data.url === "string"
    ? event.notification.data.url
    : "/daily";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client) await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  })());
});
