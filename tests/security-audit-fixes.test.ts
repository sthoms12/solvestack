import { expect, test } from "bun:test";
import { mergeBackup, parsePortableData } from "../src/domain";
import {
  buildAgentPackFiles,
  redactSessionForAgent,
  redactText,
} from "../src/agent-pack";
import { CURRENT_SCHEMA_VERSION } from "../src/migrations";

// Regression tests for the security audit run 1 fix batch
// (~/security-audit-skill/solvestack/run-1/REPORT.md).

const asRecord = (value: unknown) => value as Record<string, any>;

test("import normalization fills safe defaults for missing fields", () => {
  const incoming = parsePortableData({
    schemaVersion: 3,
    sessions: [{ id: "SS-bad", entries: [] }],
    attachments: [],
  });
  const session = asRecord(incoming.sessions[0]);
  expect(session.title).toBe("");
  expect(session.problem).toBe("");
  expect(session.system).toBe("");
  expect(session.tags).toEqual([]);
  expect(session.status).toBe("active");
  expect(session.currentFocus).toBe("");
  expect(session.scratchpad).toBe("");
  expect(session.hypotheses).toEqual([]);
  expect(session.tasks).toEqual([]);
  expect(session.resolution).toEqual({
    rootCause: "",
    fix: "",
    validation: "",
    prevention: "",
  });
  // Timestamps fall back to a parseable ISO value so dateLabel cannot throw.
  expect(Number.isNaN(Date.parse(session.createdAt))).toBe(false);
  expect(Number.isNaN(Date.parse(session.updatedAt))).toBe(false);
});

test("import normalization repairs mistyped fields instead of persisting them", () => {
  const incoming = parsePortableData({
    schemaVersion: 2,
    session: {
      id: "SS-mistyped",
      title: 42,
      tags: ["ok", 7, "also-ok"],
      status: "weird",
      updatedAt: "not a date",
      entries: [{ id: "e1", content: 99, timestamp: "junk" }],
    },
    attachments: [],
  });
  const session = asRecord(incoming.sessions[0]);
  expect(session.title).toBe("");
  expect(session.tags).toEqual(["ok", "also-ok"]);
  expect(session.status).toBe("active");
  expect(Number.isNaN(Date.parse(session.updatedAt))).toBe(false);
  const entry = asRecord(session.entries[0]);
  expect(entry.content).toBe("");
  expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false);
});

test("import rejects structurally impossible files", () => {
  // Non-object session in a backup.
  expect(() =>
    parsePortableData({ schemaVersion: 3, sessions: ["nope"], attachments: [] }),
  ).toThrow("backup");
  // Session without a usable id.
  expect(() =>
    parsePortableData({
      schemaVersion: 3,
      sessions: [{ entries: [] }],
      attachments: [],
    }),
  ).toThrow("backup");
  expect(() =>
    parsePortableData({
      schemaVersion: 3,
      sessions: [{ id: "", entries: [] }],
      attachments: [],
    }),
  ).toThrow("backup");
  // Collection field present but not an array (backup branch).
  expect(() =>
    parsePortableData({
      schemaVersion: 3,
      sessions: [{ id: "SS-1", entries: [], tags: "mail" }],
      attachments: [],
    }),
  ).toThrow("backup");
  expect(() =>
    parsePortableData({
      schemaVersion: 3,
      sessions: [{ id: "SS-1", entries: "none" }],
      attachments: [],
    }),
  ).toThrow("backup");
});

test("import drops collection elements and attachments without usable ids", () => {
  const incoming = parsePortableData({
    schemaVersion: 3,
    sessions: [
      {
        id: "SS-1",
        entries: [{ content: "no id" }, { id: "e1", content: "kept" }],
        hypotheses: [{ text: "no id" }, { id: "h1", text: "kept" }],
        tasks: [{ text: "no id" }, { id: "t1", text: "kept" }],
      },
    ],
    attachments: [
      { id: "a-orphan", filename: "no session" },
      { sessionId: "SS-1", filename: "no id" },
      { id: "a1", sessionId: "SS-1", filename: "kept.txt" },
    ],
  });
  const session = asRecord(incoming.sessions[0]);
  expect(session.entries).toHaveLength(1);
  expect(session.hypotheses).toHaveLength(1);
  expect(session.tasks).toHaveLength(1);
  expect(incoming.attachments).toHaveLength(1);
  const attachment = asRecord(incoming.attachments[0]);
  expect(attachment.filename).toBe("kept.txt");
  expect(attachment.data).toBe("");
  expect(attachment.size).toBe(0);
});

test("import drops blobRefs that alias another attachment's OPFS blob", () => {
  const incoming = parsePortableData({
    schemaVersion: 3,
    sessions: [{ id: "SS-1", entries: [] }],
    attachments: [
      {
        id: "a-new",
        sessionId: "SS-1",
        blobRef: "opfs:a-victim",
        data: "",
      },
      {
        id: "a-own",
        sessionId: "SS-1",
        blobRef: "opfs:a-own",
        data: "",
      },
    ],
  });
  const [alias, own] = incoming.attachments.map(asRecord);
  expect(alias.blobRef).toBeUndefined();
  expect(own.blobRef).toBe("opfs:a-own");
});

