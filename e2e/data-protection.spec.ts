import { readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const SEED_ID = "SS-20260818-001";

async function readWorkspace(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = indexedDB.open("solvestack");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db
            .transaction("workspace", "readonly")
            .objectStore("workspace")
            .get("data");
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            db.close();
            resolve(get.result as Record<string, unknown>);
          };
        };
      }),
  );
}

function comparable(store: Record<string, unknown>, sessionId: string) {
  const sessions = (store.sessions as Array<{ id: string }>) ?? [];
  const attachments = (store.attachments as Array<{ sessionId: string }>) ?? [];
  return JSON.parse(
    JSON.stringify({
      session: sessions.find((session) => session.id === sessionId) ?? null,
      attachments: attachments.filter((item) => item.sessionId === sessionId),
    }),
  );
}

test("export, clear site data, and import restore the investigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /New session/ }).click();
  await page.getByRole("textbox", { name: /happening/i }).fill(
    "Branch DNS lookups time out after the firewall change",
  );
  await page.getByRole("button", { name: "Start session" }).click();

  const protect = page.getByRole("dialog", { name: "Keep a copy outside this browser" });
  await expect(protect).toBeVisible();
  await expect(protect.getByRole("button", { name: "Connect a vault folder" })).toBeVisible();
  await expect(protect.getByRole("button", { name: "Download a backup file" })).toBeVisible();
  await expect(protect.getByRole("button", { name: "Connect a vault folder" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(protect.getByRole("button", { name: "Download a backup file" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(protect.getByRole("button", { name: "Connect a vault folder" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(protect).toBeHidden();
  await expect(page.getByText(/We'll ask again after 8 new edits or 7 days/)).toBeVisible();

  await page.getByLabel("Troubleshooting note").fill("Resolver returns SERVFAIL for the branch zone");
  await page.locator("#attach").setInputFiles({
    name: "resolver.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("gateway queue depth 42"),
  });
  await page.getByRole("button", { name: /^Capture/ }).click();
  await expect(page.getByText("Resolver returns SERVFAIL for the branch zone")).toBeVisible();
  await expect(protect).toBeHidden();
  await expect(page.locator("[data-protect-label]").first()).toContainText("Last backed up: not yet");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator("[data-persistence-label]")).toContainText(
    /Persistent storage: (granted|not granted|not available)/,
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup all data" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  const backupText = await readFile(backupPath!, "utf8");
  await writeFile(test.info().outputPath("solvestack-backup.json"), backupText);

  const before = await readWorkspace(page);
  const created = (before.sessions as Array<{ id: string; problem: string; entries: Array<{ content: string }> }>).find(
    (session) => session.id !== SEED_ID,
  );
  expect(created?.problem).toContain("Branch DNS");
  expect(created?.entries.some((entry) => entry.content.includes("SERVFAIL"))).toBe(true);
  const snapshot = comparable(before, created!.id);

  // deleteDatabase stays blocked while the app holds its connection open.
  // DevTools can drop the origin's storage, including that database.
  const client = await page.context().newCDPSession(page);
  await client.send("Storage.clearDataForOrigin", {
    origin: new URL(page.url()).origin,
    storageTypes: "all",
  });
  await client.detach();
  await page.reload();
  await expect(page.getByRole("heading", { name: "SolveStack", level: 1 })).toBeVisible();
  const cleared = await readWorkspace(page);
  expect(
    (cleared.sessions as Array<{ id: string }>).some((session) => session.id === created!.id),
  ).toBe(false);

  await page.getByRole("button", { name: "Settings" }).click();
  const conflict = new Promise<string>((resolve) => {
    page.once("dialog", (dialog) => {
      const message = dialog.message();
      void dialog.accept().then(() => resolve(message));
    });
  });
  await page.locator("#restore-file").setInputFiles({
    name: "solvestack-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backupText),
  });
  expect(await conflict).toMatch(/conflict/i);
  await expect(page.getByText("Backup restored")).toBeVisible();

  const after = await readWorkspace(page);
  expect(comparable(after, created!.id)).toEqual(snapshot);
  await expect(page.locator("[data-protect-label]").first()).toContainText(/Last backed up: today/);
});

test("vault write and read use a real Chromium directory handle", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const mod = await import("/src/vault-folder.ts");
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("solvestack-vault-e2e", { create: true });
    const first = {
      schemaVersion: 3,
      sessions: [
        {
          id: "SS-E2E",
          title: "Branch DNS",
          entries: [{ id: "entry-1", content: "SERVFAIL" }],
        },
      ],
      attachments: [] as unknown[],
      exportedAt: "2026-11-11T00:00:00.000Z",
    };
    const passphrase = "correct horse battery";
    await mod.writeFolderVault(dir, first, passphrase);
    const reopened = await root.getDirectoryHandle("solvestack-vault-e2e");
    const found = await mod.readFolderVault(reopened);
    if (!found) return { ok: false, reason: "missing vault" };
    const opened = await mod.openFolderVault(found.envelope, passphrase);
    const file = await reopened.getFileHandle("solvestack-vault.json");
    const raw = JSON.parse(await (await file.getFile()).text()) as { format?: string };
    const second = { ...first, exportedAt: "2026-11-11T01:00:00.000Z" };
    await mod.writeFolderVault(reopened, second, passphrase);
    const prevFile = await reopened.getFileHandle("solvestack-vault.prev.json");
    const prev = JSON.parse(await (await prevFile.getFile()).text()) as { createdAt?: string };
    const current = await mod.readFolderVault(reopened);
    const currentPayload = await mod.openFolderVault(current!.envelope, passphrase);
    return {
      ok:
        JSON.stringify(opened) === JSON.stringify(first) &&
        raw.format === "solvestack-vault" &&
        prev.createdAt === found.envelope.createdAt &&
        JSON.stringify(currentPayload) === JSON.stringify(second),
    };
  });
  expect(result.ok).toBe(true);
});
