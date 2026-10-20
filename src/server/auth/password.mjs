// Password hashing with scrypt from node:crypto (no native dependencies, works on any host).
// Plain JavaScript so the database CLI (scripts/db.mjs) shares the exact same code.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

/**
 * @param {string} password
 * @param {Buffer} salt
 * @param {number} keylen
 * @param {{ N: number, r: number, p: number }} cost
 * @returns {Promise<Buffer>}
 */
function derive(password, salt, keylen, cost) {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keylen, { ...cost, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/**
 * Hash a password for storage in app_users.password_hash.
 * @param {string} password
 * @returns {Promise<string>} `scrypt$N$r$p$<salt>$<hash>` (base64)
 */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, KEYLEN, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

/**
 * Constant-time check of a password against a stored hash. Unknown formats never match.
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  if (expected.length === 0) return false;
  const actual = await derive(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}
