import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyFirebaseToken } from "./firebase-admin.js";
import { findInStore } from "./memory-store.js";
import { sql, useMemory } from "../db.js";

export interface AuthPayload {
  userId: string;
  organizationId: string;
  email: string;
  firebaseUid: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthPayload;
  }
}

/**
 * Fastify preHandler hook – verifies Firebase ID token and attaches `request.auth`.
 * Looks up the local user by firebase_uid or email to populate userId/organizationId.
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
    const decoded = await verifyFirebaseToken(token);
    const email = decoded.email ?? "";
    const firebaseUid = decoded.uid;

    // Look up local user by firebase_uid or email
    let localUser: any = null;

    if (useMemory) {
      const byUid = findInStore("users", (u) => u.firebase_uid === firebaseUid, 1);
      if (byUid.length > 0) {
        localUser = byUid[0];
      } else {
        const byEmail = findInStore("users", (u) => u.email === email, 1);
        if (byEmail.length > 0) localUser = byEmail[0];
      }
    } else {
      const rows = await sql`
        SELECT id, organization_id, email FROM users
        WHERE firebase_uid = ${firebaseUid} OR email = ${email}
        LIMIT 1
      `;
      if (rows.length > 0) localUser = rows[0];
    }

    if (localUser) {
      request.auth = {
        userId: localUser.id,
        organizationId: localUser.organization_id,
        email: localUser.email,
        firebaseUid,
      };
    } else {
      // User authenticated with Firebase but not yet registered in our system.
      // Allow the request through with partial auth so /register can work.
      request.auth = {
        userId: "",
        organizationId: "",
        email,
        firebaseUid,
      };
    }
  } catch (err) {
    request.log.error(
      {
        err,
        authHeaderPresent: Boolean(header),
        tokenPrefix: token.slice(0, 16),
      },
      "Firebase token verification failed"
    );
    return reply
      .status(401)
      .send({ statusCode: 401, error: "Unauthorized", message: "Token inválido ou expirado" });
  }
}
