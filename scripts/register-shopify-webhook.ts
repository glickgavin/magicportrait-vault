// Registers the orders/paid webhook for My Magic Portraits on the Shopify store (docs/data.md §5.6).
// WRITTEN BUT NOT RUN by the build. A human runs it at launch (BUILD.md › After the build, step 3):
//   SHOPIFY_STORE_DOMAIN=… SHOPIFY_ADMIN_ACCESS_TOKEN=… node --experimental-strip-types scripts/register-shopify-webhook.ts [--dry-run]
const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2025-07";
const uri = process.env.WEBHOOK_URI || "https://my.magicportraits.ai/api/webhooks/shopify/orders-paid";
if (!domain || !token) {
  console.error("Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN");
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
  console.log({ domain, version, uri, mutation: "webhookSubscriptionCreate(ORDERS_PAID)" });
  process.exit(0);
}
const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-shopify-access-token": token },
  body: JSON.stringify({ query: mutation, variables }),
});
const body = (await res.json()) as { data?: { webhookSubscriptionCreate?: { webhookSubscription?: { id: string }; userErrors?: { message: string }[] } }; errors?: unknown };
console.log(JSON.stringify(body.data ?? body.errors, null, 2));
export {};
