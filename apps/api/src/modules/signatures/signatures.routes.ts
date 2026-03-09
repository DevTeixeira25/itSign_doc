import type { FastifyInstance } from "fastify";
import { signSchema } from "./signatures.schemas.js";
import { getRecipientByToken, signByToken } from "./signatures.service.js";
import { auditLog } from "../audit/audit.service.js";
import { getSignedDocumentFile } from "../documents/documents.service.js";
import { findInStore } from "../../lib/memory-store.js";
import { sql, useMemory } from "../../db.js";

export async function signatureRoutes(app: FastifyInstance) {
  // ── Get signing info (public – token-based) ───────────────
  app.get<{ Params: { token: string } }>(
    "/v1/sign/:token",
    async (request, reply) => {
      const recipient = await getRecipientByToken(request.params.token);

      await auditLog({
        organizationId: recipient.organization_id,
        envelopeId: recipient.envelope_id,
        actorEmail: recipient.email,
        action: "recipient_viewed",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadata: { recipientId: recipient.id },
      });

      return reply.send({
        recipientId: recipient.id,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        role: recipient.role,
        envelopeTitle: recipient.envelope_title,
        documentFileName: recipient.file_name,
        envelopeStatus: recipient.envelope_status,
        alreadySigned: !!recipient.signed_at,
      });
    }
  );

  // ── Sign document (public – token-based) ──────────────────
  app.post<{ Params: { token: string } }>(
    "/v1/sign/:token",
    async (request, reply) => {
      const body = signSchema.parse(request.body);
      const result = await signByToken(request.params.token, body, {
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      return reply.send(result);
    }
  );

  // ── Download signed document (public – token-based) ───────
  app.get<{ Params: { token: string } }>(
    "/v1/sign/:token/download",
    async (request, reply) => {
      const recipient = await getRecipientByToken(request.params.token);

      // Only allow download if the recipient has signed
      if (!recipient.signed_at) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Você precisa assinar o documento antes de fazer o download",
        });
      }

      // Get the document ID from the envelope
      let documentId: string;
      if (useMemory) {
        const env = findInStore("envelopes", (e: any) => e.id === recipient.envelope_id, 1)[0];
        if (!env) return reply.status(404).send({ statusCode: 404, message: "Envelope não encontrado" });
        documentId = env.document_id;
      } else {
        const rows = await sql`SELECT document_id FROM envelopes WHERE id = ${recipient.envelope_id} LIMIT 1`;
        if (rows.length === 0) return reply.status(404).send({ statusCode: 404, message: "Envelope não encontrado" });
        documentId = rows[0].document_id;
      }

      const buffer = await getSignedDocumentFile(documentId, recipient.organization_id, recipient.envelope_id);

      return reply
        .header("Content-Type", recipient.mime_type || "application/pdf")
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(recipient.file_name || "documento.pdf")}"`)
        .header("Content-Length", buffer.length)
        .send(buffer);
    }
  );
}
