"use client";

import Link from "next/link";
import { useState } from "react";

type R = { id: string; email: string; name: string | null; isCustomer: boolean; lastSeen: string; createdVia: string };

export function CustomerSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<R[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await fetch("/api/admin/customers/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q }) });
          setRows(((await r.json()) as { results: R[] }).results);
          setBusy(false);
        }}
      >
        <label htmlFor="cust-q" className="sr-only">
          Email or name
        </label>
        <input id="cust-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email or name" className="h-11 w-80 max-w-full rounded-[10px] border border-line bg-white px-3" />
        <button type="submit" disabled={busy} className="h-11 rounded-[10px] bg-[#2b2b2b] px-4 font-bold text-white">
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {rows && (
        <ul className="mt-4 flex flex-col gap-2" data-testid="customer-results">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/settings/customers/${r.id}`} className="flex items-center justify-between rounded-[14px] bg-white p-3 shadow-sm">
                <span>
                  <span className="block font-bold">{r.name ?? r.email}</span>
                  <span className="block text-[13px] text-ink-2">{r.email}</span>
                </span>
                <span className="text-[13px] text-ink-2">{r.isCustomer ? "Customer" : "Creator"}</span>
              </Link>
            </li>
          ))}
          {!rows.length && <li className="text-ink-2">Nobody found. Search a full email to look someone up in Shopify and Imagen.</li>}
        </ul>
      )}
    </div>
  );
}
