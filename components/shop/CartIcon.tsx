"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { tn } from "@/lib/i18n";

const EVENT = "mmp:cart-count";

/** Tell the header's cart the new count (after add to cart, a quantity change or a removal), without reloading the page. */
export function announceCartCount(count: number) {
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: count }));
}

/** The header's cart, shown only while the cart has something in it (docs/shop.md). */
export function CartIcon({ count: initial }: { count: number }) {
  const [count, setCount] = useState(initial);
  // A fresh count from the server (a navigation or refresh) wins.
  useEffect(() => setCount(initial), [initial]);
  useEffect(() => {
    const on = (e: Event) => setCount(Math.max(0, Number((e as CustomEvent<number>).detail) || 0));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  if (count <= 0) return null;
  return (
    <Link href="/cart" aria-label={tn("shop.cartLabel", count)} className="absolute right-[60px] top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[12px] bg-black/5">
      <ShoppingBag className="h-[18px] w-[18px] text-ink" aria-hidden="true" />
      <span className="bg-avatar-gradient absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold text-white shadow-[0_0_0_2px_#F3F1E7]">{count > 99 ? "99+" : count}</span>
    </Link>
  );
}
