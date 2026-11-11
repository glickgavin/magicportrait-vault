import { getSettings } from "@/lib/settings";
import { cartView } from "@/lib/shop/cart";
import { discountSettingFor } from "@/lib/shop";
import { requireShopUser } from "@/lib/shop/pages";
import { CartView } from "@/components/shop/CartView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your cart" };

/** /cart: 404 while the shop is hidden from this person. */
export default async function CartPage() {
  const user = await requireShopUser("/cart");
  const [cart, s] = await Promise.all([cartView(user.email), getSettings(["shop.cart_line_max_qty", "shop.gift_message_max_chars"] as const)]);
  const { label } = await discountSettingFor(cart.customerType);
  return <CartView cart={cart} maxQty={s["shop.cart_line_max_qty"]} maxMessage={s["shop.gift_message_max_chars"]} label={label} />;
}
