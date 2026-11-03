"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mail, Image as ImageIcon, Package, Settings } from "lucide-react";
import type { SessionUser } from "@/lib/auth/types";
import { Avatar } from "@/components/Avatar";
import { SignOutButton } from "@/components/SignOutButton";
import { Badge } from "@/components/ui/Badge";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";

export function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { href: "/cards", label: t("ui.menu.myCards"), Icon: Mail },
    { href: "/portraits", label: t("ui.menu.myPortraits"), Icon: ImageIcon },
    { href: "/orders", label: t("ui.menu.orders"), Icon: Package },
  ];

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={t("ui.account.openFor", { initials: user.initials })}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="avatar-button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) trackClient("account_menu_opened", { is_super_user: user.isSuperUser });
        }}
        className="absolute right-[56px] top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full"
      >
        <span className="rounded-full" style={{ boxShadow: "0 0 0 2px #F3F1E7, 0 0 0 3.5px rgba(221,7,196,0.35)" }}>
          <Avatar initials={user.initials} size={34} />
        </span>
      </button>
      {open && (
        <div
          ref={ref}
          role="menu"
          aria-label={t("ui.account.title")}
          className="animate-fade absolute right-3 top-[58px] z-50 w-[316px] max-w-[calc(100vw-24px)] rounded-[24px] bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
        >
          <div className="flex items-center gap-3 border-b border-black/10 pb-4">
            <Avatar initials={user.initials} size={48} />
            <div className="min-w-0">
              {user.name && <div className="truncate text-[17px] font-bold text-ink">{user.name}</div>}
              <div className="truncate text-sm text-ink-2">{user.email}</div>
            </div>
          </div>
          <nav className="flex flex-col py-2">
            {items.map(({ href, label, Icon }) => (
              <Link key={href} href={href} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-[10px] px-1 py-2.5 text-[16px] font-medium text-pink-link hover:bg-black/[0.03]">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </Link>
            ))}
            {user.isSuperUser && (
              <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-[10px] px-1 py-2.5 text-[16px] font-medium text-pink-link hover:bg-black/[0.03]">
                <Settings className="h-5 w-5" aria-hidden="true" />
                <span className="flex-1">{t("ui.account.settings")}</span>
                <Badge tone="dark">{t("ui.account.superUser")}</Badge>
              </Link>
            )}
          </nav>
          <div className="border-t border-black/10 pt-3">
            <SignOutButton className="h-12 w-full rounded-[14px] bg-black/[0.05] text-[16px] font-bold text-pink-link hover:bg-black/[0.08]" />
          </div>
        </div>
      )}
    </>
  );
}
