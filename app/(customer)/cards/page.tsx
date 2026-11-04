import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listCardsBySender } from "@/lib/db/cards";
import { db } from "@/lib/db/client";
import { getSettings } from "@/lib/settings";
import { HomeTabs } from "@/components/vault/HomeTabs";
import { MyCardsList, type MyCard } from "@/components/vault/MyCardsList";
import { TrackPageView } from "@/components/TrackPageView";
import { ButtonLink } from "@/components/ui/Button";
import { fmtDate } from "@/lib/format";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("myCards.title") };

export default async function MyCardsPage() {
  const user = await requireUser("/cards");
  const [cards, s] = await Promise.all([listCardsBySender(user.email), getSettings(["cards.enabled"] as const)]);
  const shown = cards.filter((c) => c.status !== "rendering");
  const ids = shown.map((c) => c.id);
  const versionIds = [...new Set(shown.map((c) => c.version_id).filter(Boolean))] as string[];
  const [deliveries, versions] = await Promise.all([
    ids.length ? db().from("card_deliveries").select("card_id, type").in("card_id", ids).in("type", ["share", "download", "link_copy"]) : Promise.resolve({ data: [] }),
    versionIds.length ? db().from("theme_versions").select("id, name").in("id", versionIds) : Promise.resolve({ data: [] }),
  ]);
  const dl = new Map<string, Set<string>>();
  for (const d of (deliveries.data ?? []) as { card_id: string; type: string }[]) (dl.get(d.card_id) ?? dl.set(d.card_id, new Set()).get(d.card_id)!).add(d.type);
  const vname = new Map(((versions.data ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name]));

  const list: MyCard[] = shown.map((c) => {
    const types = dl.get(c.id) ?? new Set();
    const label: MyCard["label"] =
      c.status === "scheduled" || c.status === "emailed" || c.status === "opened" || c.status === "failed" || c.status === "cancelled"
        ? c.status
        : types.has("share") || types.has("link_copy")
          ? "shared"
          : types.has("download")
            ? "downloaded"
            : "ready";
    return {
      id: c.id,
      publicId: c.public_id,
      toName: c.to_name,
      fromName: c.from_name,
      message: c.message,
      versionId: c.version_id,
      versionName: c.version_id ? (vname.get(c.version_id) ?? "") : "",
      imageId: c.imagen_image_id,
      crop: c.crop,
      delivery: c.delivery,
      recipientEmail: c.recipient_email,
      status: c.status,
      label,
      date: label === "opened" ? t("myCards.openedOn", { date: fmtDate(c.updated_at, { year: false }) }) : fmtDate(c.created_at, { year: false }),
      scheduledFor: c.scheduled_for,
      createdAt: c.created_at,
    };
  });

  return (
    <div className="mx-auto max-w-[640px]" data-testid="my-cards">
      <TrackPageView event="page_view_vault_cards" props={{ cards_count: list.length }} />
      <HomeTabs active="cards" />
      <div className="mt-5 flex items-center justify-between">
        <h1 className="text-[28px] font-extrabold tracking-tight">{t("myCards.title")}</h1>
        {s["cards.enabled"] && (
          <ButtonLink href="/create?step=theme&entry=my_cards" size="md">
            <Plus className="h-4 w-4" aria-hidden="true" /> {t("myCards.newCard")}
          </ButtonLink>
        )}
      </div>
      {list.length === 0 ? (
        <p className="mt-6 rounded-[16px] bg-white p-5 text-center text-ink-2">{t("myCards.empty")}</p>
      ) : (
        <div className="mt-2">
          <MyCardsList cards={list} />
        </div>
      )}
    </div>
  );
}
