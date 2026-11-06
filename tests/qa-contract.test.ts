import { strict as assert } from "node:assert";

const source = await Bun.file("src/main.ts").text();
const styles = await Bun.file("src/style.css").text();
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
assert.match(source, /attachmentDataUrl/);
assert.match(source, /bytesFromDataUrl/);
assert.match(source, /putEvidenceBlob/);
// ZIP evidence entries go through the basename sanitizer (audit run 1:
// zip-evidence-filename-path-traversal) instead of the verbatim filename.
assert.match(source, /evidenceEntryName\(a\.filename\)/);
assert.match(source, /evidence\/\$\{base/);
assert.match(source, /aria-label="Edit entry"/);
assert.match(source, /aria-label="Delete entry"/);
assert.match(source, /aria-label="Add hypothesis"/);
assert.match(source, /aria-label="Add next step"/);
assert.match(source, /savedState = "Saved locally"/);
assert.match(source, /aria-label="Primary navigation"/);
assert.match(source, /aria-label="How SolveStack works"/);
assert.match(source, /aria-label="Ways to use exported troubleshooting data"/);
assert.match(source, /What can your exports become\?/);
assert.match(source, /SolveStack does not upload or analyze exports/);
assert.match(source, /\/use-your-data\//);
assert.match(source, /Troubleshooting, written down while it happens/);
assert.match(source, /A field notebook for troubleshooting/);
assert.match(source, /Free\. No account\. No cloud database\./);
assert.match(source, /SEED_SESSION_ID/);
assert.match(source, /status example/);
assert.match(source, /confirmLabel: "Start session"/);
assert.match(source, /optionHints/);
assert.match(source, /Apply AI reply/);
assert.match(source, /applyAiReply/);
assert.match(source, /AI skill kit/);
assert.match(source, /buildSkillKitFiles/);
assert.match(source, /ABOUT SOLVESTACK/);
assert.match(source, /solvestack-welcome-dismissed/);
assert.match(styles, /\.app-shell\s*\{\s*flex-direction: column;/);
assert.match(styles, /\.capture-controls\s*\{\s*flex-wrap: wrap;/);
assert.match(styles, /\.entry-actions\s*\{\s*display: flex;\s*opacity: 1;/);

console.log("SolveStack QA failure/accessibility contract passed");
