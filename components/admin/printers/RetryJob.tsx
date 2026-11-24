"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** Retry: re-queues a failed or flagged picture job (it never submits or cancels the order). */
export function RetryJob({ jobId, order }: { jobId: string; order: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy}
        aria-label={`Retry ${order}`}
        onClick={async () => {
          setBusy(true);
          const r = await fetch("/api/admin/printers/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId }) }).catch(() => null);
          const b = (await r?.json().catch(() => null)) as { status?: string } | null;
          setMsg(r?.ok ? (b?.status === "picture_set" ? "Picture set" : "Queued again") : "Couldn't retry");
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Retrying…" : "Retry"}
      </Button>
      {msg && <span role="status" className="text-[13px]">{msg}</span>}
    </span>
  );
}
