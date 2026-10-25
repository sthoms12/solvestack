import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Split so the source tree does not contain the blocked hostnames.
const needles = ["zo" + "computer.io", "zo" + "wa"].map((needle) =>
  needle.toLowerCase(),
);

export function forbiddenHits(text) {
  const lower = text.toLowerCase();
  return needles.filter((needle) => lower.includes(needle));
}

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  const root = process.argv[2] ?? "dist";
  const hits = [];
  for await (const path of files(root)) {
    const text = (await readFile(path)).toString("latin1");
    const found = forbiddenHits(text);
    if (found.length) hits.push(`${path}: ${found.join(", ")}`);
  }

  if (hits.length) {
    console.error(`Blocked analytics reference in ${root}:`);
    for (const hit of hits) console.error(hit);
    process.exit(1);
  }

  console.log(`No blocked analytics host in ${root}`);
}
