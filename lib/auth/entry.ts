import "server-only";
import { cookies } from "next/headers";

/** Which tracked entry link (`/from/<name>`) brought this browser, for crediting the sign-in that follows. */
export const ENTRY_COOKIE = "mmp_entry";
export const ENTRY_COOKIE_SECONDS = 3600;

export async function entryFromCookie(): Promise<string | null> {
  const v = (await cookies()).get(ENTRY_COOKIE)?.value ?? null;
  return v && /^[a-z0-9-]{1,32}$/.test(v) ? v : null;
}
