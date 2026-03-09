import type { FastifyInstance } from "fastify";
import { authGuard } from "../../lib/auth-guard.js";
import { uploadDocument, getDocument, listDocuments, getDocumentFile, getSignedDocumentFile } from "./documents.service.js";
import { auditLog } from "../audit/audit.service.js";
import { findInStore } from "../../lib/memory-store.js";
import { sql, useMemory } from "../../db.js";

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

  // ── Download document file (authenticated) ────────────────
  app.get<{ Params: { id: string } }>(
    "/v1/documents/:id/download",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const doc = await getDocument(request.params.id, request.auth.organizationId);

      // Find the envelope for this document to embed signatures
      let envelopeId: string | null = null;
      if (useMemory) {
        const envRows = findInStore("envelopes", (e: any) => e.document_id === doc.id && e.organization_id === doc.organizationId, 1);
        if (envRows.length > 0) envelopeId = envRows[0].id;
      } else {
        const envRows = await sql`SELECT id FROM envelopes WHERE document_id = ${doc.id} AND organization_id = ${doc.organizationId} LIMIT 1`;
        if (envRows.length > 0) envelopeId = envRows[0].id;
      }

      const buffer = envelopeId
        ? await getSignedDocumentFile(doc.id, doc.organizationId, envelopeId)
        : await getDocumentFile(doc.id, doc.organizationId);

      return reply
        .header("Content-Type", doc.mimeType || "application/pdf")
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.fileName)}"`)
        .header("Content-Length", buffer.length)
        .send(buffer);
    }
  );
}
