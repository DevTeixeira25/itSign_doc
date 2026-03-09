import type { FastifyInstance } from "fastify";
import { registerSchema, updateProfileSchema } from "./auth.schemas.js";
import { registerUser, getUserById, getUserByEmail, updateUser } from "./auth.service.js";
import { authGuard } from "../../lib/auth-guard.js";
import { auditLog } from "../audit/audit.service.js";

export async function authRoutes(app: FastifyInstance) {
  // ── Register (Firebase-authenticated) ─────────────────────
  // The client creates the Firebase user first, then calls this
  // endpoint with the Firebase ID token to create org + local user.
  app.post(
    "/v1/auth/register",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const body = registerSchema.parse(request.body);
      const firebaseUid = request.auth.firebaseUid;
      const email = request.auth.email || body.email || '';

      const { user, organizationId } = await registerUser({
        organizationName: body.organizationName,
        name: body.name,
        email,
        firebaseUid: firebaseUid!,
      });

      await auditLog({
        organizationId,
        actorUserId: user.id,
        actorEmail: user.email,
        action: "user_registered",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.status(201).send({
        user: { id: user.id, organizationId, name: user.name, email: user.email },
      });
    }
  );

  // ── Me (profile) ──────────────────────────────────────────
  app.get(
    "/v1/auth/me",
    { preHandler: [authGuard] },
    async (request, reply) => {
      // First try by userId, then by email (for users who just registered)
      let user = request.auth.userId
        ? await getUserById(request.auth.userId)
        : null;

      if (!user && request.auth.email) {
        user = await getUserByEmail(request.auth.email);
      }

      if (!user) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: "Not Found", message: "Usuário não encontrado" });
      }
      return reply.send(user);
    }
  );

  // ── Update profile ────────────────────────────────────────
  app.patch(
    "/v1/auth/me",
    { preHandler: [authGuard] },
    async (request, reply) => {
      if (!request.auth.userId) {
        return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "Usuário não encontrado" });
      }

      const body = updateProfileSchema.parse(request.body);
      const user = await updateUser(request.auth.userId, body);

      if (!user) {
        return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "Usuário não encontrado" });
      }

      await auditLog({
        organizationId: request.auth.organizationId,
        actorUserId: request.auth.userId,
        actorEmail: request.auth.email,
        action: "profile_updated",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send(user);
    }
  );
}
