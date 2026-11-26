import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { checkAllDreamship, saveAllDreamship } from "@/lib/dreamship/link";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Settings › Printers › Check all Dreamship products (docs/dreamship.md › Part A): `check` reads every Dreamship
 * product and writes nothing; `save` links the ones found and writes what differs to Shopify (allowed write 5).
 */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = z.object({ action: z.enum(["check", "save"]) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  try {
    const r = p.data.action === "check" ? await checkAllDreamship(u.email) : await saveAllDreamship(u);
    return json({ ok: true, ...r });
  } catch (e) {
    return json({ error: `Couldn't reach Dreamship or Shopify: ${(e as Error).message.slice(0, 120)}` }, 502);
  }
}
