"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { identifyClient, trackClient } from "@/lib/track-client";

type Purpose = "gift" | "redeem" | "default";

export function SignInForm({ purpose, next, expired, codeMinutes }: { purpose: Purpose; next: string; expired: boolean; codeMinutes: number }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(expired ? t("signin.linkExpired") : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    trackClient("page_view_vault_signin", { purpose });
  }, [purpose]);
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestCode(resend = false) {
    setError(null);
    setNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t("signin.badEmail"));
      return;
    }
    setBusy(true);
    if (purpose === "redeem") trackClient("redeem_lookup_submitted", { has_order_in_url: next.startsWith("/orders/"), email_domain: email.trim().toLowerCase().split("@")[1] ?? null });
    try {
      const r = await fetch("/api/auth/code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, purpose }) });
      if (r.status === 429) setError(t("errors.rateLimited"));
      else if (r.status === 400) setError(t("signin.badEmail"));
      else if (!r.ok) setError(t("errors.generic"));
      else {
        setStep("code");
        if (resend) setNotice(t("signin.resent"));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setNotice(null);
    if (!/^\d{6}$/.test(code)) {
      setError(t("signin.badCode"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json", "x-attempt": String(attempt + 1) }, body: JSON.stringify({ email, code, next }) });
      const body = (await r.json().catch(() => ({}))) as { next?: string };
      if (r.ok) {
        identifyClient(email.trim().toLowerCase(), { email: email.trim().toLowerCase() });
        window.location.assign(body.next || "/");
        return;
      }
      setAttempt((a) => a + 1);
      setError(r.status === 429 ? t("errors.rateLimited") : t("signin.badCode"));
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      {step === "email" ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void requestCode();
          }}
        >
          <label htmlFor="signin-email" className="block text-[15px] font-bold">
            {t("signin.emailLabel")}
          </label>
          <input
            id="signin-email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("signin.emailPlaceholder")}
            aria-describedby="signin-email-hint signin-error"
            aria-invalid={Boolean(error)}
            className="mt-2 h-[52px] w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] px-4 text-[17px] outline-none focus:border-magenta focus:ring-2 focus:ring-magenta/30"
          />
          <p id="signin-email-hint" className="mt-2 text-[14px] leading-snug text-ink-2">
            {t("signin.emailHint")}
          </p>
          <Message error={error} notice={notice} />
          <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy}>
            {busy ? t("signin.sending") : purpose === "redeem" ? t("signin.sendCode") : t("signin.findPortraits")}
          </Button>
        </form>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <h2 className="text-[18px] font-extrabold">{t("signin.codeTitle")}</h2>
          <p className="mt-1 text-[14px] text-ink-2">{t("signin.codeSub", { email: email.trim().toLowerCase(), minutes: codeMinutes })}</p>
          <label htmlFor="signin-code" className="mt-4 block text-[15px] font-bold">
            {t("signin.codeLabel")}
          </label>
          <input
            ref={codeRef}
            id="signin-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            data-attempt={attempt}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-describedby="signin-error"
            aria-invalid={Boolean(error)}
            className="mt-2 h-[60px] w-full rounded-[12px] border border-black/15 bg-[#F8F6F0] text-center text-[28px] font-extrabold tracking-[0.5em] outline-none focus:border-magenta focus:ring-2 focus:ring-magenta/30"
          />
          <Message error={error} notice={notice} />
          <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy || code.length !== 6}>
            {busy ? t("signin.verifying") : t("signin.verify")}
          </Button>
          <div className="mt-3 flex justify-between text-[14px]">
            <button type="button" className="link" onClick={() => void requestCode(true)} disabled={busy}>
              {t("signin.resend")}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setNotice(null);
              }}
            >
              {t("signin.changeEmail")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Message({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <p id="signin-error" role={error ? "alert" : "status"} aria-live="polite" className={`mt-2 min-h-[1.25rem] text-[14px] font-medium ${error ? "text-danger" : "text-success"}`}>
      {error ?? notice ?? ""}
    </p>
  );
}
