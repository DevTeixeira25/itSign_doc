import { z } from "zod";

export const signSchema = z.object({
  signatureData: z.string().min(1),
  signatureType: z.enum(["draw", "type", "upload"]),
});
