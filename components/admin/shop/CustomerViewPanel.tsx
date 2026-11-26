"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Template } from "@/lib/shop/template";
import { cn } from "@/lib/utils";
import { DRAFT_MESSAGE, READY_MESSAGE } from "./CustomerView";

const SCREENS = { phone: { w: 390, h: 760, label: "Phone" }, desktop: { w: 1280, h: 800, label: "Desktop" } } as const;
type Screen = keyof typeof SCREENS;

/**
 * "Customer view" in the template editor: the real Magic Store product page in a frame, at phone or desktop size,
 * showing the draft as it's edited (photo, frame photos, the personalisation fields, the border, Reposition).
 * It's a preview only: nothing is tracked, generated or added to a cart from it.
 */
export function CustomerViewPanel({ productLegacyId, template }: { productLegacyId: string; template: Template }) {
  const uid = useId();
  const [screen, setScreen] = useState<Screen>("phone");
  const [state, setState] = useState<"ready" | "start">("ready");
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const latest = useRef(template);
  const send = () => frame.current?.contentWindow?.postMessage({ type: DRAFT_MESSAGE, template: latest.current }, window.location.origin);

  useEffect(() => {
    latest.current = template;
    // A moment after the last change, so dragging a corner doesn't flood the frame.
    const id = window.setTimeout(send, 200);
    return () => window.clearTimeout(id);
  }, [template]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.source === frame.current?.contentWindow && (e.data as { type?: string } | null)?.type === READY_MESSAGE) send();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const s = SCREENS[screen];
  const scale = width ? Math.min(1, width / s.w) : 1;
  const tab = (on: boolean) => cn("flex h-9 cursor-pointer items-center rounded-full px-3.5 text-[13px] focus-within:ring-2 focus-within:ring-[#DD07C4] focus-within:ring-offset-2", on ? "bg-ink font-extrabold text-white" : "border border-line bg-white font-bold");
  return (
    <section aria-labelledby={`${uid}-t`} className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="customer-view">
      <div>
        <h2 id={`${uid}-t`} className="text-[17px] font-extrabold">
          Customer view
        </h2>
        <p className="text-[13px] text-ink-2">The product page as customers will see it, with a sample picture and your draft (before you publish). Try it: pick a frame or size, type a name, add a border, open Reposition. Nothing here is saved, tracked or added to a cart.</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div role="radiogroup" aria-label="Screen" className="flex gap-2">
          {(Object.keys(SCREENS) as Screen[]).map((k) => (
            <label key={k} className={tab(screen === k)}>
              <input type="radio" className="sr-only" name={`${uid}-screen`} checked={screen === k} onChange={() => setScreen(k)} />
              {SCREENS[k].label}
            </label>
          ))}
        </div>
        <div role="radiogroup" aria-label="What to show" className="flex gap-2">
          {(["ready", "start"] as const).map((k) => (
            <label key={k} className={tab(state === k)}>
              <input type="radio" className="sr-only" name={`${uid}-state`} checked={state === k} onChange={() => setState(k)} />
              {k === "ready" ? "With a picture" : "Before a photo"}
            </label>
          ))}
        </div>
      </div>
      <div ref={box} className="w-full overflow-hidden rounded-[14px] border border-line bg-black/[0.03]" style={{ height: Math.round(s.h * scale) }}>
        <iframe
          ref={frame}
          key={state}
          title={`Customer view: ${s.label.toLowerCase()}`}
          src={`/customer-view/${productLegacyId}?state=${state}`}
          className="block origin-top-left border-0 bg-white"
          style={{ width: s.w, height: s.h, transform: `scale(${scale})`, marginInline: scale === 1 ? "auto" : undefined }}
          data-testid="customer-view-frame"
        />
      </div>
      <p className="text-[12px] text-ink-2">
        {s.label}: {s.w} px wide{scale < 1 ? `, shown at ${Math.round(scale * 100)}%` : ""}. The store&apos;s header and footer aren&apos;t shown.
      </p>
    </section>
  );
}
