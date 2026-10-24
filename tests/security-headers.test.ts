import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { forbiddenHits } from "../scripts/reject-analytics-host.mjs";

const headers = await Bun.file("public/_headers").text();
const policyLine =
  headers
    .split("\n")
    .find((line) => line.includes("Content-Security-Policy:")) ?? "";
const policy = policyLine.split("Content-Security-Policy:")[1]?.trim() ?? "";
const directives = new Map(
  policy
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...rest] = part.split(/\s+/);
      return [name, rest.join(" ")];
    }),
);

assert.equal(policy.length > 0, true, "CSP should be present in _headers");
assert.equal(directives.get("script-src")?.includes("'self'"), true);
assert.equal(
  directives.get("script-src")?.includes("https://static.cloudflareinsights.com"),
  true,
);
assert.equal(directives.get("script-src")?.includes("'unsafe-inline'"), false);
assert.equal(directives.get("script-src")?.includes("'unsafe-eval'"), false);
assert.equal(
  directives.get("connect-src")?.includes("https://cloudflareinsights.com"),
  true,
);
assert.equal(directives.get("connect-src")?.includes("'self'"), true);
assert.equal(directives.get("frame-ancestors"), "'none'");
assert.equal(directives.get("object-src"), "'none'");
assert.equal(directives.get("base-uri"), "'self'");
assert.match(headers, /X-Content-Type-Options: nosniff/);
assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
assert.match(
  headers,
  /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\)/,
);
assert.equal(policyLine.length <= 2000, true, "Workers _headers lines are limited to 2000 characters");
assert.match(
  headers,
  /\/service-worker\.js\n {2}Cache-Control: no-cache\n {2}! Content-Security-Policy/,
);

const readme = await Bun.file("README.md").text();
const source = await Bun.file("src/main.ts").text();
for (const text of [readme, source]) {
  assert.match(text, /Cloudflare Web Analytics/);
  assert.match(text, /cookieless/);
  assert.match(text, /aggregate page views/);
  assert.match(text, /does not read locally stored data/);
}

assert.deepEqual(forbiddenHits("local troubleshooting notes"), []);
assert.deepEqual(forbiddenHits("https://zo" + "computer.io/script.js").length > 0, true);
assert.deepEqual(forbiddenHits("zo" + "wa.js").length > 0, true);

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const hits: string[] = [];
for await (const path of files(".")) {
  const text = (await readFile(path)).toString("latin1");
  const found = forbiddenHits(text);
  if (found.length) hits.push(`${path}: ${found.join(", ")}`);
}
assert.deepEqual(hits, []);

console.log("SolveStack security header contract passed");
