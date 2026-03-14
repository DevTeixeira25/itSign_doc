import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { documentRoutes } from "./modules/documents/documents.routes.js";
import { envelopeRoutes } from "./modules/envelopes/envelopes.routes.js";
import { signatureRoutes } from "./modules/signatures/signatures.routes.js";
import { verificationRoutes } from "./modules/verification/verification.routes.js";
import { certificateRoutes } from "./modules/certificates/certificates.routes.js";
import { govbrRoutes } from "./modules/govbr/govbr.routes.js";
import { AppError } from "./lib/errors.js";
import { ZodError } from "zod";

export function buildApp() {
  const app = Fastify({ logger: true });

  // ── Plugins ──────────────────────────────────────────────
  app.register(cors, { origin: true, exposedHeaders: ["Content-Disposition"] });
  app.register(fastifyJwt, { secret: config.jwtSecret });
  app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });
  app.register(fastifySwagger, {
    mode: "dynamic",
    openapi: {
      info: {
        title: "ITSign API",
        description: "Documentacao OpenAPI da API do ITSign para integracao com sistemas externos.",
        version: "1.0.0",
      },
      servers: [
        { url: "http://localhost:3001", description: "Ambiente local" },
      ],
      tags: [
        { name: "Health", description: "Disponibilidade da API" },
        { name: "Auth", description: "Autenticacao e perfil" },
        { name: "Documents", description: "Upload e consulta de documentos" },
        { name: "Envelopes", description: "Criacao e gerenciamento de envelopes" },
        { name: "Signatures", description: "Assinatura publica por token" },
        { name: "Verification", description: "Verificacao publica e certificados" },
        { name: "Certificates", description: "Validacao e assinatura com certificado digital" },
        { name: "GovBr", description: "Fluxos de assinatura com Gov.br" },
      ],
      components: {
        securitySchemes: {
          firebaseBearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Firebase ID Token enviado em Authorization: Bearer <token>",
          },
        },
      },
    },
    transform: ({ schema, url }) => {
      if (url.startsWith("/docs")) {
        return { schema: { ...schema, hide: true }, url };
      }
      return { schema, url };
    },
  });
  app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
    staticCSP: false,
  });

  // ── Error handler ────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        message: "Dados inválidos",
        details: error.flatten().fieldErrors,
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Erro interno do servidor",
    });
  });

  // ── Health check ─────────────────────────────────────────
  app.get("/health", {
    schema: {
      tags: ["Health"],
      summary: "Health check",
      response: {
        200: {
          type: "object",
          properties: {
            service: { type: "string", example: "itsign-api" },
            status: { type: "string", example: "ok" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
      },
    },
  }, async () => ({
    service: "itsign-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  app.get("/v1", {
    schema: {
      tags: ["Health"],
      summary: "Lista resumida de endpoints",
      response: {
        200: {
          type: "object",
          properties: {
            name: { type: "string", example: "ITSign API" },
            version: { type: "string", example: "v1" },
            endpoints: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
  }, async () => ({
    name: "ITSign API",
    version: "v1",
    endpoints: [
      "POST /v1/auth/register",
      "GET  /v1/auth/me",
      "POST /v1/documents",
      "GET  /v1/documents",
      "GET  /v1/documents/:id",
      "GET  /v1/documents/:id/download",
      "POST /v1/envelopes",
      "GET  /v1/envelopes",
      "GET  /v1/envelopes/:id",
      "POST /v1/envelopes/:id/send",
      "POST /v1/envelopes/:id/cancel",
      "GET  /v1/sign/:token",
      "POST /v1/sign/:token",
      "GET  /v1/sign/:token/download",
      "GET  /v1/verify/:code",
      "GET  /v1/envelopes/:id/verification",
      "POST /v1/certificates/validate",
      "POST /v1/sign-with-certificate",
      "POST /v1/govbr/authorize",
      "GET  /v1/govbr/callback",
      "GET  /v1/govbr/session/:sessionId",
      "POST /v1/govbr/sign/:sessionId",
      "POST /v1/govbr/quick-sign",
    ],
  }));

  // ── Routes ───────────────────────────────────────────────
  app.register(authRoutes);
  app.register(documentRoutes);
  app.register(envelopeRoutes);
  app.register(signatureRoutes);
  app.register(verificationRoutes);
  app.register(certificateRoutes);
  app.register(govbrRoutes);

  return app;
}
