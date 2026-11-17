"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, data };
}

/** Creates the missing mmp_shop definitions in Shopify. */
export function CreateFieldsButton({ missing }: { missing: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const r = await post("/api/admin/shop/fields", {});
          setBusy(false);
          if (!r.ok) setMsg(String(r.data.error ?? "Couldn't create them"));
          else {
            const failed = (r.data.failed as { key: string; reason: string }[] | undefined) ?? [];
            setMsg(failed.length ? `Created ${(r.data.created as string[]).length}; ${failed.length} failed: ${failed.map((f) => `${f.key} (${f.reason})`).join(", ")}` : "Created.");
            router.refresh();
          }
        }}
      >
        {busy ? "Creating…" : `Create ${missing} shop field${missing === 1 ? "" : "s"} in Shopify`}
      </Button>
      {msg && (
        <span role="status" className="text-[14px] text-ink-2">
          {msg}
        </span>
      )}
    </div>
  );
}

const LIST_TEXT = {
  occasions: { label: "Occasions, in the order the Gifts page shows them", one: "occasion", One: "Occasion", example: "Anniversary", save: "Save occasions", endpoint: "/api/admin/shop/occasions" },
  categories: { label: "Categories, in the order the Products page shows them", one: "category", One: "Category", example: "Wall art", save: "Save categories", endpoint: "/api/admin/shop/categories" },
} as const;

/** The occasion list: add, rename, reorder, remove; saved to Shopify as one list. */
export function OccasionsEditor(props: { initial: string[]; enabled: boolean }) {
  return <ListEditor kind="occasions" {...props} />;
}

/** The Products page category list, managed exactly like occasions. */
export function CategoriesEditor(props: { initial: string[]; enabled: boolean }) {
  return <ListEditor kind="categories" {...props} />;
}

