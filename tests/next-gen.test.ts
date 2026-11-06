import { expect, test } from "bun:test";
import {
  BLUEPRINTS,
  blueprintById,
  parseMethodParam,
} from "../src/blueprints";
import { buildPatterns } from "../src/patterns";
import { classifyPaste } from "../src/smart-paste";
import {
  buildAgentPackFiles,
  redactText,
} from "../src/agent-pack";
import {
  decryptVault,
  encryptVault,
  isVaultEnvelope,
} from "../src/vault";
import { migrateWorkspace, CURRENT_SCHEMA_VERSION } from "../src/migrations";

test("blueprints cover the SEO method funnel", () => {
  expect(BLUEPRINTS.map((b) => b.id)).toEqual([
    "blank",
    "rca",
    "5-whys",
    "fishbone",
    "incident-report",
  ]);
  expect(blueprintById("rca").tasks.length).toBeGreaterThan(0);
  expect(parseMethodParam("?method=5-whys", "")).toBe("5-whys");
  expect(parseMethodParam("", "#method=fishbone")).toBe("fishbone");
  expect(parseMethodParam("?method=nope", "")).toBeNull();
});

test("pattern desk groups recurring systems and ruled-outs", () => {
  const sessions = [
    {
      id: "a",
      title: "Mail delay A",
      system: "Exchange Online",
      tags: ["mail-flow"],
      status: "resolved",
      resolution: { rootCause: "Gateway backlog", fix: "Bypass" },
      hypotheses: [
        { text: "DNS failure", status: "Ruled Out", reasoning: "Lookups ok" },
      ],
      entries: [{ technicalType: "Command" }],
    },
    {
      id: "b",
      title: "Mail delay B",
      system: "Exchange Online",
      tags: ["mail-flow"],
      status: "resolved",
      resolution: { rootCause: "Gateway backlog", fix: "Queue flush" },
      hypotheses: [
        { text: "DNS failure", status: "Ruled Out", reasoning: "Again fine" },
      ],
      entries: [{ technicalType: "Command" }, { technicalType: "Log" }],
    },
  ];
  const patterns = buildPatterns(sessions, { minCount: 2 });
  expect(patterns.some((p) => p.kind === "system" && p.count === 2)).toBe(true);
  expect(patterns.some((p) => p.kind === "tag" && p.label === "mail-flow")).toBe(
    true,
  );
  expect(
    patterns.some((p) => p.kind === "ruled-out" && p.label.includes("DNS")),
  ).toBe(true);
  expect(
    patterns.some((p) => p.kind === "root-cause" && p.label.includes("Gateway")),
  ).toBe(true);
});

test("smart paste classifies commands, errors, logs, and URLs", () => {
  expect(classifyPaste("https://example.com/ticket/1")?.technicalType).toBe(
    "URL/reference",
  );
  expect(classifyPaste("Get-MessageTrace -Recipient user@contoso.com")?.technicalType).toBe(
    "Command",
  );
  expect(
    classifyPaste("ERROR: Access is denied\nHRESULT: 0x80070005")?.technicalType,
  ).toBe("Error");
  expect(
    classifyPaste("2026-11-05 12:00:01 INFO start\n2026-11-05 12:00:02 WARN retry")
      ?.technicalType,
  ).toBe("Log");
});

test("agent pack redacts secrets and omits binaries", () => {
  expect(redactText("password=hunter2 token=abc")).toContain("[REDACTED]");
  const files = buildAgentPackFiles({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    knowledgeMarkdown: "# Case\npassword=secret",
    session: {
      id: "SS-1",
      title: "Case",
      problem: "api_key=abcd1234",
      system: "Exchange",
      tags: [],
      status: "active",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      currentFocus: "",
      scratchpad: "",
      entries: [],
      hypotheses: [],
      tasks: [],
      resolution: { rootCause: "", fix: "", validation: "", prevention: "" },
    },
    attachments: [
      {
        id: "f1",
        filename: "trace.png",
        mimeType: "image/png",
        size: 12,
        description: "user@contoso.com screenshot",
      },
    ],
  });
  expect(files.map((f) => f.name).sort()).toEqual([
    "AGENT.md",
    "evidence-manifest.json",
    "knowledge.md",
    "session.redacted.json",
  ]);
  expect(files.find((f) => f.name === "knowledge.md")!.text).toContain(
    "[REDACTED]",
  );
  expect(files.find((f) => f.name === "session.redacted.json")!.text).toContain(
    "[REDACTED]",
  );
  expect(
    files.find((f) => f.name === "evidence-manifest.json")!.text,
  ).toContain("trace.png");
});

test("encrypted vault round-trips a workspace payload", async () => {
  const payload = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sessions: [{ id: "SS-vault", entries: [] }],
    attachments: [],
  };
  const envelope = await encryptVault(payload, "correct horse battery");
  expect(isVaultEnvelope(envelope)).toBe(true);
  const unlocked = (await decryptVault(
    envelope,
    "correct horse battery",
  )) as typeof payload;
  expect(unlocked.sessions[0].id).toBe("SS-vault");
  await expect(decryptVault(envelope, "wrong passphrase")).rejects.toThrow(
    /passphrase/i,
  );
});

test("schema migrates through v3", () => {
  const migrated = migrateWorkspace({
    schemaVersion: 1,
    sessions: [
      {
        schemaVersion: 1,
        id: "SS-1",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
        entries: [{ id: "e1", timestamp: "2026-01-01" }],
        hypotheses: [{ id: "h1" }],
      },
    ],
    attachments: [{ id: "a1", data: "data:text/plain;base64,YQ==" }],
  });
  expect(migrated.schemaVersion).toBe(3);
  expect(migrated.sessions[0].schemaVersion).toBe(3);
  expect(migrated.attachments[0].blobRef).toBeUndefined();
});

test("template deep links point at method modes", async () => {
  const rca = await Bun.file("public/rca-template/index.html").text();
  const five = await Bun.file("public/5-whys-template/index.html").text();
  const fish = await Bun.file(
    "public/fishbone-diagram-template/index.html",
  ).text();
  const incident = await Bun.file(
    "public/incident-report-template/index.html",
  ).text();
  expect(rca).toContain('href="/?method=rca"');
  expect(five).toContain('href="/?method=5-whys"');
  expect(fish).toContain('href="/?method=fishbone"');
  expect(incident).toContain('href="/?method=incident-report"');
});
