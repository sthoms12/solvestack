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
  "dist/service-worker.js",
  "dist/sitemap.xml",
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
  (await Bun.file("public/service-worker.js").text()).includes("solvestack-v6"),
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
  (await Bun.file("public/robots.txt").text()).includes(
    `${productionOrigin}sitemap.xml`,
  ),
  true,
);
console.log("SolveStack static-shell smoke test passed");
