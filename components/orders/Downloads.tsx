"use client";

import { Download } from "lucide-react";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";

type Row = { tileId: string; imageUrl: string; fileName: string };

export function Downloads({ orderName, orderId, rows }: { orderName: string; orderId: string; rows: Row[] }) {
  const base = `/api/orders/${encodeURIComponent(orderName)}`;
  return (
    <div data-testid="downloads">
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={`${r.tileId}-${i}`} className="flex items-center gap-3 py-2.5">
            <img src={r.imageUrl} alt="" className="h-12 w-12 rounded-[10px] object-cover" loading="lazy" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold">{t("orders.portraitN", { n: i + 1 })}</p>
              <p className="truncate text-[13px] text-ink-2">{r.fileName}</p>
            </div>
            <a
              href={`${base}/download/${i + 1}`}
              download
              onClick={() => trackClient("redeem_download_clicked", { order_id: orderId, tile_id: r.tileId, portrait_index: i })}
              aria-label={t("orders.download", { n: i + 1 })}
              className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-black/[0.05] hover:bg-black/10"
            >
              <Download className="h-5 w-5" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <a
        href={`${base}/download-all`}
        download
        onClick={() => trackClient("redeem_download_all_clicked", { order_id: orderId, portrait_count: rows.length })}
        className="mt-3 flex h-12 items-center justify-center gap-2 rounded-[12px] bg-[#2b2b2b] font-semibold text-white"
        data-testid="download-all"
      >
        <Download className="h-5 w-5" aria-hidden="true" /> {t("orders.downloadAll")}
      </a>
    </div>
  );
}
