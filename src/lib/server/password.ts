import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "scrypt";
const HASH_KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, HASH_KEY_LENGTH).toString("hex");

  return `${HASH_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, salt, existingHash] = storedHash.split("$");

  if (prefix !== HASH_PREFIX || !salt || !existingHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, HASH_KEY_LENGTH);
  const existingHashBuffer = Buffer.from(existingHash, "hex");

  if (derivedHash.length !== existingHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedHash, existingHashBuffer);
}

export function generateTemporaryPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
