// Inject the hashed build assets (dist/assets/*) into the service
// worker's precache list. Vite copies public/service-worker.js to
// dist/service-worker.js verbatim, so the __PRECACHE_ASSETS__ token in the
// source is replaced here, after the build, with the real asset URLs.
// Fails loudly if the token is missing — a service worker that silently
// precaches nothing would look fine until the first offline visit.
import { readdir, readFile, writeFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
const assetNames = await readdir(new URL("assets/", dist));
const assets = assetNames.map((name) => `/assets/${name}`);
const swPath = new URL("service-worker.js", dist);
const source = await readFile(swPath, "utf8");
if (!source.includes("__PRECACHE_ASSETS__")) {
  throw new Error(
    "dist/service-worker.js has no __PRECACHE_ASSETS__ token to inject",
  );
}
await writeFile(
  swPath,
  source.replaceAll("__PRECACHE_ASSETS__", JSON.stringify(assets)),
);
console.log(
  `Injected ${assets.length} precache asset(s) into dist/service-worker.js`,
);
