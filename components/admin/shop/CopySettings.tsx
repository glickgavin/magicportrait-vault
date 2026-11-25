"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { COPY_PART_TEXT, COPY_PARTS, type CopyPart } from "@/lib/shop/copy-settings";
import { cn } from "@/lib/utils";

/**
 * Settings › Shop › one product › Copy settings from… (docs/shop.md › Copy settings): for a product made by
 * duplicating another, copies the other's settings here. Never the theme, the Dreamship link or the print rules.
 */
export function CopySettings({ productId, products }: { productId: string; products: { id: string; title: string; store: boolean }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId();
  const [from, setFrom] = useState("");
  const [parts, setParts] = useState<CopyPart[]>(["template", "magic_store", "sizes"]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; skipped?: string[] } | null>(null);
  const fromTitle = products.find((p) => p.id === from)?.title ?? "";

  async function copy() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/shop/copy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, to: productId, parts }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; copied?: string[]; skipped?: string[] };
      if (!r.ok) setMsg({ ok: false, text: j.error ?? "Couldn't copy. Try again." });
      else {
        const n = j.copied?.length ?? 0;
        setMsg({ ok: true, text: n ? `Copied from ${fromTitle}: ${n} ${n === 1 ? "part" : "parts"}.` : "Nothing could be copied.", skipped: j.skipped });
        // A new ?copied= starts the page's editors again from the copied values.
        router.replace(`${pathname}?copied=${Date.now()}`, { scroll: false });
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="copy-settings">
      <label className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">Copy from</span>
        <select
          id={`${uid}-from`}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setConfirming(false);
            setMsg(null);
          }}
          className="h-10 w-full max-w-[460px] rounded-[10px] border border-line bg-white px-3 text-[15px]"
        >
          <option value="">Choose a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
              {p.store ? "" : " (Gifts & Products only)"}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[15px] font-semibold">What to copy</legend>
        {COPY_PARTS.map((k) => (
          <label key={k} className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={parts.includes(k)} onChange={(e) => setParts((x) => (e.target.checked ? [...x, k] : x.filter((y) => y !== k)))} />
            <span>{COPY_PART_TEXT[k]}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-[13px] text-ink-2">Never copied: the Imagen theme, the Dreamship link and the print rules (Dreamship&apos;s Sync fills those).</p>
      <div className="flex flex-wrap items-center gap-3">
        {!confirming ? (
          <Button variant="secondary" disabled={!from || !parts.length || busy} onClick={() => setConfirming(true)}>
            Copy settings
          </Button>
        ) : (
          <>
            <span className="text-[14px] font-semibold">Replace this product&apos;s settings with {fromTitle}&apos;s?</span>
            <Button disabled={busy} onClick={() => void copy()}>
              {busy ? "Copying…" : "Yes, copy"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>
      {msg && (
        <div role="status" className={cn("text-[14px]", msg.ok ? "text-[#1f6b35]" : "text-[#a1251b]")}>
          <p className="font-bold">{msg.text}</p>
          {msg.skipped?.length ? (
            <ul className="mt-1 list-disc pl-5 text-ink-2">
              {msg.skipped.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
