"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/** "Check connection": the same harmless read as Settings › Data sources, recorded there too. */
export function CheckConnection({ source }: { source: "dreamship" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function check() {
    setBusy(true);
    setResult(null);
    const r = await fetch("/api/admin/data-sources/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) }).catch(() => null);
    const body = r?.ok ? ((await r.json()) as { results: { ok: boolean; detail: Record<string, unknown> }[] }) : null;
    const res = body?.results[0];
    setResult(res ? (res.ok ? `Connected: ${String(res.detail.business ?? "")}` : `Not connected${res.detail.error ? `: ${String(res.detail.error)}` : res.detail.mode === "not_configured" ? ": DREAMSHIP_API_KEY isn't set" : ""}`) : "Couldn't check. Try again.");
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" size="sm" onClick={check} disabled={busy} data-testid="check-dreamship">
        {busy ? "Checking…" : "Check connection"}
      </Button>
      {result && (
        <span role="status" className="text-[14px] font-semibold">
          {result}
        </span>
      )}
    </div>
  );
}
