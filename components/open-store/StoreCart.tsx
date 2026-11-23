"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ShoppingCart, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t, tn } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";

/** Other store components tell the cart to open or update its count with this event. */
export const STORE_CART_EVENT = "mmp:store-cart";

/**
 * The cart icon on every store page and its drawer from the right (docs/open-store.md › Cart and checkout).
 * Open store 2: the icon and the empty drawer; Open store 4 fills it with the visitor's Shopify cart.
 */
export function StoreCart({ count: initial }: { count: number }) {
  const [count, setCount] = useState(initial);
  const [open, setOpen] = useState(false);
  useEffect(() => setCount(initial), [initial]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ count?: number; open?: boolean }>).detail ?? {};
      if (typeof d.count === "number") setCount(Math.max(0, d.count));
      if (d.open) setOpen(true);
    };
    window.addEventListener(STORE_CART_EVENT, on);
    return () => window.removeEventListener(STORE_CART_EVENT, on);
  }, []);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) trackClient("store_cart_opened", { lines: count, subtotal: null });
      }}
    >
      <Dialog.Trigger asChild>
        <button type="button" aria-label={count ? tn("store.cartLabel", count) : t("store.cartEmptyLabel")} data-testid="store-cart-button" className="relative flex h-11 w-11 items-center justify-center rounded-[12px] hover:bg-black/5">
          <ShoppingCart className="h-6 w-6 text-ink" aria-hidden="true" strokeWidth={1.8} />
          {count > 0 && <span className="bg-avatar-gradient absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold text-white shadow-[0_0_0_2px_#F3F1E7]">{count > 99 ? "99+" : count}</span>}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col bg-white shadow-[-12px_0_40px_rgba(0,0,0,0.18)] focus:outline-none" data-testid="store-cart">
          <div className="flex h-14 items-center justify-between border-b border-[#EDEAE2] px-4">
            <Dialog.Title className="text-[18px] font-extrabold">{t("store.cartTitle")}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label={t("store.close")} className="flex h-11 w-11 items-center justify-center rounded-[12px] hover:bg-black/5">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p className="text-[17px] font-extrabold">{t("store.cartEmpty")}</p>
            <p className="text-[14px] text-ink-2">{t("store.cartEmptySub")}</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
