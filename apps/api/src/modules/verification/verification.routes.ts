import type { FastifyInstance } from "fastify";
import { verifyByCode, getVerificationCode } from "../signatures/signatures.service.js";
import { authGuard } from "../../lib/auth-guard.js";

export async function verificationRoutes(app: FastifyInstance) {
  // ── Public: verify a signed document by code ──────────────
  app.get<{ Params: { code: string } }>(
    "/v1/verify/:code",
    async (request, reply) => {
      const result = await verifyByCode(request.params.code);
      return reply.send(result);
    }
  );

  // ── Authenticated: get verification code for an envelope ──
  app.get<{ Params: { id: string } }>(
    "/v1/envelopes/:id/verification",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const code = await getVerificationCode(request.params.id);
      if (!code) {
        return reply.status(404).send({
          statusCode: 404,
          message: "Certificado de conclusão ainda não gerado. O envelope precisa estar concluído.",
        });
      }
      return reply.send({ verificationCode: code, verificationUrl: `${app.listeningOrigin ?? ""}` });
    }
  );
}
