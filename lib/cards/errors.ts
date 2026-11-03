import { ZodError } from "zod";
import { json } from "@/lib/auth/http";
import { CardError } from "./create";

export function cardErrorResponse(e: unknown) {
  if (e instanceof ZodError) return json({ error: "invalid", fields: e.issues.map((i) => i.path.join(".")) }, 400);
  if (e instanceof CardError) return json({ error: e.code, ...e.extra }, e.status);
  console.error(`[cards] ${(e as Error).message}`);
  return json({ error: "server_error" }, 500);
}
