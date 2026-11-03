import { z } from "zod";
import { adminOr404, actorOf } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { setSetting } from "@/lib/settings";
import { SECTIONS, SETTING_TYPES, getDef, isSettingKey } from "@/lib/settings/registry";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

const body = z.object({
  key: z.string().min(3).max(120),
  value: z.unknown(),
  type: z.enum(SETTING_TYPES).optional(),
  section: z.enum(SECTIONS).optional(),
  label: z.string().max(120).optional(),
});

/** Change one setting (registry validation; history by trigger; `setting_changed` never carries the value). */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const { key, value } = p.data;
  if (!isSettingKey(key)) {
    const section = key.split(".")[0];
    if (!(SECTIONS as readonly string[]).includes(section)) return json({ error: `Section must be one of: ${SECTIONS.join(", ")}` }, 400);
  }
  const r = await setSetting(key, value, u.email, { type: p.data.type, section: p.data.section ?? (key.split(".")[0] as (typeof SECTIONS)[number]), label: p.data.label });
  if (!r.ok) return json({ error: r.error }, 400);
  if (r.changed) await track("setting_changed", { key, section: isSettingKey(key) ? getDef(key).section : key.split(".")[0] }, { email: u.email, actor: actorOf(u), ref: { type: "setting", id: key } });
  return json({ ok: true, changed: r.changed });
}
