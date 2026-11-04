import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const codeRequestSchema = z.object({ email: emailSchema, purpose: z.enum(["gift", "redeem", "default"]).optional() });
export const codeVerifySchema = z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/), next: z.string().max(300).optional() });
