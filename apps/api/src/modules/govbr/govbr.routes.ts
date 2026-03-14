import type { FastifyInstance } from "fastify";
import {
  createGovBrAuthUrl,
  handleGovBrCallback,
  getGovBrSession,
  getSessionReturnPath,
  markGovBrSessionSigned,
  getGovBrSignatureLevel,
  GOVBR_MOCK_MODE,
} from "./govbr.service.js";
import { sha256, uuid, hmacSha256, generateVerificationCode } from "../../lib/crypto.js";
import { useMemory, sql } from "../../db.js";
import { findInStore, insertIntoStore, updateInStore } from "../../lib/memory-store.js";
import { auditLog, addSignatureEvent } from "../audit/audit.service.js";
import { tryCompleteEnvelope } from "../envelopes/envelopes.service.js";
import { config } from "../../config.js";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { authGuard } from "../../lib/auth-guard.js";
import { NotFoundError, BadRequestError } from "../../lib/errors.js";

export async function govbrRoutes(app: FastifyInstance) {
  // ── 1. Initiate Gov.br OAuth2 flow (authenticated) ──────────
  app.post(
    "/v1/govbr/authorize",
    {
      preHandler: [authGuard],
      schema: {
        tags: ["GovBr"],
        summary: "Iniciar fluxo autenticado Gov.br",
        security: [{ firebaseBearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const auth = request.auth;
      const body = request.body as any;
      const userRow = findInStore("users", (u: any) => u.id === auth.userId, 1)[0];

      const { authUrl, sessionId } = createGovBrAuthUrl({
        userId: auth.userId,
        userEmail: auth.email,
        userName: userRow?.name ?? auth.email,
        envelopeId: body?.envelopeId,
        recipientToken: body?.recipientToken,
        documentTitle: body?.documentTitle,
        returnPath: body?.returnPath ?? "/self-sign",
      });

      return reply.send({ authUrl, sessionId });
    }
  );

  // ── 1b. Initiate Gov.br OAuth2 flow (public — for recipients) ──
  app.post(
    "/v1/govbr/public-authorize",
    {
      schema: {
        tags: ["GovBr"],
        summary: "Iniciar fluxo publico Gov.br",
      },
    },
    async (request, reply) => {
      const body = request.body as any;
      const recipientToken = body?.recipientToken;

      if (!recipientToken) throw new BadRequestError("Token do destinatário é obrigatório");

      // Look up the recipient to get name/email
      const tokenHash = sha256(recipientToken);
      let recipient: any;

      if (useMemory) {
        const rows = findInStore("recipients", (r: any) => r.access_token_hash === tokenHash, 1);
        if (rows.length === 0) throw new NotFoundError("Link de assinatura inválido");
        recipient = rows[0];
      } else {
        const rows = await sql`SELECT * FROM recipients WHERE access_token_hash = ${tokenHash} LIMIT 1`;
        if (rows.length === 0) throw new NotFoundError("Link de assinatura inválido");
        recipient = rows[0];
      }

      if (recipient.signed_at) throw new BadRequestError("Você já assinou este documento");

      const { authUrl, sessionId } = createGovBrAuthUrl({
        userEmail: recipient.email,
        userName: recipient.name,
        recipientToken,
        returnPath: body?.returnPath ?? `/sign/${recipientToken}`,
      });

      return reply.send({ authUrl, sessionId });
    }
  );

  // ── 2. OAuth2 callback from Gov.br ──────────────────────────
  // Gov.br redirects here after user authenticates
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/v1/govbr/callback",
    {
      schema: {
        tags: ["GovBr"],
        summary: "Callback OAuth2 do Gov.br",
      },
    },
    async (request, reply) => {
      const { code, state, error: oauthError } = request.query;

      if (oauthError) {
        return reply.redirect(`${config.webUrl}/self-sign?govbr_error=${encodeURIComponent(oauthError)}`);
      }

      if (!code || !state) {
        return reply.redirect(`${config.webUrl}/self-sign?govbr_error=missing_params`);
      }

      try {
        const { sessionId } = await handleGovBrCallback(code, state);
        const returnPath = getSessionReturnPath(sessionId);

        // Redirect to the web app callback page with session ID and return path
        return reply.redirect(
          `${config.webUrl}/govbr/callback?session_id=${sessionId}&status=ok&return_path=${encodeURIComponent(returnPath)}`
        );
      } catch (err: any) {
        return reply.redirect(
          `${config.webUrl}/self-sign?govbr_error=${encodeURIComponent(err.message)}`
        );
      }
    }
  );

  // ── 3. Get Gov.br session status (no auth required — session ID is the secret) ──
  app.get<{ Params: { sessionId: string } }>(
    "/v1/govbr/session/:sessionId",
    {
      schema: {
        tags: ["GovBr"],
        summary: "Consultar sessao Gov.br",
      },
    },
    async (request, reply) => {
      const session = getGovBrSession(request.params.sessionId);
      if (!session) throw new NotFoundError("Sessão Gov.br não encontrada ou expirada");

      return reply.send({
        sessionId: session.id,
        status: session.status,
        user: session.govbrData
          ? {
              name: session.govbrData.name,
              cpf: session.govbrData.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4"),
              email: session.govbrData.email,
              nivel: session.govbrData.nivel,
            }
          : null,
      });
    }
  );

  // ── 4. Sign document using Gov.br identity ─────────────────
  // No authGuard: session ID + recipient token together provide authorization.
  // This allows both authenticated users and public recipients to sign.
  app.post<{ Params: { sessionId: string } }>(
    "/v1/govbr/sign/:sessionId",
    {
      schema: {
        tags: ["GovBr"],
        summary: "Concluir assinatura com Gov.br",
      },
    },
    async (request, reply) => {
      const session = getGovBrSession(request.params.sessionId);
      if (!session) throw new NotFoundError("Sessão Gov.br não encontrada ou expirada");
      if (session.status !== "authenticated") {
        throw new BadRequestError("Autenticação Gov.br não concluída");
      }
      if (!session.govbrData) {
        throw new BadRequestError("Dados do Gov.br não disponíveis");
      }

      const body = request.body as any;
      const recipientToken = body?.recipientToken;
      const signaturePosition = body?.signaturePosition ?? null;
      const formFields = body?.formFields ?? {};
      const overlayFields = body?.overlayFields ?? [];

      if (!recipientToken) throw new BadRequestError("Token do destinatário é obrigatório");

      // Get recipient
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
          sha256_hash: doc?.sha256_hash,
        };
      } else {
        const rows = await sql`
          SELECT r.*, e.organization_id, e.status AS envelope_status,
                 e.title AS envelope_title, d.sha256_hash
          FROM recipients r
          JOIN envelopes e ON e.id = r.envelope_id
          JOIN documents d ON d.id = e.document_id
          WHERE r.access_token_hash = ${tokenHash} LIMIT 1
        `;
        if (rows.length === 0) throw new NotFoundError("Link de assinatura inválido");
        recipient = rows[0];
      }

      if (recipient.signed_at) throw new BadRequestError("Você já assinou este documento");
      if (recipient.envelope_status === "canceled" || recipient.envelope_status === "expired") {
        throw new BadRequestError("Este envelope não está mais disponível");
      }

      const govbrUser = session.govbrData;
      const sigLevel = getGovBrSignatureLevel(govbrUser.nivel);
      const documentHash = recipient.sha256_hash ?? "unknown";
      const signedAt = new Date().toISOString();

      // Build HMAC signature proof
      const signaturePayload = [
        recipient.envelope_id,
        recipient.id,
        recipient.email,
        documentHash,
        "govbr",
        signedAt,
        request.ip,
      ].join("|");
      const signatureHash = hmacSha256(signaturePayload, config.jwtSecret);

      // Store signature
      const sigDir = join(config.storageDir, "signatures", recipient.envelope_id);
      await mkdir(sigDir, { recursive: true });
      await writeFile(
        join(sigDir, `${recipient.id}.json`),
        JSON.stringify(
          {
            recipientId: recipient.id,
            recipientName: recipient.name,
            recipientEmail: recipient.email,
            signatureType: "govbr",
            signaturePosition,
            formFields,
            overlayFields,
            signedAt,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"] ?? null,
            documentHash,
            signatureHash,
            signaturePayloadFields:
              "envelopeId|recipientId|email|documentHash|signatureType|signedAt|ipAddress",
            hashAlgorithm: "HMAC-SHA256",
            govbr: {
              cpf: govbrUser.cpf,
              name: govbrUser.name,
              email: govbrUser.email,
              nivel: govbrUser.nivel,
              signatureLevel: sigLevel.level,
              confiabilidades: govbrUser.confiabilidades,
            },
            legalBasis: sigLevel.legalBasis,
          },
          null,
          2
        )
      );

      // Update recipient
      if (useMemory) {
        updateInStore("recipients", (r: any) => r.id === recipient.id, {
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
        eventPayload: {
          signatureType: "govbr",
          ipAddress: request.ip,
          govbrNivel: govbrUser.nivel,
          govbrCPF: govbrUser.cpf,
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
          signatureType: "govbr",
          govbrNivel: govbrUser.nivel,
        },
      });

      markGovBrSessionSigned(request.params.sessionId);

      // Try complete
      const completed = await tryCompleteEnvelope(recipient.envelope_id);

      let verificationCode: string | null = null;
      if (completed) {
        verificationCode = await generateGovBrCompletionCertificate(
          recipient.envelope_id,
          recipient.organization_id
        );
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
        govbr: {
          name: govbrUser.name,
          cpf: govbrUser.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4"),
          nivel: govbrUser.nivel,
          signatureLevel: sigLevel.level,
          legalBasis: sigLevel.legalBasis,
        },
      });
    }
  );

  // ── 5. Quick Gov.br sign (mock mode only) ───────────────────
  // Simulates the full OAuth + sign flow in one step for GOVBR_MOCK=true
  // In production, the frontend uses the real OAuth redirect flow:
  //   1) POST /v1/govbr/authorize → get authUrl → redirect user to Gov.br
  //   2) Gov.br callback → GET /v1/govbr/callback → redirect to web callback page
  //   3) Web callback page calls POST /v1/govbr/sign/:sessionId
  app.post(
    "/v1/govbr/quick-sign",
    {
      preHandler: [authGuard],
      schema: {
        tags: ["GovBr"],
        summary: "Assinatura rapida Gov.br em modo mock",
        security: [{ firebaseBearerAuth: [] }],
      },
    },
    async (request, reply) => {
      if (!GOVBR_MOCK_MODE) {
        throw new BadRequestError(
          "Quick-sign só funciona em modo mock (GOVBR_MOCK=true). " +
          "Para assinatura real, use o fluxo OAuth2 completo via /v1/govbr/authorize."
        );
      }

      const auth = request.auth;
      const body = request.body as any;
      const recipientToken = body?.recipientToken;
      const formFields = body?.formFields ?? {};
      const overlayFields = body?.overlayFields ?? [];

      if (!recipientToken) throw new BadRequestError("Token do destinatário é obrigatório");

      // Create a session, mock-authenticate, then sign
      const userRow = findInStore("users", (u: any) => u.id === auth.userId, 1)[0];
      const { sessionId } = createGovBrAuthUrl({
        userId: auth.userId,
        userEmail: auth.email,
        userName: userRow?.name ?? auth.email,
      });

      // Simulate callback
      await handleGovBrCallback("mock-code", `${sessionId}:${getGovBrSession(sessionId)!.state}`);

      // Forward to the sign endpoint
      (request as any).params = { sessionId };
      const session = getGovBrSession(sessionId)!;

      // Re-use the sign logic inline
      const govbrUser = session.govbrData!;
      const sigLevel = getGovBrSignatureLevel(govbrUser.nivel);
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
          sha256_hash: doc?.sha256_hash,
        };
      } else {
        const rows = await sql`
          SELECT r.*, e.organization_id, e.status AS envelope_status, d.sha256_hash
          FROM recipients r JOIN envelopes e ON e.id = r.envelope_id
          JOIN documents d ON d.id = e.document_id
          WHERE r.access_token_hash = ${tokenHash} LIMIT 1
        `;
        if (rows.length === 0) throw new NotFoundError("Link de assinatura inválido");
        recipient = rows[0];
      }

      if (recipient.signed_at) throw new BadRequestError("Você já assinou este documento");

      const documentHash = recipient.sha256_hash ?? "unknown";
      const signedAt = new Date().toISOString();
      const signaturePayload = [
        recipient.envelope_id, recipient.id, recipient.email,
        documentHash, "govbr", signedAt, request.ip,
      ].join("|");
      const signatureHash = hmacSha256(signaturePayload, config.jwtSecret);

      const sigDir = join(config.storageDir, "signatures", recipient.envelope_id);
      await mkdir(sigDir, { recursive: true });
      await writeFile(
        join(sigDir, `${recipient.id}.json`),
        JSON.stringify({
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          signatureType: "govbr",
          signaturePosition: null,
          formFields,
          overlayFields,
          signedAt,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
          documentHash,
          signatureHash,
          signaturePayloadFields: "envelopeId|recipientId|email|documentHash|signatureType|signedAt|ipAddress",
          hashAlgorithm: "HMAC-SHA256",
          govbr: {
            cpf: govbrUser.cpf,
            name: govbrUser.name,
            email: govbrUser.email,
            nivel: govbrUser.nivel,
            signatureLevel: sigLevel.level,
            confiabilidades: govbrUser.confiabilidades,
          },
          legalBasis: sigLevel.legalBasis,
        }, null, 2)
      );

      if (useMemory) {
        updateInStore("recipients", (r: any) => r.id === recipient.id, {
          signed_at: signedAt,
          signature_hash: signatureHash,
        });
      } else {
        await sql`UPDATE recipients SET signed_at = now(), signature_hash = ${signatureHash} WHERE id = ${recipient.id}`;
      }

      await addSignatureEvent({
        envelopeId: recipient.envelope_id,
        recipientId: recipient.id,
        eventType: "signature_completed",
        eventPayload: { signatureType: "govbr", govbrNivel: govbrUser.nivel, ipAddress: request.ip },
      });

      await auditLog({
        organizationId: recipient.organization_id,
        envelopeId: recipient.envelope_id,
        actorEmail: recipient.email,
        action: "signature_completed",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadata: { recipientId: recipient.id, signatureType: "govbr", govbrNivel: govbrUser.nivel },
      });

      markGovBrSessionSigned(sessionId);

      const completed = await tryCompleteEnvelope(recipient.envelope_id);
      let verificationCode: string | null = null;
      if (completed) {
        verificationCode = await generateGovBrCompletionCertificate(recipient.envelope_id, recipient.organization_id);
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
        govbr: {
          name: govbrUser.name,
          cpf: govbrUser.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4"),
          nivel: govbrUser.nivel,
          signatureLevel: sigLevel.level,
          legalBasis: sigLevel.legalBasis,
        },
      });
    }
  );
}

