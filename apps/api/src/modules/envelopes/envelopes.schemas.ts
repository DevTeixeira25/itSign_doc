import { z } from "zod";

export const createEnvelopeSchema = z.object({
  title: z.string().min(1).max(255),
  documentId: z.string().uuid(),
  message: z.string().max(2000).optional(),
  recipients: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        email: z.string().email().max(320),
        role: z.enum(["signer", "approver", "viewer"]),
        signingOrder: z.number().int().min(1),
      })
    )
    .min(1)
    .max(50),
  expiresAt: z.string().datetime().optional(),
});

export const sendEnvelopeSchema = z.object({
  message: z.string().max(2000).optional(),
});
