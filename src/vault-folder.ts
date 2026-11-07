import {
  decryptVault,
  encryptVault,
  isVaultEnvelope,
  type VaultEnvelope,
} from "./vault";

/**
 * Vault folder sync (V1): keep the existing encrypted vault file current
 * inside a folder the user picks — typically one already synced by their
 * OneDrive / Google Drive / Dropbox desktop client. SolveStack never
 * talks to those services and holds no tokens; the drive app does the
 * syncing and only ever stores AES-GCM ciphertext.
 *
 * The handle types are structural on purpose: the real
 * FileSystemDirectoryHandle satisfies them, and tests can fake them.
 */

export const VAULT_FILE = "solvestack-vault.json";
export const VAULT_PREV_FILE = "solvestack-vault.prev.json";

export interface FolderFileHandle {
  getFile(): Promise<{ text(): Promise<string>; lastModified: number }>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

export interface FolderDirHandle {
  name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FolderFileHandle>;
  queryPermission?(options: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission?(options: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
}

/** Directory pickers are Chromium-only (Chrome/Edge desktop) today. */
export function folderSyncSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "showDirectoryPicker" in window &&
    typeof indexedDB !== "undefined"
  );
}

/** Show the folder picker; null when the user cancels. */
export async function pickFolder(): Promise<FolderDirHandle | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker: () => Promise<FolderDirHandle>;
    }
  ).showDirectoryPicker;
  try {
    return await picker();
  } catch {
    return null;
  }
}

export async function folderPermission(
  handle: FolderDirHandle,
  request = false,
): Promise<PermissionState> {
  try {
    if (request && handle.requestPermission)
      return await handle.requestPermission({ mode: "readwrite" });
    if (handle.queryPermission)
      return await handle.queryPermission({ mode: "readwrite" });
    return "granted";
  } catch {
    return "denied";
  }
}

/* The handle persists in its own tiny IndexedDB — deliberately NOT the
 * workspace database, so the workspace migration chain stays untouched. */
const FS_DB = "solvestack-fs";
const FS_STORE = "handles";
const FS_KEY = "sync-folder";

function openFsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FS_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FS_STORE))
        request.result.createObjectStore(FS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveFolderHandle(handle: FolderDirHandle): Promise<void> {
  const db = await openFsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FS_STORE, "readwrite");
    tx.objectStore(FS_STORE).put(handle, FS_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadFolderHandle(): Promise<FolderDirHandle | null> {
  try {
    const db = await openFsDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction(FS_STORE, "readonly")
        .objectStore(FS_STORE)
        .get(FS_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return (value as FolderDirHandle) ?? null;
  } catch {
    return null;
  }
}

export async function clearFolderHandle(): Promise<void> {
  try {
    const db = await openFsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FS_STORE, "readwrite");
      tx.objectStore(FS_STORE).delete(FS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Nothing to disconnect if the store is unreachable.
  }
}

async function writeTextFile(
  dir: FolderDirHandle,
  name: string,
  text: string,
): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

async function readTextFile(
  dir: FolderDirHandle,
  name: string,
): Promise<{ text: string; lastModified: number } | null> {
  try {
    const file = await dir.getFileHandle(name);
    const blob = await file.getFile();
    return { text: await blob.text(), lastModified: blob.lastModified };
  } catch {
    return null;
  }
}

/** The folder's current vault envelope, or null when absent/unreadable. */
export async function readFolderVault(
  dir: FolderDirHandle,
): Promise<{ envelope: VaultEnvelope; lastModified: number } | null> {
  const found = await readTextFile(dir, VAULT_FILE);
  if (!found) return null;
  try {
    const parsed: unknown = JSON.parse(found.text);
    if (!isVaultEnvelope(parsed)) return null;
    return { envelope: parsed, lastModified: found.lastModified };
  } catch {
    return null;
  }
}

/**
 * Encrypt the payload and write it as the folder's vault, first rotating
 * the previous vault to solvestack-vault.prev.json — one rolling backup
 * inside the folder, so a bad write mid-sync cannot take the only copy.
 * Returns the envelope written.
 */
export async function writeFolderVault(
  dir: FolderDirHandle,
  payload: unknown,
  passphrase: string,
): Promise<VaultEnvelope> {
  const envelope = await encryptVault(payload, passphrase);
  const previous = await readTextFile(dir, VAULT_FILE);
  if (previous) {
    try {
      await writeTextFile(dir, VAULT_PREV_FILE, previous.text);
    } catch {
      // Rotation is a safety net, never a reason to fail the write.
    }
  }
  await writeTextFile(dir, VAULT_FILE, JSON.stringify(envelope, null, 2));
  return envelope;
}

/** Decrypt a folder vault with the user's passphrase. */
export async function openFolderVault(
  envelope: VaultEnvelope,
  passphrase: string,
): Promise<unknown> {
  return decryptVault(envelope, passphrase);
}

/** A folder vault is "waiting" when it is newer than the last one seen. */
export function folderVaultIsNewer(
  createdAt: string,
  seenCreatedAt: string,
): boolean {
  return Boolean(createdAt) && createdAt > seenCreatedAt;
}
