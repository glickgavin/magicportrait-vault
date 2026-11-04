# Thank-you pop-up (GiftSheet): wiring notes

The pop-up lives in a Shopify **checkout UI extension** on the thank-you page (outside this repo; launch step 5 in `BUILD.md`). It asks My Magic Portraits for the customer's one-tap link.

**Endpoint:** `POST https://my.magicportraits.ai/api/gift/offer-link`

- Header `Authorization: Bearer <session token>` from the extension's `useSessionToken().get()`. The token is an HS256 JWT signed with the app's API secret (`SHOPIFY_CLIENT_SECRET`); the server checks the signature, `exp`/`nbf` and that `dest` is the store's domain.
- Body `{ "orderId": "<order legacy id>" }` (from the extension's order confirmation API). An order number on its own is never accepted.
- Answers `200 { url, expiresAt }` only for an order paid within `gift.popup_window_minutes` that unlocks the free gift (`gift.unlock_rule`). Everything else is `401` (bad token), `404`/`410` with `{ "error": "unavailable" }` (no detail), or `429`.
- `gift.popup_enabled` must be on (it starts off).
- "Later, email me the link": the same call with `{ "orderId": "…", "action": "email_later" }`. Hidden until `gift.popup_email_later_enabled` is on (after the Klaviyo offer flow exists); it queues `free_gift_link_requested` for Klaviyo and returns `{ ok: true }`.

**Sheet copy and layout:** `designs/screens/GiftSheet.dc.html`. Events to fire from the extension (PostHog, same project): `gift_popup_shown`, `gift_popup_cta_tapped`, `gift_popup_dismissed`.

```ts
// Sketch for the extension (React, @shopify/ui-extensions-react/checkout)
const token = await sessionToken.get();
const res = await fetch("https://my.magicportraits.ai/api/gift/offer-link", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ orderId }),
});
if (res.ok) {
  const { url } = await res.json(); // show the sheet with "Make my card" → url
}
```
