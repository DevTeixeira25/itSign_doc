import type { FastifyInstance } from "fastify";
import { signSchema } from "./signatures.schemas.js";
import { getRecipientByToken, signByToken } from "./signatures.service.js";
import { auditLog } from "../audit/audit.service.js";

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
}
