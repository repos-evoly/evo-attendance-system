/**
 * Password hashing for the auth Route Handlers (Node.js runtime only).
 *
 * Uses Node's built-in `scrypt`, so no extra dependency is needed. The stored
 * format is `scrypt$N$r$p$salt$key`, with the salt and the derived key in
 * base64. `scripts/create-admin.cjs` writes the same format.
 */

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 };

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

/** Hashes a plaintext password for storage. The plaintext is never persisted. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS);

  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/** Constant-time verification of a plaintext password against a stored hash. */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, salt, key] = parts;

  if (!n || !r || !p || !salt || !key) return false;

  const N = Number(n);
  const rValue = Number(r);
  const pValue = Number(p);

  if (!Number.isInteger(N) || !Number.isInteger(rValue) || !Number.isInteger(pValue)) {
    return false;
  }

  const expectedKey = Buffer.from(key, "base64");

  if (expectedKey.length === 0) return false;

  try {
    const actualKey = await scrypt(password, Buffer.from(salt, "base64"), expectedKey.length, {
      N,
      r: rValue,
      p: pValue,
    });

    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
