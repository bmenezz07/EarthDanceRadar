const SHELL = "earthdance-shell-v1";
const MAPS = "earthdance-map-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![SHELL, MAPS].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(caches.open(MAPS).then(async (cache) => {
      const cached = await cache.match(event.request);
      const fresh = fetch(event.request).then((response) => { if (response.ok) cache.put(event.request, response.clone()); return response; }).catch(() => cached);
      return cached || fresh;
    }));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(SHELL).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))));
  }
});
