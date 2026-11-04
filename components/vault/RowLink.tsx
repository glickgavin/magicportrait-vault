import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function RowLink({ href, icon, title, sub, subTone = "muted", testId, action }: { href: string; icon: ReactNode; title: string; sub?: string; subTone?: "muted" | "pink"; testId?: string; action?: string }) {
  return (
    <Link href={href} data-testid={testId} className="flex items-center gap-4 rounded-[18px] bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:bg-white/80">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-pink-tint text-magenta" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold text-ink">{title}</span>
        {sub && <span className={subTone === "pink" ? "block text-[14px] font-semibold text-pink-link" : "block text-[14px] text-ink-2"}>{sub}</span>}
      </span>
      {action && <span className="shrink-0 text-[15px] font-semibold text-pink-link">{action}</span>}
      <ChevronRight className="h-5 w-5 text-ink-3" aria-hidden="true" />
    </Link>
  );
}