// ── Completion certificate with Gov.br data ──────────────────

async function generateGovBrCompletionCertificate(
  envelopeId: string,
  organizationId: string
): Promise<string> {
  let recipientsList: any[];
  let envData: any;
  const signatureProofs: any[] = [];

  if (useMemory) {
    recipientsList = findInStore("recipients", (r: any) => r.envelope_id === envelopeId)
      .sort((a: any, b: any) => a.signing_order - b.signing_order);
    const env = findInStore("envelopes", (e: any) => e.id === envelopeId, 1)[0];
    const doc = findInStore("documents", (d: any) => d.id === env?.document_id, 1)[0];
    envData = {
      title: env?.title, created_at: env?.created_at,
      completed_at: env?.completed_at, file_name: doc?.file_name,
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
        signatureHash: sigData.signatureHash ?? r.signature_hash,
        signatureType: sigData.signatureType,
        documentHashAtSigning: sigData.documentHash,
        ...(sigData.govbr ? { govbr: sigData.govbr } : {}),
        ...(sigData.icpBrasil ? { icpBrasil: sigData.icpBrasil } : {}),
        legalBasis: sigData.legalBasis,
      });
    } catch {
      signatureProofs.push({
        recipientId: r.id, name: r.name, email: r.email,
        signedAt: r.signed_at, signatureHash: r.signature_hash,
      });
    }
  }

  const hasGovBr = signatureProofs.some((s) => s.govbr);
  const hasIcpBrasil = signatureProofs.some((s) => s.icpBrasil?.isIcpBrasil);
  const bestLevel = hasIcpBrasil ? "qualificada" : hasGovBr ? "avançada" : "avançada";

  const certificate = {
    version: "2.0",
    type: "completion_certificate",
    platform: "ITSign",
    platformUrl: config.webUrl,
    legalBasis: {
      law: "Lei 14.063/2020",
      article: hasIcpBrasil
        ? "Art. 4° III - Assinatura eletrônica qualificada"
        : hasGovBr
        ? "Art. 4° II - Assinatura eletrônica avançada (Gov.br)"
        : "Art. 4° II - Assinatura eletrônica avançada",
      complementary: hasGovBr ? "Decreto 10.543/2020 - Gov.br" : "MP 2.200-2/2001",
      icpBrasil: hasIcpBrasil,
      govbr: hasGovBr,
      description: hasGovBr
        ? "Documento assinado utilizando identidade digital Gov.br, nos termos do Decreto 10.543/2020 e Lei 14.063/2020."
        : "Assinatura eletrônica avançada conforme Lei 14.063/2020.",
    },
    envelope: {
      id: envelopeId,
      title: envData.title,
      createdAt: envData.created_at,
      completedAt: envData.completed_at ?? new Date().toISOString(),
    },
    document: {
      fileName: envData.file_name,
      sha256Hash: envData.sha256_hash,
      hashAlgorithm: "SHA-256",
    },
    signatures: signatureProofs,
    generatedAt: new Date().toISOString(),
  };

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

  return verificationCode;
}
