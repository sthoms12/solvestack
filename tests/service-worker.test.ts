import { strict as assert } from "node:assert";

const source = await Bun.file("public/service-worker.js").text();
const install = source.slice(
  source.indexOf('addEventListener("install"'),
  source.indexOf('addEventListener("activate"'),
);
const activate = source.slice(
  source.indexOf('addEventListener("activate"'),
  source.indexOf('addEventListener("fetch"'),
);
const fetchHandler = source.slice(source.indexOf('addEventListener("fetch"'));

assert.match(source, /const CACHE = "solvestack-v13"/);
assert.match(install, /event\.waitUntil/);
assert.match(install, /self\.skipWaiting\(\)/);
// One missing precache file must not fail the whole install.
assert.match(install, /Promise\.allSettled/);
assert.match(activate, /event\.waitUntil/);
assert.match(activate, /caches\.delete/);
assert.match(activate, /self\.clients\.claim\(\)/);
assert.equal(source.includes("indexedDB"), false);
assert.equal(fetchHandler.includes("cache.put"), true);
assert.match(fetchHandler, /shouldCache\(event\.request, response\)/);
// Offline with nothing cached: navigations fall back to the app shell,
// other requests get an honest 503 — never respondWith(undefined).
assert.match(fetchHandler, /mode === "navigate"/);
assert.match(fetchHandler, /caches\.match\("\/"\)/);
assert.match(fetchHandler, /status: 503/);
assert.equal(source.includes("fonts.googleapis.com"), false);
assert.equal(source.includes("fonts.gstatic.com"), false);

// Every content page is precached, plus the fonts and icons that make a
// first offline load look right.
for (const url of [
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
  "/root-cause-analysis-tools/",
  "/root-cause-analysis-tools/template.css",
  "/corrective-action-plan-template/",
  "/corrective-action-plan-template/template.css",
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
])
  assert.equal(source.includes(`"${url}"`), true, `${url} precached`);
assert.match(source, /__PRECACHE_ASSETS__/);

const shouldCache = new Function(
  "self",
  `${source.match(/function shouldCache[\s\S]*?\n\}/)?.[0]}
return shouldCache;`,
)({ location: { origin: "https://solvestack-ai.app" } }) as (
  request: { method: string; url: string },
  response: { ok: boolean },
) => boolean;

const same = (path: string) => `https://solvestack-ai.app${path}`;
const ok = { ok: true };
const missing = { ok: false };

assert.equal(shouldCache({ method: "GET", url: same("/") }, ok), true);
assert.equal(shouldCache({ method: "GET", url: same("/missing") }, missing), false);
assert.equal(shouldCache({ method: "POST", url: same("/") }, ok), false);
assert.equal(
  shouldCache({ method: "GET", url: same("/fonts/manrope.woff2") }, ok),
  true,
);
// Nothing cross-origin is cached any more — fonts are self-hosted now.
assert.equal(
  shouldCache({ method: "GET", url: "https://fonts.googleapis.com/css2?family=Manrope" }, ok),
  false,
);
assert.equal(
  shouldCache({ method: "GET", url: "https://fonts.gstatic.com/s/manrope/v20/font.woff2" }, ok),
  false,
);
assert.equal(
  shouldCache({ method: "GET", url: "https://static.cloudflareinsights.com/beacon.min.js" }, ok),
  false,
);
assert.equal(
  shouldCache({ method: "POST", url: "https://cloudflareinsights.com/cdn-cgi/rum" }, ok),
  false,
);
assert.equal(
  shouldCache({ method: "GET", url: "https://example.com/script.js" }, ok),
  false,
);

console.log("SolveStack service worker contract passed");