test("backup merge drops duplicate ids inside a single incoming file", () => {
  const merged = mergeBackup(
    [{ id: "existing" }],
    [{ id: "x" }, { id: "x" }, { id: "existing" }, { id: "y" }],
  );
  expect(merged.map((item) => item.id)).toEqual(["existing", "x", "y"]);
  expect(mergeBackup([], [{ id: "a" }, { id: "a" }])).toHaveLength(1);
});

test("redactText catches the credential shapes the old patterns missed", () => {
  const cases: [string, string][] = [
    // Canonical Bearer header: the keyword pattern used to eat "Bearer".
    ["Authorization: Bearer abc123def456", "abc123def456"],
    ["Authorization: Basic dXNlcjpwYXNzd29yZA==", "dXNlcjpwYXNzd29yZA=="],
    // Multi-word passphrase after a label.
    ["password=correct horse battery staple", "horse"],
    // Azure connection-string key and client_secret (underscore form).
    ["Server=tcp:db;AccountKey=abcDEF123==;EndpointSuffix=core", "abcDEF123"],
    ["client_secret=shh-do-not-share", "shh-do-not-share"],
    // Unlabeled token shapes. Fixture values are assembled at runtime so
    // no credential-shaped literal sits in the source file (GitHub push
    // protection flags even well-known documentation example keys).
    ["aws key " + "AKIA" + "IOSFODNN7EXAMPLE in log", "AKIA" + "IOSFODNN7EXAMPLE"],
    [
      "token " + "github_" + "pat_" + "11ABCDEFG0HqlZxYzAbCdEfGhIjKlMnOpQrStUv",
      "github_" + "pat_" + "11ABCDEFG0HqlZxYzAbCdEfGhIjKlMnOpQrStUv",
    ],
    [
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    ],
    [
      "key " + "sk-" + "proj-" + "abcdef0123456789ABCDEF",
      "sk-" + "proj-" + "abcdef0123456789ABCDEF",
    ],
    [
      "key " + "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc",
      "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc",
    ],
    ["host 2001:db8:85a3::8a2e:370:7334 down", "2001:db8:85a3::8a2e:370:7334"],
    ["link-local fe80::1 unreachable", "fe80::1"],
  ];
  for (const [input, secret] of cases) {
    const out = redactText(input);
    expect(out).not.toContain(secret);
    expect(out).toContain("[REDACTED]");
  }
});

test("redactText handles PEM blocks, SAS signatures, and URL credentials", () => {
  const pem = [
    "-----BEGIN PRIVATE " + "KEY-----",
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC",
    "-----END PRIVATE " + "KEY-----",
  ].join("\n");
  const redactedPem = redactText(pem);
  expect(redactedPem).not.toContain("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC");
  expect(redactedPem).toContain("[REDACTED]");

  const sas = redactText(
    "https://acct.blob.core.windows.net/c/f.txt?sig=abcDEF123%3D&st=2026-01-01",
  );
  expect(sas).not.toContain("abcDEF123");
  expect(sas).toContain("sig=[REDACTED]");

  const url = redactText("connect https://admin:s3cret@db.internal:5432/app");
  expect(url).not.toContain("s3cret");
  expect(url).toContain("https://[REDACTED]@db.internal");
});

test("redactText still catches the shapes it always caught", () => {
  expect(redactText("password=hunter2")).toContain("[REDACTED]");
  expect(redactText("mail user@contoso.com")).not.toContain("user@contoso.com");
  expect(redactText("host 10.0.0.8")).not.toContain("10.0.0.8");
  // Diagnostic content that is not a credential stays put.
  expect(redactText("log at 12:30:45 from dc01.corp.local")).toContain(
    "12:30:45",
  );
  expect(redactText("log at 12:30:45 from dc01.corp.local")).toContain(
    "dc01.corp.local",
  );
});

test("agent pack redacts tags, metadata, and attachment filenames", () => {
  const session = {
    id: "SS-1",
    title: "Case",
    problem: "",
    system: "Exchange",
    tags: ["mail-flow", "token=tagsecret"],
    status: "active",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    currentFocus: "",
    scratchpad: "",
    entries: [],
    hypotheses: [],
    tasks: [],
    resolution: { rootCause: "", fix: "", validation: "", prevention: "" },
    metadata: {
      note: "api_key=metasecret",
      nested: { list: ["password=deepsecret"] },
      count: 3,
    },
  };
  const redacted = redactSessionForAgent(session);
  expect(redacted.tags[0]).toBe("mail-flow");
  expect(redacted.tags[1]).toBe("[REDACTED]");
  const metadata = asRecord(redacted.metadata);
  expect(metadata.note).toBe("[REDACTED]");
  expect(asRecord(metadata.nested).list[0]).toBe("[REDACTED]");
  expect(metadata.count).toBe(3);

  const files = buildAgentPackFiles({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    knowledgeMarkdown: "# Case",
    session,
    attachments: [
      {
        id: "f1",
        filename: "token=filesecret screenshot.png",
        mimeType: "image/png",
        size: 12,
        description: "",
      },
    ],
  });
  for (const name of ["session.redacted.json", "evidence-manifest.json"]) {
    const text = files.find((f) => f.name === name)!.text;
    expect(text).not.toContain("filesecret");
    expect(text).not.toContain("tagsecret");
    expect(text).not.toContain("metasecret");
  }
});
