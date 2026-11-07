const CACHE = "solvestack-v12";

// Every page and static file precached on install, so the whole site works
// offline on a first visit — not only after a page was visited once.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/404.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/og-image.png",
  "/fonts/manrope.woff2",
  "/fonts/dm-mono-400.woff2",
  "/fonts/dm-mono-500.woff2",
  "/use-your-data/",
  "/use-your-data/guide.css",
  "/agent-adapter/",
  "/rca-template/",
  "/rca-template/template.css",
  "/5-whys-template/",
  "/5-whys-template/template.css",
  "/fishbone-diagram-template/",
  "/fishbone-diagram-template/template.css",
  "/incident-report-template/",
  "/incident-report-template/template.css",
  "/vpn-outage-template/",
  "/vpn-outage-template/template.css",
  "/sign-in-failure-template/",
  "/sign-in-failure-template/template.css",
  "/expired-certificate-template/",
  "/expired-certificate-template/template.css",
  "/dns-failure-template/",
  "/dns-failure-template/template.css",
  "/disk-full-template/",
  "/disk-full-template/template.css",
  "/email-delivery-template/",
  "/email-delivery-template/template.css",
  "/onenote-vs-solvestack/",
  "/onenote-vs-solvestack/template.css",
];

// Hashed build assets (dist/assets/*), injected by
// scripts/generate-sw-precache.mjs at build time. In dev the token is
// undefined and the list is empty; the runtime cache still covers assets.
const PRECACHE_ASSETS =
  typeof __PRECACHE_ASSETS__ !== "undefined" ? __PRECACHE_ASSETS__ : [];

function shouldCache(request, response) {
  if (request.method !== "GET" || !response.ok) return false;
  return new URL(request.url).origin === self.location.origin;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // allSettled: one missing file must not fail the whole install.
        Promise.allSettled(
          [...PRECACHE_URLS, ...PRECACHE_ASSETS].map((url) =>
            cache.add(url),
          ),
        ),
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
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (shouldCache(event.request, response)) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then((cache) => cache.put(event.request, copy)),
          );
        }
        return response;
      } catch {
        // Offline with nothing cached: never answer with undefined (the
        // old handler did — respondWith(undefined) throws). Navigations
        // fall back to the app shell; anything else gets an honest 503.
        if (event.request.mode === "navigate") {
          return (
            (await caches.match("/")) ||
            (await caches.match("/404.html")) ||
            new Response("Offline", { status: 503 })
          );
        }
        return (
          cached ||
          new Response("Offline", { status: 503, statusText: "Offline" })
        );
      }
    }),
  );
});
