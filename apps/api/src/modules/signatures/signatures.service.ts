import { sql, useMemory } from "../../db.js";
import { findInStore, insertIntoStore, updateInStore } from "../../lib/memory-store.js";
import { sha256, uuid } from "../../lib/crypto.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../lib/errors.js";
import { tryCompleteEnvelope } from "../envelopes/envelopes.service.js";
import { auditLog, addSignatureEvent } from "../audit/audit.service.js";
import { config } from "../../config.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function getRecipientByToken(rawToken: string) {
  const tokenHash = sha256(rawToken);

  if (useMemory) {
    const rows = findInStore("recipients", (r) => r.access_token_hash === tokenHash, 1);
    if (rows.length === 0) throw new NotFoundError("Link de assinatura inválido");
    const r = rows[0];
    const env = findInStore("envelopes", (e) => e.id === r.envelope_id, 1)[0];
    const doc = findInStore("documents", (d) => d.id === env?.document_id, 1)[0];
    return {
      ...r,
      organization_id: env?.organization_id,
      envelope_status: env?.status,
      envelope_title: env?.title,
      file_name: doc?.file_name,
      mime_type: doc?.mime_type,
    };
  }

  const rows = await sql`
    SELECT r.*, e.organization_id, e.status AS envelope_status, e.title AS envelope_title,
           d.file_name, d.mime_type
    FROM recipients r
    JOIN envelopes e ON e.id = r.envelope_id
    JOIN documents d ON d.id = e.document_id
    WHERE r.access_token_hash = ${tokenHash}
    LIMIT 1
  `;
  if (rows.length === 0) throw new NotFoundError("Link de assinatura inválido");
  return rows[0];
}

export async function signByToken(
  rawToken: string,
  input: { signatureData: string; signatureType: string },
  meta: { ipAddress: string; userAgent: string | null }
) {
  const recipient = await getRecipientByToken(rawToken);

  if (recipient.envelope_status === "canceled" || recipient.envelope_status === "expired") {
    throw new BadRequestError("Este envelope não está mais disponível para assinatura");
  }
  if (recipient.signed_at) {
    throw new BadRequestError("Você já assinou este documento");
  }
  if (recipient.role !== "signer" && recipient.role !== "approver") {
    throw new ForbiddenError("Você não tem permissão para assinar");
  }

  // Check signing order
  if (useMemory) {
    const pendingBefore = findInStore("recipients", (r) =>
      r.envelope_id === recipient.envelope_id &&
      r.signing_order < recipient.signing_order &&
      r.role === "signer" &&
      !r.signed_at
    );
    if (pendingBefore.length > 0) throw new BadRequestError("Aguarde os signatários anteriores assinarem");
  } else {
    const pendingBefore = await sql`
      SELECT count(*)::int AS cnt FROM recipients
      WHERE envelope_id = ${recipient.envelope_id}
        AND signing_order < ${recipient.signing_order}
        AND role = 'signer' AND signed_at IS NULL
    `;
    if (pendingBefore[0].cnt > 0) throw new BadRequestError("Aguarde os signatários anteriores assinarem");
  }

  // Store signature data
  const sigDir = join(config.storageDir, "signatures", recipient.envelope_id);
  await mkdir(sigDir, { recursive: true });
  await writeFile(join(sigDir, `${recipient.id}.json`), JSON.stringify({
    recipientId: recipient.id,
    signatureData: input.signatureData,
    signatureType: input.signatureType,
    signedAt: new Date().toISOString(),
    ipAddress: meta.ipAddress,
  }));

  // Update recipient
  if (useMemory) {
    updateInStore("recipients", (r) => r.id === recipient.id, { signed_at: new Date().toISOString() });
  } else {
    await sql`UPDATE recipients SET signed_at = now() WHERE id = ${recipient.id}`;
  }

  // Audit
  await addSignatureEvent({
    envelopeId: recipient.envelope_id,
    recipientId: recipient.id,
    eventType: "signature_completed",
    eventPayload: { signatureType: input.signatureType, ipAddress: meta.ipAddress },
  });

  await auditLog({
    organizationId: recipient.organization_id,
    envelopeId: recipient.envelope_id,
    actorEmail: recipient.email,
    action: "signature_completed",
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    metadata: { recipientId: recipient.id, recipientName: recipient.name },
  });

  const completed = await tryCompleteEnvelope(recipient.envelope_id);

  if (completed) {
    await generateCompletionCertificate(recipient.envelope_id, recipient.organization_id);
    await auditLog({
      organizationId: recipient.organization_id,
      envelopeId: recipient.envelope_id,
      action: "envelope_completed",
      metadata: { completedAt: new Date().toISOString() },
    });
  }

  return { signed: true, envelopeCompleted: completed, recipientId: recipient.id };
}

async function generateCompletionCertificate(envelopeId: string, organizationId: string) {
  let recipientsList: any[];
  let envData: any;

  if (useMemory) {
    recipientsList = findInStore("recipients", (r) => r.envelope_id === envelopeId)
      .sort((a: any, b: any) => a.signing_order - b.signing_order);
    const env = findInStore("envelopes", (e) => e.id === envelopeId, 1)[0];
    const doc = findInStore("documents", (d) => d.id === env?.document_id, 1)[0];
    envData = { title: env?.title, created_at: env?.created_at, completed_at: env?.completed_at, file_name: doc?.file_name, sha256_hash: doc?.sha256_hash };
  } else {
    recipientsList = await sql`SELECT id, name, email, role, signing_order, signed_at FROM recipients WHERE envelope_id = ${envelopeId} ORDER BY signing_order ASC`;
    const envRows = await sql`SELECT e.title, e.created_at, e.completed_at, d.file_name, d.sha256_hash FROM envelopes e JOIN documents d ON d.id = e.document_id WHERE e.id = ${envelopeId} LIMIT 1`;
    envData = envRows[0];
  }

  const certificate = {
    envelopeId,
    title: envData.title,
    documentFileName: envData.file_name,
    documentHash: envData.sha256_hash,
    createdAt: envData.created_at,
    completedAt: envData.completed_at,
    recipients: recipientsList.map((r: any) => ({ name: r.name, email: r.email, role: r.role, signedAt: r.signed_at })),
    generatedAt: new Date().toISOString(),
  };

  const certJson = JSON.stringify(certificate, null, 2);
  const certHash = sha256(certJson);
  const certId = uuid();
  const certKey = `certificates/${organizationId}/${envelopeId}.json`;

  const certDir = join(config.storageDir, "certificates", organizationId);
  await mkdir(certDir, { recursive: true });
  await writeFile(join(certDir, `${envelopeId}.json`), certJson);

  if (useMemory) {
    insertIntoStore("completion_certificates", { id: certId, envelope_id: envelopeId, certificate_storage_key: certKey, certificate_sha256: certHash });
  } else {
    await sql`INSERT INTO completion_certificates (id, envelope_id, certificate_storage_key, certificate_sha256) VALUES (${certId}, ${envelopeId}, ${certKey}, ${certHash})`;
  }

  await auditLog({ organizationId, envelopeId, action: "certificate_generated", metadata: { certificateHash: certHash } });
}
