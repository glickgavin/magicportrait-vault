import type { CardRow } from "@/lib/db/cards";
import { t } from "@/lib/i18n";
import { fmtDate, fmtDateTime } from "@/lib/format";

export function cardStatusText(c: Pick<CardRow, "status" | "scheduled_for" | "updated_at" | "delivery">): { text: string; tone: "green" | "pink" | "grey" | "red" } {
  switch (c.status) {
    case "emailed":
      return { text: t("cards.status.emailed"), tone: "green" };
    case "opened":
      return { text: t("cards.status.opened", { date: fmtDate(c.updated_at, { year: false }) }), tone: "green" };
    case "scheduled":
      return { text: t("cards.status.scheduled", { date: fmtDateTime(c.scheduled_for) }), tone: "pink" };
    case "failed":
      return { text: t("cards.status.failed"), tone: "red" };
    case "cancelled":
      return { text: t("cards.status.cancelled"), tone: "grey" };
    case "rendering":
      return { text: t("cards.status.rendering"), tone: "grey" };
    default:
      return { text: c.delivery === "self" ? t("cards.status.shared") : t("cards.status.ready"), tone: "grey" };
  }
}

const tones = { green: "text-[#1f6b35]", pink: "text-pink-dark", grey: "text-ink-2", red: "text-danger" };

export function CardStatusLabel({ card }: { card: Pick<CardRow, "status" | "scheduled_for" | "updated_at" | "delivery"> }) {
  const s = cardStatusText(card);
  return <span className={`block text-[14px] font-semibold ${tones[s.tone]}`}>{s.text}</span>;
}
