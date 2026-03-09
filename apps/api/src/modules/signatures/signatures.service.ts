import { sql, useMemory } from "../../db.js";
import { findInStore, insertIntoStore, updateInStore } from "../../lib/memory-store.js";
import { sha256, uuid, hmacSha256, generateVerificationCode } from "../../lib/crypto.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../lib/errors.js";
import { tryCompleteEnvelope } from "../envelopes/envelopes.service.js";
import { auditLog, addSignatureEvent } from "../audit/audit.service.js";
import { config } from "../../config.js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
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
  input: { signatureData: string; signatureType: string; signaturePosition?: { page: number; x: number; y: number; width: number; height: number } },
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

  // Build cryptographic signature proof
  const signedAt = new Date().toISOString();
  const documentHash = await getDocumentHashForEnvelope(recipient.envelope_id);
  const signaturePayload = [
    recipient.envelope_id,
    recipient.id,
    recipient.email,
    documentHash,
    input.signatureType,
    signedAt,
    meta.ipAddress,
  ].join("|");
  const signatureHash = hmacSha256(signaturePayload, config.jwtSecret);

  // Store signature data with legal proof
  const sigDir = join(config.storageDir, "signatures", recipient.envelope_id);
  await mkdir(sigDir, { recursive: true });
  await writeFile(join(sigDir, `${recipient.id}.json`), JSON.stringify({
    recipientId: recipient.id,
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    signatureData: input.signatureData,
    signatureType: input.signatureType,
    signaturePosition: input.signaturePosition ?? null,
    signedAt,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    // Legal integrity fields
    documentHash,
    signatureHash,
    signaturePayloadFields: "envelopeId|recipientId|email|documentHash|signatureType|signedAt|ipAddress",
    legalBasis: "Lei 14.063/2020 Art. 4\u00b0 - Assinatura eletr\u00f4nica avançada",
    hashAlgorithm: "HMAC-SHA256",
  }, null, 2));

  // Update recipient
  if (useMemory) {
    updateInStore("recipients", (r) => r.id === recipient.id, {
      signed_at: signedAt,
      signature_hash: signatureHash,
    });
  } else {
    await sql`UPDATE recipients SET signed_at = now(), signature_hash = ${signatureHash} WHERE id = ${recipient.id}`;
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
  let signatureProofs: any[] = [];

  if (useMemory) {
    recipientsList = findInStore("recipients", (r) => r.envelope_id === envelopeId)
      .sort((a: any, b: any) => a.signing_order - b.signing_order);
    const env = findInStore("envelopes", (e) => e.id === envelopeId, 1)[0];
    const doc = findInStore("documents", (d) => d.id === env?.document_id, 1)[0];
    envData = { title: env?.title, created_at: env?.created_at, completed_at: env?.completed_at, file_name: doc?.file_name, sha256_hash: doc?.sha256_hash };
  } else {
    recipientsList = await sql`SELECT id, name, email, role, signing_order, signed_at, signature_hash FROM recipients WHERE envelope_id = ${envelopeId} ORDER BY signing_order ASC`;
    const envRows = await sql`SELECT e.title, e.created_at, e.completed_at, d.file_name, d.sha256_hash FROM envelopes e JOIN documents d ON d.id = e.document_id WHERE e.id = ${envelopeId} LIMIT 1`;
    envData = envRows[0];
  }

  // Load signature proof files for each signer
  for (const r of recipientsList) {
    try {
      const sigPath = join(config.storageDir, "signatures", envelopeId, `${r.id}.json`);
      const sigData = JSON.parse(await readFile(sigPath, "utf-8"));
      signatureProofs.push({
        recipientId: r.id,
        name: sigData.recipientName ?? r.name,
        email: sigData.recipientEmail ?? r.email,
        signedAt: sigData.signedAt ?? r.signed_at,
        ipAddress: sigData.ipAddress,
        userAgent: sigData.userAgent,
        signatureHash: sigData.signatureHash ?? r.signature_hash,
        signatureType: sigData.signatureType,
        documentHashAtSigning: sigData.documentHash,
      });
    } catch {
      signatureProofs.push({
        recipientId: r.id,
        name: r.name,
        email: r.email,
        signedAt: r.signed_at,
        signatureHash: r.signature_hash,
      });
    }
  }

  const completedAt = envData.completed_at ?? new Date().toISOString();

  const certificate = {
    // Certificate metadata
    version: "1.0",
    type: "completion_certificate",
    platform: "ITSign",
    platformUrl: config.webUrl,

    // Legal basis
    legalBasis: {
      law: "Lei 14.063/2020",
      article: "Art. 4\u00b0 - Assinatura eletr\u00f4nica avan\u00e7ada",
      complementary: "MP 2.200-2/2001 Art. 10 \u00a72",
      description: "Assinatura eletr\u00f4nica avan\u00e7ada que utiliza certificados n\u00e3o emitidos pela ICP-Brasil ou outro meio de comprova\u00e7\u00e3o da autoria e integridade de documentos em forma eletr\u00f4nica, desde que admitido pelas partes como v\u00e1lido ou aceito pela pessoa a quem for oposto o documento.",
    },

    // Envelope info
    envelope: {
      id: envelopeId,
      title: envData.title,
      createdAt: envData.created_at,
      completedAt,
    },

    // Document integrity
    document: {
      fileName: envData.file_name,
      sha256Hash: envData.sha256_hash,
      hashAlgorithm: "SHA-256",
      integrityNote: "O hash acima pode ser usado para verificar que o documento n\u00e3o foi alterado ap\u00f3s o upload.",
    },

    // Signature proofs for each signer
    signatures: signatureProofs,

    // Certificate generation
    generatedAt: new Date().toISOString(),
  };

  // Generate certificate hash and verification code
  const certJson = JSON.stringify(certificate, null, 2);
  const certHash = sha256(certJson);
  const verificationCode = generateVerificationCode(envelopeId, certHash);

  // Add verification info to certificate
  const finalCertificate = {
    ...certificate,
    verification: {
      certificateHash: certHash,
      verificationCode,
      verificationUrl: `${config.webUrl}/verify/${verificationCode}`,
      hashAlgorithm: "SHA-256",
      note: "Use o c\u00f3digo de verifica\u00e7\u00e3o ou o link acima para validar a autenticidade deste documento.",
    },
  };

  const finalJson = JSON.stringify(finalCertificate, null, 2);
  const certId = uuid();
  const certKey = `certificates/${organizationId}/${envelopeId}.json`;

  const certDir = join(config.storageDir, "certificates", organizationId);
  await mkdir(certDir, { recursive: true });
  await writeFile(join(certDir, `${envelopeId}.json`), finalJson);

  if (useMemory) {
    insertIntoStore("completion_certificates", {
      id: certId,
      envelope_id: envelopeId,
      certificate_storage_key: certKey,
      certificate_sha256: certHash,
      verification_code: verificationCode,
    });
  } else {
    await sql`INSERT INTO completion_certificates (id, envelope_id, certificate_storage_key, certificate_sha256, verification_code)
      VALUES (${certId}, ${envelopeId}, ${certKey}, ${certHash}, ${verificationCode})`;
  }

  await auditLog({ organizationId, envelopeId, action: "certificate_generated", metadata: { certificateHash: certHash, verificationCode } });

  return { verificationCode, certHash };
}

