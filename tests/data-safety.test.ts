import { test, expect } from "bun:test";
import {
  BACKUP_STALE_AFTER_DAYS,
  backupStatus,
  formatBytes,
  formatStorageEstimate,
  UndoHistory,
  UNDO_WINDOW_MS,
} from "../src/data-safety";

const day = 86_400_000;
const now = new Date("2026-11-05T12:00:00.000Z");

test("backup status: never backed up warns only when there is real work", () => {
  expect(backupStatus(undefined, now, 2)).toMatchObject({
    state: "never",
    daysSince: null,
    needsBackup: true,
  });
  expect(backupStatus(undefined, now, 0).needsBackup).toBe(false);
  expect(backupStatus("not-a-date", now, 2).state).toBe("never");
});

test("backup status: current within 7 days, stale at the boundary", () => {
  expect(
    backupStatus(new Date(now.getTime() - 6 * day).toISOString(), now, 1),
  ).toMatchObject({ state: "current", needsBackup: false });
  expect(
    backupStatus(
      new Date(now.getTime() - BACKUP_STALE_AFTER_DAYS * day).toISOString(),
      now,
      1,
    ),
  ).toMatchObject({ state: "stale", daysSince: 7, needsBackup: true });
  expect(backupStatus(now.toISOString(), now, 1).label).toBe(
    "Backed up today",
  );
  expect(
    backupStatus(new Date(now.getTime() - day).toISOString(), now, 1).label,
  ).toBe("Backed up yesterday");
});

test("storage meter: real quota when reported, evidence fallback otherwise", () => {
  const real = formatStorageEstimate(250_000_000, 1_000_000_000, 1_000);
  expect(real.percent).toBe(25);
  expect(real.label).toBe("238.4 MB of 953.7 MB used");
  const fallback = formatStorageEstimate(undefined, undefined, 500_000);
  expect(fallback.percent).toBe(11);
  expect(fallback.label).toContain("browser quota unknown");
  expect(formatBytes(0)).toBe("0 KB");
  expect(formatBytes(1536)).toBe("1.5 KB");
});

test("undo history: only the latest action, only inside the window", () => {
  const history = new UndoHistory<string>();
  history.push("first", 1000);
  history.push("second", 2000);
  expect(history.take(2000 + UNDO_WINDOW_MS)).toBe("second");
  expect(history.take(2000 + UNDO_WINDOW_MS)).toBeUndefined();
  history.push("third", 3000);
  expect(history.take(3000 + UNDO_WINDOW_MS + 1)).toBeUndefined();
  expect(history.pending).toBe(false);
});

test("no blocking alerts in delete/restore flows; conflict confirm kept", async () => {
  const main = await Bun.file("src/main.ts").text();
  expect(main).not.toContain("alert(");
  expect(main).not.toContain('confirm("Delete this entry');
  expect(main).toContain("solvestack:remove-attachment");
  expect(main).toContain("beforeunload");
  expect(main).toContain("schedulePersist()");
  const attachments = await Bun.file(
    "src/attachment-enhancements.ts",
  ).text();
  expect(attachments).not.toContain("confirm(");
  expect(attachments).not.toContain("location.reload()");
  const style = await Bun.file("src/style.css").text();
  expect(style).toContain(".toast-region");
  expect(style).toContain(".backup-banner");
});
