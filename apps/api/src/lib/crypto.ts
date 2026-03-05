import { randomBytes, createHash } from "node:crypto";

/** Generate a cryptographically random hex token */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** SHA-256 hash of a Buffer or string, returned as hex */
export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Hash a plain password using built-in scrypt (no native add-on needed) */
export async function hashPassword(password: string): Promise<string> {
  const { scrypt, randomBytes } = await import("node:crypto");
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16).toString("hex");
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/** Verify a password against a scrypt hash */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const { scrypt } = await import("node:crypto");
  const [salt, key] = hash.split(":");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString("hex") === key);
    });
  });
}

/** Generate a v4-style UUID using Node built-in */
export function uuid(): string {
  return crypto.randomUUID();
}
