# SolveStack data model

SolveStack stores one versioned workspace record in IndexedDB under the `workspace` object store and `data` key.

The current persisted format is `schemaVersion: 3`. A workspace contains `sessions` and normalized `attachments`. Session records own entries, hypotheses, tasks, scratchpad text, resolution fields, and metadata (including optional `blueprint` method id). Attachment records may keep an inline data URL and/or an OPFS `blobRef` (`opfs:<attachmentId>`).

`src/migrations.ts` contains the executable migration boundary. Version 1 workspaces upgrade to version 2 (session metadata + timestamps), then to version 3 (optional `blobRef` on attachments). Future versions are rejected without overwriting local data.

## Data safety (P0)

- `lastBackupAt` (ISO string, optional) records the last full backup
  download or encrypted vault export on the workspace record. It is set by
  Backup, by a successful restore or vault import, and by encrypted vault
  export. It survives migration (unknown top-level fields are preserved).
  Absent means "never backed up".
- `localStorage` key `solvestack-protect` stores `{ snoozedAt, editsSinceAnchor }`
  for the protect prompt. `solvestack-folder-meta.lastWriteAt` is the last
  successful vault-folder sync. The dashboard, the session header, and
  Settings show "Last backed up: …", plus a sync time when the folder copy
  is newer. The prompt opens on the first user-created investigation, and
  again after 8 meaningful saves (`PROTECT_REPROMPT_AFTER_EDITS`) or 7 days
  (`PROTECT_REPROMPT_AFTER_DAYS`) while a change is still unbacked-up.
  "Remind me later" snoozes until one of those limits; it is not a permanent
  dismiss. Chrome and Edge on desktop can connect a vault folder. Other
  browsers get a backup file plus Import JSON. `navigator.storage.persist()`
  runs on load and Settings shows granted, denied, or unavailable. Persistent
  storage is not a backup.
- Writes are serialised: `persist()` in `src/main.ts` queues full-workspace
  IndexedDB transactions instead of interleaving them, updates the save
  status in place, and never re-renders. Callers that changed data render
  after awaiting it. Scratchpad keystrokes debounce to one write 500 ms
  after the user pauses. A `beforeunload` guard fires while a write is
  in flight.
- Deletes are undoable for 30 seconds: removing an entry (with its
  evidence) or an evidence attachment shows a toast with Undo instead of
  a blocking `confirm()`. Attachment removal is routed through `main.ts`
  via a `solvestack:remove-attachment` event so the in-memory workspace
  is the single IndexedDB owner — a second writer could otherwise
  resurrect a removed attachment on the next save.
- Settings shows the real quota from `navigator.storage.estimate()` when
  available, falling back to the evidence-only estimate. Large attachments
  prefer the Origin Private File System when the browser supports it.

## Encrypted vault

Settings can export an AES-GCM vault (`format: solvestack-vault`) derived
from a user passphrase via PBKDF2. The passphrase never leaves the browser
except as key material computed locally. Import decrypts then merges with
the same conflict policy as JSON backup restore.

## Agent pack

Session export can produce a redaction-first ZIP for organization-approved
AI tools. Binaries are omitted; see `/agent-adapter/`.

Future migrations must:

1. Read the existing version before changing its shape.
2. Transform records deterministically into the next version.
3. Preserve unknown fields when safe to do so.
4. Reject unsupported future versions without overwriting local data.
5. Keep JSON backup/import compatibility explicit in tests.

The shared browser access boundary is `src/local-store.ts`. UI modules should use its read/write functions instead of opening the database directly.
