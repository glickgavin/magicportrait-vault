import "server-only";
import { addDays, dayIn, startOfDayIn } from "@/lib/biztime";
import { storeNumbersData, visitorFirstTouches } from "@/lib/db/store";
import { getSettings } from "@/lib/settings";
import type { FirstTouch } from "./first-touch";
import { splits, totals, type Split, type Totals } from "./numbers";

export type StoreNumbersView = { periods: { key: "today" | "7d" | "30d"; label: string; totals: Totals }[]; split: { product: Split[]; theme: Split[]; channel: Split[] } };

/** Today, 7 and 30 days (business days in brand.timezone), and the 30 days split by product, theme and channel. */
export async function storeNumbers(): Promise<StoreNumbersView> {
  const tz = (await getSettings(["brand.timezone"] as const))["brand.timezone"];
  const today = dayIn(tz, new Date());
  const since = { today: startOfDayIn(tz, today), "7d": startOfDayIn(tz, addDays(today, -6)), "30d": startOfDayIn(tz, addDays(today, -29)) };
  const data = await storeNumbersData(since["30d"]);
  const known = new Map(data.visitors.map((v) => [v.id, v.first_touch]));
  const missing = [...new Set(data.generations.map((g) => g.visitor_id).filter((id) => !known.has(id)))];
  for (const [id, ft] of await visitorFirstTouches(missing)) known.set(id, ft);
  return {
    periods: [
      { key: "today", label: "Today", totals: totals(data, since.today) },
      { key: "7d", label: "7 days", totals: totals(data, since["7d"]) },
      { key: "30d", label: "30 days", totals: totals(data, since["30d"]) },
    ],
    split: splits(data, (id) => (known.get(id) ?? null) as FirstTouch | null),
  };
}
