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

assert.match(install, /event\.waitUntil/);
assert.match(install, /self\.skipWaiting\(\)/);
assert.match(activate, /event\.waitUntil/);
assert.match(activate, /caches\.delete/);
assert.match(activate, /self\.clients\.claim\(\)/);
assert.equal(source.includes("indexedDB"), false);
assert.equal(fetchHandler.includes("cache.put"), true);
assert.match(fetchHandler, /shouldCache\(event\.request, response\)/);

const shouldCache = new Function(
  "self",
  `${source.match(/const FONT_HOSTS = new Set\(\[[\s\S]*?\]\);/)?.[0]}
${source.match(/function shouldCache[\s\S]*?\n\}/)?.[0]}
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
  shouldCache({ method: "GET", url: "https://fonts.googleapis.com/css2?family=Manrope" }, ok),
  true,
);
assert.equal(
  shouldCache({ method: "GET", url: "https://fonts.gstatic.com/s/manrope/v20/font.woff2" }, ok),
  true,
);
assert.equal(
  shouldCache({ method: "GET", url: "https://fonts.googleapis.com/css2?family=Manrope" }, missing),
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
