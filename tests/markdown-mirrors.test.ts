import { expect, test } from "bun:test";

// The markdown-mirror mechanism has three lists that must agree: the
// generator's PAGES (scripts/generate-md-mirrors.mjs), the worker's
// markdownRoutes (worker/index.ts), and the built dist/*.md files. The
// worker list drifted once already (agent-adapter had a generated mirror
// no route served), so pin generator-to-worker sync here.
test("every generated markdown mirror is routed by the worker", async () => {
  const script = await Bun.file("scripts/generate-md-mirrors.mjs").text();
  const worker = await Bun.file("worker/index.ts").text();
  const paths = [...script.matchAll(/path: "(\/[^"]*)"/g)].map(
    (match) => match[1],
  );
  expect(paths.length).toBeGreaterThanOrEqual(8);
  for (const path of paths) expect(worker).toContain(`"${path}"`);
});
