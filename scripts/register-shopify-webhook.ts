// Registers the orders/paid webhook for My Magic Portraits on the Shopify store (docs/data.md §5.6).
// WRITTEN BUT NOT RUN by the build. A human runs it at launch (BUILD.md › After the build, step 3):
//   SHOPIFY_STORE_DOMAIN=… SHOPIFY_CLIENT_ID=… SHOPIFY_CLIENT_SECRET=… node --experimental-strip-types scripts/register-shopify-webhook.ts [--dry-run]
// (or SHOPIFY_ADMIN_ACCESS_TOKEN=… instead of the client id/secret)
const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const staticToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2025-07";
const uri = process.env.WEBHOOK_URI || "https://my.magicportraits.ai/api/webhooks/shopify/orders-paid";
if (!domain || !((clientId && clientSecret) || staticToken)) {
  console.error("Set SHOPIFY_STORE_DOMAIN and SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (or SHOPIFY_ADMIN_ACCESS_TOKEN)");
  process.exit(1);
}
const mutation = `mutation VaultCreateOrdersPaidWebhook($sub: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: ORDERS_PAID, webhookSubscription: $sub) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;
const variables = { sub: { uri, format: "JSON" } };
if (process.argv.includes("--dry-run")) {
  console.log({ domain, version, uri, auth: clientId && clientSecret ? "client_credentials" : "static_token", mutation: "webhookSubscriptionCreate(ORDERS_PAID)" });
  process.exit(0);
}

async function token(): Promise<string> {
  if (!(clientId && clientSecret)) return staticToken!;
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!res.ok || !body?.access_token) throw new Error(`token request failed: ${res.status} ${body?.error ?? ""}`);
  return body.access_token;
}

const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-shopify-access-token": await token() },
  body: JSON.stringify({ query: mutation, variables }),
});
const body = (await res.json()) as { data?: { webhookSubscriptionCreate?: { webhookSubscription?: { id: string }; userErrors?: { message: string }[] } }; errors?: unknown };
console.log(JSON.stringify(body.data ?? body.errors, null, 2));
export {};
