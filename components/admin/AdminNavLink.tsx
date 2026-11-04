"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNavLink({ href, label }: { href: string; label: string }) {
  const path = usePathname();
  const active = href === "/settings" ? path === "/settings" : path.startsWith(href);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={cn("block shrink-0 whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[15px] text-white/90 hover:bg-white/10", active && "bg-white/15 font-bold text-white")}>
      {label}
    </Link>
  );
}
