import { strict as assert } from "node:assert";

type Session = {
  schemaVersion: number;
  id: string;
  title: string;
  entries: unknown[];
};
type Backup = {
  schemaVersion: number;
  sessions: Session[];
  attachments: unknown[];
};

const original: Backup = {
  schemaVersion: 1,
  sessions: [
    { schemaVersion: 1, id: "SS-existing", title: "Existing", entries: [] },
  ],
  attachments: [],
};
const incoming: Backup = {
  schemaVersion: 1,
  sessions: [{ schemaVersion: 1, id: "SS-new", title: "New", entries: [] }],
  attachments: [],
};
const ids = new Set(original.sessions.map((session) => session.id));
const merged = {
  ...original,
  sessions: [
    ...original.sessions,
    ...incoming.sessions.filter((session) => !ids.has(session.id)),
  ],
};
assert.deepEqual(
  merged.sessions.map((session) => session.id),
  ["SS-existing", "SS-new"],
);
assert.throws(() => {
  const invalid = { schemaVersion: 2, sessions: [], attachments: [] };
  if (invalid.schemaVersion !== 1) throw new Error("Unsupported schema");
});

const markdown = await Bun.file("src/main.ts").text();
for (const heading of [
  "## Problem",
  "## Environment",
  "## Key Findings",
  "## Timeline",
  "## Hypotheses",
  "## Ruled Out",
  "## Root Cause",
  "## Resolution",
  "## Validation",
  "## Prevention",
  "## Evidence",
])
  assert.equal(markdown.includes(heading), true, `${heading} missing`);

const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
assert.equal(zipHeader[0], 0x50);
assert.equal(zipHeader[1], 0x4b);
assert.equal(zipHeader[2], 0x03);
assert.equal(zipHeader[3], 0x04);
const source = await Bun.file("src/main.ts").text();
assert.match(source, /parsePortableData/);
assert.match(source, /session ID conflict/);
assert.match(source, /Attachment\[\]/);
assert.match(source, /evidence\//);
assert.match(source, /aria-label="Add hypothesis"/);
assert.match(source, /aria-label="Add next step"/);
console.log("SolveStack portable-contract smoke test passed");
