import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { superUserOrNull } from "@/lib/auth/session";

/**
 * The activity-log filter form posts here so an email filter never sits in the address bar:
 * the email goes into a short-lived cookie read by the page.
 */
export async function POST(req: Request) {
  if (!(await superUserOrNull())) return new Response("Not found", { status: 404 });
  const f = await req.formData();
  const qs = new URLSearchParams();
  for (const k of ["event", "source", "actor"]) {
    const v = String(f.get(k) ?? "").trim();
    if (v) qs.set(k, v.slice(0, 80));
  }
  const email = String(f.get("email") ?? "").trim().toLowerCase().slice(0, 120);
  const res = NextResponse.redirect(new URL(`/settings/activity${qs.size ? `?${qs}` : ""}`, req.url), 303);
  (await cookies()).set("vault_activity_email", email, { httpOnly: true, sameSite: "strict", path: "/settings/activity", maxAge: 600 });
  if (!email) res.cookies.delete("vault_activity_email");
  return res;
}
