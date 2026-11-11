import "server-only";
import { cartLines, openCartFor } from "@/lib/db/shop";

/**
 * The header's cart count (0 when there's no cart). Cheap: our own rows only. In its own module so the
 * customer layout, which runs on every page, doesn't load the cart's image and preview code.
 */
export async function cartCount(email: string): Promise<number> {
  try {
    const cart = await openCartFor(email);
    if (!cart) return 0;
    return (await cartLines(cart.id)).reduce((n, l) => n + l.quantity, 0);
  } catch {
    return 0;
  }
}
