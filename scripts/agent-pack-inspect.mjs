#!/usr/bin/env bun
// Local helper for BYO agent workflows. Lists files inside a SolveStack
// agent-pack ZIP and verifies AGENT.md is present. Does not upload anything.
import { readFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) {
  console.error("Usage: bun scripts/agent-pack-inspect.mjs <agent-pack.zip>");
  process.exit(1);
}

const bytes = new Uint8Array(await readFile(path));
const names = [];
let offset = 0;
const u16 = (at) => bytes[at] | (bytes[at + 1] << 8);
const u32 = (at) =>
  bytes[at] |
  (bytes[at + 1] << 8) |
  (bytes[at + 2] << 16) |
  (bytes[at + 3] << 24);

while (offset + 30 <= bytes.length) {
  const sig = u32(offset);
  if (sig !== 0x04034b50) break;
  const nameLen = u16(offset + 26);
  const extraLen = u16(offset + 28);
  const size = u32(offset + 18);
  const nameStart = offset + 30;
  const name = new TextDecoder().decode(
    bytes.slice(nameStart, nameStart + nameLen),
  );
  names.push(name);
  offset = nameStart + nameLen + extraLen + size;
}

if (!names.includes("AGENT.md")) {
  console.error("Not a SolveStack agent pack (AGENT.md missing).");
  console.error("Found:", names.join(", ") || "(none)");
  process.exit(2);
}

console.log("SolveStack agent pack OK");
for (const name of names) console.log(`- ${name}`);
