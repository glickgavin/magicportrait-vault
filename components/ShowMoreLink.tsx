"use client";

import Link, { useLinkStatus } from "next/link";
import { t } from "@/lib/i18n";

function Label({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-live="polite" className={pending ? "opacity-70" : undefined}>
      {pending ? t("ui.loading") : children}
    </span>
  );
}

/** A "Show more" link that says it's loading the moment it's tapped (the same page reads everything). */
export function ShowMoreLink({ href, className, testId, children }: { href: string; className?: string; testId?: string; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className={className} data-testid={testId}>
      <Label>{children}</Label>
    </Link>
  );
}
