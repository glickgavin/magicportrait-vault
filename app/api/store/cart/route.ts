import { json } from "@/lib/auth/http";
import { storeCartView } from "@/lib/open-store/cart";
import { asker } from "@/lib/open-store/owner";

export const dynamic = "force-dynamic";

/** The visitor's cart for the drawer: Shopify's lines and prices, our previews. Empty for a browser with none. */
export async function GET() {
  return json({ cart: await storeCartView(await asker()) });
}
