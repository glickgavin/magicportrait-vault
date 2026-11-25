import { requireSuperUser } from "@/lib/auth/session";
import { settingRows } from "@/lib/admin/data";
import Link from "next/link";
import { dreamshipConnection, dreamshipProducts, makerUse, type Maker } from "@/lib/printers";
import { designerUrl } from "@/lib/sources/dreamship";
import { printerOrders } from "@/lib/dreamship/artwork";
import { RetryJob } from "@/components/admin/printers/RetryJob";
import { fmtBiz } from "@/lib/biztime";
import { getSettings } from "@/lib/settings";
import { SettingField } from "@/components/admin/SettingField";
import { CheckConnection } from "@/components/admin/printers/CheckConnection";
import { TrackPageView } from "@/components/TrackPageView";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Printers" };

const CARD = "rounded-[20px] bg-white p-5 shadow-[0_1px_6px_rgba(0,0,0,0.05)]";
const FILE_KEYS = ["printers.print_files_to_order"];
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
  const [rows, use, conn, s, products, orders] = await Promise.all([settingRows(), makerUse().catch(() => null), dreamshipConnection(), getSettings(["brand.timezone"] as const), dreamshipProducts().catch(() => null), printerOrders().catch(() => null)]);
  const tz = s["brand.timezone"];
  const dsRows = DREAMSHIP_KEYS.map((k) => rows.find((r) => r.key === k)).filter((r) => r !== undefined);
  const autoSubmit = conn.account?.settings.autoSubmitImportOrders === true;
  const dsOrders = orders?.filter((o) => o.kind === "dreamship_artwork") ?? null;
  const fileJobs = orders?.filter((o) => o.kind === "print_file") ?? null;
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
          <p className="text-[13px] text-ink-2">Set in Dreamship, and the app changes nothing because of them. Dreamship&apos;s API doesn&apos;t share them, so they show as Not reported: check them in Dreamship&apos;s settings.</p>
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

          <h3 className="mt-5 text-[16px] font-extrabold">Orders</h3>
          <p className="text-[13px] text-ink-2">The latest 50 paid orders with personalised Dreamship lines: what the app did, and Dreamship&apos;s own status. Submitting or cancelling happens in Dreamship and Shopify, never here.</p>
          {dsOrders === null ? (
            <p className="mt-2 text-[14px] text-ink-2">Couldn&apos;t read the orders.</p>
          ) : dsOrders.length === 0 ? (
            <p className="mt-2 text-[14px] text-ink-2">No orders yet.</p>
          ) : (
            <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Dreamship orders">
              <table className="w-full min-w-[640px] text-[14px]" data-testid="dreamship-orders">
                <thead>
                  <tr className="text-left text-ink-2">
                    <th className="py-1 font-semibold">Shopify order</th>
                    <th className="py-1 font-semibold">Dreamship order</th>
                    <th className="py-1 font-semibold">The customer&apos;s picture</th>
                    <th className="py-1 font-semibold">Dreamship&apos;s status</th>
                    <th className="py-1 font-semibold">When</th>
                  </tr>
                </thead>
                <tbody>
                  {dsOrders.map((o) => (
                    <tr key={o.id} className="border-t border-black/[0.06] align-top">
                      <td className="py-1.5 pr-2 font-semibold">{o.orderName}</td>
                      <td className="py-1.5 pr-2">
                        {o.dreamshipUrl ? (
                          <a href={o.dreamshipUrl} target="_blank" rel="noreferrer" className="link">
                            {o.dreamshipOrderId}
                          </a>
                        ) : (
                          "Not imported yet"
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <Badge tone={o.status === "picture_set" ? "green" : o.status === "waiting" ? "grey" : "amber"}>{o.status === "picture_set" ? "PICTURE SET" : o.status === "waiting" ? "WAITING FOR DREAMSHIP" : "NEEDS ATTENTION"}</Badge>
                        <span className="ml-1 text-[13px] text-ink-2">
                          {o.linesDone}/{o.lines} {o.lines === 1 ? "line" : "lines"}
                        </span>
                        {o.reason && <p className="mt-1 text-[13px] text-ink-2">{o.reason}</p>}
                        {(o.status === "needs_attention" || o.status === "failed") && (
                          <div className="mt-1">
                            <RetryJob jobId={o.id} order={o.orderName} />
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">{o.dreamshipStatus ?? "–"}</td>
                      <td className="py-1.5 text-ink-2">{fmtBiz(o.at, tz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-5">
          <section className={CARD} aria-labelledby="print-files" data-testid="printer-print-files">
            <h2 id="print-files" className="text-[19px] font-extrabold">
              Personalised print files
            </h2>
            <p className="mt-1 text-[13px] text-ink-2">For lines the customer personalised (words or a picture) and made by Prodigi, Gelato or in house: the app makes the print file with the layer drawn on and links it from the order in Shopify (<code>mmp_shop.print_files</code>). Dreamship&apos;s are set on its order instead.</p>
            {FILE_KEYS.map((k) => rows.find((r) => r.key === k)).filter((r) => r !== undefined).map((r) => (
              <div key={r.key} className="mt-3 flex items-center justify-between gap-3 rounded-[14px] bg-black/[0.03] p-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{r.label}</p>
                  {r.description && <p className="text-[13px] text-ink-2">{r.description}</p>}
                </div>
                <SettingField row={r} compact={false} />
              </div>
            ))}
            {fileJobs === null ? (
              <p className="mt-2 text-[14px] text-ink-2">Couldn&apos;t read them.</p>
            ) : fileJobs.length === 0 ? (
              <p className="mt-2 text-[14px] text-ink-2">None yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2 text-[14px]" data-testid="print-file-jobs">
                {fileJobs.map((o) => (
                  <li key={o.id} className="rounded-[14px] bg-black/[0.03] p-3" aria-label={`Order ${o.orderName}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{o.orderName}</span>
                      <Badge tone={o.status === "picture_set" ? "green" : o.status === "waiting" ? "grey" : "amber"}>{o.status === "picture_set" ? "FILES READY" : o.status === "waiting" ? "MAKING" : "NEEDS ATTENTION"}</Badge>
                      <span className="text-[13px] text-ink-2">
                        {o.linesDone}/{o.lines} {o.lines === 1 ? "line" : "lines"} · {fmtBiz(o.at, tz)}
                      </span>
                    </div>
                    {o.reason && <p className="mt-1 text-[13px] text-ink-2">{o.reason}</p>}
                    {o.files.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-x-3 text-[13px]">
                        {o.files.map((f) => (
                          <a key={f.lineId} href={f.url} target="_blank" rel="noreferrer" className="link">
                            Line {f.lineId} file
                          </a>
                        ))}
                      </p>
                    )}
                    {(o.status === "needs_attention" || o.status === "failed") && (
                      <div className="mt-1">
                        <RetryJob jobId={o.id} order={o.orderName} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
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
