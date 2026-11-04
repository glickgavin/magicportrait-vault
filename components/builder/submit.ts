"use client";

import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import type { Draft } from "./types";

export type SubmitResult = { ok: true; id: string; publicId: string; firstCard: boolean } | { ok: false; message: string };

const ERRORS: Record<string, string> = {
  too_long: "builder.errorTooLong",
  bad_schedule: "builder.errorSchedule",
  suppressed: "builder.errorSuppressed",
  paused: "builder.paused",
  locked: "builder.lockedTitle",
  limit: "builder.limit",
  rate_limited: "errors.rateLimited",
};

export async function submitCard(d: Draft, themeSlug: string, opts: { method?: "POST" | "PATCH"; url?: string } = {}): Promise<SubmitResult> {
  const scheduledFor = d.delivery === "email" && d.when === "later" && d.scheduledLocal ? new Date(d.scheduledLocal).toISOString() : null;
  trackClient("card_create_tapped", { theme_slug: themeSlug, delivery: d.delivery, message_length: d.message.length, scheduled: Boolean(scheduledFor), flow: d.flow, has_recipient_email: d.delivery === "email" });
  const res = await fetch(opts.url ?? "/api/cards", {
    method: opts.method ?? "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      versionId: d.versionId,
      imageId: d.imageId,
      crop: d.crop,
      to: d.to.trim(),
      from: d.from.trim(),
      message: d.message.trim(),
      delivery: d.delivery,
      recipientEmail: d.delivery === "email" ? d.recipientEmail.trim() : undefined,
      scheduledFor,
      entryPoint: d.entryPoint ?? undefined,
      flow: d.flow,
      reusedFrom: d.reusedFrom,
    }),
  }).catch(() => null);
  if (!res) return { ok: false, message: t("builder.errorGeneric") };
  const body = (await res.json().catch(() => ({}))) as { id?: string; publicId?: string; firstCard?: boolean; error?: string; fields?: string[] };
  if (res.ok && body.id && body.publicId) return { ok: true, id: body.id, publicId: body.publicId, firstCard: Boolean(body.firstCard) };
  if (body.error === "invalid" && body.fields?.includes("recipientEmail")) return { ok: false, message: t("builder.errorEmail") };
  if (body.error === "invalid" && body.fields?.some((f) => f === "to" || f === "from")) return { ok: false, message: t("builder.errorName") };
  return { ok: false, message: t(ERRORS[body.error ?? ""] ?? "builder.errorGeneric") };
}
