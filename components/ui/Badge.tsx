import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "pink" | "dark" | "green" | "grey" | "amber" | "red" | "gradient";
const tones: Record<Tone, string> = {
  pink: "bg-pink-tint text-pink-dark",
  dark: "bg-[#2b2b2b] text-white",
  green: "bg-[#e3f4e8] text-[#1f6b35]",
  grey: "bg-black/[0.06] text-ink",
  amber: "bg-[#fff1d6] text-[#7a4a00]",
  red: "bg-[#fde8e6] text-[#a1251b]",
  gradient: "bg-primary-gradient text-white",
};

export function Badge({ tone = "pink", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide", tones[tone], className)}>
      {children}
    </span>
  );
}
