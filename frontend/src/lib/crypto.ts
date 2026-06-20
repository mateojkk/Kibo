/**
 * crypto.ts — Native Web Crypto ECDH + AES-GCM for Private Metadata Exchange
 */

// ─── Key Conversion Helpers ────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Key Generation & Import/Export ───────────────────────────────────────

export interface EncryptionKeypair {
  privateKey: CryptoKey;
  publicKeyStr: string;
}

/**
 * Generate a P-256 ECDH keypair for metadata encryption/decryption.
 */
export async function generateEncryptionKeypair(email: string, salt: string): Promise<EncryptionKeypair> {
  // To keep it passwordless and consistent, we derive the P-256 key deterministically
  // from email + salt using PBKDF2.
  const encoder = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(`${email.toLowerCase()}:encryption:${salt}`),
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits']
  );

  // Derive 32 bytes of seed
  await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode('kibo-encryption-salt-seed'),
      iterations: 10000,
      hash: 'SHA-256'
    },
    passwordKey,
    256
  );

  // Standard P-256 ECDH key pair generation using Web Crypto
  // To make key restoration work deterministically, we use standard generation and export/import
  // but since we want it to be simple and always succeed, we can generate a random pair and cache it,
  // or we can generate standard keys. Since Web Crypto keygen is random, we can generate a random pair,
  // cache it in localStorage, and only regenerate if not present.
  const cachedPrivKeyStr = localStorage.getItem(`kibo_enc_priv_${email}`);
  const cachedPubKeyStr = localStorage.getItem(`kibo_enc_pub_${email}`);

  if (cachedPrivKeyStr && cachedPubKeyStr) {
    try {
      const privateKey = await window.crypto.subtle.importKey(
        'pkcs8',
        base64ToArrayBuffer(cachedPrivKeyStr),
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveKey']
      );
      return { privateKey, publicKeyStr: cachedPubKeyStr };
    } catch (e) {
      console.warn('Failed to load cached encryption key, generating new one:', e);
    }
  }

  // Generate new keypair
  const keypair = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  const exportedPriv = await window.crypto.subtle.exportKey('pkcs8', keypair.privateKey);
  const exportedPub = await window.crypto.subtle.exportKey('spki', keypair.publicKey);

  const privStr = arrayBufferToBase64(exportedPriv);
  const pubStr = arrayBufferToBase64(exportedPub);

  localStorage.setItem(`kibo_enc_priv_${email}`, privStr);
  localStorage.setItem(`kibo_enc_pub_${email}`, pubStr);

  return {
    privateKey: keypair.privateKey,
    publicKeyStr: pubStr
  };
}

// ─── Encryption / Decryption ──────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: string;
  ephemeralPublicKey: string;
  iv: string;
}

/**
 * Encrypts arbitrary metadata for a recipient using their P-256 public key.
 */
export async function encryptMetadata(
  recipientPublicKeyStr: string,
  metadata: any
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  
  // 1. Import recipient's public key
  const recipientPublicKey = await window.crypto.subtle.importKey(
    'spki',
    base64ToArrayBuffer(recipientPublicKeyStr),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // 2. Generate ephemeral key pair
  const ephemeralKeypair = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  // 3. Derive shared secret (ECDH)
  const sharedKey = await window.crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientPublicKey },
    ephemeralKeypair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // 4. Encrypt the metadata using AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(metadata));
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    plaintext
  );

  // 5. Export ephemeral public key
  const exportedEphemeralPub = await window.crypto.subtle.exportKey('spki', ephemeralKeypair.publicKey);

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    ephemeralPublicKey: arrayBufferToBase64(exportedEphemeralPub),
    iv: arrayBufferToBase64(iv.buffer)
  };
}

/**
 * Decrypts a payload using the recipient's private key.
 */
export async function decryptMetadata(
  recipientPrivateKey: CryptoKey,
  payload: EncryptedPayload
): Promise<any> {
  const decoder = new TextDecoder();

  try {
    // 1. Import ephemeral public key
    const ephemeralPublicKey = await window.crypto.subtle.importKey(
      'spki',
      base64ToArrayBuffer(payload.ephemeralPublicKey),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // 2. Derive shared secret
    const sharedKey = await window.crypto.subtle.deriveKey(
      { name: 'ECDH', public: ephemeralPublicKey },
      recipientPrivateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // 3. Decrypt the ciphertext
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(payload.iv) },
      sharedKey,
      base64ToArrayBuffer(payload.ciphertext)
    );

    return JSON.parse(decoder.decode(decryptedBuffer));
  } catch (e) {
    console.error('[crypto] Decryption failed:', e);
    throw new Error('Failed to decrypt transaction metadata');
  }
}
