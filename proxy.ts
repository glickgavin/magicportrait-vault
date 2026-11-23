import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Shop pages; their loading placeholders stream, so a page's own notFound() can't set the 404 status. */
const SHOP_PAGE = /^\/(gifts|products|cart)(\/|$)/;
/** The open store's pages and API (docs/open-store.md): 404 while hidden, the same way. */
const STORE_PATH = /^\/(store|api\/store)(\/|$)/;

/**
 * Keeps the Supabase auth cookies fresh. Authorisation itself happens in each page and route, except that
 * hidden shop pages are answered 404 here, before anything streams (CLAUDE.md: hidden shop routes are 404).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (SHOP_PAGE.test(request.nextUrl.pathname)) {
    const { shopVisibleTo } = await import("@/lib/shop/visible");
    if (!(await shopVisibleTo(data.user?.email ?? null))) {
      // Any unknown path renders the app's not-found page with a real 404.
      const hidden = NextResponse.rewrite(new URL("/_shop-hidden", request.url), { status: 404 });
      for (const c of response.cookies.getAll()) hidden.cookies.set(c);
      return hidden;
    }
  }
  if (STORE_PATH.test(request.nextUrl.pathname)) {
    const { openStoreVisibleTo } = await import("@/lib/open-store/visible");
    if (!(await openStoreVisibleTo(data.user?.email ?? null))) {
      const hidden = request.nextUrl.pathname.startsWith("/api/") ? NextResponse.json({ error: "not_found" }, { status: 404 }) : NextResponse.rewrite(new URL("/_store-hidden", request.url), { status: 404 });
      for (const c of response.cookies.getAll()) hidden.cookies.set(c);
      return hidden;
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|ingest|fixtures|theme-placeholders|favicon|mp-logo|api/health|api/webhooks|api/cron|g/).*)"],
};
