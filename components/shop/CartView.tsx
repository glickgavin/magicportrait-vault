"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CartView as Cart } from "@/lib/shop/cart";
import { formatMoney } from "@/lib/shop/money";
import { t, tn } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TrackPageView } from "@/components/TrackPageView";
import { announceCartCount } from "./CartIcon";

type Line = Cart["lines"][number];

/**
 * A line's price: Shopify's own when its line total includes a discount, otherwise ours (the same
 * percentage as on the product pages), so the discount shows on every item either way.
 */
export function linePrice(l: Line): { was: string | null; now: string; pct: number | null } {
  if (l.shopify && Number(l.shopify.subtotal) > Number(l.shopify.total)) {
    const pct = Math.round((1 - Number(l.shopify.total) / Number(l.shopify.subtotal)) * 100);
    return { was: l.shopify.subtotal, now: l.shopify.total, pct };
  }
  if (l.ourTotal !== null && Number(l.ourTotal) < Number(l.listTotal)) {
    return { was: l.listTotal, now: l.ourTotal, pct: Math.round((1 - Number(l.ourTotal) / Number(l.listTotal)) * 100) };
  }
  return { was: null, now: l.shopify?.total ?? l.listTotal, pct: null };
}

/** Quantity changes and removals not yet confirmed by the server: line id → new quantity, or null when removed. */
export type PendingLines = Record<string, number | null>;

/**
 * The cart as it will be once the pending changes are saved, so a tap shows at once. Prices scale with
 * the quantity; Shopify's cart-level figures are left out until the server's answer replaces this guess.
 */
export function withPending(cart: Cart, pending: PendingLines): Cart {
  if (!Object.keys(pending).length) return cart;
  const scale = (a: string, from: number, to: number) => ((Math.round(Number(a) * 100) * to) / from / 100).toFixed(2);
  const lines = cart.lines.flatMap((l): Line[] => {
    if (!(l.id in pending)) return [l];
    const q = pending[l.id];
    if (q === null) return [];
    if (q === l.quantity) return [l];
    return [
      {
        ...l,
        quantity: q,
        listTotal: scale(l.listTotal, l.quantity, q),
        ourTotal: l.ourTotal === null ? null : scale(l.ourTotal, l.quantity, q),
        shopify: l.shopify ? { subtotal: scale(l.shopify.subtotal, l.quantity, q), total: scale(l.shopify.total, l.quantity, q) } : null,
      },
    ];
  });
  return { ...cart, lines, count: lines.reduce((n, l) => n + l.quantity, 0), hasGift: lines.some((l) => l.page === "gifts"), figures: null };
}

