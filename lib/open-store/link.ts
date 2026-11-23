import "server-only";
import { linkVisitorEmail, visitorByHash } from "@/lib/db/store";
import { storeTrack } from "./analytics";
import { visitorTokenHash } from "./visitor";

/**
 * Signing in links the visitor to the email (docs/open-store.md › Visitors and sign-in). A visitor not linked yet
 * is linked to the signed-in email. One linked to a different email (a shared device) is left alone: the caller
 * starts a fresh visitor cookie for the person signing in, and the other person's pictures stay theirs.
 */
export async function linkOnSignIn(email: string, token: string): Promise<"none" | "linked" | "same" | "fresh"> {
  const visitor = await visitorByHash(visitorTokenHash(token));
  if (!visitor) return "none";
  const e = email.trim().toLowerCase();
  if (visitor.email === e) return "same";
  if (visitor.email) return "fresh";
  if (await linkVisitorEmail(visitor.id, e, "sign_in")) {
    await storeTrack("store_visitor_linked", { via: "sign_in", visitors_linked: 1 }, { visitor, email: e });
    return "linked";
  }
  return "same";
}
