"use client";

import { useState } from "react";

export function SendTestButton({ template }: { template: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="rounded-[10px] border border-line bg-white px-3 py-1.5 text-[14px] font-bold"
        onClick={async () => {
          setMsg("Sending…");
          const r = await fetch("/api/admin/emails/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template }) });
          const b = (await r.json().catch(() => ({}))) as { provider?: string; error?: string };
          setMsg(r.ok ? (b.provider === "fixtures" ? "Recorded (no AgentMail key here)" : "Sent to you") : `Failed: ${b.error}`);
        }}
      >
        Send me a test
      </button>
      <span role="status" className="text-[13px] text-ink-2">
        {msg}
      </span>
    </span>
  );
}

export function OrderLookup() {
  const [order, setOrder] = useState("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby="lookup-title">
      <h2 id="lookup-title" className="text-[19px] font-extrabold">
        Look up an order
      </h2>
      <p className="text-[14px] text-ink-2">Read-only: shows what the customer would see. Nothing is changed.</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setResult("Looking up…");
          const r = await fetch("/api/admin/redeem/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order }) });
          setResult(JSON.stringify(await r.json(), null, 2));
        }}
      >
        <label htmlFor="lookup-order" className="sr-only">
          Order number
        </label>
        <input id="lookup-order" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="#1001" className="h-11 w-48 rounded-[10px] border border-line px-3" />
        <button type="submit" className="h-11 rounded-[10px] bg-[#2b2b2b] px-4 font-bold text-white">
          Look up
        </button>
      </form>
      {result && <pre className="mt-3 max-h-[420px] overflow-auto rounded-[10px] bg-black/[0.04] p-3 text-[12px]" data-testid="lookup-result">{result}</pre>}
    </section>
  );
}
