"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { TrackedLink } from "@/components/TrackedLink";
import { t } from "@/lib/i18n";

/** "Sign in" from a store page comes back to the same page (docs/open-store.md › Visitors and sign-in). */
export function StoreSignIn({ className }: { className?: string }) {
  const path = usePathname() || "/store";
  const q = useSearchParams()?.toString();
  // Only the store's own pages: a `next` outside /store falls back to /store.
  const back = path.startsWith("/store") ? `${path}${q ? `?${q}` : ""}` : "/store";
  return (
    <TrackedLink href={`/signin?next=${encodeURIComponent(back)}`} event="store_signin_tapped" props={{ page: path.startsWith("/store/product") ? "product" : "store" }} className={className}>
      {t("store.signIn")}
    </TrackedLink>
  );
}