/** The cart: lines with their previews, "Who's it for?" only when it holds a gift, Shopify's figures, Checkout. */
export function CartView({ cart: saved, maxQty, maxMessage, label }: { cart: Cart; maxQty: number; maxMessage: number; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingLines>({});
  const [refreshing, startRefresh] = useTransition();
  const timers = useRef<Record<string, { timer: ReturnType<typeof setTimeout>; quantity: number | null }>>({});
  const sending = useRef(new Set<Promise<void>>());
  const cart = withPending(saved, pending);
  const [giftFor, setGiftFor] = useState(cart.giftFor);
  const [message, setMessage] = useState(cart.giftMessage);
  const [state, setState] = useState<{ busy: boolean; error: string | null; nameError: boolean }>({ busy: false, error: null, nameError: false });
  const money = (a: string | number) => formatMoney(a, cart.currency);
  const blocked = cart.lines.some((l) => l.problem);
  const unsaved = Object.keys(pending).length > 0 || refreshing;

  // The server's answer replaces the guesses once nothing else is waiting to be saved.
  useEffect(() => {
    if (!sending.current.size && !Object.keys(timers.current).length) setPending({});
  }, [saved]);
  useEffect(() => () => Object.values(timers.current).forEach((w) => clearTimeout(w.timer)), []);

  function send(id: string, quantity: number | null): Promise<void> {
    delete timers.current[id];
    const p = (async () => {
      const r = await fetch(`/api/shop/cart/lines/${id}`, quantity === null ? { method: "DELETE" } : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantity }) }).catch(() => null);
      if (!r?.ok) {
        setPending((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setState((st) => ({ ...st, error: t("shop.checkoutErrors.other") }));
      }
    })();
    sending.current.add(p);
    void p.finally(() => {
      sending.current.delete(p);
      startRefresh(() => router.refresh());
    });
    return p;
  }

  /** Shows the change at once; quick taps on + or − are saved together a moment later. */
  function change(id: string, quantity: number | null) {
    const next = { ...pending, [id]: quantity };
    setPending(next);
    announceCartCount(withPending(saved, next).count);
    clearTimeout(timers.current[id]?.timer);
    timers.current[id] = { quantity, timer: setTimeout(() => void send(id, quantity), quantity === null ? 0 : 350) };
  }

  /** Saves every change still waiting, so checkout reads the cart as the customer sees it. */
  async function saveAll() {
    for (const [id, w] of Object.entries(timers.current)) {
      clearTimeout(w.timer);
      void send(id, w.quantity);
    }
    await Promise.all([...sending.current]);
  }

  async function checkout() {
    if (cart.hasGift && !giftFor.trim()) {
      setState({ busy: false, error: t("shop.checkoutErrors.gift_name_required"), nameError: true });
      return;
    }
    setState({ busy: true, error: null, nameError: false });
    await saveAll();
    const r = await fetch("/api/shop/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cart.hasGift ? { giftFor, giftMessage: message } : {}) });
    const b = (await r.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };
    if (r.ok && b.checkoutUrl) {
      window.location.assign(b.checkoutUrl);
      return;
    }
    const known = ["gift_name_required", "gift_message_too_long", "lines_need_attention", "shopify_unavailable", "rate_limited", "empty"];
    setState({ busy: false, error: t(`shop.checkoutErrors.${known.includes(b.error ?? "") ? b.error : "other"}`), nameError: b.error === "gift_name_required" });
    if (b.error === "lines_need_attention") router.refresh();
  }

  if (!cart.lines.length) {
    return (
      <div className="mx-auto flex max-w-[640px] flex-col items-center gap-4 py-10 text-center">
        <TrackPageView event="page_view_cart" props={{ lines: 0 }} />
        <h1 className="text-[26px] font-extrabold">{t("shop.cartTitle")}</h1>
        <p className="text-[15px] text-ink-2">{t("shop.cartEmpty")}</p>
        <div className="grid w-full max-w-[420px] grid-cols-2 gap-2">
          <Link href="/gifts" className="bg-primary-gradient shadow-primary flex h-12 items-center justify-center rounded-[12px] font-extrabold text-white">
            {t("shop.shopGifts")}
          </Link>
          <Link href="/products" className="flex h-12 items-center justify-center rounded-[12px] border border-black/15 bg-white font-bold">
            {t("shop.shopProducts")}
          </Link>
        </div>
      </div>
    );
  }

  // Shopify's figures when they include the discount; otherwise our own, so the discount always shows.
  const shopifyDiscounted = Boolean(cart.figures && Number(cart.figures.discount) > 0);
  const cents = (a: string) => Math.round(Number(a) * 100);
  const listSum = cart.lines.reduce((n, l) => n + cents(l.listTotal), 0) / 100;
  const ourSum = cart.lines.reduce((n, l) => n + cents(linePrice(l).now), 0) / 100;
  const summary = shopifyDiscounted && cart.figures
    ? { items: cart.figures.subtotal, discount: cart.figures.discount, total: cart.figures.total, atCheckout: false }
    : { items: (cart.figures?.subtotal ?? listSum).toString(), discount: (listSum - ourSum).toFixed(2), total: ourSum.toString(), atCheckout: listSum - ourSum > 0 };
  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-4">
      <TrackPageView event="page_view_cart" props={{ lines: cart.lines.length, has_gift: cart.hasGift, subtotal: cart.figures?.subtotal ?? null, customer_type: cart.customerType }} />
      <Link href={cart.hasGift ? "/gifts" : "/products"} className="-ml-2 flex h-11 w-fit items-center gap-1 px-2 text-[15px] font-bold text-ink">
        ‹ {t("shop.keepShopping")}
      </Link>
      <div className="flex items-baseline gap-3">
        <h1 className="text-[26px] font-extrabold leading-8 lg:text-[32px]">{t("shop.cartTitle")}</h1>
        <span className="text-[14px] text-ink-2">{tn("shop.cartItems", cart.count)}</span>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <ul aria-label={t("shop.items")} className="min-w-0 flex-[999_1_420px] rounded-[20px] bg-white px-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          {cart.lines.map((l, i) => {
            const price = linePrice(l);
            return (
            <li key={l.id} className={cn("flex gap-3 py-4", i > 0 && "border-t border-black/[0.07]")}>
              {l.previewUrl ? <img src={l.previewUrl} alt={t("shop.previewAlt", { product: l.productTitle })} className="ph-no-capture h-[76px] w-[76px] flex-none rounded-[12px] object-cover lg:h-[112px] lg:w-[112px]" /> : <span className="h-[76px] w-[76px] flex-none rounded-[12px] bg-black/5 lg:h-[112px] lg:w-[112px]" aria-hidden="true" />}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[16px] font-bold lg:text-[18px]">{l.productTitle}</span>
                  <span className="flex flex-none flex-col items-end" data-testid="line-price">
                    {price.was && (
                      <s className="text-[12px] text-ink-2">
                        <span className="sr-only">{t("shop.was")} </span>
                        {money(price.was)}
                      </s>
                    )}
                    <span className={cn("text-[15px] font-extrabold", price.was && "text-pink-dark")}>{money(price.now)}</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
                  {l.page === "gifts" && <span className="rounded-[6px] bg-pink-tint px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-pink-dark">{t("shop.gift").toUpperCase()}</span>}
                  <span>{[l.variantTitle, t(l.page === "gifts" ? "shop.fromGifts" : "shop.fromProducts")].filter(Boolean).join(" · ")}</span>
                </div>
                {price.was && price.pct !== null && <span className="text-[12px] font-bold text-pink-dark">{t("shop.lineDiscount", { label, pct: price.pct })}</span>}
                {l.problem && (
                  <p role="alert" className="text-[13px] font-bold text-[#a1251b]">
                    {t(`shop.problems.${l.problem}`)}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-4 pt-1">
                  {!l.problem && (
                    <div role="group" aria-label={`${t("shop.quantity")}: ${l.productTitle}`} className="flex items-center overflow-hidden rounded-[10px] border border-black/15">
                      <button type="button" aria-label={t("shop.fewer")} disabled={l.quantity <= 1} onClick={() => change(l.id, l.quantity - 1)} className="h-9 w-9 text-[18px] disabled:opacity-40">
                        −
                      </button>
                      <span className="w-7 text-center text-[15px] font-bold" aria-live="polite">
                        {l.quantity}
                      </span>
                      <button type="button" aria-label={t("shop.moreOne")} disabled={l.quantity >= maxQty} onClick={() => change(l.id, l.quantity + 1)} className="h-9 w-9 text-[18px] disabled:opacity-40">
                        +
                      </button>
                    </div>
                  )}
                  <button type="button" onClick={() => change(l.id, null)} className="h-9 text-[13px] font-bold text-pink-link">
                    {t("shop.remove")}
                  </button>
                </div>
              </div>
            </li>
            );
          })}
        </ul>

        <aside className="flex w-full flex-col gap-4 lg:max-w-[400px] lg:flex-[1_1_340px]">
          {cart.hasGift && (
            <section aria-labelledby="who-title" className="flex flex-col gap-3 rounded-[20px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <div>
                <h2 id="who-title" className="text-[18px] font-extrabold">
                  {t("shop.whoTitle")}
                </h2>
                <p className="text-[13px] text-ink-2">{t("shop.whoSub")}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gift-for" className="text-[14px] font-bold">
                  {t("shop.theirName")}
                </label>
                <input id="gift-for" value={giftFor} maxLength={120} required aria-invalid={state.nameError || undefined} onChange={(e) => setGiftFor(e.target.value)} placeholder={t("shop.namePlaceholder")} className={cn("h-12 rounded-[12px] border bg-white px-3.5 text-[16px]", state.nameError ? "border-[#a1251b]" : "border-black/20")} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gift-message" className="text-[14px] font-bold">
                  {t("shop.giftMessage")}
                </label>
                <textarea id="gift-message" rows={3} value={message} maxLength={maxMessage} onChange={(e) => setMessage(e.target.value)} placeholder={t("shop.messagePlaceholder")} className="resize-none rounded-[12px] border border-black/20 bg-white px-3.5 py-3 text-[16px] leading-[22px]" />
                <div className="flex justify-between gap-2 text-[12px] text-ink-2">
                  <span>{t("shop.messageNote")}</span>
                  <span className="flex-none">
                    {message.length} / {maxMessage}
                  </span>
                </div>
              </div>
            </section>
          )}
          <section aria-label={t("shop.subtotal")} aria-busy={unsaved || undefined} className={cn("flex flex-col gap-1.5 rounded-[20px] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-opacity", unsaved && "opacity-70")}>
            <div className="flex justify-between text-[14px] text-ink-2">
              <span>{t("shop.items")}</span>
              <span>{money(summary.items)}</span>
            </div>
            {Number(summary.discount) > 0 && (
              <div className="flex justify-between text-[14px] font-bold text-pink-dark" data-testid="cart-discount">
                <span>{label}</span>
                <span>−{money(summary.discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-black/[0.08] pt-2 text-[17px] font-extrabold">
              <span>{t("shop.subtotal")}</span>
              <span>{money(summary.total)}</span>
            </div>
            {summary.atCheckout && <span className="text-[13px] font-bold text-pink-dark">{t("shop.discountAtCheckout", { label })}</span>}
            <span className="text-[13px] text-ink-2">{cart.figures || cart.pct ? t("shop.shippingNote") : t("shop.pricesNote")}</span>
            <button type="button" disabled={state.busy || blocked} onClick={() => void checkout()} className="bg-primary-gradient shadow-primary mt-3 h-13 rounded-[12px] py-3.5 text-[16px] font-extrabold text-white disabled:opacity-50">
              {state.busy ? t("shop.checkingOut") : t("shop.checkout")}
            </button>
            {state.error && (
              <p role="alert" className="text-[14px] text-[#a1251b]">
                {state.error}
              </p>
            )}
            <p className="text-center text-[13px] leading-[18px] text-ink-2">
              {t("shop.checkoutNote")} {cart.hasGift ? t("shop.checkoutGiftNote") : ""}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
