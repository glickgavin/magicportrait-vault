"use client";

type IntercomFn = (cmd: string, ...args: unknown[]) => void;

export function openChat() {
  (window as unknown as { Intercom?: IntercomFn }).Intercom?.("show");
}

/** The live site's "VIP Login": a 500×650 popup to the Shopify Customer Account login. */
export function openShopifyLogin(url = "https://shopify.com/4283367495/account") {
  const w = 500;
  const h = 650;
  const left = window.screenX + (window.outerWidth - w) / 2;
  const top = window.screenY + (window.outerHeight - h) / 2;
  const popup = window.open(url, "shopify-login", `width=${w},height=${h},left=${left},top=${top}`);
  if (!popup) window.location.href = url;
}
