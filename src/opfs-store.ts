const ROOT = "solvestack-evidence";

async function evidenceDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ROOT, { create: true });
}

export function canUseOpfs() {
  return typeof navigator !== "undefined" && !!navigator.storage?.getDirectory;
}

/** Persist an attachment body in OPFS; returns a stable blobRef key. */
export async function putEvidenceBlob(
  attachmentId: string,
  data: Blob | ArrayBuffer | Uint8Array,
): Promise<string> {
  if (!canUseOpfs()) throw new Error("OPFS is not available in this browser.");
  const dir = await evidenceDir();
  const handle = await dir.getFileHandle(attachmentId, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
  return `opfs:${attachmentId}`;
}

export async function readEvidenceBlob(
  blobRef: string,
): Promise<ArrayBuffer | null> {
  if (!blobRef.startsWith("opfs:")) return null;
  if (!canUseOpfs()) return null;
  const attachmentId = blobRef.slice("opfs:".length);
  try {
    const dir = await evidenceDir();
    const handle = await dir.getFileHandle(attachmentId);
    const file = await handle.getFile();
    return file.arrayBuffer();
  } catch {
    return null;
  }
}

export async function deleteEvidenceBlob(blobRef: string): Promise<void> {
  if (!blobRef.startsWith("opfs:") || !canUseOpfs()) return;
  const attachmentId = blobRef.slice("opfs:".length);
  try {
    const dir = await evidenceDir();
    await dir.removeEntry(attachmentId);
  } catch {
    /* missing is fine */
  }
}

export async function dataUrlFromBlobRef(
  blobRef: string,
  mimeType: string,
): Promise<string | null> {
  const buffer = await readEvidenceBlob(blobRef);
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mimeType || "application/octet-stream"};base64,${btoa(binary)}`;
}

export function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const raw = atob(dataUrl.split(",")[1] || "");
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}
