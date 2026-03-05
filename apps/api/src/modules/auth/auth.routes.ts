import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "./auth.schemas.js";
import { registerUser, authenticateUser, getUserById } from "./auth.service.js";
import { authGuard } from "../../lib/auth-guard.js";
import { auditLog } from "../audit/audit.service.js";
import { AppError } from "../../lib/errors.js";

export async function authRoutes(app: FastifyInstance) {
  // ── Register ──────────────────────────────────────────────
  app.post("/v1/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const { user, organizationId } = await registerUser(body);

    const token = app.jwt.sign(
      { userId: user.id, organizationId, email: user.email },
      { expiresIn: "8h" }
    );

    await auditLog({
      organizationId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "user_login",
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return reply.status(201).send({
      accessToken: token,
      user: { id: user.id, organizationId, name: user.name, email: user.email },
    });
  });

  // ── Login ─────────────────────────────────────────────────
  app.post("/v1/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await authenticateUser(body.email, body.password);

    const token = app.jwt.sign(
      {
        userId: result.userId,
        organizationId: result.organizationId,
        email: result.email,
      },
      { expiresIn: "8h" }
    );

    await auditLog({
      organizationId: result.organizationId,
      actorUserId: result.userId,
      actorEmail: result.email,
      action: "user_login",
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return reply.send({
      accessToken: token,
      user: {
        id: result.userId,
        organizationId: result.organizationId,
        name: result.name,
        email: result.email,
      },
    });
  });

  // ── Me (profile) ──────────────────────────────────────────
  app.get(
    "/v1/auth/me",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const user = await getUserById(request.auth.userId);
      if (!user) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: "Not Found", message: "Usuário não encontrado" });
      }
      return reply.send(user);
    }
  );
}
