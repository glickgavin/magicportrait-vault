import { cn } from "@/lib/utils";

export function Avatar({ initials, size = 34, className }: { initials: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("bg-avatar-gradient inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}
