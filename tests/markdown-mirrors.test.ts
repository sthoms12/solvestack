import { expect, test } from "bun:test";

// The markdown-mirror mechanism has four lists that must agree: the
// generator's PAGES (scripts/generate-md-mirrors.mjs), the worker's
// markdownRoutes (worker/index.ts), wrangler's run_worker_first
// (wrangler.jsonc — paths not listed there never reach the worker), and
// the built dist/*.md files. The lists drifted twice (agent-adapter had a
// generated mirror no route served; the incident pages were generated and
// routed but absent from run_worker_first), so pin the sync here.
test("every generated markdown mirror is routed by the worker", async () => {
  const script = await Bun.file("scripts/generate-md-mirrors.mjs").text();
  const worker = await Bun.file("worker/index.ts").text();
  const wrangler = await Bun.file("wrangler.jsonc").text();
  const paths = [...script.matchAll(/path: "(\/[^"]*)"/g)].map(
    (match) => match[1],
  );
  expect(paths.length).toBeGreaterThanOrEqual(8);
  for (const path of paths) {
    expect(worker).toContain(`"${path}"`);
    if (path !== "/") expect(wrangler).toContain(`"${path}*"`);
  }
});
