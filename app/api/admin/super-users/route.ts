import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { emailSchema } from "@/lib/auth/schemas";
import { db } from "@/lib/db/client";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const body = z.object({ action: z.enum(["add", "remove"]), email: emailSchema });

/** Add or remove a super user. You can't remove yourself or the last one. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "Enter a valid email." }, 400);
  const { action, email } = p.data;
  if (action === "add") {
    const r = await db().from("super_users").insert({ email, added_by: u.email });
    if (r.error && r.error.code !== "23505") return json({ error: "Couldn't add." }, 500);
    if (!r.error) await track("super_user_added", { added: true }, { email: u.email, actor: actorOf(u), ref: { type: "customer", id: email } });
    return json({ ok: true });
  }
  if (email === u.email) return json({ error: "You can't remove yourself." }, 409);
  const count = (await db().from("super_users").select("email", { count: "exact", head: true })).count ?? 0;
  if (count <= 1) return json({ error: "You can't remove the last super user." }, 409);
  await db().from("super_users").delete().eq("email", email);
  await track("super_user_removed", { removed: true }, { email: u.email, actor: actorOf(u), ref: { type: "customer", id: email } });
  return json({ ok: true });
}
