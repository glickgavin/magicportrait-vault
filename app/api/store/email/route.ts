import { z } from "zod";
import { clientIp, hashKey, json, notFoundJson, rateLimit } from "@/lib/auth/http";
import { askForPictureEmail } from "@/lib/open-store/email";
import { asker, ownsVisitor } from "@/lib/open-store/owner";
import { generationFor } from "@/lib/open-store/pictures";

export const dynamic = "force-dynamic";

const body = z.object({ generationId: z.string().uuid(), email: z.string().trim().toLowerCase().email().max(254), consent: z.boolean().default(false) });

/** The optional email given while painting (docs/open-store.md › Asking for their email). Rate-limited per visitor and IP. */
export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const a = await asker();
  if (!a.visitor) return notFoundJson();
  const [okVisitor, okIp] = await Promise.all([rateLimit(`store-email:${a.visitor.id}`, 10), rateLimit(`store-email-ip:${hashKey(await clientIp(req))}`, 30)]);
  if (!okVisitor || !okIp) return json({ error: "rate_limited" }, 429);
  const gen = await generationFor(p.data.generationId);
  if (!gen || !(await ownsVisitor(a, gen.visitor_id))) return notFoundJson();
  const r = await askForPictureEmail(gen, p.data.email, p.data.consent);
  if (!r.ok) return json({ error: r.error }, 409);
  return json({ ok: true });
}
