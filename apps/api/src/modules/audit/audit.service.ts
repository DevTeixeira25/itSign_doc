import { sql, useMemory } from "../../db.js";
import { insertIntoStore, findInStore } from "../../lib/memory-store.js";
import { uuid } from "../../lib/crypto.js";
import type { AuditAction } from "@itsign/shared-types";

interface AuditInput {
  organizationId: string;
  envelopeId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function auditLog(input: AuditInput): Promise<void> {
  const row = {
    id: uuid(),
    organization_id: input.organizationId,
    envelope_id: input.envelopeId ?? null,
    actor_user_id: input.actorUserId ?? null,
    actor_email: input.actorEmail ?? null,
    action: input.action,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    metadata: input.metadata ?? null,
  };

  if (useMemory) {
    insertIntoStore("audit_logs", row);
    return;
  }

  await sql`
    INSERT INTO audit_logs (id, organization_id, envelope_id, actor_user_id, actor_email, action, ip_address, user_agent, metadata)
    VALUES (
      ${row.id}, ${row.organization_id}, ${row.envelope_id}, ${row.actor_user_id},
      ${row.actor_email}, ${row.action}, ${row.ip_address}, ${row.user_agent},
      ${row.metadata ? sql.json(row.metadata as any) : null}
    )
  `;
}

export async function getAuditTrail(envelopeId: string) {
  if (useMemory) {
    return findInStore("audit_logs", (r) => r.envelope_id === envelopeId)
      .sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
  }

  return sql`
    SELECT id, organization_id, envelope_id, actor_user_id, actor_email,
           action, ip_address, user_agent, metadata, created_at
    FROM audit_logs
    WHERE envelope_id = ${envelopeId}
    ORDER BY created_at ASC
  `;
}

export async function addSignatureEvent(input: {
  envelopeId: string;
  recipientId?: string | null;
  eventType: AuditAction;
  eventPayload?: Record<string, unknown> | null;
}): Promise<void> {
  const row = {
    id: uuid(),
    envelope_id: input.envelopeId,
    recipient_id: input.recipientId ?? null,
    event_type: input.eventType,
    event_payload: input.eventPayload ?? null,
  };

  if (useMemory) {
    insertIntoStore("signature_events", row);
    return;
  }

  await sql`
    INSERT INTO signature_events (id, envelope_id, recipient_id, event_type, event_payload)
    VALUES (
      ${row.id}, ${row.envelope_id}, ${row.recipient_id}, ${row.event_type},
      ${row.event_payload ? sql.json(row.event_payload as any) : null}
    )
  `;
}
