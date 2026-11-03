import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { flushOutbox, retryFailed } from "@/lib/klaviyo";

export const dynamic = "force-dynamic";

export async function POST() {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  const n = await retryFailed();
  const counts = await flushOutbox();
  return json({ requeued: n, ...counts });
}
