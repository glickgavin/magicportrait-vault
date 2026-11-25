"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** `tail` is the end of the label, hidden on phones (still read out), so the three tabs fit at 390 px. */
export type ProductTab = { id: string; label: string; tail?: string; content: ReactNode };

/**
 * Settings › Shop › one product: the tabs under the header (Magic Store, Gifts & Products pages, Print rules).
 * Every tab stays mounted, so what's typed and not yet saved survives switching. The open tab is kept in the
 * address (`?tab=`), so a link can open the page on the right one.
 */
export function ProductTabs({ tabs, initial }: { tabs: ProductTab[]; initial: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // A #dreamship (or other) anchor from an older link opens the tab holding it.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const holder = tabs.find((t) => document.getElementById(`tabpanel-${t.id}`)?.querySelector(`#${CSS.escape(id)}`));
    if (holder) {
      setActive(holder.id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    }
  }, [tabs]);

  const open = (id: string) => {
    setActive(id);
    // At once, without a server round trip. A null state is how Next.js keeps its router in step with
    // history.replaceState, so its refresh after a save keeps the tab in the address.
    const u = new URL(window.location.href);
    u.searchParams.set("tab", id);
    u.hash = "";
    window.history.replaceState(null, "", u.toString());
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Product settings" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={on}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => open(t.id)}
              onKeyDown={(e) => {
                const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const n = (i + d + tabs.length) % tabs.length;
                open(tabs[n].id);
                refs.current[n]?.focus();
              }}
              className={cn(
                "h-11 flex-none whitespace-nowrap rounded-full border px-3 text-[14px] font-bold sm:px-4 sm:text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DD07C4]",
                on ? "border-[#DD07C4] bg-pink-tint text-pink-dark" : "border-line bg-white text-ink hover:bg-black/[0.03]",
              )}
            >
              {t.label}
              {t.tail && <span className="sr-only sm:not-sr-only">{t.tail}</span>}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`tabpanel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={t.id !== active} tabIndex={0} className="focus:outline-none">
          {t.content}
        </div>
      ))}
    </div>
  );
}
