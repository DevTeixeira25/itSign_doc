import type { FastifyInstance } from "fastify";
import {
  parseCertificate,
  validateCertificate,
  signWithCertificate,
  type CertificateInfo,
} from "../../lib/icp-brasil.js";
import { sha256, uuid, hmacSha256, generateVerificationCode } from "../../lib/crypto.js";
import { useMemory, sql } from "../../db.js";
import { findInStore, insertIntoStore, updateInStore } from "../../lib/memory-store.js";
import { auditLog, addSignatureEvent } from "../audit/audit.service.js";
import { tryCompleteEnvelope } from "../envelopes/envelopes.service.js";
import { config } from "../../config.js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NotFoundError, BadRequestError, ForbiddenError } from "../../lib/errors.js";

export async function certificateRoutes(app: FastifyInstance) {
  // ── Validate certificate (no signing — just inspect) ──────────
  app.post("/v1/certificates/validate", {
    schema: {
      tags: ["Certificates"],
      summary: "Validar certificado digital",
    },
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) throw new BadRequestError("Envie o arquivo .pfx/.p12 do certificado");

    const pfxBuffer = await data.toBuffer();

    // Password comes as a field — get it from the fields
    const passwordField = (data.fields as any)?.password;
    const password = passwordField?.value ?? "";

    if (!password) {
      throw new BadRequestError("Informe a senha do certificado (campo 'password')");
    }

    try {
      const { info } = parseCertificate(pfxBuffer, password);
      const validation = validateCertificate(info);

      return reply.send({
        certificate: info,
        validation,
      });
    } catch (err: any) {
      throw new BadRequestError(err.message ?? "Erro ao processar certificado");
    }
  });

  // ── Sign with certificate (self-sign flow) ────────────────────
  // This receives: .pfx file, password, documentId or envelopeId
  app.post("/v1/sign-with-certificate", {
    schema: {
      tags: ["Certificates"],
      summary: "Assinar com certificado digital",
    },
  }, async (request, reply) => {
    // We need multipart: certificate file + password + envelope info
    const parts = request.parts();
    let pfxBuffer: Buffer | null = null;
    let password = "";
    let envelopeId = "";
    let recipientToken = "";
    let signaturePosition: { page: number; x: number; y: number; width: number; height: number } | null = null;
    let formFields: Record<string, string | boolean | string[]> = {};
    let overlayFields: Array<{ id?: string; type: "text" | "check" | "cross" | "dot"; page: number; x: number; y: number; width: number; height: number; value?: string }> = [];

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "certificate") {
        pfxBuffer = await part.toBuffer();
      } else if (part.type === "field") {
        if (part.fieldname === "password") password = part.value as string;
        if (part.fieldname === "envelopeId") envelopeId = part.value as string;
        if (part.fieldname === "recipientToken") recipientToken = part.value as string;
        if (part.fieldname === "signaturePosition") {
          try { signaturePosition = JSON.parse(part.value as string); } catch { /* ignore */ }
        }
        if (part.fieldname === "formFields") {
          try { formFields = JSON.parse(part.value as string); } catch { /* ignore */ }
        }
        if (part.fieldname === "overlayFields") {
          try { overlayFields = JSON.parse(part.value as string); } catch { /* ignore */ }
        }
      }
    }

    if (!pfxBuffer) throw new BadRequestError("Envie o arquivo .pfx/.p12 do certificado");
    if (!password) throw new BadRequestError("Informe a senha do certificado");
    if (!recipientToken) throw new BadRequestError("Token do destinatário é obrigatório");

    // 1. Parse and validate certificate
    let parsed;
    try {
      parsed = parseCertificate(pfxBuffer, password);
    } catch (err: any) {
      throw new BadRequestError(err.message ?? "Erro ao processar certificado");
    }

    const validation = validateCertificate(parsed.info);
    if (!validation.valid) {
      throw new BadRequestError(`Certificado inválido: ${validation.errors.join("; ")}`);
    }

    // 2. Get recipient info from token
    const tokenHash = sha256(recipientToken);
    let recipient: any;

    if (useMemory) {
      const rows = findInStore("recipients", (r: any) => r.access_token_hash === tokenHash, 1);
      if (rows.length === 0) throw new NotFoundError("Link de assinatura inválido");
      recipient = rows[0];
      const env = findInStore("envelopes", (e: any) => e.id === recipient.envelope_id, 1)[0];
      const doc = findInStore("documents", (d: any) => d.id === env?.document_id, 1)[0];
      recipient = {
        ...recipient,
        organization_id: env?.organization_id,
        envelope_status: env?.status,
        envelope_title: env?.title,
        file_name: doc?.file_name,
        sha256_hash: doc?.sha256_hash,
      };
    } else {
      const rows = await sql`
        SELECT r.*, e.organization_id, e.status AS envelope_status, e.title AS envelope_title,
               d.file_name, d.sha256_hash
        FROM recipients r
        JOIN envelopes e ON e.id = r.envelope_id
        JOIN documents d ON d.id = e.document_id
        WHERE r.access_token_hash = ${tokenHash} LIMIT 1
      `;
      if (rows.length === 0) throw new NotFoundError("Link de assinatura inválido");
      recipient = rows[0];
    }

    if (recipient.envelope_status === "canceled" || recipient.envelope_status === "expired") {
      throw new BadRequestError("Este envelope não está mais disponível para assinatura");
    }
    if (recipient.signed_at) {
      throw new BadRequestError("Você já assinou este documento");
    }

    // 3. Get document hash
    const documentHash = recipient.sha256_hash ?? "unknown";

    // 4. Sign with ICP-Brasil certificate
    const signResult = signWithCertificate(
      documentHash,
      parsed.cert,
      parsed.privateKey,
      parsed.chain
    );

    // 5. Build signature proof combining HMAC + PKCS#7
    const signedAt = signResult.signedAt;
    const signaturePayload = [
      recipient.envelope_id,
      recipient.id,
      recipient.email,
      documentHash,
      "certificate_icp",
      signedAt,
      request.ip,
    ].join("|");
    const signatureHash = hmacSha256(signaturePayload, config.jwtSecret);

    // 6. Store comprehensive signature data
    const sigDir = join(config.storageDir, "signatures", recipient.envelope_id);
    await mkdir(sigDir, { recursive: true });
    await writeFile(
      join(sigDir, `${recipient.id}.json`),
      JSON.stringify(
        {
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          signatureType: "certificate_icp",
          signaturePosition: signaturePosition ?? null,
          formFields,
          overlayFields,
          signedAt,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
          // Legal integrity
          documentHash,
          signatureHash,
          signaturePayloadFields:
            "envelopeId|recipientId|email|documentHash|signatureType|signedAt|ipAddress",
          hashAlgorithm: "HMAC-SHA256",
          // ICP-Brasil specific
          icpBrasil: {
            certificateCommonName: parsed.info.commonName,
            certificateEmail: parsed.info.email,
            cpf: parsed.info.cpf,
            cnpj: parsed.info.cnpj,
            issuerOrg: parsed.info.issuerOrg,
            issuerCN: parsed.info.issuerCN,
            serialNumber: parsed.info.serialNumber,
            validFrom: parsed.info.validFrom,
            validAfter: parsed.info.validAfter,
            certType: parsed.info.certType,
            fingerprint: parsed.info.fingerprint,
            isIcpBrasil: parsed.info.isIcpBrasil,
            keyUsage: parsed.info.keyUsage,
            pkcs7SignatureBase64: signResult.signatureBase64,
          },
          legalBasis: parsed.info.isIcpBrasil
            ? "Lei 14.063/2020 Art. 4° III - Assinatura eletrônica qualificada (ICP-Brasil)"
            : "Lei 14.063/2020 Art. 4° II - Assinatura eletrônica avançada",
        },
        null,
        2
      )
    );

    // 7. Update recipient
    if (useMemory) {
      updateInStore("recipients", (r: any) => r.id === recipient.id, {
        signed_at: signedAt,
        signature_hash: signatureHash,
      });
    } else {
      await sql`UPDATE recipients SET signed_at = now(), signature_hash = ${signatureHash} WHERE id = ${recipient.id}`;
    }

    // 8. Audit
    await addSignatureEvent({
      envelopeId: recipient.envelope_id,
      recipientId: recipient.id,
      eventType: "signature_completed",
      eventPayload: {
        signatureType: "certificate_icp",
        ipAddress: request.ip,
        certificateCN: parsed.info.commonName,
        certificateCPF: parsed.info.cpf,
        isIcpBrasil: parsed.info.isIcpBrasil,
      },
    });

    await auditLog({
      organizationId: recipient.organization_id,
      envelopeId: recipient.envelope_id,
      actorEmail: recipient.email,
      action: "signature_completed",
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadata: {
        recipientId: recipient.id,
        recipientName: recipient.name,
        signatureType: "certificate_icp",
        certificateCN: parsed.info.commonName,
        isIcpBrasil: parsed.info.isIcpBrasil,
      },
    });

    // 9. Check if envelope is completed
    const completed = await tryCompleteEnvelope(recipient.envelope_id);

    let verificationCode: string | null = null;
    if (completed) {
      const certResult = await generateIcpCompletionCertificate(
        recipient.envelope_id,
        recipient.organization_id
      );
      verificationCode = certResult.verificationCode;

      await auditLog({
        organizationId: recipient.organization_id,
        envelopeId: recipient.envelope_id,
        action: "envelope_completed",
        metadata: { completedAt: new Date().toISOString() },
      });
    }

    return reply.send({
      signed: true,
      envelopeCompleted: completed,
      recipientId: recipient.id,
      verificationCode,
      certificate: {
        commonName: parsed.info.commonName,
        cpf: parsed.info.cpf,
        cnpj: parsed.info.cnpj,
        issuer: parsed.info.issuerOrg,
        isIcpBrasil: parsed.info.isIcpBrasil,
        certType: parsed.info.certType,
        signatureLevel: parsed.info.isIcpBrasil ? "qualificada" : "avançada",
      },
      warnings: validation.warnings,
    });
  });
}

