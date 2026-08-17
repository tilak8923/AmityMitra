/**
 * crypto.ts — credential-at-rest encryption.
 * -----------------------------------------------------------------------------
 * NEVER store user passwords (or saved session cookies) in plain text.
 *
 * Each secret is encrypted with AES-256-GCM using a 32-byte master key supplied
 * via the CREDENTIAL_MASTER_KEY env var (base64). GCM gives us confidentiality
 * AND integrity (tamper detection). A fresh random IV is used per encryption.
 *
 * The stored string format is:  v1.<ivB64>.<tagB64>.<cipherB64>
 *
 * Generate a master key once and keep it OUT of the repo (env / secret manager):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * -----------------------------------------------------------------------------
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

function masterKey(): Buffer {
  const b64 = process.env.CREDENTIAL_MASTER_KEY;
  if (!b64) {
    throw new Error(
      'CREDENTIAL_MASTER_KEY is not set. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(`CREDENTIAL_MASTER_KEY must decode to 32 bytes, got ${key.length}.`);
  }
  return key;
}

/** Encrypt a UTF-8 secret. Returns an opaque string safe to store in a DB column. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce is the GCM standard
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join('.');
}

/** Decrypt a value produced by encryptSecret. Throws if tampered or wrong key. */
export function decryptSecret(stored: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed ciphertext (expected v1.iv.tag.cipher).');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(), // throws if the auth tag doesn't verify
  ]);
  return dec.toString('utf8');
}

/** Constant-time string compare (for tokens / API keys, not passwords). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
