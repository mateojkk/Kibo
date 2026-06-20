/**
 * keystore.ts — AES-GCM encrypted private key storage
 *
 * Key derivation: PBKDF2-SHA256 (210_000 iterations, per OWASP 2023)
 * Encryption:     AES-256-GCM (256-bit key, random 96-bit IV per write)
 * Storage format: "<base64(salt)>:<base64(iv)>:<base64(ciphertext)>"
 *
 * Session persistence:
 *   After login the derived CryptoKey is stored in IndexedDB with extractable:false.
 *   The browser holds the raw key bytes — JS can use it but never export them.
 *   On refresh we load the CryptoKey + cached blob → decrypt without a password.
 *   On logout we delete the IndexedDB record.
 */

const PBKDF2_ITERS   = 210_000;
const BLOB_KEY       = 'kibo_keystore_blob';
const IDB_DB         = 'kibo_session';
const IDB_STORE      = 'keys';
const IDB_RECORD     = 'session_key';

// ─── Helpers ──────────────────────────────────────────────────────────────

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function unb64(s: string): ArrayBuffer {
  const binStr = atob(s);
  const buf = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) buf[i] = binStr.charCodeAt(i);
  return buf.buffer;
}

// ─── PBKDF2 key derivation ────────────────────────────────────────────────

/** Derives an AES-GCM key from a password + salt. extractable controls whether
 *  the result can be stored in IndexedDB for session restoration. */
async function deriveKey(
  password: string,
  saltBuf: ArrayBuffer,
  extractable = false,
): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBuf, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    extractable,   // false = browser holds key bytes, JS can't read them
    ['encrypt', 'decrypt'],
  );
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Store the derived CryptoKey in IndexedDB (non-extractable = safe). */
export async function saveSessionKey(key: CryptoKey): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(key, IDB_RECORD);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Load the stored CryptoKey, or null if none. */
export async function loadSessionKey(): Promise<CryptoKey | null> {
  try {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_RECORD);
      req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Delete the stored CryptoKey (call on logout / destroy). */
export async function clearSessionKey(): Promise<void> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx  = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_RECORD);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve(); // best-effort
    });
  } catch {
    // ignore
  }
}

// ─── Keystore blob cache (localStorage) ──────────────────────────────────

export function keystoreExists(): boolean {
  return !!sessionStorage.getItem(BLOB_KEY);
}

/** Cache a blob fetched from the server so restore works offline too. */
export function cacheKeystore(blob: string): void {
  sessionStorage.setItem(BLOB_KEY, blob);
}

/** Get the locally cached keystore blob. */
export function getCachedKeystore(): string | null {
  return sessionStorage.getItem(BLOB_KEY);
}

/** Remove local keystore cache. */
export function clearKeystore(): void {
  sessionStorage.removeItem(BLOB_KEY);
}

// ─── Public crypto API ────────────────────────────────────────────────────

/**
 * Encrypt a private key with the given password and return the storable blob.
 */
export async function encryptKey(privateKey: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)).buffer;
  const iv   = crypto.getRandomValues(new Uint8Array(12)).buffer;
  const key  = await deriveKey(password, salt);
  const ct   = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(privateKey),
  );
  return `${b64(salt)}:${b64(iv)}:${b64(ct)}`;
}

/**
 * Decrypt a keystore blob with the given password.
 * Also persists the derived CryptoKey in IndexedDB for session restoration.
 * Throws 'wrong password' on authentication failure.
 */
export async function decryptKey(blob: string, password: string): Promise<string> {
  const parts = blob.split(':');
  if (parts.length !== 3) throw new Error('malformed keystore');
  const [s, i, c] = parts;
  // extractable:false — browser holds the key, JS cannot read bytes
  const key = await deriveKey(password, unb64(s), false);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(i) }, key, unb64(c));
  } catch {
    throw new Error('wrong password');
  }
  // Persist the derived key + blob so the next page load can restore without password
  cacheKeystore(blob);
  saveSessionKey(key).catch(() => {}); // fire-and-forget, non-critical
  return new TextDecoder().decode(plain);
}

/**
 * Decrypt using only the stored IndexedDB CryptoKey (no password needed).
 * Returns null if no session key exists or decryption fails.
 */
export async function decryptWithSessionKey(blob: string): Promise<string | null> {
  const key = await loadSessionKey();
  if (!key) return null;
  const parts = blob.split(':');
  if (parts.length !== 3) return null;
  const [, i, c] = parts;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(i) },
      key,
      unb64(c),
    );
    return new TextDecoder().decode(plain);
  } catch {
    // Session key is stale (e.g. password was changed) — clear it
    await clearSessionKey();
    return null;
  }
}
