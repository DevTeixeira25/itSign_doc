import type { FastifyInstance } from "fastify";
import { authGuard } from "../../lib/auth-guard.js";
import { createEnvelopeSchema } from "./envelopes.schemas.js";
import {
  createEnvelope,
  sendEnvelope,
  getEnvelope,
  listEnvelopes,
  cancelEnvelope,
} from "./envelopes.service.js";
import { auditLog } from "../audit/audit.service.js";

export async function envelopeRoutes(app: FastifyInstance) {
  // ── Create envelope ───────────────────────────────────────
  app.post(
    "/v1/envelopes",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const body = createEnvelopeSchema.parse(request.body);
      const result = await createEnvelope({
        organizationId: request.auth.organizationId,
        createdBy: request.auth.userId,
        title: body.title,
        documentId: body.documentId,
        recipients: body.recipients,
        expiresAt: body.expiresAt,
      });

      await auditLog({
        organizationId: request.auth.organizationId,
        envelopeId: result.id,
        actorUserId: request.auth.userId,
        actorEmail: request.auth.email,
        action: "envelope_created",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        metadata: { title: body.title, recipientCount: body.recipients.length },
      });

      return reply.status(201).send(result);
    }
  );

  // ── Send envelope (draft → sent) ─────────────────────────
  app.post<{ Params: { id: string } }>(
    "/v1/envelopes/:id/send",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const result = await sendEnvelope(
        request.params.id,
        request.auth.organizationId
      );

      await auditLog({
        organizationId: request.auth.organizationId,
        envelopeId: result.id,
        actorUserId: request.auth.userId,
        actorEmail: request.auth.email,
        action: "envelope_sent",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send(result);
    }
  );

  // ── List envelopes ────────────────────────────────────────
  app.get(
    "/v1/envelopes",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const query = request.query as { page?: string; pageSize?: string };
      const page = Math.max(1, Number(query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
      const result = await listEnvelopes(
        request.auth.organizationId,
        page,
        pageSize
      );
      return reply.send(result);
    }
  );

  // ── Get envelope detail ───────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/v1/envelopes/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const envelope = await getEnvelope(
        request.params.id,
        request.auth.organizationId
      );
      return reply.send(envelope);
    }
  );

  // ── Cancel envelope ───────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    "/v1/envelopes/:id/cancel",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const result = await cancelEnvelope(
        request.params.id,
        request.auth.organizationId
      );

      await auditLog({
        organizationId: request.auth.organizationId,
        envelopeId: result.id,
        actorUserId: request.auth.userId,
        actorEmail: request.auth.email,
        action: "envelope_canceled",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send(result);
    }
  );
}
