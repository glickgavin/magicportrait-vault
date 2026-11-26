"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** What the store keeps in the browser itself (not cookies): cleared too, so the next visit is a first one. */
const BROWSER_KEYS = ["mmp_store_first_visit", "mmp_store_email_ask_closed"];

/**
 * Settings › Magic Store › Testing: "Start again as a new visitor". Clears the super user's own shopping state
 * (POST /api/admin/test-reset) and this browser's store notes; they stay signed in.
 */
export function TestReset() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function reset() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/test-reset", { method: "POST" }).catch(() => null);
    const b = (await r?.json().catch(() => null)) as { visitors?: number; pictures?: number; files?: number; shopCarts?: number } | null;
    for (const k of BROWSER_KEYS) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        /* no storage: nothing kept there */
      }
    }
    setBusy(false);
    setConfirming(false);
    if (!r?.ok || !b) return setMsg({ ok: false, text: "Couldn't reset just now. Try again." });
    const n = (k: number | undefined, one: string, many: string) => `${k ?? 0} ${(k ?? 0) === 1 ? one : many}`;
    setMsg({ ok: true, text: `Done: ${n(b.visitors, "visitor", "visitors")}, ${n(b.pictures, "picture", "pictures")}, ${n(b.files, "file", "files")} and ${n(b.shopCarts, "shop cart", "shop carts")} removed. You're still signed in; the store will treat you as new.` });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="test-reset">
      {!confirming ? (
        <Button variant="secondary" className="self-start" disabled={busy} onClick={() => setConfirming(true)}>
          Start again as a new visitor
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] font-semibold">Delete your own photos, pictures and carts, and the store cookies?</span>
          <Button variant="danger" disabled={busy} onClick={() => void reset()}>
            {busy ? "Resetting…" : "Yes, start again"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
      {msg && (
        <p role="status" className={msg.ok ? "text-[14px] font-bold text-[#1f6b35]" : "text-[14px] font-bold text-[#a1251b]"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
