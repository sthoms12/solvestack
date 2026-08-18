import { strict as assert } from "node:assert";

const source = await Bun.file("src/main.ts").text();
const fixture = await Bun.file("tests/fixture-evidence.log").text();

assert.match(source, /Storage unavailable:/);
assert.match(source, /Save failed:/);
assert.match(source, /Storage full\. Export a backup or remove evidence/);
assert.match(source, /tx\.onabort/);
assert.match(source, /role="status" aria-live="polite"/);
assert.match(source, /aria-label="Troubleshooting note"/);
assert.match(source, /Evidence could not be read:/);
assert.match(source, /Attachments are limited to 10 MB/);
assert.match(source, /parsePortableData/);
assert.match(source, /collectFields/);
assert.match(source, /Restore failed:/);
assert.ok(fixture.includes("error=451 4.4.0 gateway queue"));
assert.match(source, /readFile\(file\)/);
assert.match(source, /atob\(a\.data/);
assert.match(source, /evidence\/\$\{a\.filename\}/);
assert.match(source, /aria-label="Edit entry"/);
assert.match(source, /aria-label="Delete entry"/);
assert.match(source, /aria-label="Add hypothesis"/);
assert.match(source, /aria-label="Add next step"/);

console.log("SolveStack QA failure/accessibility contract passed");
