"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CustomerActions({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="rounded-[10px] border border-line bg-white px-3 py-2 text-[14px] font-semibold"
        onClick={async () => {
          const r = await fetch(`/api/admin/customers/${id}/resend-link`, { method: "POST" });
          setMsg(r.ok ? "Sign-in link sent." : "Couldn't send the link.");
        }}
      >
        Resend sign-in link
      </button>
      <a href={`/api/admin/customers/${id}/export`} className="rounded-[10px] border border-line bg-white px-3 py-2 text-[14px] font-semibold">
        Export data
      </a>
      <button type="button" className="rounded-[10px] border border-[#b42318] bg-white px-3 py-2 text-[14px] font-semibold text-danger" onClick={() => setConfirming(true)}>
        Delete data
      </button>
      <span role="status" className="text-[14px] text-ink-2">
        {msg}
      </span>
      {confirming && (
        <form
          className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-[12px] bg-[#fde8e6] p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await fetch(`/api/admin/customers/${id}/delete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: typed }) });
            const b = (await r.json()) as { error?: string; cards?: number };
            if (!r.ok) setMsg(b.error ?? "Couldn't delete");
            else {
              setMsg(`Deleted ${b.cards} cards and anonymised their activity.`);
              router.push("/settings/customers");
            }
          }}
        >
          <label className="flex flex-col text-[13px] font-semibold">
            This deletes their cards and files, anonymises their activity and blocks card emails. Type {email} to confirm.
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 h-10 w-72 rounded-[10px] border border-line px-2 font-normal" />
          </label>
          <button type="submit" className="h-10 rounded-[10px] bg-[#b42318] px-3 font-bold text-white">
            Delete permanently
          </button>
          <button type="button" className="h-10 px-2 font-semibold" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
