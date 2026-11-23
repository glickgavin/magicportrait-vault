import type { StoreNumbersView } from "@/lib/open-store/numbers-load";
import type { Split, Totals } from "@/lib/open-store/numbers";

const usd = (n: number | null) => (n == null ? "–" : "$" + n.toFixed(2));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "–");

const ROWS: [string, (t: Totals) => string][] = [
  ["Visitors", (t) => String(t.visitors)],
  ["Pictures started", (t) => String(t.started)],
  ["Ready", (t) => t.ready + " (" + pct(t.ready, t.started) + ")"],
  ["Failed or timed out", (t) => String(t.failed)],
  ["Median seconds", (t) => (t.medianSeconds == null ? "–" : String(t.medianSeconds))],
  ["Imagen cost", (t) => usd(t.costUsd)],
  ["Emails given", (t) => String(t.emails)],
  ["Ticked for offers", (t) => t.ticked + " (" + pct(t.ticked, t.emails) + ")"],
  ["Added to cart", (t) => String(t.carts)],
  ["Paid orders", (t) => String(t.orders)],
  ["Revenue", (t) => usd(t.revenue)],
  ["Imagen cost per order", (t) => usd(t.costPerOrder)],
];

function SplitTable({ title, list, name, withVisitors = false }: { title: string; list: Split[]; name: (k: string) => string; withVisitors?: boolean }) {
  return (
    <div className="mt-4">
      <h3 className="text-[15px] font-extrabold">{title} (30 days)</h3>
      {list.length ? (
        <table className="mt-1 w-full text-[13px]" data-testid={"store-numbers-" + title.toLowerCase()}>
          <thead>
            <tr className="text-left text-ink-2">
              <th className="py-1 font-semibold">{title}</th>
              {withVisitors && <th className="py-1 text-right font-semibold">Visitors</th>}
              <th className="py-1 text-right font-semibold">Pictures</th>
              <th className="py-1 text-right font-semibold">Ready</th>
              <th className="py-1 text-right font-semibold">Ordered</th>
              <th className="py-1 text-right font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 10).map((r) => (
              <tr key={r.key} className="border-t border-black/[0.06]">
                <td className="py-1 pr-2">{name(r.key)}</td>
                {withVisitors && <td className="py-1 text-right">{r.visitors}</td>}
                <td className="py-1 text-right">{r.started}</td>
                <td className="py-1 text-right">{r.ready}</td>
                <td className="py-1 text-right">{r.ordered}</td>
                <td className="py-1 text-right">{usd(r.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-1 text-[13px] text-ink-2">Nothing yet.</p>
      )}
    </div>
  );
}

/** Settings › Shop › Magic Store numbers (docs/open-store.md): from our own tables, so they don't depend on PostHog. */
export function StoreNumbers({ numbers, titles, themes }: { numbers: StoreNumbersView; titles: Map<string, string>; themes: Map<string, string> }) {
  return (
    <div className="mt-3">
      <table className="w-full text-[14px]" data-testid="store-numbers">
        <thead>
          <tr className="text-left text-ink-2">
            <th className="py-1 font-semibold">
              <span className="sr-only">Measure</span>
            </th>
            {numbers.periods.map((p) => (
              <th key={p.key} className="py-1 text-right font-semibold">
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, f]) => (
            <tr key={label} className="border-t border-black/[0.06]">
              <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
                {label}
              </th>
              {numbers.periods.map((p) => (
                <td key={p.key} className="py-1.5 text-right tabular-nums">
                  {f(p.totals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <SplitTable title="Product" list={numbers.split.product} name={(k) => titles.get(k) ?? k} />
      <SplitTable title="Theme" list={numbers.split.theme} name={(k) => themes.get(k) ?? k} />
      <SplitTable title="Channel" list={numbers.split.channel} name={(k) => k} withVisitors />
    </div>
  );
}
