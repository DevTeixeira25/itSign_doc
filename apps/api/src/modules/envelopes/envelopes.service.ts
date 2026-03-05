import { sql, useMemory } from "../../db.js";
import { insertIntoStore, findInStore, updateInStore } from "../../lib/memory-store.js";
import { uuid, generateToken, sha256 } from "../../lib/crypto.js";
import { NotFoundError, BadRequestError } from "../../lib/errors.js";
import type { EnvelopeStatus } from "@itsign/shared-types";

interface CreateEnvelopeInput {
  organizationId: string;
  createdBy: string;
  title: string;
  documentId: string;
  recipients: Array<{
    name: string;
    email: string;
    role: string;
    signingOrder: number;
  }>;
  expiresAt?: string;
}

export async function createEnvelope(input: CreateEnvelopeInput) {
  const envelopeId = uuid();

  const recipientRows = input.recipients.map((r) => {
    const accessToken = generateToken();
    return {
      id: uuid(),
      envelope_id: envelopeId,
      name: r.name,
      email: r.email,
      role: r.role,
      signing_order: r.signingOrder,
      access_token_hash: sha256(accessToken),
      accessToken,
      signed_at: null,
      status: "pending",
    };
  });

  if (useMemory) {
    insertIntoStore("envelopes", {
      id: envelopeId,
      organization_id: input.organizationId,
      document_id: input.documentId,
      title: input.title,
      status: "draft",
      created_by: input.createdBy,
      expires_at: input.expiresAt ?? null,
      completed_at: null,
    });
    for (const r of recipientRows) {
      const { accessToken, ...row } = r;
      insertIntoStore("recipients", row);
    }
  } else {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO envelopes (id, organization_id, document_id, title, status, created_by, expires_at)
        VALUES (${envelopeId}, ${input.organizationId}, ${input.documentId}, ${input.title}, 'draft', ${input.createdBy}, ${input.expiresAt ?? null})`;
      for (const r of recipientRows) {
        await tx`INSERT INTO recipients (id, envelope_id, name, email, role, signing_order, access_token_hash)
          VALUES (${r.id}, ${envelopeId}, ${r.name}, ${r.email}, ${r.role}, ${r.signing_order}, ${r.access_token_hash})`;
      }
    });
  }

  return {
    id: envelopeId,
    status: "draft" as EnvelopeStatus,
    recipients: recipientRows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      signingOrder: r.signing_order,
      accessToken: r.accessToken,
    })),
  };
}

export async function sendEnvelope(envelopeId: string, organizationId: string) {
  if (useMemory) {
    const rows = findInStore("envelopes", (e) => e.id === envelopeId && e.organization_id === organizationId, 1);
    if (rows.length === 0) throw new NotFoundError("Envelope");
    if (rows[0].status !== "draft") throw new BadRequestError("Envelope já foi enviado");
    updateInStore("envelopes", (e) => e.id === envelopeId, { status: "sent" });
    return { id: envelopeId, status: "sent" as EnvelopeStatus };
  }

  const rows = await sql`SELECT status FROM envelopes WHERE id = ${envelopeId} AND organization_id = ${organizationId} LIMIT 1`;
  if (rows.length === 0) throw new NotFoundError("Envelope");
  if (rows[0].status !== "draft") throw new BadRequestError("Envelope já foi enviado");
  await sql`UPDATE envelopes SET status = 'sent' WHERE id = ${envelopeId}`;
  return { id: envelopeId, status: "sent" as EnvelopeStatus };
}

export async function getEnvelope(envelopeId: string, organizationId: string) {
  if (useMemory) {
    const envRows = findInStore("envelopes", (e) => e.id === envelopeId && e.organization_id === organizationId, 1);
    if (envRows.length === 0) throw new NotFoundError("Envelope");
    const env = envRows[0];
    const doc = findInStore("documents", (d) => d.id === env.document_id, 1)[0];
    const recipients = findInStore("recipients", (r) => r.envelope_id === envelopeId)
      .sort((a: any, b: any) => a.signing_order - b.signing_order);
    const auditTrail = findInStore("audit_logs", (a) => a.envelope_id === envelopeId)
      .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));

    return {
      id: env.id, organizationId: env.organization_id, documentId: env.document_id,
      title: env.title, status: env.status, createdBy: env.created_by,
      expiresAt: env.expires_at, completedAt: env.completed_at, createdAt: env.created_at,
      document: { id: env.document_id, fileName: doc?.file_name ?? "", mimeType: doc?.mime_type ?? "" },
      recipients, auditTrail,
    };
  }

  const envRows = await sql`SELECT e.*, d.file_name, d.mime_type FROM envelopes e JOIN documents d ON d.id = e.document_id WHERE e.id = ${envelopeId} AND e.organization_id = ${organizationId} LIMIT 1`;
  if (envRows.length === 0) throw new NotFoundError("Envelope");
  const env = envRows[0];
  const recipients = await sql`SELECT id, name, email, role, signing_order, signed_at, created_at FROM recipients WHERE envelope_id = ${envelopeId} ORDER BY signing_order ASC`;
  const auditTrail = await sql`SELECT id, action, actor_email, ip_address, metadata, created_at FROM audit_logs WHERE envelope_id = ${envelopeId} ORDER BY created_at ASC`;

  return {
    id: env.id, organizationId: env.organization_id, documentId: env.document_id,
    title: env.title, status: env.status, createdBy: env.created_by,
    expiresAt: env.expires_at, completedAt: env.completed_at, createdAt: env.created_at,
    document: { id: env.document_id, fileName: env.file_name, mimeType: env.mime_type },
    recipients, auditTrail,
  };
}

export async function listEnvelopes(organizationId: string, page = 1, pageSize = 20) {
  if (useMemory) {
    const all = findInStore("envelopes", (e) => e.organization_id === organizationId)
      .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at));
    const offset = (page - 1) * pageSize;
    return { data: all.slice(offset, offset + pageSize), total: all.length, page, pageSize };
  }

  const offset = (page - 1) * pageSize;
  const rows = await sql`SELECT id, title, status, created_by, expires_at, completed_at, created_at FROM envelopes WHERE organization_id = ${organizationId} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`;
  const countResult = await sql`SELECT count(*)::int AS total FROM envelopes WHERE organization_id = ${organizationId}`;
  return { data: rows, total: countResult[0].total, page, pageSize };
}

export async function cancelEnvelope(envelopeId: string, organizationId: string) {
  if (useMemory) {
    const rows = findInStore("envelopes", (e) => e.id === envelopeId && e.organization_id === organizationId, 1);
    if (rows.length === 0) throw new NotFoundError("Envelope");
    if (rows[0].status === "completed" || rows[0].status === "canceled") throw new BadRequestError(`Não é possível cancelar envelope com status '${rows[0].status}'`);
    updateInStore("envelopes", (e) => e.id === envelopeId, { status: "canceled" });
    return { id: envelopeId, status: "canceled" as EnvelopeStatus };
  }

  const rows = await sql`SELECT status FROM envelopes WHERE id = ${envelopeId} AND organization_id = ${organizationId} LIMIT 1`;
  if (rows.length === 0) throw new NotFoundError("Envelope");
  const { status } = rows[0];
  if (status === "completed" || status === "canceled") throw new BadRequestError(`Não é possível cancelar envelope com status '${status}'`);
  await sql`UPDATE envelopes SET status = 'canceled' WHERE id = ${envelopeId}`;
  return { id: envelopeId, status: "canceled" as EnvelopeStatus };
}

export async function tryCompleteEnvelope(envelopeId: string): Promise<boolean> {
  if (useMemory) {
    const pending = findInStore("recipients", (r) => r.envelope_id === envelopeId && r.role === "signer" && !r.signed_at);
    if (pending.length === 0) {
      updateInStore("envelopes", (e) => e.id === envelopeId, { status: "completed", completed_at: new Date().toISOString() });
      return true;
    }
    return false;
  }

  const pending = await sql`SELECT count(*)::int AS cnt FROM recipients WHERE envelope_id = ${envelopeId} AND role = 'signer' AND signed_at IS NULL`;
  if (pending[0].cnt === 0) {
    await sql`UPDATE envelopes SET status = 'completed', completed_at = now() WHERE id = ${envelopeId}`;
    return true;
  }
  return false;
}
