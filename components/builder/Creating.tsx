"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { clearDraft } from "./useDraft";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";

/** M4Creating: the server renders the JPEG while three progress lines show. */
export function Creating({ cardId, firstCard }: { cardId: string; firstCard: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState(0);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const run = useCallback(async () => {
    setFailed(false);
    setPhase(0);
    const timers = [setTimeout(() => setPhase(1), 700), setTimeout(() => setPhase(2), 1500)];
    const res = await fetch(`/api/cards/${cardId}/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstCard }) }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { publicId?: string; status?: string } | undefined;
    timers.forEach(clearTimeout);
    if (res?.ok && body?.publicId && body.status !== "failed") {
      setPhase(3);
      clearDraft();
      router.replace(`/cards/${body.publicId}?new=1`);
    } else setFailed(true);
  }, [cardId, firstCard, router]);

  useEffect(() => {
    trackClient("page_view_card_creating", { card_id: cardId });
    if (started.current) return;
    started.current = true;
    void run();
  }, [run, cardId]);

  const lines = [t("builder.creating1"), t("builder.creating2"), t("builder.creating3")];
  return (
    <div className="mx-auto max-w-md pt-10 text-center" data-testid="creating">
      {failed ? (
        <>
          <h1 className="text-[24px] font-extrabold">{t("builder.failedTitle")}</h1>
          <p className="mt-2 text-ink-2">{t("builder.failedBody")}</p>
          <Button size="lg" className="mt-6" onClick={() => void run()}>
            {t("builder.tryAgain")}
          </Button>
        </>
      ) : (
        <>
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-pink-tint border-t-magenta motion-reduce:animate-none" aria-hidden="true" />
          <h1 className="mt-6 text-[24px] font-extrabold" role="status">
            {t("builder.creatingTitle")}
          </h1>
          <ul className="mx-auto mt-5 w-fit space-y-3 text-left">
            {lines.map((l, i) => (
              <li key={l} className={`flex items-center gap-3 text-[16px] ${i <= phase ? "text-ink" : "text-ink-3"}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${i < phase ? "bg-avatar-gradient text-white" : "bg-black/10"}`} aria-hidden="true">
                  {i < phase && <Check className="h-3.5 w-3.5" />}
                </span>
                {l}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
