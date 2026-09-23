import { createStore, get as idbGet, set as idbSet } from "idb-keyval";

const cryptoStore = createStore("pipeline-crypto", "keyval");
const KEY_NAME = "app-key-v1";
const ALGO = "AES-GCM";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Envelope-encrypt a UTF-8 string with AES-GCM. The key is generated once,
 * stored in its own IndexedDB store, and re-used across sessions. This
 * protects health data at rest against disk/copy artifacts on shared machines
 * (the realistic threat model for these district computers) without the
 * user-friction of passphrases.
 *
 * Format: "v1.<ivB64>.<cipherB64>"
 */
export async function encryptString(plain: string): Promise<string> {
  const key = await getAppKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoder.encode(plain) as unknown as BufferSource,
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(cipher))}`;
}

export async function decryptString(payload: string): Promise<string> {
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported encrypted payload format.");
  }
  const key = await getAppKey();
  const iv = fromB64(parts[1]);
  const cipher = fromB64(parts[2]);
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher as unknown as BufferSource);
  return decoder.decode(plain);
}

export async function encryptBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const key = await getAppKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, key, bytes as BufferSource);
  const out = new Uint8Array(12 + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), 12);
  return out;
}

export async function decryptBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const key = await getAppKey();
  const iv = bytes.slice(0, 12);
  const cipher = bytes.slice(12);
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher as unknown as BufferSource);
  return new Uint8Array(plain);
}

let cachedKey: CryptoKey | null = null;

async function getAppKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const existing = await idbGet<ArrayBuffer>(KEY_NAME, cryptoStore);
  if (existing) {
    cachedKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(existing),
      { name: ALGO },
      false,
      ["encrypt", "decrypt"],
    );
    return cachedKey;
  }
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const raw = await crypto.subtle.exportKey("raw", key);
  await idbSet(KEY_NAME, raw, cryptoStore);
  cachedKey = key;
  return key;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}