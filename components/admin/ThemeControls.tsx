"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (r.ok) return null;
  const b = (await r.json().catch(() => ({}))) as { error?: string };
  return b.error ?? "Couldn't save";
}

export function useAdminAction() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const run = async (url: string, method: string, body: unknown) => {
    const e = await send(url, method, body);
    setErr(e);
    if (!e) router.refresh();
    return e;
  };
  return { err, run };
}

export function CategoryControls({ id, name, reminder }: { id: string; name: string; reminder: boolean }) {
  const { err, run } = useAdminAction();
  return (
    <span className="flex items-center gap-3 text-[14px]">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={reminder} onChange={(e) => void run(`/api/admin/categories/${id}`, "PATCH", { reminderEnabled: e.target.checked })} className="h-4 w-4 accent-[#DD07C4]" />
        Seasonal reminder for {name}
      </label>
      {err && <span role="alert" className="text-danger">{err}</span>}
    </span>
  );
}

export function ThemeStatus({ id, status, from, to, name }: { id: string; status: string; from: string | null; to: string | null; name: string }) {
  const { err, run } = useAdminAction();
  const [f, setF] = useState(from ?? "");
  const [tt, setT] = useState(to ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2 text-[14px]">
      <label className="sr-only" htmlFor={`status-${id}`}>
        Status of {name}
      </label>
      <select id={`status-${id}`} value={status} onChange={(e) => void run(`/api/admin/themes/${id}`, "PATCH", { status: e.target.value })} className="h-9 rounded-[8px] border border-line px-2">
        <option value="draft">Draft</option>
        <option value="live">Live</option>
        <option value="archived">Archived</option>
      </select>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          void run(`/api/admin/themes/${id}`, "PATCH", { from: f || null, to: tt || null });
        }}
      >
        <label className="sr-only" htmlFor={`from-${id}`}>Shown from (MM-DD)</label>
        <input id={`from-${id}`} value={f} onChange={(e) => setF(e.target.value)} placeholder="MM-DD" className="h-9 w-[76px] rounded-[8px] border border-line px-2" />
        <span aria-hidden="true">→</span>
        <label className="sr-only" htmlFor={`to-${id}`}>Shown until (MM-DD)</label>
        <input id={`to-${id}`} value={tt} onChange={(e) => setT(e.target.value)} placeholder="MM-DD" className="h-9 w-[76px] rounded-[8px] border border-line px-2" />
        <button type="submit" className="h-9 rounded-[8px] bg-black/[0.06] px-2 font-semibold">Save dates</button>
      </form>
      {err && <span role="alert" className="text-danger">{err}</span>}
    </div>
  );
}

export function VersionOrder({ id, sort, prevSort, nextSort, prevId, nextId, label }: { id: string; sort: number; prevSort?: number; nextSort?: number; prevId?: string; nextId?: string; label: string }) {
  const { run } = useAdminAction();
  const swap = async (otherId: string, otherSort: number) => {
    await run(`/api/admin/versions/${id}`, "PATCH", { sortOrder: otherSort === sort ? sort - 1 : otherSort });
    await run(`/api/admin/versions/${otherId}`, "PATCH", { sortOrder: sort });
  };
  return (
    <span className="flex gap-1">
      <button type="button" disabled={!prevId} aria-label={`Move ${label} up`} onClick={() => prevId && void swap(prevId, prevSort!)} className="h-8 w-8 rounded-[8px] bg-black/[0.05] disabled:opacity-30">↑</button>
      <button type="button" disabled={!nextId} aria-label={`Move ${label} down`} onClick={() => nextId && void swap(nextId, nextSort!)} className="h-8 w-8 rounded-[8px] bg-black/[0.05] disabled:opacity-30">↓</button>
    </span>
  );
}

