import { sql, useMemory } from "../../db.js";
import { findInStore, insertIntoStore, updateInStore } from "../../lib/memory-store.js";
import { uuid } from "../../lib/crypto.js";
import { ConflictError } from "../../lib/errors.js";
import type { User } from "@itsign/shared-types";

export async function registerUser(input: {
  organizationName: string;
  name: string;
  email: string;
  firebaseUid: string;
}): Promise<{ user: User; organizationId: string }> {
  const orgId = uuid();
  const userId = uuid();

  if (useMemory) {
    const existing = findInStore("users", (u) => u.email === input.email || u.firebase_uid === input.firebaseUid, 1);
    if (existing.length > 0) throw new ConflictError("E-mail já cadastrado");
    insertIntoStore("organizations", { id: orgId, name: input.organizationName });
    insertIntoStore("users", {
      id: userId,
      organization_id: orgId,
      name: input.name,
      email: input.email,
      firebase_uid: input.firebaseUid,
      created_at: new Date().toISOString(),
    });
  } else {
    const existing = await sql`SELECT id FROM users WHERE email = ${input.email} OR firebase_uid = ${input.firebaseUid} LIMIT 1`;
    if (existing.length > 0) throw new ConflictError("E-mail já cadastrado");
    await sql.begin(async (tx) => {
      await tx`INSERT INTO organizations (id, name) VALUES (${orgId}, ${input.organizationName})`;
      await tx`INSERT INTO users (id, organization_id, name, email, firebase_uid) VALUES (${userId}, ${orgId}, ${input.name}, ${input.email}, ${input.firebaseUid})`;
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

export async function updateUser(userId: string, input: { name?: string }) {
  if (useMemory) {
    const rows = findInStore("users", (u) => u.id === userId, 1);
    if (rows.length === 0) return null;
    const updated = { ...rows[0], ...input };
    updateInStore("users", (u) => u.id === userId, updated);
    return { id: updated.id, organizationId: updated.organization_id, name: updated.name, email: updated.email, createdAt: updated.created_at };
  }

  const sets: string[] = [];
  if (input.name) sets.push(`name`);
  if (sets.length === 0) return getUserById(userId);

  const rows = await sql`
    UPDATE users SET name = COALESCE(${input.name ?? null}, name)
    WHERE id = ${userId}
    RETURNING id, organization_id, name, email, created_at
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, organizationId: r.organization_id, name: r.name, email: r.email, createdAt: r.created_at };
}

export async function getUserByEmail(email: string) {
  if (useMemory) {
    const rows = findInStore("users", (u) => u.email === email, 1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, organizationId: r.organization_id, name: r.name, email: r.email, createdAt: r.created_at };
  }

  const rows = await sql`SELECT id, organization_id, name, email, created_at FROM users WHERE email = ${email} LIMIT 1`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: r.id, organizationId: r.organization_id, name: r.name, email: r.email, createdAt: r.created_at };
}
