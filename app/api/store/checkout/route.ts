import { json } from "@/lib/auth/http";
import { storeCheckout } from "@/lib/open-store/cart";
import { asker } from "@/lib/open-store/owner";

export const dynamic = "force-dynamic";

/** Checkout: hands back Shopify's checkout link for this visitor's cart. */
export async function POST() {
  const r = await storeCheckout(await asker());
  if (!r.ok) return json({ error: r.error }, r.status);
  return json({ ok: true, url: r.url });
}
