# Vault sync and backup round trip

SolveStack keeps the working copy in IndexedDB. Creating an investigation asks for a backup file or, in Chrome and Edge on desktop, a vault folder. "Remind me later" comes back after 8 saved changes or 7 days (`PROTECT_REPROMPT_AFTER_EDITS` and `PROTECT_REPROMPT_AFTER_DAYS` in `src/protect-data.ts`). Clearing site data still removes the browser copy. Persistent storage is requested with `navigator.storage.persist()` and Settings shows whether it was granted. That grant is not a backup.

Nothing here was run on a physical Windows or macOS machine, and Firefox and Safari were not launched. The native folder picker (`showDirectoryPicker`) was not driven: headless Chromium cannot accept that operating-system dialog.

## What was automated

Run from this repo on Linux, Bun 1.4.4, Playwright 1.65 with Chromium 158.0.8127.18.

Prompt rules (`bun test tests/protect-data.test.ts`):

- The seeded example does not open the prompt. The first user-created investigation does.
- "Remind me later" hides the prompt until 8 new saves or 7 days. It does not dismiss it permanently.
- A snooze beats an older stale backup until the snooze itself expires.
- A fresh backup stays quiet. Eight new saves ask again. Seven days ask again only when the workspace changed after that backup.
- A newer vault-folder sync counts as protection. The status line reads `Last backed up: …`, and adds `Last synced: …` when the folder copy is newer.

Vault file on a real temp directory (`bun test tests/vault-folder.test.ts`):

- A handle shim backed by Node `fs` wrote `solvestack-vault.json` under `os.tmpdir()`, read those bytes back from disk, and decrypted them to the same payload.
- This shim is not the browser File System Access API. It implements the same `getFileHandle` / `createWritable` shape `writeFolderVault` already uses.

Browser round trip (`bun run test:e2e`, Playwright, Chromium only):

```
✓ export, clear site data, and import restore the investigation (758ms)
✓ vault write and read use a real Chromium directory handle (281ms)
2 passed
```

The export test, in the real app:

1. Created an investigation, dismissed the protect dialog with Escape (keyboard), and confirmed focus moved between the dialog's actions with Tab.
2. Captured a note and a small text attachment.
3. Downloaded Backup all data.
4. Cleared the origin's storage (IndexedDB, local storage, and the rest) through Chrome DevTools and reloaded.
5. Imported the file. The user-created session and its attachment were deep-equal to the copy read from IndexedDB before the clear. The seeded example's id conflicts and the existing example is kept, which is the app's normal import rule.
6. Settings showed `Last backed up: today` and a finished persistent-storage line (granted, not granted, or not available — not the "checking" placeholder).

The vault test did not click "Connect a vault folder". It called `writeFolderVault` and `readFolderVault` — the same functions the app uses — with a real Chromium `FileSystemDirectoryHandle` from `navigator.storage.getDirectory()` (the origin private file system). That is the File System Access API, in a directory Chromium keeps inside the Playwright profile. The test wrote the vault, read it back through a second handle, decrypted it, wrote a second generation, and checked that `solvestack-vault.prev.json` held the first envelope. It does not prove the operating-system folder picker, and the files are not a plain folder you can open in Finder or Explorer.

`bun test tests` after `bun run build`: 101 pass, 0 fail. `bun run test:e2e`: 2 pass, 0 fail.

## Manual checklist

Chrome or Edge on a desktop you control (Windows or macOS):

1. Open the app, create an investigation, and confirm the protect dialog appears. Tab through Connect a vault folder, Download a backup file, Import an existing backup, and Remind me later. Escape should close it and say it will ask again.
2. Connect a vault folder. Pick an empty folder that your drive app already syncs, if you want a second machine to see it. Set a passphrase of at least 8 characters.
3. Add a note. Wait a few seconds. Confirm `solvestack-vault.json` appears in that folder and the app shows a last-synced time.
4. Reload the page. Unlock the folder when asked. The note should still be there.
5. Clear site data for the origin, reload, and reconnect the same folder with the same passphrase. Review the vault and confirm the note is back. SolveStack does not upload the file; the drive app, if you use one, is what moves it.
6. Disconnect the folder. Download a backup from Settings. Clear site data again. Import that JSON. The investigation should match, including any small attachment you added.

Firefox or Safari:

1. Create an investigation. The dialog should offer a backup file and not a vault folder.
2. Download the backup. Clear site data. Import JSON from Settings. The investigation, including a small text attachment if you added one, should match.
3. Settings should show the persistent-storage result for that browser, or that persistent storage is not available. Either way, clearing site data still removes the browser copy.

Stop if a reload loses a note you did not back up or sync, if import drops an attachment, or if the prompt never returns after you choose Remind me later and then make eight saved changes.
