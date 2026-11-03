import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Download, Sparkles } from "lucide-react";
import { markOpenedFromEmail, publicCard } from "@/lib/cards/public";
import { TrackPageView } from "@/components/TrackPageView";
import { t } from "@/lib/i18n";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("publicCard.title"), robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The public card page a recipient opens. No sign-in, noindex, and nothing about the sender but their first name. */
export default async function PublicCardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string }> }) {
  const { slug } = await params;
  const { d } = await searchParams;
  const card = await publicCard(slug);
  if (card && d) {
    await markOpenedFromEmail(card, d);
    redirect(`/c/${slug}`);
  }
  if (!card || card.share_hidden) {
    return (
      <div className="mx-auto max-w-md pt-10 text-center" data-testid="card-unavailable">
        <h1 className="text-[24px] font-extrabold">{t("publicCard.unavailable")}</h1>
        <p className="mt-2 text-ink-2">{t("publicCard.unavailableBody")}</p>
      </div>
    );
  }
  const theme = card.theme_id ? ((await db().from("themes").select("name").eq("id", card.theme_id).single()).data as { name: string } | null) : null;
  return (
    <div className="mx-auto max-w-[480px]" data-testid="public-card">
      <TrackPageView event="page_view_card_received" props={{ card_id: card.public_id, entry_point: "recipient_page" }} />
      <p className="text-center text-[16px] text-ink-2">{t("publicCard.from", { from: card.from_name, theme: theme?.name ?? t("publicCard.card") })}</p>
      <img src={`/c/${slug}/image`} alt={t("publicCard.alt", { from: card.from_name })} width={1500} height={2100} className="ph-no-capture mx-auto mt-4 w-full max-w-[420px] rounded-[8px] shadow-[0_12px_40px_rgba(0,0,0,0.18)]" />
      <a
        href={`/c/${slug}/image?download=1`}
        className="mt-5 flex h-12 items-center justify-center gap-2 rounded-[12px] bg-white font-semibold shadow-sm"
        data-testid="save-card"
      >
        <Download className="h-5 w-5" aria-hidden="true" /> {t("publicCard.save")}
      </a>
      <TryBlock slug={slug} via="page" />
    </div>
  );
}

function TryBlock({ slug, via }: { slug: string; via: "page" | "email" }) {
  return (
    <section className="mt-6 rounded-[20px] bg-white p-5 text-center shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <h2 className="text-[19px] font-extrabold">{t("publicCard.tryTitle")}</h2>
      <p className="mt-1 text-ink-2">{t("publicCard.tryBody")}</p>
      <a href={`/c/${slug}/try?via=${via}`} className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-primary-gradient px-6 font-semibold text-white shadow-primary">
        {t("publicCard.tryCta")} <Sparkles className="h-4 w-4" aria-hidden="true" />
      </a>
    </section>
  );
}
