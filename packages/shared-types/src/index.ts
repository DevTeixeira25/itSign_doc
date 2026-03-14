// ─── Enums / Union Types ───────────────────────────────────────────

export type EnvelopeStatus =
  | "draft"
  | "sent"
  | "in_progress"
  | "completed"
  | "canceled"
  | "expired";

export type RecipientRole = "signer" | "approver" | "viewer";

export type RecipientStatus = "pending" | "sent" | "viewed" | "signed" | "declined";

export type AuditAction =
  | "envelope_created"
  | "envelope_sent"
  | "envelope_viewed"
  | "envelope_completed"
  | "envelope_canceled"
  | "envelope_expired"
  | "document_uploaded"
  | "document_viewed"
  | "recipient_email_sent"
  | "recipient_email_opened"
  | "recipient_viewed"
  | "signature_started"
  | "signature_completed"
  | "signature_declined"
  | "certificate_generated"
  | "user_registered"
  | "profile_updated"
  | "user_login"
  | "user_logout";

// ─── Entities ──────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  createdAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Document {
  id: string;
  organizationId: string;
  fileName: string;
  mimeType: string;
  storageKey: string;
  sha256Hash: string;
  uploadedBy: string;
  createdAt: string;
}

export interface Envelope {
  id: string;
  organizationId: string;
  documentId: string;
  title: string;
  status: EnvelopeStatus;
  createdBy: string;
  expiresAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Recipient {
  id: string;
  envelopeId: string;
  name: string;
  email: string;
  role: RecipientRole;
  signingOrder: number;
  status: RecipientStatus;
  signedAt: string | null;
  createdAt: string;
}

export interface SignatureEvent {
  id: string;
  envelopeId: string;
  recipientId: string | null;
  eventType: AuditAction;
  eventPayload: Record<string, unknown> | null;
  occurredAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  envelopeId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  action: AuditAction;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CompletionCertificate {
  id: string;
  envelopeId: string;
  certificateStorageKey: string;
  certificateSha256: string;
  generatedAt: string;
}

// ─── API Inputs ────────────────────────────────────────────────────

export interface RegisterInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: Omit<User, "createdAt">;
}

export interface CreateEnvelopeInput {
  title: string;
  documentId: string;
  message?: string;
  recipients: Array<{
    name: string;
    email: string;
    role: RecipientRole;
    signingOrder: number;
  }>;
  expiresAt?: string;
}

export interface SignInput {
  signatureData: string;       // base64 of drawn signature or typed name
  signatureType: "draw" | "type" | "upload";
}

// ─── API Responses ─────────────────────────────────────────────────

export interface EnvelopeDetail extends Envelope {
  document: Pick<Document, "id" | "fileName" | "mimeType">;
  recipients: Array<Omit<Recipient, "envelopeId">>;
  auditTrail: AuditLog[];
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
