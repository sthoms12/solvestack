# SolveStack data model

SolveStack stores one versioned workspace record in IndexedDB under the `workspace` object store and `data` key.

The current persisted format is `schemaVersion: 2`. A workspace contains `sessions` and normalized `attachments`. Session records own entries, hypotheses, tasks, scratchpad text, resolution fields, and metadata. Attachment records retain the original data URL and relationship IDs.

`src/migrations.ts` contains the executable migration boundary. Version 1 workspaces upgrade deterministically to version 2 by adding session metadata plus entry and hypothesis creation/update timestamps. Future versions are rejected without overwriting local data.

Future migrations must:

1. Read the existing version before changing its shape.
2. Transform records deterministically into the next version.
3. Preserve unknown fields when safe to do so.
4. Reject unsupported future versions without overwriting local data.
5. Keep JSON backup/import compatibility explicit in tests.

The shared browser access boundary is `src/local-store.ts`. UI modules should use its read/write functions instead of opening the database directly.
