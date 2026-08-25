const STATIC_CACHE = "kontamou-daily-static-v1";
const OFFLINE_URL = "/daily-offline.html";
const PRECACHE = [OFFLINE_URL, "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("kontamou-daily-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Authenticated Daily HTML stays network-only. The fallback has no order,
  // customer, QR, session, catalogue or account data.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const fallback = await caches.match(OFFLINE_URL);
      return fallback || new Response("Offline", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    }));
    return;
  }

  // Only immutable framework assets and the public icon may be runtime cached.
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })));
  }
});

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
  const requested = event.notification && event.notification.data && typeof event.notification.data.url === "string"
    ? event.notification.data.url
    : "/daily";
  const bridgeOrigin = self.location.hostname.endsWith(".vercel.app");
  const target = bridgeOrigin
    ? `/daily/push-open?target=${encodeURIComponent(requested.startsWith("/daily") ? requested : "/daily")}`
    : requested;
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
