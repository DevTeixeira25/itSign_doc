import { z } from "zod";

export const registerSchema = z.object({
  organizationName: z.string().min(2).max(200),
  name: z.string().min(2).max(200),
  email: z.string().email().max(320).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(200).optional(),
});
