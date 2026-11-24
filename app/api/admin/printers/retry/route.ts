import { z } from "zod";
import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { retryJob } from "@/lib/dreamship/artwork";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Retry on Settings › Printers › Orders: re-queues a failed or flagged picture job and runs it now. */
export async function POST(req: Request) {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const p = z.object({ jobId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return json({ error: "invalid" }, 400);
  const job = await retryJob(u, p.data.jobId);
  if (!job) return json({ error: "not_found" }, 404);
  return json({ ok: true, status: job.status, reason: job.reason });
}
