"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { initialsFor } from "@/lib/utils";

export function SuperUsersCard({ users, me }: { users: { email: string }[]; me: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function call(action: "add" | "remove", e: string) {
    setErr(null);
    const r = await fetch("/api/admin/super-users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, email: e }) });
    if (!r.ok) setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save");
    else {
      setEmail("");
      router.refresh();
    }
  }
  return (
    <section className="rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]" aria-labelledby="su-title" data-testid="super-users">
      <h2 id="su-title" className="text-[19px] font-extrabold">
        Super users
      </h2>
      <p className="text-[14px] text-ink-2">Only these accounts see Settings.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {users.map((u) => (
          <li key={u.email} className="flex items-center gap-3">
            <Avatar initials={initialsFor(null, u.email)} size={32} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{u.email}</span>
            {u.email === me ? (
              <span className="text-[13px] text-ink-2">You</span>
            ) : (
              <button type="button" className="text-[13px] font-bold text-danger" onClick={() => void call("remove", u.email)} aria-label={`Remove ${u.email}`}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void call("add", email);
        }}
      >
        <label htmlFor="su-email" className="sr-only">
          Email to add
        </label>
        <input id="su-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@storyboards.io" className="h-11 min-w-0 flex-1 rounded-[10px] border border-line px-3" />
        <button type="submit" className="h-11 rounded-[10px] bg-[#2b2b2b] px-4 font-bold text-white">
          Add
        </button>
      </form>
      {err && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {err}
        </p>
      )}
    </section>
  );
}
