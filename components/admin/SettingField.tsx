"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type SettingRowLite = { key: string; type: string; value: unknown; options: string[] | null; readOnly: boolean; label: string; description?: string | null };

export async function saveSetting(key: string, value: unknown, extra: Record<string, unknown> = {}): Promise<string | null> {
  const r = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, value, ...extra }) });
  if (r.ok) return null;
  const b = (await r.json().catch(() => ({}))) as { error?: string };
  return b.error ?? "Couldn't save";
}

export function toText(type: string, v: unknown): string {
  if (type === "list") return Array.isArray(v) ? v.join("\n") : "";
  if (type === "json") return JSON.stringify(v, null, 2);
  if (v === null || v === undefined) return "";
  return String(v);
}

function fromText(type: string, s: string): unknown {
  if (type === "number") return s.trim() === "" ? NaN : Number(s);
  if (type === "list") return s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  if (type === "json") return JSON.parse(s);
  return s;
}

/** One setting, edited in place with the registry's type checks (validated again on the server). */
export function SettingField({ row, compact }: { row: SettingRowLite; compact?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(toText(row.type, row.value));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = `set-${row.key.replace(/\./g, "-")}`;

  async function commit(value: unknown) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const err = await saveSetting(row.key, value);
    setBusy(false);
    if (err) setError(err);
    else {
      setSaved(true);
      router.refresh();
    }
  }

  if (row.readOnly) return <span className="font-mono text-[14px]">{toText(row.type, row.value)}</span>;

  if (row.type === "boolean") {
    const on = row.value === true;
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={row.label}
          disabled={busy}
          onClick={() => void commit(!on)}
          className={cn("relative h-8 w-14 rounded-full transition-colors", on ? "bg-magenta" : "bg-black/25")}
          data-testid={`switch-${row.key}`}
        >
          <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", on ? "left-7" : "left-1")} />
        </button>
        {error && <span role="alert" className="text-[13px] text-danger">{error}</span>}
      </span>
    );
  }

  if (row.type === "choice" && row.options) {
    return (
      <span className="inline-flex flex-col">
        <select id={id} aria-label={row.label} disabled={busy} value={String(row.value)} onChange={(e) => void commit(e.target.value)} className="h-11 rounded-[10px] border border-line bg-white px-3 text-[15px]" data-testid={`select-${row.key}`}>
          {row.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {error && <span role="alert" className="text-[13px] text-danger">{error}</span>}
      </span>
    );
  }

  const multiline = row.type === "list" || row.type === "json";
  return (
    <form
      className={cn("flex gap-2", compact ? "items-center" : "items-start")}
      onSubmit={(e) => {
        e.preventDefault();
        let v: unknown;
        try {
          v = fromText(row.type, text);
        } catch {
          setError("Not valid JSON");
          return;
        }
        void commit(v);
      }}
    >
      {multiline ? (
        <textarea id={id} aria-label={row.label} value={text} rows={Math.min(6, text.split("\n").length + 1)} onChange={(e) => setText(e.target.value)} className="min-w-0 flex-1 rounded-[10px] border border-line bg-white px-2 py-1.5 font-mono text-[13px]" />
      ) : (
        <input id={id} aria-label={row.label} value={text} inputMode={row.type === "number" ? "decimal" : undefined} onChange={(e) => setText(e.target.value)} className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-2 text-[14px]" data-testid={`input-${row.key}`} />
      )}
      <button type="submit" disabled={busy || text === toText(row.type, row.value)} className="h-10 shrink-0 rounded-[10px] bg-[#2b2b2b] px-3 text-[13px] font-bold text-white disabled:opacity-40">
        Save
      </button>
      <span aria-live="polite" className="sr-only">
        {saved ? "Saved" : ""}
      </span>
      {error && (
        <span role="alert" className="self-center text-[13px] text-danger">
          {error}
        </span>
      )}
    </form>
  );
}
