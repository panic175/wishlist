import crypto from 'crypto';

/**
 * Password hashing helpers. Uses Node's built-in scrypt (a memory-hard KDF)
 * with a per-password random salt so the same password never hashes twice and
 * offline brute-force of a leaked hash is expensive.
 *
 * Stored format: `scrypt$N$r$p$salt$hash`
 */

const SCRYPT_KEYLEN = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nStr, rStr, pStr, salt, keyHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N <= 0 ||
    r <= 0 ||
    p <= 0
  ) {
    return false;
  }

  const expectedKey = Buffer.from(keyHex, 'hex');
  if (expectedKey.length === 0) return false;

  const actualKey = crypto.scryptSync(password, salt, expectedKey.length, { N, r, p });
  return crypto.timingSafeEqual(actualKey, expectedKey);
}

/**
 * Constant-time string comparison: hashes both sides first so neither the
 * values nor their lengths leak through timing differences.
 */
export function safeEqualString(a: string, b: string): boolean {
  const aHash = crypto.createHash('sha256').update(a).digest();
  const bHash = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(aHash, bHash);
}