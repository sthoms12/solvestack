import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Served sources always; the built site too when `npm run build` has produced dist/.
const roots = ["index.html", "public", "src", "dist"].filter((root) => existsSync(root));

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

const hits = roots
  .flatMap(files)
  .filter((path) => /\.(html|xml|txt|json|js|ts|css|md|webmanifest)$/.test(path))
  .filter((path) => readFileSync(path, "utf8").toLowerCase().includes("steve thoms"));
assert.deepEqual(hits, [], `personal name found in: ${hits.join(", ")}`);
console.log("No personal name in served pages");
