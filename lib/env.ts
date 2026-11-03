import "server-only";

/** Server environment. Secrets live only in Vercel env vars; nothing here reaches the browser. */
export const env = {
  get appUrl() {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
    if (process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  },
  get dataSource(): "live" | "fixtures" {
    return process.env.DATA_SOURCE === "live" ? "live" : "fixtures";
  },
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get giftLinkSecret() {
    const s = required("GIFT_LINK_SECRET");
    if (s.length < 32) throw new Error("GIFT_LINK_SECRET must be 32+ characters");
    return s;
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
  optional(name: string): string | undefined {
    const v = process.env[name];
    return v && v.length ? v : undefined;
  },
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}
