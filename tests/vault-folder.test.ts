import { describe, expect, test } from "bun:test";
import {
  folderVaultIsNewer,
  openFolderVault,
  readFolderVault,
  writeFolderVault,
  VAULT_FILE,
  VAULT_PREV_FILE,
  type FolderDirHandle,
} from "../src/vault-folder";
import { isVaultEnvelope } from "../src/vault";

/** Minimal in-memory File System Access stand-in. */
class FakeDir implements FolderDirHandle {
  name = "FakeSync";
  files = new Map<string, { text: string; lastModified: number }>();
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create)
        throw new DOMException("missing", "NotFoundError");
      this.files.set(name, { text: "", lastModified: 0 });
    }
    const record = this.files.get(name)!;
    const files = this.files;
    return {
      getFile: async () => ({
        text: async () => files.get(name)!.text,
        lastModified: files.get(name)!.lastModified,
      }),
      createWritable: async () => ({
        write: async (data: string) => {
          record.text = data;
          record.lastModified = Date.now();
        },
        close: async () => {},
      }),
    };
  }
}

const PASS = "correct horse battery";

describe("vault folder sync primitives", () => {
  test("a written vault reads back and decrypts to the payload", async () => {
    const dir = new FakeDir();
    const payload = { sessions: [{ id: "S1" }], exportedAt: "t0" };
    const envelope = await writeFolderVault(dir, payload, PASS);
    expect(isVaultEnvelope(envelope)).toBe(true);
    const found = await readFolderVault(dir);
    expect(found?.envelope.createdAt).toBe(envelope.createdAt);
    expect(await openFolderVault(found!.envelope, PASS)).toEqual(payload);
  });

  test("the second write rotates the first vault to .prev", async () => {
    const dir = new FakeDir();
    const first = await writeFolderVault(dir, { n: 1 }, PASS);
    await writeFolderVault(dir, { n: 2 }, PASS);
    const prev = JSON.parse(dir.files.get(VAULT_PREV_FILE)!.text);
    expect(isVaultEnvelope(prev)).toBe(true);
    expect(prev.createdAt).toBe(first.createdAt);
    const current = await readFolderVault(dir);
    expect(await openFolderVault(current!.envelope, PASS)).toEqual({ n: 2 });
    expect(dir.files.has(VAULT_FILE)).toBe(true);
  });

  test("an absent vault reads as null, and a wrong passphrase fails", async () => {
    const dir = new FakeDir();
    expect(await readFolderVault(dir)).toBeNull();
    await writeFolderVault(dir, { n: 1 }, PASS);
    const found = await readFolderVault(dir);
    await expect(
      openFolderVault(found!.envelope, "wrong passphrase"),
    ).rejects.toThrow();
  });

  test("newer detection compares envelope creation times", () => {
    expect(folderVaultIsNewer("2026-11-06T10:00:00Z", "2026-11-06T09:00:00Z")).toBe(true);
    expect(folderVaultIsNewer("2026-11-06T09:00:00Z", "2026-11-06T09:00:00Z")).toBe(false);
    expect(folderVaultIsNewer("2026-11-06T09:00:00Z", "")).toBe(true);
    expect(folderVaultIsNewer("", "2026-11-06T09:00:00Z")).toBe(false);
  });
});
