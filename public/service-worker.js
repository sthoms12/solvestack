const CACHE = "solvestack-v8";
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

function shouldCache(request, response) {
  if (request.method !== "GET" || !response.ok) return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin || FONT_HOSTS.has(url.hostname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/",
          "/index.html",
          "/manifest.webmanifest",
          "/icon.svg",
          "/og-image.png",
          "/use-your-data/",
          "/use-your-data/guide.css",
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (shouldCache(event.request, response)) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
            );
          }
          return response;
        })
        .catch(() => cached);
    }),
  );
});
