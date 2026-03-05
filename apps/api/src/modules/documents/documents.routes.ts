import type { FastifyInstance } from "fastify";
import { authGuard } from "../../lib/auth-guard.js";
import { uploadDocument, getDocument, listDocuments } from "./documents.service.js";
import { auditLog } from "../audit/audit.service.js";

export async function documentRoutes(app: FastifyInstance) {
  // ── Upload document ───────────────────────────────────────
  app.post(
    "/v1/documents",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Nenhum arquivo enviado",
        });
      }

      const buffer = await file.toBuffer();
      const doc = await uploadDocument({
        organizationId: request.auth.organizationId,
        uploadedBy: request.auth.userId,
        fileName: file.filename,
        mimeType: file.mimetype,
        data: buffer,
      });

      await auditLog({
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        actorEmail: request.auth.email,
        action: "document_uploaded",
        metadata: { documentId: doc.id, fileName: doc.fileName, sha256: doc.sha256Hash },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.status(201).send(doc);
    }
  );

  // ── List documents ────────────────────────────────────────
  app.get(
    "/v1/documents",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const docs = await listDocuments(request.auth.organizationId);
      return reply.send({ data: docs });
    }
  );

  // ── Get single document ───────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/v1/documents/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const doc = await getDocument(request.params.id, request.auth.organizationId);
      return reply.send(doc);
    }
  );
}
