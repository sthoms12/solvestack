# SolveStack data model

SolveStack stores one versioned workspace record in IndexedDB under the `workspace` object store and `data` key.

The current persisted format is `schemaVersion: 3`. A workspace contains `sessions` and normalized `attachments`. Session records own entries, hypotheses, tasks, scratchpad text, resolution fields, and metadata (including optional `blueprint` method id). Attachment records may keep an inline data URL and/or an OPFS `blobRef` (`opfs:<attachmentId>`).

`src/migrations.ts` contains the executable migration boundary. Version 1 workspaces upgrade to version 2 (session metadata + timestamps), then to version 3 (optional `blobRef` on attachments). Future versions are rejected without overwriting local data.

## Data safety (P0)

- `lastBackupAt` (ISO string, optional) records the last full backup
  download on the workspace record. It is set by the Backup button, by a
  successful restore or vault import, by encrypted vault export, and survives
  migration (unknown top-level fields are preserved). Absent means "never
  backed up". The dashboard shows a banner while a backup is due (never, or
  7+ days old with real sessions) and Settings shows the same status next to
  the backup controls.
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
- Storage is requested as persistent (`navigator.storage.persist()`) on
  load, best-effort. Settings shows the real quota from
  `navigator.storage.estimate()` when available, falling back to the
  evidence-only estimate. Large attachments prefer the Origin Private File
  System when the browser supports it.

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
