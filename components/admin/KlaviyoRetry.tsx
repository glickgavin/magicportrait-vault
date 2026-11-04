"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function KlaviyoRetry() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <span role="status" className="text-[13px] text-ink-2">
        {msg}
      </span>
      <button
        type="button"
        className="rounded-[10px] border border-line px-3 py-1.5 text-[14px] font-bold"
        onClick={async () => {
          const r = await fetch("/api/admin/klaviyo/retry", { method: "POST" });
          const b = (await r.json()) as { requeued?: number };
          setMsg(`Retried ${b.requeued ?? 0}`);
          router.refresh();
        }}
      >
        Retry failed
      </button>
    </span>
  );
}
