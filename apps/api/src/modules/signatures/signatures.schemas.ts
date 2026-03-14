import { z } from "zod";

export const signPositionSchema = z.object({
  page: z.number().int().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
}).optional();

export const signSchema = z.object({
  signatureData: z.string().min(1),
  signatureType: z.enum(["draw", "type", "upload"]),
  signaturePosition: signPositionSchema,
  formFields: z.record(z.union([z.string(), z.boolean(), z.array(z.string())])).optional(),
  overlayFields: z.array(z.object({
    id: z.string().optional(),
    type: z.enum(["text", "check", "cross", "dot"]),
    page: z.number().int().min(1),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    width: z.number().min(1).max(100),
    height: z.number().min(1).max(100),
    value: z.string().optional(),
  })).optional(),
});
