import { strict as assert } from "node:assert";

type Session = { schemaVersion: number; id: string; entries: unknown[] };
type Store = {
  schemaVersion: number;
  sessions: Session[];
  attachments: unknown[];
};

const sample: Store = {
  schemaVersion: 1,
  sessions: [{ schemaVersion: 1, id: "SS-test", entries: [] }],
  attachments: [],
};
const serialized = JSON.stringify(sample);
const restored = JSON.parse(serialized) as Store;
assert.equal(restored.schemaVersion, 1);
assert.equal(restored.sessions[0].id, "SS-test");
assert.deepEqual(restored.attachments, []);
console.log("SolveStack data-model smoke test passed");

const buildFiles = [
  "dist/index.html",
  "dist/manifest.webmanifest",
  "dist/og-image.png",
  "dist/robots.txt",
  "dist/404.html",
  "dist/service-worker.js",
  "dist/sitemap.xml",
  "dist/use-your-data/index.html",
  "dist/use-your-data/guide.css",
];
for (const file of buildFiles)
  assert.equal(
    Bun.file(file).size > 0,
    true,
    `${file} should exist after build`,
  );
assert.equal(
  (await Bun.file("public/manifest.webmanifest").text()).includes("icon.svg"),
  true,
);
assert.equal(
  (await Bun.file("public/service-worker.js").text()).includes("solvestack-v7"),
  true,
);
const productionOrigin = "https://solvestack-ai.app/";
assert.equal(
  (await Bun.file("index.html").text()).includes(
    `<link rel="canonical" href="${productionOrigin}" />`,
  ),
  true,
);
assert.equal(
  (await Bun.file("public/sitemap.xml").text()).includes(
    `<loc>${productionOrigin}</loc>`,
  ),
  true,
);
assert.equal(
  (await Bun.file("public/sitemap.xml").text()).includes(
    `<loc>${productionOrigin}use-your-data/</loc>`,
  ),
  true,
);
assert.equal(
  (await Bun.file("public/robots.txt").text()).includes(
    `${productionOrigin}sitemap.xml`,
  ),
  true,
);
const home = await Bun.file("index.html").text();
const title = home.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
const heading = home.match(/<h1>([^<]+)<\/h1>/)?.[1] ?? "";
assert.equal(title.startsWith("SolveStack"), true, title);
assert.equal(heading.startsWith("SolveStack"), true, heading);
const jsonLd = JSON.parse(
  home.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1] ?? "{}",
) as { "@graph": Array<Record<string, unknown>> };
const entity = (type: string) =>
  jsonLd["@graph"].find((node) => node["@type"] === type);
const organization = entity("Organization");
const website = entity("WebSite");
assert.equal(organization?.name, "SolveStack");
assert.equal(organization?.url, productionOrigin);
assert.equal(
  (organization?.logo as { url?: string } | undefined)?.url,
  `${productionOrigin}icon.svg`,
);
assert.equal(website?.name, "SolveStack");
assert.equal(website?.url, productionOrigin);
const knownProfiles = new Set([
  "https://www.linkedin.com/in/steve-thoms-81381990",
  "https://x.com/thomstech12",
]);
for (const node of jsonLd["@graph"]) {
  const sameAs = node.sameAs;
  if (!Array.isArray(sameAs)) continue;
  for (const profile of sameAs) {
    assert.equal(knownProfiles.has(String(profile)), true, String(profile));
  }
}
assert.equal(
  (await Bun.file("src/main.ts").text()).includes("<h1>SolveStack</h1>"),
  true,
);
console.log("SolveStack static-shell smoke test passed");
