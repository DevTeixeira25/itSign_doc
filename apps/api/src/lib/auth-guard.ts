import type { FastifyRequest, FastifyReply } from "fastify";

export interface AuthPayload {
  userId: string;
  organizationId: string;
  email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthPayload;
  }
}

/**
 * Fastify preHandler hook – verifies JWT and attaches `request.auth`.
 */
export async function authGuard(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply
      .status(401)
      .send({ statusCode: 401, error: "Unauthorized", message: "Token ausente" });
  }

  const token = header.slice(7);

  try {
    const decoded = request.server.jwt.verify<AuthPayload>(token);
    request.auth = decoded;
  } catch {
    return reply
      .status(401)
      .send({ statusCode: 401, error: "Unauthorized", message: "Token inválido ou expirado" });
  }
}