// ── Helper: get document SHA-256 for an envelope ────────────────
async function getDocumentHashForEnvelope(envelopeId: string): Promise<string> {
  if (useMemory) {
    const env = findInStore("envelopes", (e) => e.id === envelopeId, 1)[0];
    if (!env) return "unknown";
    const doc = findInStore("documents", (d) => d.id === env.document_id, 1)[0];
    return doc?.sha256_hash ?? "unknown";
  }
  const rows = await sql`
    SELECT d.sha256_hash FROM envelopes e
    JOIN documents d ON d.id = e.document_id
    WHERE e.id = ${envelopeId} LIMIT 1
  `;
  return rows[0]?.sha256_hash ?? "unknown";
}

// ── Public verification ─────────────────────────────────────────

/**
 * Verify a document's signature by its verification code.
 * This is a PUBLIC endpoint — no auth required.
 */
export async function verifyByCode(code: string) {
  let cert: any;

  if (useMemory) {
    const rows = findInStore("completion_certificates", (c) => c.verification_code === code, 1);
    if (rows.length === 0) throw new NotFoundError("Código de verificação inválido");
    cert = rows[0];
  } else {
    const rows = await sql`SELECT * FROM completion_certificates WHERE verification_code = ${code} LIMIT 1`;
    if (rows.length === 0) throw new NotFoundError("Código de verificação inválido");
    cert = rows[0];
  }

  // Read the stored certificate
  const certPath = join(config.storageDir, cert.certificate_storage_key);
  let certData: any;
  try {
    certData = JSON.parse(await readFile(certPath, "utf-8"));
  } catch {
    throw new NotFoundError("Certificado não encontrado no armazenamento");
  }

  // Verify certificate integrity
  const { verification, ...certWithoutVerification } = certData;
  const recalculatedHash = sha256(JSON.stringify(certWithoutVerification, null, 2));
  const integrityValid = recalculatedHash === cert.certificate_sha256;

  return {
    valid: integrityValid,
    verificationCode: code,
    certificateHash: cert.certificate_sha256,
    integrityCheck: integrityValid ? "PASS" : "FAIL",
    envelope: certData.envelope,
    document: certData.document,
    signatures: certData.signatures?.map((s: any) => ({
      name: s.name,
      email: s.email,
      signedAt: s.signedAt,
      signatureType: s.signatureType,
      signatureHash: s.signatureHash,
      ipAddress: s.ipAddress ? s.ipAddress.replace(/\d+$/, "***") : null, // Mask last octet for privacy
      ...(s.icpBrasil ? { icpBrasil: s.icpBrasil } : {}),
      ...(s.govbr ? { govbr: s.govbr } : {}),
      ...(s.legalBasis ? { legalBasis: s.legalBasis } : {}),
    })),
    legalBasis: certData.legalBasis,
    generatedAt: certData.generatedAt,
    platform: certData.platform,
  };
}

/**
 * Get the verification code for a completed envelope.
 */
export async function getVerificationCode(envelopeId: string) {
  if (useMemory) {
    const rows = findInStore("completion_certificates", (c) => c.envelope_id === envelopeId, 1);
    if (rows.length === 0) return null;
    return rows[0].verification_code;
  }
  const rows = await sql`SELECT verification_code FROM completion_certificates WHERE envelope_id = ${envelopeId} LIMIT 1`;
  if (rows.length === 0) return null;
  return rows[0].verification_code;
}
