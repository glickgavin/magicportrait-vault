"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { StoreCartView } from "@/lib/open-store/cart";
import { formatMoney } from "@/lib/shop/money";
import { t, tn } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

/** Other store components tell the cart to open, update its count, or show a fresh cart with this event. */
export const STORE_CART_EVENT = "mmp:store-cart";
export type StoreCartEvent = { count?: number; open?: boolean; cart?: StoreCartView };

/**
 * The cart icon on every store page and its drawer from the right (docs/open-store.md › Cart and checkout):
 * each line's preview, title, size, quantity, Shopify's price, Remove, the subtotal and Checkout.
 */
export function StoreCart({ count: initial }: { count: number }) {
  const [count, setCount] = useState(initial);
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<StoreCartView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setCount(initial), [initial]);

  const show = useCallback((c: StoreCartView) => {
    setCart(c);
    setCount(c.count);
  }, []);

  const load = useCallback(async () => {
    const r = await fetch("/api/store/cart", { cache: "no-store" }).catch(() => null);
    if (r?.ok) show(((await r.json()) as { cart: StoreCartView }).cart);
  }, [show]);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<StoreCartEvent>).detail ?? {};
      if (d.cart) show(d.cart);
      else if (typeof d.count === "number") setCount(Math.max(0, d.count));
      if (d.open) setOpen(true);
    };
    window.addEventListener(STORE_CART_EVENT, on);
    return () => window.removeEventListener(STORE_CART_EVENT, on);
  }, [show]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function change(lineId: string, quantity: number | null) {
    setBusy(lineId);
    setError(null);
    const r = await fetch(`/api/store/cart/lines/${lineId}`, quantity == null ? { method: "DELETE" } : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantity }) }).catch(() => null);
    if (r?.ok) show(((await r.json()) as { cart: StoreCartView }).cart);
    else setError(t("store.cartError"));
    setBusy(null);
  }

  async function checkout() {
    setBusy("checkout");
    setError(null);
    const r = await fetch("/api/store/checkout", { method: "POST" }).catch(() => null);
    const body = r?.ok ? ((await r.json()) as { url?: string }) : null;
    if (body?.url) {
      window.location.assign(body.url);
      return;
    }
    setError(t("store.cartError"));
    setBusy(null);
  }

  const lines = cart?.lines ?? [];
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) trackClient("store_cart_opened", { lines: cart?.lines.length ?? count, subtotal: cart?.subtotal ?? null });
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
          <div className="flex h-14 flex-none items-center justify-between border-b border-[#EDEAE2] px-4">
            <Dialog.Title className="text-[18px] font-extrabold">{t("store.cartTitle")}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label={t("store.close")} className="flex h-11 w-11 items-center justify-center rounded-[12px] hover:bg-black/5">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              {cart ? (
                <>
                  <p className="text-[17px] font-extrabold">{t("store.cartEmpty")}</p>
                  <p className="text-[14px] text-ink-2">{t("store.cartEmptySub")}</p>
                </>
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-[#B8059F]" aria-label={t("store.loading")} />
              )}
            </div>
          ) : (
            <>
              <ul className="flex-1 divide-y divide-[#EDEAE2] overflow-y-auto px-4" data-testid="store-cart-lines">
                {lines.map((l) => (
                  <li key={l.id} className="flex gap-3 py-4" data-testid="store-cart-line">
                    {l.preview ? <img src={`/api/store/files/${l.preview}`} alt="" className="ph-no-capture h-20 w-20 flex-none rounded-[10px] bg-page object-cover" data-ph-mask /> : <span className="h-20 w-20 flex-none rounded-[10px] bg-page" aria-hidden="true" />}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[15px] font-extrabold leading-[1.3]">{l.title}</span>
                      {l.variant && <span className="text-[13px] text-[#616161]">{l.variant}</span>}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="flex h-9 items-center rounded-[10px] border border-[#D9D5CA]" role="group" aria-label={`${t("store.quantity")}: ${l.title}`}>
                          <button type="button" aria-label={t("store.less")} disabled={busy !== null || l.quantity <= 1} onClick={() => change(l.id, l.quantity - 1)} className="flex h-full w-9 items-center justify-center disabled:opacity-40">
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <span className="w-6 text-center text-[14px] font-extrabold" data-testid="store-cart-qty">
                            {l.quantity}
                          </span>
                          <button type="button" aria-label={t("store.moreQty")} disabled={busy !== null} onClick={() => change(l.id, l.quantity + 1)} className="flex h-full w-9 items-center justify-center disabled:opacity-40">
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <span className="text-[15px] font-extrabold">
                          {Number(l.total) < Number(l.subtotal) && <span className="mr-1.5 text-[13px] font-normal text-[#6b6b6b] line-through">{formatMoney(l.subtotal, cart!.currency)}</span>}
                          {formatMoney(l.total, cart!.currency)}
                        </span>
                      </div>
                      <button type="button" disabled={busy !== null} onClick={() => change(l.id, null)} className="self-start text-[13px] font-bold text-[#616161] underline disabled:opacity-40">
                        {t("store.remove")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-none flex-col gap-2.5 border-t border-[#EDEAE2] p-4">
                <div className="flex items-baseline justify-between text-[16px]">
                  <span className="font-extrabold">{t("store.subtotal")}</span>
                  <span className="font-extrabold" data-testid="store-cart-subtotal">
                    {formatMoney(cart!.total, cart!.currency)}
                  </span>
                </div>
                <p className="text-[13px] text-[#616161]">{t("store.shippingAtCheckout")}</p>
                {error && (
                  <p role="alert" className="text-[14px] font-bold text-[#a1251b]">
                    {error}
                  </p>
                )}
                <button type="button" disabled={busy !== null} onClick={checkout} data-testid="store-checkout" className={cn("bg-primary-gradient shadow-primary flex h-14 items-center justify-center gap-2 rounded-[12px] text-[17px] font-extrabold text-white disabled:opacity-60")}>
                  {busy === "checkout" && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                  {t("store.checkout")}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
