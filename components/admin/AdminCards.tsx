"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdminCardRow } from "@/lib/admin/cards";
import { cn } from "@/lib/utils";

type Filters = { q: string; category: string; status: string; from: string; to: string; page: number };
type Detail = {
  card: { id: string; public_id: string; created_at: string; sender_email: string; from_name: string; to_name: string; recipient_email: string | null; message: string; status: string; delivery: string; scheduled_for: string | null; share_hidden: boolean; share_slug: string; jpeg_path: string | null; imagen_image_id: string | null; themes: { name: string } | null; theme_versions: { name: string } | null };
  deliveries: { type: string; channel: string | null; status: string; error: string | null; opened_at: string | null; created_at: string }[];
  timeline: { occurred_at: string; event: string; actor: string }[];
  senderMemberId: string | null;
};

const STATUSES = ["", "ready", "scheduled", "emailed", "opened", "failed", "cancelled"];

export function AdminCards({ categories }: { categories: { slug: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const open = sp.get("card");
  const [f, setF] = useState<Filters>({ q: "", category: "", status: "", from: "", to: "", page: 1 });
  const [data, setData] = useState<{ rows: AdminCardRow[]; total: number; pageSize: number } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  const load = useCallback(async (filters: Filters) => {
    const r = await fetch("/api/admin/cards/list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(filters) });
    setData(await r.json());
  }, []);
  useEffect(() => {
    void load(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.page, f.category, f.status, load]);
  useEffect(() => {
    setDetail(null);
    setMsg(null);
    setConfirm("");
    if (open) void fetch(`/api/admin/cards/${open}`).then(async (r) => (r.ok ? setDetail(await r.json()) : setMsg("Card not found")));
  }, [open]);

  async function act(path: string, body: unknown, ok: string) {
    if (!detail) return;
    const r = await fetch(`/api/admin/cards/${detail.card.id}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    setMsg(r.ok ? ok : (b.error ?? "Failed"));
    if (r.ok && path === "delete") {
      router.replace("/settings/cards");
      void load(f);
    } else if (r.ok) {
      const d = await fetch(`/api/admin/cards/${detail.card.id}`);
      if (d.ok) setDetail(await d.json());
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px] 2xl:grid-cols-[1fr_520px]">
      <div className="min-w-0">
        <form
          className="flex flex-wrap items-end gap-2 rounded-[16px] bg-white p-3 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const next = { ...f, page: 1 };
            setF(next);
            void load(next);
          }}
        >
          <label className="flex flex-col text-[12px] font-semibold">
            Search
            <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Name, email or C-id" className="h-10 w-56 rounded-[10px] border border-line px-2 text-[14px] font-normal" />
          </label>
          <label className="flex flex-col text-[12px] font-semibold">
            Category
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, page: 1 })} className="h-10 rounded-[10px] border border-line px-2 text-[14px]">
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-[12px] font-semibold">
            Status
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })} className="h-10 rounded-[10px] border border-line px-2 text-[14px]">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s || "All"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-[12px] font-semibold">
            From
            <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-10 rounded-[10px] border border-line px-2 text-[14px]" />
          </label>
          <label className="flex flex-col text-[12px] font-semibold">
            To
            <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-10 rounded-[10px] border border-line px-2 text-[14px]" />
          </label>
          <button type="submit" className="h-10 rounded-[10px] bg-[#2b2b2b] px-3 font-bold text-white">
            Apply
          </button>
        </form>
        <form method="post" action="/api/admin/cards/export" className="mt-2">
          {Object.entries(f).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={String(v)} />
          ))}
          <button type="submit" className="text-[14px] font-bold text-pink-link">
            Export CSV ({data?.total ?? 0} cards)
          </button>
        </form>
        <div className="mt-2 overflow-x-auto rounded-[16px] bg-white p-2 shadow-sm">
          <table className="w-full min-w-[720px] text-left text-[14px]" data-testid="cards-table">
            <thead>
              <tr className="border-b border-line text-[12px] uppercase text-ink-2">
                <th className="p-2">Card</th>
                <th>Created</th>
                <th>Sender</th>
                <th>To</th>
                <th>Theme</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((c) => (
                <tr key={c.id} className={cn("border-b border-line", open === c.public_id && "bg-pink-tint/40")}>
                  <td className="p-2">
                    <Link href={`/settings/cards?card=${c.public_id}`} className="link font-mono">
                      {c.public_id}
                    </Link>
                  </td>
                  <td>{new Date(c.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="max-w-[200px] truncate">{c.sender_email}</td>
                  <td>{c.to_name}</td>
                  <td>
                    {c.theme} · {c.version}
                  </td>
                  <td>
                    {c.status}
                    {c.share_hidden ? " · hidden" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-2 text-[14px]">
            <button type="button" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })} className="font-bold disabled:opacity-30">
              ← Newer
            </button>
            <span>
              Page {f.page} of {pages}
            </span>
            <button type="button" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })} className="font-bold disabled:opacity-30">
              Older →
            </button>
          </div>
        </div>
      </div>
      <aside className="rounded-[20px] bg-white p-5 shadow-sm" aria-label="Card detail" data-testid="card-detail">
        {!detail ? (
          <p className="text-ink-2">{msg ?? "Pick a card to see it. Opening a card's message is logged."}</p>
        ) : (
          <div>
            <h2 className="text-[19px] font-extrabold">
              {detail.card.public_id} · {detail.card.themes?.name} {detail.card.theme_versions?.name}
            </h2>
            {detail.card.jpeg_path && <img src={`/api/cards/${detail.card.id}/image`} alt={`Card ${detail.card.public_id}`} className="ph-no-capture mt-3 w-full rounded-[6px] shadow" />}
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-1 text-[14px]" data-ph-mask>
              <dt className="text-ink-2">Message</dt>
              <dd className="whitespace-pre-wrap">{detail.card.message}</dd>
              <dt className="text-ink-2">Sender</dt>
              <dd>
                {detail.senderMemberId ? (
                  <Link className="link" href={`/settings/customers/${detail.senderMemberId}`}>
                    {detail.card.from_name} ({detail.card.sender_email})
                  </Link>
                ) : (
                  `${detail.card.from_name} (${detail.card.sender_email})`
                )}
              </dd>
              <dt className="text-ink-2">Recipient</dt>
              <dd>
                {detail.card.to_name}
                {detail.card.recipient_email ? ` · ${detail.card.recipient_email}` : ""}
              </dd>
              <dt className="text-ink-2">Delivery</dt>
              <dd>
                {detail.card.delivery} · {detail.card.status}
                {detail.card.scheduled_for ? ` · ${new Date(detail.card.scheduled_for).toLocaleString("en-GB")}` : ""}
              </dd>
              <dt className="text-ink-2">Portrait</dt>
              <dd className="font-mono text-[12px]">{detail.card.imagen_image_id}</dd>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/api/cards/${detail.card.id}/image?download=1`} className="rounded-[10px] border border-line px-3 py-1.5 text-[14px] font-semibold">
                Download JPEG
              </a>
              {detail.card.recipient_email && (
                <button type="button" className="rounded-[10px] border border-line px-3 py-1.5 text-[14px] font-semibold" onClick={() => void act("resend", {}, "Email sent again.")}>
                  Resend email
                </button>
              )}
              <button type="button" className="rounded-[10px] border border-line px-3 py-1.5 text-[14px] font-semibold" onClick={() => void act("share", { hidden: !detail.card.share_hidden }, detail.card.share_hidden ? "Link restored." : "Link hidden.")} data-testid="toggle-share">
                {detail.card.share_hidden ? "Show link" : "Hide link"}
              </button>
            </div>
            <p role="status" className="mt-2 text-[14px] font-semibold text-success">
              {msg}
            </p>
            <h3 className="mt-4 font-bold">Deliveries</h3>
            <ul className="text-[13px]">
              {detail.deliveries.map((d, i) => (
                <li key={i}>
                  {d.type}
                  {d.channel ? `/${d.channel}` : ""} · {d.status}
                  {d.error ? ` (${d.error})` : ""} · {new Date(d.created_at).toLocaleString("en-GB")}
                </li>
              ))}
            </ul>
            <h3 className="mt-3 font-bold">Timeline</h3>
            <ul className="text-[13px]">
              {detail.timeline.map((t, i) => (
                <li key={i}>
                  {new Date(t.occurred_at).toLocaleString("en-GB")} · <code>{t.event}</code> · {t.actor}
                </li>
              ))}
            </ul>
            <form
              className="mt-4 rounded-[12px] bg-[#fde8e6] p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void act("delete", { confirm }, "Deleted.");
              }}
            >
              <label className="block text-[13px] font-semibold">
                Delete on request: type {detail.card.public_id} to confirm
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 h-9 w-full rounded-[8px] border border-line px-2 font-normal" />
              </label>
              <button type="submit" disabled={confirm !== detail.card.public_id} className="mt-2 h-9 rounded-[8px] bg-[#b42318] px-3 font-bold text-white disabled:opacity-40">
                Delete card and files
              </button>
            </form>
          </div>
        )}
      </aside>
    </div>
  );
}
