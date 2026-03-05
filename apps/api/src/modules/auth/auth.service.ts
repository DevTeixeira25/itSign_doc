import { sql, useMemory } from "../../db.js";
import { store, findInStore, insertIntoStore } from "../../lib/memory-store.js";
import { hashPassword, verifyPassword, uuid } from "../../lib/crypto.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import type { User } from "@itsign/shared-types";

export async function registerUser(input: {
  organizationName: string;
  name: string;
  email: string;
  password: string;
}): Promise<{ user: User; organizationId: string }> {
  const orgId = uuid();
  const userId = uuid();
  const passwordHash = await hashPassword(input.password);

  if (useMemory) {
    const existing = findInStore("users", (u) => u.email === input.email, 1);
    if (existing.length > 0) throw new ConflictError("E-mail já cadastrado");
    insertIntoStore("organizations", { id: orgId, name: input.organizationName });
    insertIntoStore("users", {
      id: userId,
      organization_id: orgId,
      name: input.name,
      email: input.email,
      password_hash: passwordHash,
    });
  } else {
    const existing = await sql`SELECT id FROM users WHERE email = ${input.email} LIMIT 1`;
    if (existing.length > 0) throw new ConflictError("E-mail já cadastrado");
    await sql.begin(async (tx) => {
      await tx`INSERT INTO organizations (id, name) VALUES (${orgId}, ${input.organizationName})`;
      await tx`INSERT INTO users (id, organization_id, name, email, password_hash) VALUES (${userId}, ${orgId}, ${input.name}, ${input.email}, ${passwordHash})`;
    });
  }

  return {
    user: {
      id: userId,
      organizationId: orgId,
      name: input.name,
      email: input.email,
      createdAt: new Date().toISOString(),
    },
    organizationId: orgId,
  };
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<{ userId: string; organizationId: string; name: string; email: string }> {
  let user: any;

  if (useMemory) {
    const rows = findInStore("users", (u) => u.email === email, 1);
    if (rows.length === 0) throw new NotFoundError("Credenciais inválidas");
    user = rows[0];
  } else {
    const rows = await sql`SELECT id, organization_id, name, email, password_hash FROM users WHERE email = ${email} LIMIT 1`;
    if (rows.length === 0) throw new NotFoundError("Credenciais inválidas");
    user = rows[0];
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw new NotFoundError("Credenciais inválidas");

  return {
    userId: user.id,
    organizationId: user.organization_id,
    name: user.name,
    email: user.email,
  };
}

export async function getUserById(userId: string) {
  if (useMemory) {
    const rows = findInStore("users", (u) => u.id === userId, 1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, organizationId: r.organization_id, name: r.name, email: r.email, createdAt: r.created_at };
  }

  const rows = await sql`SELECT id, organization_id, name, email, created_at FROM users WHERE id = ${userId} LIMIT 1`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, organizationId: r.organization_id, name: r.name, email: r.email, createdAt: r.created_at };
}
