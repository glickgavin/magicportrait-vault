import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";

/** /api/admin/*: 404 (not 401/403) unless the signed-in email is a super user, so the API reveals nothing. */
export async function adminOr404(): Promise<SessionUser | Response> {
  const u = await getSessionUser();
  if (!u?.isSuperUser) return new Response("Not found", { status: 404 });
  return u;
}

export const actorOf = (u: SessionUser) => `super_user:${u.email}` as const;
