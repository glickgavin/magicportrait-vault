"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Gift, Mail, Image as ImageIcon, Package, MessageCircle, Headphones, Info, ShoppingBag } from "lucide-react";
import type { SessionUser } from "@/lib/auth/types";
import { Avatar } from "@/components/Avatar";
import { SignOutButton } from "@/components/SignOutButton";
import { t } from "@/lib/i18n";
import { mainSite, PRODUCT_ITEMS } from "@/lib/site-links";
import { openChat } from "@/lib/intercom";
import { trackClient } from "@/lib/track-client";

const MAGENTA = "#DD07C4";

export function MenuSheet({ user, mainSiteUrl, thumbnails = [], cardsEnabled = true, shopVisible = false }: { user: SessionUser | null; mainSiteUrl: string; thumbnails?: string[]; cardsEnabled?: boolean; shopVisible?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  const mine = [
    ...(cardsEnabled ? [{ href: "/create", label: t("ui.menu.createCard"), Icon: Gift, isNew: true }] : []),
    // The shop (docs/shop.md): only while it's visible to this person.
    ...(shopVisible
      ? [
          { href: "/gifts", label: t("ui.menu.gifts"), Icon: Gift, isNew: false, badge: true },
          { href: "/products", label: t("ui.menu.products"), Icon: ShoppingBag, isNew: false, badge: true },
        ]
      : []),
    { href: "/cards", label: t("ui.menu.myCards"), Icon: Mail, isNew: false },
    { href: "/portraits", label: t("ui.menu.myPortraits"), Icon: ImageIcon, isNew: false },
    { href: "/orders", label: t("ui.menu.orders"), Icon: Package, isNew: false },
  ] as { href: string; label: string; Icon: typeof Gift; isNew: boolean; badge?: boolean }[];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label={t("ui.menu.open")} data-testid="menu-button" className="flex h-10 w-10 items-center justify-center rounded-[12px] hover:bg-black/5">
          <Menu className="h-8 w-8" strokeWidth={2.5} style={{ color: "rgba(0,0,0,0.8)" }} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content
          className="animate-sheet-left fixed inset-y-0 left-0 z-50 flex w-full flex-col overflow-y-auto sm:max-w-[420px]"
          style={{ backgroundColor: "#FBF6EE" }}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{t("ui.menu.title")}</Dialog.Title>
          <div className="flex items-center justify-between px-6 pb-2 pt-6">
            <img src="/mp-logo.svg" alt={t("app.logoAlt")} className="h-8 w-auto" />
            <Dialog.Close asChild>
              <button type="button" aria-label={t("ui.menu.close")} className="flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ backgroundColor: "rgba(0,0,0,0.05)" }}>
                <X className="h-5 w-5" style={{ color: "rgba(0,0,0,0.8)" }} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mx-6 mt-4 border-t border-black/[0.08] pt-5 text-xs font-bold uppercase tracking-[0.12em] text-ink-2">{t("ui.menu.myGroup")}</div>
          <nav aria-label={t("ui.menu.myGroup")} className="flex flex-col px-6 pb-4 pt-2">
            {mine.map(({ href, label, Icon, isNew, badge }) => (
              <Link
                key={href}
                href={href}
                onClick={() => {
                  if (href === "/create") trackClient("menu_create_card_tapped", { signed_in: Boolean(user) });
                  close();
                }}
                aria-current={pathname === href ? "page" : undefined}
                className="flex items-center gap-4 py-1.5"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-full ${isNew ? "bg-avatar-gradient text-white" : "bg-pink-tint text-magenta"}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className={`flex-1 text-[17px] ${isNew ? "font-bold" : "font-medium"} text-ink`}>{label}</span>
                {(isNew || badge) && <span className="rounded-full bg-pink-tint px-2 py-0.5 text-[11px] font-extrabold text-pink-dark">{t("ui.menu.new")}</span>}
              </Link>
            ))}
          </nav>

          <div className="mx-6 border-t border-black/[0.08] pt-5 text-[13px] font-bold text-pink-link">
            {t("ui.menu.lead")}
          </div>
          <nav aria-label={t("ui.menu.lead")} className="flex flex-col px-6 pb-4 pt-1">
            {PRODUCT_ITEMS.map((item, i) => (
              <a key={item.path} href={mainSite(mainSiteUrl, item.path)} onClick={close} className="grid grid-cols-[28px_44px_1fr] items-center gap-4 py-1.5">
                <span className="font-gothic text-[26px] leading-none" style={{ color: "rgba(0,0,0,0.5)", letterSpacing: "0.04em" }} aria-hidden="true">
                  {item.n}
                </span>
                <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[10px]" style={{ backgroundColor: item.tint }}>
                  {thumbnails[i] ? <img src={thumbnails[i]} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon className="h-5 w-5 text-black/40" aria-hidden="true" />}
                </span>
                <span className="text-[17px] text-ink">{t(item.titleKey)}</span>
              </a>
            ))}
          </nav>

          <div className="mx-6 flex flex-col gap-1 border-t border-black/[0.08] py-4 text-[16px] text-ink">
            <a href={mainSite(mainSiteUrl, "/faq")} className="flex items-center gap-4 py-2.5 hover:opacity-70">
              <MessageCircle className="h-5 w-5" style={{ color: MAGENTA }} aria-hidden="true" />
              {t("ui.footer.faq")}
            </a>
            <button type="button" onClick={() => { openChat(); close(); }} className="flex items-center gap-4 py-2.5 text-left hover:opacity-70">
              <Headphones className="h-5 w-5" style={{ color: MAGENTA }} aria-hidden="true" />
              {t("ui.footer.chat")}
            </button>
            <a href={mainSite(mainSiteUrl, "/about")} className="flex items-center gap-4 py-2.5 hover:opacity-70">
              <Info className="h-5 w-5" style={{ color: MAGENTA }} aria-hidden="true" />
              {t("ui.footer.about")}
            </a>
          </div>

          <div className="mx-6 mb-6 mt-auto">
            {user ? (
              <div className="flex items-center gap-3 rounded-[16px] bg-black/[0.04] p-3">
                <Avatar initials={user.initials} size={40} />
                <div className="min-w-0 flex-1">
                  {user.name && <div className="truncate text-[15px] font-bold">{user.name}</div>}
                  <div className="truncate text-[13px] text-ink-2">{user.email}</div>
                </div>
                <SignOutButton withIcon={false} className="h-10 rounded-[10px] bg-white px-3 text-sm font-bold text-ink shadow-sm" />
              </div>
            ) : (
              <Link href="/signin" onClick={close} className="flex h-12 items-center justify-center rounded-[14px] bg-black/[0.05] font-bold text-pink-link">
                {t("ui.menu.signIn")}
              </Link>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
