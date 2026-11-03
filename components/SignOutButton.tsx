"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { resetClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

export function SignOutButton({ className, withIcon = true }: { className?: string; withIcon?: boolean }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      resetClient();
      // Full reload on purpose: clears every bit of client state after sign-out.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/signin";
    }
  }
  return (
    <button type="button" onClick={signOut} disabled={busy} className={cn("inline-flex items-center justify-center gap-2", className)}>
      {withIcon && <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />}
      {t("ui.account.signOut")}
    </button>
  );
}
