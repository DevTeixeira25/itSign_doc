import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import { config } from "./config.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { documentRoutes } from "./modules/documents/documents.routes.js";
import { envelopeRoutes } from "./modules/envelopes/envelopes.routes.js";
import { signatureRoutes } from "./modules/signatures/signatures.routes.js";
import { AppError } from "./lib/errors.js";
import { ZodError } from "zod";

export function buildApp() {
  const app = Fastify({ logger: true });

  // ── Plugins ──────────────────────────────────────────────
  app.register(cors, { origin: true });
  app.register(fastifyJwt, { secret: config.jwtSecret });
  app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
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
  app.get("/health", async () => ({
    service: "itsign-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  app.get("/v1", async () => ({
    name: "ITSign API",
    version: "v1",
    endpoints: [
      "POST /v1/auth/register",
      "POST /v1/auth/login",
      "GET  /v1/auth/me",
      "POST /v1/documents",
      "GET  /v1/documents",
      "GET  /v1/documents/:id",
      "POST /v1/envelopes",
      "GET  /v1/envelopes",
      "GET  /v1/envelopes/:id",
      "POST /v1/envelopes/:id/send",
      "POST /v1/envelopes/:id/cancel",
      "GET  /v1/sign/:token",
      "POST /v1/sign/:token",
    ],
  }));

  // ── Routes ───────────────────────────────────────────────
  app.register(authRoutes);
  app.register(documentRoutes);
  app.register(envelopeRoutes);
  app.register(signatureRoutes);

  return app;
}
