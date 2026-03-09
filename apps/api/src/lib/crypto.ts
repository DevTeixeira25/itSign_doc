import { randomBytes, createHash, createHmac } from "node:crypto";

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

/**
 * Generate HMAC-SHA256 — used for signature integrity proofs.
 * Links signer identity + document hash + timestamp into an unforgeable chain.
 */
export function hmacSha256(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Generate a human-readable verification code (e.g. "ITSN-A3F8-BC12-D9E4").
 * Derived deterministically from envelope + certificate hash so it's reproducible.
 */
export function generateVerificationCode(envelopeId: string, certHash: string): string {
  const hash = sha256(`${envelopeId}:${certHash}`);
  const parts = [
    "ITSN",
    hash.slice(0, 4).toUpperCase(),
    hash.slice(4, 8).toUpperCase(),
    hash.slice(8, 12).toUpperCase(),
  ];
  return parts.join("-");
}
