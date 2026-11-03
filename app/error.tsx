"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error]", error.digest ?? "");
  }, [error]);
  return (
    <main id="main" className="mx-auto max-w-md px-4 pt-20 text-center">
      <h1 className="text-[26px] font-extrabold">{t("errors.errorTitle")}</h1>
      <p className="mt-2 text-ink-2">{t("errors.errorBody")}</p>
      <Button onClick={reset} className="mt-6">
        {t("errors.tryAgain")}
      </Button>
    </main>
  );
}
