const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const VAULT_FORMAT = "solvestack-vault" as const;
export const VAULT_VERSION = 1;

export type VaultEnvelope = {
  format: typeof VAULT_FORMAT;
  version: typeof VAULT_VERSION;
  kdf: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: string;
};

const iterations = 210_000;

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    input.format === VAULT_FORMAT &&
    input.version === VAULT_VERSION &&
    input.kdf === "PBKDF2" &&
    typeof input.salt === "string" &&
    typeof input.iv === "string" &&
    typeof input.ciphertext === "string"
  );
}

/** Encrypt a portable workspace JSON payload with a user-held passphrase. */
export async function encryptVault(
  payload: unknown,
  passphrase: string,
): Promise<VaultEnvelope> {
  if (!passphrase || passphrase.length < 8)
    throw new Error("Passphrase must be at least 8 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(payload)),
  );
  return {
    format: VAULT_FORMAT,
    version: VAULT_VERSION,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    createdAt: new Date().toISOString(),
  };
}

export async function decryptVault(
  envelope: VaultEnvelope,
  passphrase: string,
): Promise<unknown> {
  if (!isVaultEnvelope(envelope))
    throw new Error("Unsupported or corrupt SolveStack vault.");
  if (!passphrase) throw new Error("Passphrase required.");
  const key = await deriveKey(passphrase, fromBase64(envelope.salt));
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) },
      key,
      fromBase64(envelope.ciphertext),
    );
    return JSON.parse(decoder.decode(plain));
  } catch {
    throw new Error("Vault decrypt failed — check the passphrase.");
  }
}
