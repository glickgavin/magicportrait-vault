import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[12px] font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed select-none";
const variants: Record<Variant, string> = {
  primary: "bg-primary-gradient text-white shadow-primary hover:opacity-90",
  secondary: "bg-white text-ink border border-line hover:bg-black/[0.03]",
  ghost: "bg-black/5 text-ink hover:bg-black/10",
  danger: "bg-[#b42318] text-white hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-7 text-[17px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  href,
  children,
  external,
  ...props
}: Omit<ComponentProps<"a">, "href"> & { variant?: Variant; size?: Size; href: string; children: ReactNode; external?: boolean }) {
  if (external || /^https?:/.test(href)) {
    return (
      <a href={href} className={buttonClass(variant, size, className)} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
