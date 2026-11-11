// When to ask the user to protect the workspace.
//
// Pure and DOM-free so the first-run and periodic rules can be tested
// without IndexedDB. The app stores the snooze and edit count in
// localStorage, the last backup time on the workspace record, and the
// last vault-folder sync time in the folder meta record.

/** Ask again this many days after a snooze, or after a stale backup/sync that no longer matches the workspace. */
export const PROTECT_REPROMPT_AFTER_DAYS = 7;

/** Ask again after this many meaningful saves since the last backup, sync, or snooze. */
export const PROTECT_REPROMPT_AFTER_EDITS = 8;

const DAY_MS = 86_400_000;

export type PersistenceGrant = "granted" | "denied" | "unsupported" | "pending";

export type ProtectReason = "first-save" | "stale-days" | "edit-count" | "none";

export type ProtectSnapshot = {
  /** At least one investigation the user created (the seeded example does not count). */
  hasRealWork: boolean;
  lastBackupAt?: string | null;
  lastSyncAt?: string | null;
  /** When the user chose "remind me later". */
  snoozedAt?: string | null;
  /** Meaningful saves since the later of the last protection and the last snooze. */
  editsSinceAnchor: number;
  /**
   * A real session's updatedAt is newer than the latest backup or sync.
   * Covers changes made before this counter existed.
   */
  changedSinceProtection: boolean;
};

export type ProtectDecision = {
  show: boolean;
  reason: ProtectReason;
};

export function validIso(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/** Latest valid timestamp, or null when none parse. Ties keep the later argument. */
export function latestIso(
  ...values: Array<string | null | undefined>
): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const value of values) {
    const iso = validIso(value);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (ms >= bestMs) {
      best = iso;
      bestMs = ms;
    }
  }
  return best;
}

function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
}

function editCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * Whether the protect prompt should be open.
 *
 * - First real investigation, with no backup, sync, or snooze: show immediately.
 * - "Remind me later" hides it until PROTECT_REPROMPT_AFTER_EDITS new saves
 *   or PROTECT_REPROMPT_AFTER_DAYS, whichever comes first. A snooze is not permanent.
 * - After a backup or sync, show again after that many new saves, or after
 *   that many days when the workspace has changed since the copy was made.
 */
export function protectDecision(
  snapshot: ProtectSnapshot,
  now: Date = new Date(),
): ProtectDecision {
  if (!snapshot.hasRealWork) return { show: false, reason: "none" };

  const protectedAt = latestIso(snapshot.lastSyncAt, snapshot.lastBackupAt);
  const snoozedAt = validIso(snapshot.snoozedAt);
  const edits = editCount(snapshot.editsSinceAnchor);

  if (!protectedAt && !snoozedAt) return { show: true, reason: "first-save" };

  if (edits >= PROTECT_REPROMPT_AFTER_EDITS)
    return { show: true, reason: "edit-count" };

  const snoozeActive = Boolean(
    snoozedAt && (!protectedAt || Date.parse(snoozedAt) > Date.parse(protectedAt)),
  );
  if (snoozeActive && snoozedAt) {
    if (daysSince(snoozedAt, now) >= PROTECT_REPROMPT_AFTER_DAYS)
      return { show: true, reason: "stale-days" };
    return { show: false, reason: "none" };
  }

  if (
    protectedAt &&
    daysSince(protectedAt, now) >= PROTECT_REPROMPT_AFTER_DAYS &&
    (edits > 0 || snapshot.changedSinceProtection)
  ) {
    return { show: true, reason: "stale-days" };
  }

  return { show: false, reason: "none" };
}

function formatWhen(iso: string, now: Date): string {
  const days = daysSince(iso, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** Visible status. Always starts with "Last backed up:". Adds a sync clause when the folder copy is newer. */
export function protectionStatusLabel(
  snapshot: Pick<ProtectSnapshot, "lastBackupAt" | "lastSyncAt">,
  now: Date = new Date(),
): string {
  const backup = validIso(snapshot.lastBackupAt);
  const sync = validIso(snapshot.lastSyncAt);
  const backupText = backup ? formatWhen(backup, now) : "not yet";
  if (!sync || (backup && Date.parse(backup) >= Date.parse(sync)))
    return `Last backed up: ${backupText}`;
  return `Last backed up: ${backupText} · Last synced: ${formatWhen(sync, now)}`;
}

export function persistenceResultLabel(grant: PersistenceGrant): string {
  switch (grant) {
    case "granted":
      return "Persistent storage: granted. This browser is less likely to evict the site under pressure. Clearing site data still removes the workspace.";
    case "denied":
      return "Persistent storage: not granted. A backup file or vault folder is the copy that survives cleanup.";
    case "unsupported":
      return "Persistent storage: not available in this browser. Download a backup file to keep a copy.";
    default:
      return "Persistent storage: checking…";
  }
}