function ListEditor({ kind, initial, enabled }: { kind: keyof typeof LIST_TEXT; initial: string[]; enabled: boolean }) {
  const words = LIST_TEXT[kind];
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(list) !== JSON.stringify(initial);
  const inputId = useId();
  const move = (i: number, d: -1 | 1) => setList((l) => {
    const n = [...l];
    const j = i + d;
    if (j < 0 || j >= n.length) return l;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2" aria-label={words.label}>
        {list.map((o, i) => (
          <li key={`${i}-${o}`} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${inputId}-${i}`}>
              {words.One} {i + 1}
            </label>
            <input
              id={`${inputId}-${i}`}
              value={o}
              disabled={!enabled}
              onChange={(e) => setList((l) => l.map((x, k) => (k === i ? e.target.value : x)))}
              className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-3 text-[15px]"
            />
            <button type="button" aria-label={`Move ${o} up`} disabled={!enabled || i === 0} onClick={() => move(i, -1)} className="grid h-10 w-10 place-items-center rounded-[10px] bg-black/5 disabled:opacity-40">
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Move ${o} down`} disabled={!enabled || i === list.length - 1} onClick={() => move(i, 1)} className="grid h-10 w-10 place-items-center rounded-[10px] bg-black/5 disabled:opacity-40">
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Remove ${o}`} disabled={!enabled} onClick={() => setList((l) => l.filter((_, k) => k !== i))} className="grid h-10 w-10 place-items-center rounded-[10px] bg-black/5 disabled:opacity-40">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) setList((l) => [...l, v]);
          setDraft("");
        }}
      >
        <label className="sr-only" htmlFor={`${inputId}-new`}>
          New {words.one}
        </label>
        <input id={`${inputId}-new`} value={draft} disabled={!enabled} onChange={(e) => setDraft(e.target.value)} placeholder={`Add ${kind === "occasions" ? "an" : "a"} ${words.one}, e.g. ${words.example}`} maxLength={40} className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-3 text-[15px]" />
        <Button type="submit" variant="secondary" size="sm" disabled={!enabled || !draft.trim()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!enabled || !dirty || busy || !list.length}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await post(words.endpoint, { [kind]: list.map((x) => x.trim()) });
            setBusy(false);
            setMsg(r.ok ? { ok: true, text: "Saved to Shopify." } : { ok: false, text: String(r.data.error ?? "Couldn't save") });
            if (r.ok) router.refresh();
          }}
        >
          {busy ? "Saving…" : words.save}
        </Button>
        {dirty && (
          <button type="button" className="text-[14px] font-bold text-pink-link" onClick={() => setList(initial)}>
            Undo changes
          </button>
        )}
        {msg && (
          <span role="status" className={cn("text-[14px]", msg.ok ? "text-[#1f6b35]" : "text-[#a1251b]")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

const PAGES = [
  ["none", "Not in the shop"],
  ["gifts", "Gifts"],
  ["products", "Products"],
  ["all", "All (both pages)"],
] as const;

/** Chips for one list (occasions or categories): tick the ones that apply. */
function ChipField({ legend, all, choices, value, onChange, disabled, empty }: { legend: string; all: string[]; choices: string[]; value: string[]; onChange: (v: string[]) => void; disabled: boolean; empty: string }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-[13px] font-bold">{legend}</legend>
      {all.length ? (
        <div className="flex flex-wrap gap-2">
          {all.map((o) => {
            const on = value.includes(o);
            const unknown = !choices.includes(o);
            return (
              <label key={o} className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-[14px] focus-within:ring-2 focus-within:ring-[#DD07C4] focus-within:ring-offset-1", on ? "border-[#DD07C4] bg-pink-tint font-bold text-pink-dark" : "border-line bg-white", unknown && "border-dashed")}>
                <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} />
                {o}
                {unknown && <span className="text-[11px] font-normal text-ink-2">(not in list)</span>}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="text-[14px] text-ink-2">{empty}</p>
      )}
    </fieldset>
  );
}

/** One product's page, occasions (Gifts) and categories (Products), saved straight to its mmp_shop metafields in Shopify. */
export function ProductFieldsEditor({ productId, title, page, occasions, choices, categories, categoryChoices, canSave }: { productId: string; title: string; page: "gifts" | "products" | "all" | null; occasions: string[]; choices: string[]; categories: string[]; categoryChoices: string[]; canSave: boolean }) {
  const router = useRouter();
  const [p, setP] = useState<string>(page ?? "none");
  const [occ, setOcc] = useState<string[]>(occasions);
  const [cat, setCat] = useState<string[]>(categories);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = useId();
  const dirty = p !== (page ?? "none") || JSON.stringify(occ) !== JSON.stringify(occasions) || JSON.stringify(cat) !== JSON.stringify(categories);
  const all = [...choices, ...occasions.filter((o) => !choices.includes(o))];
  const allCats = [...categoryChoices, ...categories.filter((o) => !categoryChoices.includes(o))];
  const onGifts = p === "gifts" || p === "all";
  const onProducts = p === "products" || p === "all";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-page`} className="text-[13px] font-bold">
          Page
        </label>
        <select id={`${id}-page`} value={p} disabled={!canSave} onChange={(e) => setP(e.target.value)} className="h-10 rounded-[10px] border border-line bg-white px-3 text-[15px]">
          {PAGES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {/* Occasions group it on the Gifts page; categories group it on the Products page. */}
      {(onGifts || occ.length > 0) && <ChipField legend="Occasions (Gifts page)" all={all} choices={choices} value={occ} onChange={setOcc} disabled={!canSave} empty="Add occasions first." />}
      {(onProducts || cat.length > 0) && <ChipField legend="Categories (Products page)" all={allCats} choices={categoryChoices} value={cat} onChange={setCat} disabled={!canSave} empty="Add categories first." />}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={!canSave || !dirty || busy}
          aria-label={`Save page, occasions and categories for ${title}`}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await post("/api/admin/shop/products", { productId, page: p, occasions: occ, categories: cat });
            setBusy(false);
            setMsg(r.ok ? { ok: true, text: "Saved to Shopify." } : { ok: false, text: String(r.data.error ?? "Couldn't save") });
            if (r.ok) router.refresh();
          }}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
        {msg && (
          <span role="status" className={cn("text-[13px]", msg.ok ? "text-[#1f6b35]" : "text-[#a1251b]")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
