import { requireSuperUser } from "@/lib/auth/session";
import { settingRows } from "@/lib/admin/data";
import Link from "next/link";
import { dreamshipConnection, dreamshipProducts, makerUse, type Maker } from "@/lib/printers";
import { designerUrl } from "@/lib/sources/dreamship";
import { fmtBiz } from "@/lib/biztime";
import { getSettings } from "@/lib/settings";
import { SettingField } from "@/components/admin/SettingField";
import { CheckConnection } from "@/components/admin/printers/CheckConnection";
import { TrackPageView } from "@/components/TrackPageView";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Printers" };

const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";
const DREAMSHIP_KEYS = ["dreamship.sync_enabled", "dreamship.import_wait_hours", "dreamship.sale_pct", "dreamship.min_margin_pct", "dreamship.api_url"];
const OTHERS: [Maker, string][] = [
  ["prodigi", "Prodigi"],
  ["gelato", "Gelato"],
  ["in_house", "In house"],
];

const onOff = (v: boolean | null) => (v == null ? "Not reported" : v ? "On" : "Off");

/**
 * Settings › Printers (docs/dreamship.md › Part C): the connection, Dreamship's own order settings (read only), this
 * app's printer settings, and what the app has done. It never controls order status: that's Shopify's and Dreamship's.
 */
export default async function PrintersPage() {
  await requireSuperUser();
  const [rows, use, conn, s, products] = await Promise.all([settingRows(), makerUse().catch(() => null), dreamshipConnection(), getSettings(["brand.timezone"] as const), dreamshipProducts().catch(() => null)]);
  const tz = s["brand.timezone"];
  const dsRows = DREAMSHIP_KEYS.map((k) => rows.find((r) => r.key === k)).filter((r) => r !== undefined);
  const autoSubmit = conn.account?.settings.autoSubmitImportOrders === true;
  const count = (m: Maker) => (use ? `${use[m].products} ${use[m].products === 1 ? "product" : "products"}, ${use[m].sizes} ${use[m].sizes === 1 ? "size" : "sizes"}` : "Couldn't read the products");

  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "printers" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Printers</h1>
      <p className="max-w-[860px] text-[15px] text-ink-2">Who makes each product, how the app talks to them, and what it has done. Whether an order waits or goes to print is set in Shopify and the printer, never here.</p>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
        <section className={CARD} aria-labelledby="dreamship-title" data-testid="printer-dreamship">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="dreamship-title" className="text-[21px] font-extrabold">
              Dreamship
            </h2>
            <Badge tone={conn.account ? "green" : "grey"}>{conn.account ? "Connected" : conn.configured ? "Not connected" : "No API key"}</Badge>
          </div>
          <p className="text-[14px] text-ink-2">{count("dreamship")}</p>

          <h3 className="mt-4 text-[16px] font-extrabold">Connection</h3>
          <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[14px]">
            <dt className="text-ink-2">API key</dt>
            <dd>{conn.configured ? "Set in Vercel" : "Not set (DREAMSHIP_API_KEY)"}</dd>
            <dt className="text-ink-2">Business</dt>
            <dd>{conn.account?.businessName || conn.lastCheck?.business || "–"}</dd>
            <dt className="text-ink-2">Plan</dt>
            <dd>{conn.account?.plan ?? conn.lastCheck?.plan ?? "–"}</dd>
            <dt className="text-ink-2">Last checked</dt>
            <dd>{conn.lastCheck ? `${fmtBiz(conn.lastCheck.checkedAt, tz)} · ${conn.lastCheck.ok ? "OK" : "failed"}` : "Never"}</dd>
          </dl>
          {conn.error && <p className="mt-1 text-[13px] text-[#a1251b]">Couldn&apos;t read Dreamship just now: {conn.error}</p>}
          <div className="mt-3">
            <CheckConnection source="dreamship" />
          </div>

          <h3 className="mt-5 text-[16px] font-extrabold">Dreamship&apos;s own order settings</h3>
          <p className="text-[13px] text-ink-2">Read from Dreamship; change them in Dreamship. The app changes nothing because of them.</p>
          <dl className="mt-2 grid grid-cols-[1fr_max-content] gap-x-4 gap-y-1.5 text-[14px]" data-testid="dreamship-order-settings">
            <dt>Auto-import orders with Dreamship products</dt>
            <dd className="font-semibold">{conn.account ? onOff(conn.account.settings.autoImportOrders) : "–"}</dd>
            <dt>Auto-submit imported orders</dt>
            <dd className="font-semibold">{conn.account ? onOff(conn.account.settings.autoSubmitImportOrders) : "–"}</dd>
            <dt>Auto-submit API orders</dt>
            <dd className="font-semibold">{conn.account ? onOff(conn.account.settings.autoSubmitApiOrders) : "–"}</dd>
          </dl>
          {autoSubmit && (
            <p className="mt-3 rounded-[14px] bg-[#FFF4E5] p-3 text-[14px] text-[#7a4b00]" data-testid="auto-submit-note">
              Dreamship sends imported orders to print straight away, so the customer&apos;s picture may not be on them in time.
            </p>
          )}

          <h3 className="mt-5 text-[16px] font-extrabold">This app&apos;s settings</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {dsRows.map((r) => (
              <div key={r.key} className={`flex gap-3 rounded-[14px] bg-black/[0.03] p-3 ${r.type === "boolean" ? "items-center justify-between" : "flex-col"}`}>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{r.label}</p>
                  {r.description && <p className="text-[13px] text-ink-2">{r.description}</p>}
                </div>
                <SettingField row={r} compact={r.type !== "boolean"} />
              </div>
            ))}
          </div>

          <h3 className="mt-5 text-[16px] font-extrabold">Products</h3>
          {products === null ? (
            <p className="text-[14px] text-ink-2">Couldn&apos;t read the products.</p>
          ) : products.length === 0 ? (
            <p className="text-[14px] text-ink-2">No product has a Dreamship size yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2" data-testid="dreamship-products">
              {products.map((p) => (
                <li key={p.legacyId} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[14px] bg-black/[0.03] p-3 text-[14px]">
                  <span className="min-w-[200px] flex-1 font-semibold">{p.title}</span>
                  <span>
                    {p.dreamshipProductId ? (
                      <a href={designerUrl(p.dreamshipProductId)} target="_blank" rel="noreferrer" className="link">
                        Dreamship {p.dreamshipProductId}
                      </a>
                    ) : (
                      "Not linked"
                    )}
                  </span>
                  <span className="text-ink-2">{p.lastSyncedAt ? `Synced ${fmtBiz(p.lastSyncedAt, tz)}` : "Never synced"}</span>
                  <Link href={`/settings/shop/products/${p.legacyId}#dreamship`} className={p.warnings ? "font-bold text-[#7a4b00] hover:underline" : "link"}>
                    {p.warnings} {p.warnings === 1 ? "warning" : "warnings"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-5">
          {OTHERS.map(([m, name]) => (
            <section key={m} className={CARD} aria-labelledby={`printer-${m}`} data-testid={`printer-${m}`}>
              <h2 id={`printer-${m}`} className="text-[19px] font-extrabold">
                {name}
              </h2>
              <p className="text-[14px] text-ink-2">{count(m)}</p>
              <p className="mt-2 text-[14px]">Orders go to the existing print system straight from Shopify. No settings yet.</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
