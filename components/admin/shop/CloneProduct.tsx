"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";

type Master = { id: string; title: string; image: string | null; theme: string | null };
type Pending = { dreamshipProductId: number; masterId: string; masterTitle: string | null; name: string; theme: string; startedAt: string; by: string };
type RowState = { busy?: "finish" | "dismiss"; text?: string; ok?: boolean; done?: { productId: string; notes: string[] } };

const input = "h-11 w-full min-w-0 rounded-[10px] border border-line bg-white px-3 text-[15px] font-normal";

async function post(body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch("/api/admin/shop/clone", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = ((await r?.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  return { ok: Boolean(r?.ok), data };
}

/**
 * Settings › Shop › Clone a product. Step 1 makes the new product in Dreamship; Dreamship then lists it in Shopify
 * (usually within a few minutes). Step 2, "Finish setting up", adds it to the Magic Store and copies everything
 * from the master. The new product stays a draft in Shopify until it's made active there.
 */
export function CloneProduct({ masters, themes, pending, initialMaster }: { masters: Master[]; themes: { slug: string; name: string }[]; pending: Pending[]; initialMaster: string | null }) {
  const uid = useId();
  const router = useRouter();
  const [masterId, setMasterId] = useState(masters.some((m) => m.id === initialMaster) ? initialMaster! : (masters[0]?.id ?? ""));
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const master = masters.find((m) => m.id === masterId) ?? null;
  const themeName = themes.find((t) => t.slug === theme)?.name ?? theme;
  const ready = Boolean(master && name.trim().length >= 3 && theme);

  async function start() {
    setBusy(true);
    setMsg(null);
    const r = await post({ action: "start", masterId, name: name.trim(), theme });
    setBusy(false);
    setConfirm(false);
    if (!r.ok) return setMsg({ ok: false, text: String(r.data.error ?? "Couldn't start the clone. Try again.") });
    setMsg({ ok: true, text: `“${name.trim()}” was created in Dreamship. Dreamship is now publishing it to Shopify; when it's there, press “Finish setting up” below.` });
    setName("");
    router.refresh();
  }

  async function act(c: Pending, action: "finish" | "dismiss") {
    setRows((x) => ({ ...x, [c.dreamshipProductId]: { busy: action } }));
    const r = await post({ action, dreamshipProductId: c.dreamshipProductId });
    if (!r.ok) return setRows((x) => ({ ...x, [c.dreamshipProductId]: { ok: false, text: String(r.data.error ?? "That didn't work. Try again.") } }));
    if (action === "dismiss") {
      setRows((x) => ({ ...x, [c.dreamshipProductId]: {} }));
      return router.refresh();
    }
    if (r.data.state === "waiting") return setRows((x) => ({ ...x, [c.dreamshipProductId]: { ok: true, text: String(r.data.detail ?? "Not ready yet.") } }));
    setRows((x) => ({ ...x, [c.dreamshipProductId]: { done: { productId: String(r.data.productId), notes: (r.data.notes as string[]) ?? [] } } }));
  }

  if (!masters.length)
    return (
      <p className="mt-5 rounded-[14px] bg-black/[0.03] p-4 text-[15px]" data-testid="clone-no-masters">
        No product can be a master yet. A master is a Magic Store product linked to its Dreamship product: open one in Settings › Shop, link it on its Dreamship card, then come back.
      </p>
    );

  return (
    <div className="mt-5 flex max-w-[720px] flex-col gap-6" data-testid="clone-product">
      <section aria-labelledby={`${uid}-new`} className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]">
        <h2 id={`${uid}-new`} className="text-[17px] font-extrabold">
          New product
        </h2>
        <div className="flex items-end gap-3">
          {master?.image && <img src={master.image} alt="" className="h-16 w-16 flex-none rounded-[10px] bg-black/[0.04] object-cover" />}
          <label htmlFor={`${uid}-master`} className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-bold">
            Master to copy
            <select id={`${uid}-master`} className={input} value={masterId} onChange={(e) => setMasterId(e.target.value)}>
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label htmlFor={`${uid}-name`} className="flex flex-col gap-1 text-[13px] font-bold">
          New product&apos;s name
          <input id={`${uid}-name`} className={input} value={name} maxLength={120} placeholder={master ? `e.g. ${master.title.replace(/\s*Master$/i, "")} “Watercolor”` : undefined} onChange={(e) => setName(e.target.value)} />
        </label>
        <label htmlFor={`${uid}-theme`} className="flex flex-col gap-1 text-[13px] font-bold">
          Imagen theme
          <select id={`${uid}-theme`} className={input} value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="">Choose a theme…</option>
            {themes.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name} ({t.slug}){t.slug === master?.theme ? " · the master's" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[13px] text-ink-2">Copied from the master: its Dreamship product (sizes, prices and artwork), the preview template with its personalisation layer, the Magic Store fields, badges and making times, and the print settings. The product photos show the master&apos;s sample picture until you replace it in Dreamship.</p>
        {!confirm ? (
          <Button type="button" className="self-start" disabled={!ready || busy} onClick={() => setConfirm(true)} data-testid="clone-start">
            Clone product
          </Button>
        ) : (
          <div className="rounded-[14px] bg-[#FFF4E5] p-3 text-[14px] text-[#7a4b00]" role="alertdialog" aria-labelledby={`${uid}-q`} data-testid="clone-confirm">
            <p id={`${uid}-q`} className="font-semibold">
              Create “{name.trim()}” in Dreamship as a copy of “{master?.title}”, with the theme {themeName}? Dreamship will add it to Shopify as a draft. This can&apos;t be undone from here (delete it in Dreamship if you change your mind).
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" onClick={start} disabled={busy} data-testid="clone-yes">
                {busy ? "Creating…" : "Yes, create it"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setConfirm(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <div role="status" aria-live="polite">
          {msg && <p className={msg.ok ? "text-[14px] font-semibold" : "text-[14px] font-semibold text-[#a1251b]"}>{msg.text}</p>}
        </div>
      </section>

      <section aria-labelledby={`${uid}-pending`} className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" data-testid="clone-pending">
        <h2 id={`${uid}-pending`} className="text-[17px] font-extrabold">
          Being set up
        </h2>
        {pending.length === 0 ? (
          <p className="text-[14px] text-ink-2">Nothing is waiting. A clone shows here from the moment it&apos;s created in Dreamship until it&apos;s set up in the store.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((c) => {
              const s = rows[c.dreamshipProductId] ?? {};
              return (
                <li key={c.dreamshipProductId} className="rounded-[14px] bg-black/[0.03] p-3 text-[14px]">
                  <p className="font-extrabold">{c.name}</p>
                  <p className="text-[13px] text-ink-2">
                    From {c.masterTitle ?? "a product no longer in the store"} · theme {c.theme} · Dreamship {c.dreamshipProductId} · started {new Date(c.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  {s.done ? (
                    <div className="mt-2" data-testid="clone-done">
                      <p className="font-semibold">Set up. It&apos;s a draft in Shopify: check it, then make it active in Shopify (and available to the storefront sales channel) to put it in the store.</p>
                      {s.done.notes.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-[13px] text-[#7a4b00]">
                          {s.done.notes.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      )}
                      <Link href={`/settings/shop/products/${s.done.productId}`} className="link mt-1 inline-block font-bold">
                        Open its settings →
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={() => act(c, "finish")} disabled={Boolean(s.busy)}>
                        {s.busy === "finish" ? "Setting up…" : "Finish setting up"}
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => act(c, "dismiss")} disabled={Boolean(s.busy)}>
                        Remove from this list
                      </Button>
                    </div>
                  )}
                  <div role="status" aria-live="polite">
                    {s.text && <p className={s.ok ? "mt-2 text-[13px] font-semibold" : "mt-2 text-[13px] font-semibold text-[#a1251b]"}>{s.text}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[12px] text-ink-2">“Remove from this list” only hides it here; it deletes nothing in Dreamship or Shopify.</p>
      </section>
    </div>
  );
}
