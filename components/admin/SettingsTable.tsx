"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingField, saveSetting, type SettingRowLite } from "./SettingField";
import { Button } from "@/components/ui/Button";

export type TableRow = SettingRowLite & { section: string; updatedBy: string | null; updatedAt: string | null };

export function SettingsTable({ rows, sections }: { rows: TableRow[]; sections?: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!sections || sections.includes(r.section)) && (!s || r.key.includes(s) || r.label.toLowerCase().includes(s)));
  }, [q, rows, sections]);

  return (
    <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby="vars-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="vars-title" className="text-[19px] font-extrabold">
          Variables
        </h2>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="settings-search">
            Search settings
          </label>
          <input id="settings-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" className="h-10 w-56 rounded-[10px] border border-line px-3 text-[14px]" />
          {!sections && (
            <Button size="sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              Add variable
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">Secrets and API keys stay in Vercel, never here. Every change is logged.</p>
      {adding && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-[14px] bg-black/[0.03] p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            let value: unknown = newVal;
            try {
              value = JSON.parse(newVal);
            } catch {
              /* plain text */
            }
            const error = await saveSetting(newKey.trim(), value, { type: typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : typeof value === "string" ? "text" : "json", label: newKey.trim() });
            if (error) setErr(error);
            else {
              setAdding(false);
              setNewKey("");
              setNewVal("");
              router.refresh();
            }
          }}
        >
          <label className="flex flex-col text-[13px] font-semibold">
            Key
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="brand.something" className="h-10 rounded-[10px] border border-line px-2 font-mono text-[14px]" />
          </label>
          <label className="flex flex-1 flex-col text-[13px] font-semibold">
            Value (text, number, true/false or JSON)
            <input value={newVal} onChange={(e) => setNewVal(e.target.value)} className="h-10 rounded-[10px] border border-line px-2 text-[14px]" />
          </label>
          <Button type="submit" size="sm">
            Add
          </Button>
          {err && (
            <p role="alert" className="w-full text-[13px] text-danger">
              {err}
            </p>
          )}
        </form>
      )}
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Settings table">
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-[12px] uppercase tracking-wide text-ink-2">
              <th className="py-2 pr-3 font-bold">Key</th>
              <th className="py-2 pr-3 font-bold">Value</th>
              <th className="py-2 pr-3 font-bold">Type</th>
              <th className="py-2 font-bold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-b border-line align-top" data-testid={`row-${r.key}`}>
                <td className="py-2.5 pr-3">
                  <div className="font-mono text-[13px]">{r.key}</div>
                  <div className="text-[12px] text-ink-2">{r.label}</div>
                </td>
                <td className="w-[45%] py-2 pr-3">
                  <SettingField row={r} compact />
                  {r.readOnly && r.description && <p className="mt-1 text-[12px] text-ink-2">{r.description}</p>}
                </td>
                <td className="py-2.5 pr-3 text-ink-2">{r.type}</td>
                <td className="py-2.5 text-[13px] text-ink-2">
                  {r.updatedBy ?? "—"}
                  {r.updatedAt ? ` · ${new Date(r.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
