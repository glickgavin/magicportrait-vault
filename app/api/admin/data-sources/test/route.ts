import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { SOURCE_NAMES, testSource } from "@/lib/sources/health";
import "@/lib/sources/extra-checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const body = z.object({ source: z.union([z.enum(SOURCE_NAMES), z.literal("all")]) });

/** "Test" and "Test all" in Settings › Data sources. Records only counts and timings. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const list = p.data.source === "all" ? SOURCE_NAMES : [p.data.source];
  const results = [];
  for (const s of list) results.push(await testSource(s, u.email));
  return json({ results });
}
