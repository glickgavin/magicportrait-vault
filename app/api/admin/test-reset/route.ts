import { adminOr404 } from "@/lib/admin/guard";
import { json } from "@/lib/auth/http";
import { resetMyTestState } from "@/lib/admin/test-reset";

export const dynamic = "force-dynamic";

/** Settings › Magic Store › Start again as a new visitor: the super user's own shopping state, for testing. */
export async function POST() {
  const u = await adminOr404();
  if (u instanceof Response) return u;
  return json({ ok: true, ...(await resetMyTestState(u)) });
}