export function NewThemeForm({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await fetch("/api/admin/themes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.get("name"), slug: f.get("slug"), categoryId: f.get("category"), from: f.get("from") || null, to: f.get("to") || null }) });
        const b = (await r.json()) as { error?: string };
        if (!r.ok) setErr(b.error ?? "Couldn't create");
        else {
          setErr(null);
          (e.target as HTMLFormElement).reset();
          router.refresh();
        }
      }}
    >
      {[
        ["name", "Name", "Valentine's"],
        ["slug", "Slug", "valentines"],
        ["from", "From (MM-DD)", "02-01"],
        ["to", "To (MM-DD)", "02-14"],
      ].map(([n, l, ph]) => (
        <label key={n} className="flex flex-col text-[12px] font-semibold">
          {l}
          <input name={n} placeholder={ph} className="h-10 w-36 rounded-[10px] border border-line px-2 text-[14px] font-normal" />
        </label>
      ))}
      <label className="flex flex-col text-[12px] font-semibold">
        Category
        <select name="category" className="h-10 rounded-[10px] border border-line px-2 text-[14px]">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="h-10 rounded-[10px] bg-[#2b2b2b] px-4 font-bold text-white">
        Add theme
      </button>
      {err && <p role="alert" className="w-full text-[13px] text-danger">{err}</p>}
    </form>
  );
}

export function NewVersionForm({ themeId, themeName }: { themeId: string; themeName: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="text-[14px] font-bold text-pink-link" onClick={() => setOpen(true)}>
        + New version of {themeName}
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await fetch("/api/admin/versions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ themeId, name: f.get("name"), slug: f.get("slug") }) });
        const b = (await r.json()) as { id?: string; error?: string };
        if (!r.ok || !b.id) setErr(b.error ?? "Couldn't create");
        else router.push(`/settings/themes/${themeId}/versions/${b.id}`);
      }}
    >
      <label className="flex flex-col text-[12px] font-semibold">
        Version name
        <input name="name" className="h-9 w-40 rounded-[8px] border border-line px-2 text-[14px] font-normal" />
      </label>
      <label className="flex flex-col text-[12px] font-semibold">
        Slug
        <input name="slug" className="h-9 w-36 rounded-[8px] border border-line px-2 text-[14px] font-normal" />
      </label>
      <button type="submit" className="h-9 rounded-[8px] bg-[#2b2b2b] px-3 text-[14px] font-bold text-white">
        Create and edit
      </button>
      {err && <p role="alert" className="w-full text-[13px] text-danger">{err}</p>}
    </form>
  );
}

/**
 * Per-theme switch in the library. On = theme live and every version live; turning it on publishes
 * all draft versions (can take a few seconds per version). Off hides the theme from customers.
 */
export function ThemeLiveToggle({ id, name, themeLive, liveCount, draftCount }: { id: string; name: string; themeLive: boolean; liveCount: number; draftCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const on = themeLive && liveCount > 0;
  const total = liveCount + draftCount;
  const call = async (live: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/themes/${id}/live`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ live }) });
      const b = (await r.json().catch(() => ({}))) as { error?: string; warning?: string };
      setMsg(r.ok ? (b.warning ?? null) : (b.error ?? "Couldn't save"));
      router.refresh();
    } catch {
      setMsg("Couldn't save");
    } finally {
      setBusy(false);
    }
  };
  const flip = () => {
    if (on && !window.confirm(`Turn off ${name}? Customers stop seeing it straight away. Its versions stay as they are.`)) return;
    void call(!on);
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-ink-2" id={`live-desc-${id}`}>
          {busy ? (on ? "Turning off…" : `Publishing ${draftCount} version${draftCount === 1 ? "" : "s"}…`) : total === 0 ? "No versions yet" : `${liveCount} of ${total} live`}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${name} live`}
          aria-describedby={`live-desc-${id}`}
          disabled={busy || total === 0}
          onClick={flip}
          data-testid={`theme-live-${id}`}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DD07C4] focus-visible:ring-offset-2 disabled:opacity-50 ${on ? "bg-[#1a7f37]" : "bg-black/25"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? "left-6" : "left-1"}`} />
        </button>
        <span className={`w-8 text-[13px] font-bold ${on ? "text-[#1a7f37]" : "text-ink-2"}`}>{on ? "Live" : "Off"}</span>
      </div>
      {on && draftCount > 0 && !busy && (
        <button type="button" onClick={() => void call(true)} className="text-[13px] font-bold text-[#B0069C] underline">
          Publish {draftCount} draft{draftCount === 1 ? "" : "s"}
        </button>
      )}
      {msg && <span role="alert" className="max-w-[260px] text-right text-[13px] text-danger">{msg}</span>}
    </div>
  );
}
