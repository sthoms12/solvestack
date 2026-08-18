import { expect, test } from "bun:test";
import { CURRENT_SCHEMA_VERSION, migrateWorkspace } from "../src/migrations";

test("version 1 workspaces migrate without losing records", () => {
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
    attachments: [{ id: "a1" }],
  });
  expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(migrated.sessions[0].entries[0].createdAt).toBe("2026-01-01");
  expect(migrated.sessions[0].hypotheses[0].updatedAt).toBe("2026-01-02");
  expect(migrated.attachments).toHaveLength(1);
});

test("future workspace versions are rejected", () =>
  expect(() =>
    migrateWorkspace({ schemaVersion: 99, sessions: [], attachments: [] }),
  ).toThrow("future"));
