import Link from "next/link";
import { loadThemeTables } from "@/lib/db/themes";
import { TrackPageView } from "@/components/TrackPageView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Template editor" };

export default async function TemplateIndex() {
  const { themes, versions } = await loadThemeTables();
  return (
    <div>
      <TrackPageView event="settings_viewed" props={{ section: "template" }} />
      <h1 className="text-[30px] font-extrabold tracking-tight">Template editor</h1>
      <p className="text-[15px] text-ink-2">Pick a version to edit. New versions are added from the theme library.</p>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {versions.map((v) => {
          const t = themes.find((x) => x.id === v.theme_id)!;
          return (
            <li key={v.id}>
              <Link href={`/settings/themes/${t.id}/versions/${v.id}`} className="flex justify-between rounded-[14px] bg-white p-3 font-semibold shadow-sm">
                <span>
                  {t.name} · {v.name}
                </span>
                <span className="text-[13px] text-ink-2">{v.status}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
