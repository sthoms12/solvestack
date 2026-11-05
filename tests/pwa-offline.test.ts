import { test, expect } from "bun:test";
import { readdir } from "node:fs/promises";

test("manifest has installable PNG icons, not only an SVG", async () => {
  const manifest = JSON.parse(
    await Bun.file("public/manifest.webmanifest").text(),
  ) as { icons: { src: string; sizes: string; type: string }[] };
  const bySize = new Map(manifest.icons.map((icon) => [icon.sizes, icon]));
  expect(bySize.get("192x192")?.src).toBe("/icons/icon-192.png");
  expect(bySize.get("192x192")?.type).toBe("image/png");
  expect(bySize.get("512x512")?.src).toBe("/icons/icon-512.png");
  expect(bySize.get("512x512")?.type).toBe("image/png");
  for (const size of ["192x192", "512x512"])
    expect(Bun.file(`public${bySize.get(size)!.src}`).size).toBeGreaterThan(0);
});

test("fonts are self-hosted: @font-face points at /fonts, no Google import", async () => {
  const css = await Bun.file("src/style.css").text();
  expect(css).not.toContain("fonts.googleapis.com");
  expect(css).toContain('@font-face');
  expect(css).toContain('src: url("/fonts/manrope.woff2")');
  expect(css).toContain('src: url("/fonts/dm-mono-400.woff2")');
  expect(css).toContain('src: url("/fonts/dm-mono-500.woff2")');
  for (const file of ["manrope.woff2", "dm-mono-400.woff2", "dm-mono-500.woff2"]) {
    const bytes = await Bun.file(`public/fonts/${file}`).arrayBuffer();
    expect(new Uint8Array(bytes.slice(0, 4))).toEqual(
      new Uint8Array([0x77, 0x4f, 0x46, 0x32]), // "wOF2"
    );
  }
  const headers = await Bun.file("public/_headers").text();
  expect(headers).not.toContain("fonts.googleapis.com");
  expect(headers).not.toContain("fonts.gstatic.com");
});

test("every sitemap page is precached by the service worker", async () => {
  const sitemap = await Bun.file("public/sitemap.xml").text();
  const sw = await Bun.file("public/service-worker.js").text();
  const paths = [...sitemap.matchAll(/<loc>https:\/\/solvestack-ai\.app([^<]*)<\/loc>/g)].map(
    (match) => match[1] || "/",
  );
  expect(paths.length).toBeGreaterThanOrEqual(7);
  for (const path of paths) expect(sw).toContain(`"${path}"`);
});

test("built service worker precaches the hashed assets", async () => {
  const shipped = await Bun.file("dist/service-worker.js").text();
  expect(shipped).not.toContain("__PRECACHE_ASSETS__");
  expect(shipped).toContain("solvestack-v9");
  const assets = await readdir("dist/assets");
  expect(assets.length).toBeGreaterThanOrEqual(2);
  for (const asset of assets) expect(shipped).toContain(`/assets/${asset}`);
});

test("app prompts on service-worker updates instead of swapping silently", async () => {
  const main = await Bun.file("src/main.ts").text();
  expect(main).toContain("controllerchange");
  expect(main).toContain("SolveStack updated");
  expect(main).toContain('actionLabel: "Reload"');
  expect(main).toContain("registration.update()");
});
