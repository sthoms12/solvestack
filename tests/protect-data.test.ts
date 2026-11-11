import { expect, test } from "bun:test";
import {
  PROTECT_REPROMPT_AFTER_DAYS,
  PROTECT_REPROMPT_AFTER_EDITS,
  persistenceResultLabel,
  protectDecision,
  protectionStatusLabel,
  type ProtectSnapshot,
} from "../src/protect-data";

const now = new Date("2026-11-11T12:00:00.000Z");
const day = 86_400_000;

function snap(partial: Partial<ProtectSnapshot> = {}): ProtectSnapshot {
  return {
    hasRealWork: true,
    lastBackupAt: null,
    lastSyncAt: null,
    snoozedAt: null,
    editsSinceAnchor: 0,
    changedSinceProtection: false,
    ...partial,
  };
}

test("first real investigation prompts; the seeded example alone does not", () => {
  expect(protectDecision(snap(), now)).toEqual({
    show: true,
    reason: "first-save",
  });
  expect(protectDecision(snap({ hasRealWork: false, editsSinceAnchor: 40 }), now)).toEqual({
    show: false,
    reason: "none",
  });
  expect(
    protectDecision(snap({ lastBackupAt: "not-a-date", snoozedAt: "" }), now).reason,
  ).toBe("first-save");
});

test("remind me later is not permanent: edits or the day limit bring the prompt back", () => {
  const snoozed = snap({ snoozedAt: new Date(now.getTime() - 2 * day).toISOString() });
  expect(protectDecision(snoozed, now).show).toBe(false);

  expect(
    protectDecision(
      snap({
        snoozedAt: snoozed.snoozedAt,
        editsSinceAnchor: PROTECT_REPROMPT_AFTER_EDITS - 1,
      }),
      now,
    ).show,
  ).toBe(false);
  expect(
    protectDecision(
      snap({
        snoozedAt: snoozed.snoozedAt,
        editsSinceAnchor: PROTECT_REPROMPT_AFTER_EDITS,
      }),
      now,
    ),
  ).toEqual({ show: true, reason: "edit-count" });

  const expired = snap({
    snoozedAt: new Date(now.getTime() - PROTECT_REPROMPT_AFTER_DAYS * day).toISOString(),
  });
  expect(protectDecision(expired, now)).toEqual({
    show: true,
    reason: "stale-days",
  });
});

test("an active snooze blocks the stale-backup rule until the snooze itself expires", () => {
  const backup = new Date(now.getTime() - 30 * day).toISOString();
  const snooze = new Date(now.getTime() - 1 * day).toISOString();
  expect(
    protectDecision(
      snap({
        lastBackupAt: backup,
        snoozedAt: snooze,
        changedSinceProtection: true,
        editsSinceAnchor: 0,
      }),
      now,
    ).show,
  ).toBe(false);
});

test("a fresh backup stays quiet until new edits or a real change ages out", () => {
  const backup = now.toISOString();
  expect(protectDecision(snap({ lastBackupAt: backup }), now).show).toBe(false);
  expect(
    protectDecision(
      snap({
        lastBackupAt: backup,
        editsSinceAnchor: PROTECT_REPROMPT_AFTER_EDITS,
      }),
      now,
    ).reason,
  ).toBe("edit-count");

  const stale = new Date(now.getTime() - PROTECT_REPROMPT_AFTER_DAYS * day).toISOString();
  expect(
    protectDecision(snap({ lastBackupAt: stale, changedSinceProtection: false }), now).show,
  ).toBe(false);
  expect(
    protectDecision(snap({ lastBackupAt: stale, editsSinceAnchor: 1 }), now),
  ).toEqual({ show: true, reason: "stale-days" });
  expect(
    protectDecision(snap({ lastBackupAt: stale, changedSinceProtection: true }), now).reason,
  ).toBe("stale-days");

  const almost = new Date(now.getTime() - (PROTECT_REPROMPT_AFTER_DAYS - 1) * day).toISOString();
  expect(
    protectDecision(snap({ lastBackupAt: almost, changedSinceProtection: true }), now).show,
  ).toBe(false);
});

test("a newer vault sync counts as protection", () => {
  const backup = new Date(now.getTime() - 20 * day).toISOString();
  const sync = new Date(now.getTime() - 1 * day).toISOString();
  expect(
    protectDecision(
      snap({ lastBackupAt: backup, lastSyncAt: sync, changedSinceProtection: false }),
      now,
    ).show,
  ).toBe(false);
  const backupWhen = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(backup));
  expect(protectionStatusLabel(snap({ lastBackupAt: backup, lastSyncAt: sync }), now)).toBe(
    `Last backed up: ${backupWhen} · Last synced: yesterday`,
  );
});

test("status label names the latest copy", () => {
  expect(protectionStatusLabel(snap(), now)).toBe("Last backed up: not yet");
  expect(protectionStatusLabel(snap({ lastBackupAt: now.toISOString() }), now)).toBe(
    "Last backed up: today",
  );
  expect(
    protectionStatusLabel(
      snap({ lastBackupAt: new Date(now.getTime() - day).toISOString() }),
      now,
    ),
  ).toBe("Last backed up: yesterday");
  expect(
    protectionStatusLabel(snap({ lastSyncAt: now.toISOString() }), now),
  ).toBe("Last backed up: not yet · Last synced: today");
  const olderSync = new Date(now.getTime() - 3 * day).toISOString();
  expect(
    protectionStatusLabel(
      snap({ lastBackupAt: now.toISOString(), lastSyncAt: olderSync }),
      now,
    ),
  ).toBe("Last backed up: today");
});

test("persistent storage result is spelled out", () => {
  expect(persistenceResultLabel("granted")).toContain("granted");
  expect(persistenceResultLabel("granted")).toContain("Clearing site data");
  expect(persistenceResultLabel("denied")).toContain("not granted");
  expect(persistenceResultLabel("unsupported")).toContain("not available");
  expect(persistenceResultLabel("pending")).toContain("checking");
});

test("the app wires the prompt, the visible status, and storage.persist()", async () => {
  const main = await Bun.file("src/main.ts").text();
  expect(main).toContain('setAttribute("aria-labelledby", "protect-title")');
  expect(main).toContain("protect-desc protect-later protect-persistence");
  expect(main).toContain("Connect a vault folder");
  expect(main).toContain("Download a backup file");
  expect(main).toContain("Remind me later");
  expect(main).toContain("Import an existing backup");
  expect(main).toContain("data-protect-label");
  expect(main).toContain("data-persistence-label");
  expect(main).toContain("PROTECT_REPROMPT_AFTER_DAYS");
  expect(main).toContain("PROTECT_REPROMPT_AFTER_EDITS");
  expect(main).toContain("navigator.storage");
  expect(main).toContain('protect: "mark-protected"');
  expect(main).toContain('protect: "skip"');
  const style = await Bun.file("src/style.css").text();
  expect(style).toContain(".protect-dialog button:focus-visible");
  expect(style).toContain(".protect-status");
});
