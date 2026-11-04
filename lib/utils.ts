import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Masks an email for server logs: s***@example.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "(none)";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Initials from first/last name, else the first two letters of the email (SPEC §7). */
export function initialsFor(name: string | null | undefined, email: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return email.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "MP";
}

export function firstName(name: string | null | undefined): string | null {
  const f = (name ?? "").trim().split(/\s+/)[0];
  return f ? f : null;
}
