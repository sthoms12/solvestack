// Data-safety helpers for SolveStack (P0 batch).
//
// Pure, DOM-free logic lives here so it can be unit-tested without
// IndexedDB or a browser. The only DOM touch is showToast(), which is
// guarded for non-browser environments (tests import this module).

export const BACKUP_STALE_AFTER_DAYS = 7;
export const UNDO_WINDOW_MS = 30_000;

export type BackupState = "never" | "current" | "stale";

export type BackupStatus = {
  state: BackupState;
  /** Whole days since the last backup, or null when never backed up. */
  daysSince: number | null;
  label: string;
  /** True when the user has real sessions and a backup is due. */
  needsBackup: boolean;
};

/**
 * Describe backup freshness. `userSessionCount` counts real sessions
 * (the seeded demo session does not count): with no real work yet,
 * "never backed up" is not a warning.
 */
export function backupStatus(
  lastBackupAt: string | null | undefined,
  now: Date = new Date(),
  userSessionCount = 1,
): BackupStatus {
  const parsed = lastBackupAt ? new Date(lastBackupAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return {
      state: "never",
      daysSince: null,
      label: "Never backed up",
      needsBackup: userSessionCount > 0,
    };
  }
  const daysSince = Math.max(
    0,
    Math.floor((now.getTime() - parsed.getTime()) / 86_400_000),
  );
  if (daysSince >= BACKUP_STALE_AFTER_DAYS) {
    return {
      state: "stale",
      daysSince,
      label: `Last backup ${daysSince} day${daysSince === 1 ? "" : "s"} ago`,
      needsBackup: true,
    };
  }
  return {
    state: "current",
    daysSince,
    label:
      daysSince === 0
        ? "Backed up today"
        : daysSince === 1
          ? "Backed up yesterday"
          : `Backed up ${daysSince} days ago`,
    needsBackup: false,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}

export type StorageMeter = {
  /** 0-100, used to fill the Settings storage bar. */
  percent: number;
  label: string;
};

/**
 * Real quota when the browser reports it (navigator.storage.estimate),
 * otherwise the previous evidence-only estimate as a fallback so the
 * bar never pretends to know the quota when it does not.
 */
export function formatStorageEstimate(
  usage: number | undefined,
  quota: number | undefined,
  evidenceBytes: number,
): StorageMeter {
  if (quota && quota > 0) {
    return {
      percent: Math.min(100, Math.max(0, ((usage ?? 0) / quota) * 100)),
      label: `${formatBytes(usage ?? 0)} of ${formatBytes(quota)} used`,
    };
  }
  return {
    percent: Math.min(96, (evidenceBytes / 1_000_000) * 10 + 6),
    label: `${formatBytes(evidenceBytes)} evidence · browser quota unknown`,
  };
}

/**
 * A single-slot undo history: only the most recent destructive action
 * can be undone, and only inside UNDO_WINDOW_MS. Pushing a new action
 * expires any earlier one.
 */
export class UndoHistory<T> {
  private current: { item: T; atMs: number } | null = null;

  push(item: T, nowMs: number = Date.now()): void {
    this.current = { item, atMs: nowMs };
  }

  /** Take the pending undo if it is still inside the window, else clear it. */
  take(nowMs: number = Date.now()): T | undefined {
    if (!this.current) return undefined;
    if (nowMs - this.current.atMs > UNDO_WINDOW_MS) {
      this.current = null;
      return undefined;
    }
    const { item } = this.current;
    this.current = null;
    return item;
  }

  clear(): void {
    this.current = null;
  }

  get pending(): boolean {
    return this.current !== null;
  }
}

export type ToastOptions = {
  actionLabel?: string;
  onAction?: () => void;
  /** Default 5s; undo toasts pass 30s; 0 = sticky (no auto-dismiss). */
  durationMs?: number;
};

/** Non-blocking status/undo toast. Lives outside #app so re-renders keep it. */
export function showToast(message: string, options: ToastOptions = {}): void {
  if (typeof document === "undefined") return;
  let region = document.querySelector<HTMLElement>("#toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(text);
  const remove = () => toast.remove();
  if (options.actionLabel) {
    const button = document.createElement("button");
    button.className = "toast-action";
    button.type = "button";
    button.textContent = options.actionLabel;
    button.addEventListener("click", () => {
      remove();
      options.onAction?.();
    });
    toast.append(button);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "toast-dismiss";
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "Dismiss notification");
  dismiss.textContent = "×";
  dismiss.addEventListener("click", remove);
  toast.append(dismiss);
  region.append(toast);
  if (options.durationMs !== 0)
    window.setTimeout(remove, options.durationMs ?? 5000);
}
