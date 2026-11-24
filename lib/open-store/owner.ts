import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";
import { visitorLinkedTo, type StoreVisitorRow } from "@/lib/db/store";
import { currentVisitor } from "./visitor";

/**
 * Who may touch a visitor's things (CLAUDE.md › Security; docs/open-store.md › Limits, security and privacy):
 * the browser whose cookie is that visitor, or a signed-in email linked to that visitor.
 * Super users may see files (for support), never act as the visitor.
 */
export type Asker = { visitor: StoreVisitorRow | null; user: SessionUser | null };

export async function asker(): Promise<Asker> {
  const [visitor, user] = await Promise.all([currentVisitor(), getSessionUser()]);
  return { visitor, user };
}

export async function ownsVisitor(a: Asker, visitorId: string): Promise<boolean> {
  if (a.visitor?.id === visitorId) return true;
  if (!a.user) return false;
  return visitorLinkedTo(visitorId, a.user.email);
}

export async function canSeeVisitorFile(a: Asker, visitorId: string): Promise<boolean> {
  return (await ownsVisitor(a, visitorId)) || Boolean(a.user?.isSuperUser);
}