// ── ICP-Brasil enhanced completion certificate ─────────────────

async function generateIcpCompletionCertificate(
  envelopeId: string,
  organizationId: string
) {
  let recipientsList: any[];
  let envData: any;
  let signatureProofs: any[] = [];

  if (useMemory) {
    recipientsList = findInStore("recipients", (r: any) => r.envelope_id === envelopeId).sort(
      (a: any, b: any) => a.signing_order - b.signing_order
    );
    const env = findInStore("envelopes", (e: any) => e.id === envelopeId, 1)[0];
    const doc = findInStore("documents", (d: any) => d.id === env?.document_id, 1)[0];
    envData = {
      title: env?.title,
      created_at: env?.created_at,
      completed_at: env?.completed_at,
      file_name: doc?.file_name,
      sha256_hash: doc?.sha256_hash,
    };
  } else {
    recipientsList = await sql`
      SELECT id, name, email, role, signing_order, signed_at, signature_hash
      FROM recipients WHERE envelope_id = ${envelopeId} ORDER BY signing_order ASC`;
    const envRows = await sql`
      SELECT e.title, e.created_at, e.completed_at, d.file_name, d.sha256_hash
      FROM envelopes e JOIN documents d ON d.id = e.document_id
      WHERE e.id = ${envelopeId} LIMIT 1`;
    envData = envRows[0];
  }

  // Load signature proof files for each signer (including ICP-Brasil details)
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
        // ICP-Brasil fields (when available)
        ...(sigData.icpBrasil
          ? {
              icpBrasil: {
                certificateCN: sigData.icpBrasil.certificateCommonName,
                cpf: sigData.icpBrasil.cpf,
                cnpj: sigData.icpBrasil.cnpj,
                issuer: sigData.icpBrasil.issuerOrg,
                issuerCN: sigData.icpBrasil.issuerCN,
                serialNumber: sigData.icpBrasil.serialNumber,
                certType: sigData.icpBrasil.certType,
                fingerprint: sigData.icpBrasil.fingerprint,
                isIcpBrasil: sigData.icpBrasil.isIcpBrasil,
              },
            }
          : {}),
        legalBasis: sigData.legalBasis,
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

  // Determine the highest level of signature present
  const hasIcpBrasil = signatureProofs.some((s) => s.icpBrasil?.isIcpBrasil);
  const hasAdvanced = signatureProofs.some(
    (s) => s.signatureType && s.signatureType !== "certificate_icp"
  );

  const completedAt = envData.completed_at ?? new Date().toISOString();

  const certificate = {
    version: "2.0",
    type: "completion_certificate",
    platform: "ITSign",
    platformUrl: config.webUrl,

    // Legal basis — upgraded when ICP-Brasil is present
    legalBasis: {
      law: "Lei 14.063/2020",
      article: hasIcpBrasil
        ? "Art. 4° III - Assinatura eletrônica qualificada"
        : "Art. 4° II - Assinatura eletrônica avançada",
      complementary: "MP 2.200-2/2001",
      icpBrasil: hasIcpBrasil,
      description: hasIcpBrasil
        ? "Este documento foi assinado com certificado digital ICP-Brasil, constituindo assinatura eletrônica qualificada nos termos da Lei 14.063/2020. Possui presunção de veracidade e equivale à assinatura manuscrita."
        : "Assinatura eletrônica avançada que utiliza certificados não emitidos pela ICP-Brasil ou outro meio de comprovação da autoria e integridade de documentos em forma eletrônica.",
    },

    envelope: {
      id: envelopeId,
      title: envData.title,
      createdAt: envData.created_at,
      completedAt,
    },

    document: {
      fileName: envData.file_name,
      sha256Hash: envData.sha256_hash,
      hashAlgorithm: "SHA-256",
      integrityNote:
        "O hash acima pode ser usado para verificar que o documento não foi alterado após o upload.",
    },

    signatures: signatureProofs,
    generatedAt: new Date().toISOString(),
  };

  // Generate certificate hash and verification code
  const certJson = JSON.stringify(certificate, null, 2);
  const certHash = sha256(certJson);
  const verificationCode = generateVerificationCode(envelopeId, certHash);

  const finalCertificate = {
    ...certificate,
    verification: {
      certificateHash: certHash,
      verificationCode,
      verificationUrl: `${config.webUrl}/verify/${verificationCode}`,
      hashAlgorithm: "SHA-256",
      note: "Use o código de verificação ou o link acima para validar a autenticidade deste documento.",
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

  await auditLog({
    organizationId,
    envelopeId,
    action: "certificate_generated",
    metadata: { certificateHash: certHash, verificationCode, hasIcpBrasil },
  });

  return { verificationCode, certHash };
}
