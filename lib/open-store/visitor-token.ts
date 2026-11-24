/** The visitor cookie's name and shape; shared with proxy.ts, which sets it on the first store page. */
export const VISITOR_COOKIE = "mmp_visitor";

/** 32 random bytes, base64url: 43 characters. */
export const isVisitorToken = (v: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(v);

export function newVisitorTokenWeb(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
