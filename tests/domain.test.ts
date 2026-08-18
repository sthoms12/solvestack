import { test, expect } from "bun:test";
import {
  mergeBackup,
  parsePortableData,
  redactSelection,
  relatedSessions,
  searchSessions,
} from "../src/domain";

const session = (
  id: string,
  title: string,
  system = "Exchange Online",
  tags = ["mail-flow"],
) => ({
  id,
  title,
  problem: `Investigate ${title}`,
  system,
  tags,
  resolution: {
    rootCause: "gateway queue",
    fix: "",
    validation: "",
    prevention: "",
  },
  entries: [{ type: "Evidence", content: "message trace" }],
  hypotheses: [{ text: "gateway issue", reasoning: "" }],
});

test("search ranks title and reports match reasons", () => {
  const result = searchSessions(
    [session("1", "Gateway queue delay"), session("2", "General mail issue")],
    "gateway",
  );
  expect(result[0].session.id).toBe("1");
  expect(result[0].reasons).toContain("title match");
});

test("related sessions explain deterministic matches", () => {
  const result = relatedSessions(session("1", "Outbound delay"), [
    session("1", "Outbound delay"),
    session("2", "Connector failure"),
  ]);
  expect(result[0].reasons).toEqual(
    expect.arrayContaining([
      "same system",
      "shared tag",
      "shared problem terms",
    ]),
  );
});

test("redaction changes only the selected range", () =>
  expect(redactSelection("token=secret", 6, 12)).toBe("token=[REDACTED]"));

test("backup merge preserves existing records and adds new records", () =>
  expect(mergeBackup([{ id: "old" }], [{ id: "old" }, { id: "new" }])).toEqual([
    { id: "old" },
    { id: "new" },
  ]));

test("portable parser accepts session exports and full backups", () => {
  expect(
    parsePortableData({
      schemaVersion: 1,
      session: { id: "SS-1", entries: [] },
      attachments: [],
    }).kind,
  ).toBe("session");
  expect(
    parsePortableData({ schemaVersion: 1, sessions: [], attachments: [] }).kind,
  ).toBe("backup");
});

test("portable parser rejects corrupt and future formats", () => {
  expect(() =>
    parsePortableData({ schemaVersion: 3, sessions: [], attachments: [] }),
  ).toThrow("schema version");
  expect(() =>
    parsePortableData({
      schemaVersion: 1,
      session: { id: "SS-1" },
      attachments: [],
    }),
  ).toThrow("session export");
});

test("core renderer uses shared search and avoids duplicate search enhancement", async () => {
  const source = await Bun.file("src/main.ts").text();
  expect(source).toContain('from "./domain"');
  expect(source).not.toContain('import "./search-enhancements"');
});

test("enhancements identify sessions explicitly and reuse uses a modal", async () => {
  const enhancements = await Bun.file("src/enhancements.ts").text();
  const reuse = await Bun.file("src/reuse-enhancement.ts").text();
  const attachments = await Bun.file("src/attachment-enhancements.ts").text();
  expect(`${enhancements}${reuse}${attachments}`).not.toContain(
    "document.body.innerText",
  );
  expect(reuse).toContain("dialog.showModal()");
  expect(reuse).not.toContain("prompt(");
  expect(attachments).toContain("data-remove-attachment");
});
