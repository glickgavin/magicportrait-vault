# Open store: shop without signing in

Drafted 23 Nov 2026 from Gavin's brief. Screen mockups: the "Open store" design canvas. This is a proposal: the open questions at the end need answers before the build starts. Where this file and `docs/shop.md` disagree about the open store, this file wins; everything else in `docs/shop.md` (product rules, templates, order-line keys) applies unchanged.

## Summary

Anyone can buy from My Magic Portraits without signing in, including people who have never ordered or made a portrait. They land on a store page, pick a product, upload a photo, and see their own picture made in that product's style by Imagen, right on the product. Below it they see the same picture on three other products. They add to cart and pay in Shopify checkout, where they give their email for the first time.

Shopify stays the source of truth: products, variants, prices, categories (collections) and each product's generation settings (metafields). This app stores only the generations, keyed to an anonymous visitor.

| Brief (23 Nov) | Choice in this spec |
|---|---|
| For people who have never bought, or don't want to sign in | No sign-in anywhere in the flow. An anonymous visitor cookie holds their pictures and cart |
| A general landing page, like the Bo & Birdie example | Category circles, a collection heading and intro, Filter and Sort, a two-column product grid |
| Shopify is the source of truth for products and categories | Categories are Shopify collections, listed in a Shopify navigation menu; products, prices and variants are read live |
| A standard product page | Gallery, rating, title, price, short bullets, delivery estimate, variant chips, photo upload, Add to cart |
| Generate with the Imagen API, settings per product | Each product names its Imagen theme and options in `mmp_shop` metafields; the server calls Imagen's API |
| A spinner while it generates | The picture area shows progress steps over the placeholder, about a minute |
| The result replaces the placeholder | Their picture is drawn onto the product with the product's template and becomes the first gallery image |
| Shopping info, product info, and 3 more products with the picture | Delivery and returns, product details, and "Teddy on more gifts": three products drawn with their picture |

Customer-facing name: **Magic Store**, as in the Black Friday "Introducing the Magic Store" emails. In code and settings it is the **open store** (`open_store.*`), so it isn't confused with the signed-in shop (`shop.*`) or the Shopify **Store** collection.

## Keeping today's app unchanged

The same rules as the signed-in shop (`docs/shop.md` › Keeping today's app unchanged):

- **Two switches, both off.** `open_store.enabled` shows it to everyone; `open_store.super_user_preview` shows it to super users only. While hidden, `/store/*` and `/api/store/*` return 404. Both are launch switches.
- **Additive only.** New routes, new tables, new `open_store.*` settings, new events. No existing screen changes.
- **Its own code.** `lib/open-store/`, `components/open-store/`, `app/(store)/store/`. The Imagen API sits behind `lib/sources/imagen-api.ts` with a fixtures implementation, like every other source.
- **The main site is untouched.** magicportraits.ai and the Shopify theme don't change.

## The customer flow

1. **Store page** (`/store`, `/store/c/<collection>`). Category circles, collection heading and intro, Filter and Sort, product grid. Tapping a product opens its page.
2. **Product page** (`/store/p/<handle>`). They pick the variant (size etc.), upload a photo, optionally type a name, and tap **Create their picture**.
3. **Creating** (same page). The picture area shows progress steps; the rest of the page stays usable.
4. **Ready** (same page). Their picture is on the product. They can pick another of the results, try another photo, change the variant, and **Add to cart**. Below: shopping info, product details and three more products with their picture.
5. **Cart** (a drawer from the right on every store page). Lines with previews, quantities, Shopify's prices and discounts, **Checkout**.
6. **Shopify checkout**, then Shopify's thank-you page as usual.

They can leave and come back: the visitor cookie brings back their last picture on each product, and their cart, for `open_store.keep_days` (default 30).

## Store page

| Part | Source |
|---|---|
| Promotion bar | The existing `site.promo_bar*` settings (`docs/shop.md` › Promotion bar), audience "everyone" |
| Header | The app's header with the cart icon (count, shown when the cart has lines). No sign-in needed; "Sign in" stays in the menu |
| Category circles | Shopify navigation menu `open_store.menu_handle` (default `magic-store`): each item links to a collection. Circle image = the collection's image; label = the menu item's title; order = the menu's order. Edited in Shopify admin › Online Store › Navigation |
| Heading and intro | The collection's title and description |
| Products | The collection's products in its sort order, 24 per page, "Show more" for the next 24 |
| Filter | Chips for the product types in the collection (Shopify's Product type field) |
| Sort | Featured (collection order), Price low to high, Price high to low, Newest |
| Product card | First product image, title, "From" the cheapest available variant's price, the compare-at price struck through when higher, and stars with a count only when the product has the standard `reviews.rating` and `reviews.rating_count` metafields |

`/store` shows the collection in `open_store.home_collection` (default `magic-store-bestsellers`). Only products that pass the open-store check appear (below); a collection with none shows "Nothing here yet" and the circles.

**A product is in the open store** when it's active and published to the Storefront token's sales channel, has an available variant, every variant has the `mmp_shop` rules (`docs/shop.md` › Product rules), it has a template (`mmp_shop.template`), and it has an Imagen theme (`mmp_shop.imagen_theme`) or is marked `mmp_shop.open_store_related = true` (shown only as a related product). Settings › Open store lists every product in the menu's collections and says why any is hidden.

## Product page

Top to bottom, mobile first:

1. **Gallery.** Before a picture: the product's Shopify media, the first being its placeholder (a sample picture on the product). After: the first slot is their picture drawn on the product with the variant's template, with their photo in a small circle in the corner (while the photo is still in their browser; it isn't stored); the second is their picture on its own; then the product's remaining media, marked "Example".
2. **Rating** (when the review metafields exist), **title**, **price** with compare-at struck through and the discount label (see Prices), "VAT included" where the shop's prices include tax.
3. **Bullets** from `mmp_shop.short_description` (as in the shop), e.g. "Your pet as The Admiral in about a minute".
4. **Delivery estimate**: "Delivery approx. 27 Nov – 30 Nov": today plus the variant's `mmp_shop.lead_days` (e.g. `4-6`, working days) plus `open_store.shipping_days` (e.g. `2-3`), skipping weekends. Hidden when either is missing.
5. **Variant chips**, one group per Shopify option (Size, Colour). A variant can carry a badge from `mmp_shop.badge` (e.g. "Bestseller"). Sold-out variants show but can't be chosen.
6. **Your photo** (required): a tap target that opens the camera roll, with tips from the product's settings ("A clear, front-facing photo works best"). After choosing: the thumbnail, "Photo added" and **Change**.
7. **Name** (optional, only when the product's settings define it): label, placeholder and limit from settings, e.g. "Pet's name (optional)", 15 characters. It goes to Imagen with the photo, for themes that print the name.
8. **Create their picture** (gradient button, "Free to try. Takes about a minute." under it) until there's a picture; while creating it turns grey with a small spinner. When ready, a pink "Teddy is ready" note with **Try another photo** sits above the chips, and the button becomes a quantity stepper plus **Add to cart · $24.00** (gradient), with the accepted payment methods under it.
9. **Shopping info**: three short rows from settings (`open_store.reassurance`, e.g. "Free shipping until 1 Dec" with the delivery estimate, "Printed to order, just for you", "Secure checkout with Shopify"), each with an icon, on a cream panel.
10. **Product details**: accordions. "Product details" (the Shopify description, then `mmp_shop.details` when set), "How it works" (three steps from settings), "Shipping and returns" (Shopify's shipping and refund policies).
11. **On more gifts**: "Teddy on more gifts" (or "Your picture on more gifts" without a name): three products drawn with their picture (below). Before a picture, the same slot is "Also made from one photo" with the products' sample pictures.
12. **Reviews**: the reviews app's block, once one is chosen (open question).
13. The app's footer.

Mockups: the "Open store mockups" design canvas (store page, product page before a photo, creating, ready, cart drawer; store and product pages on desktop).

### Creating the picture

| Step | What the visitor sees | What happens |
|---|---|---|
| Photo chosen | The thumbnail under **Your photo**; **Create my preview** turns on | The browser shrinks it to `open_store.upload_max_px` (default 2048) if bigger. Nothing is sent yet |
| Create my preview | The picture area dims and shows three steps: "Uploading your photo", "Painting {name} as The Admiral", "Putting it on your pillow". The button reads "Creating… about a minute" and is disabled. The page below stays usable | `POST /api/store/generations` with the photo, the product and the name. The server checks the photo (as `docs/shop.md` › Images: type by content, up to 20 MB, at least `open_store.min_photo_px`, default 600, on the short side, location data removed), the bot check and the limits, then calls Imagen |
| Waiting | The steps tick as Imagen's status moves (`pending` → `preprocessing` → `generating` → `done`) | The browser asks `GET /api/store/generations/<id>` every 2 s; the server asks Imagen |
| Ready | The picture fades in on the product; a strip of the results to choose from ("Pick your favourite") when Imagen returned more than one; **Add to cart** | The server keeps the session id and image ids against the visitor |
| Slow | After `open_store.slow_after_s` (default 90): "Still painting. This one's taking a little longer." | |
| Failed or timed out | "We couldn't make this one. Try a different photo, ideally a clear, front-facing one." with **Try another photo**. A failure doesn't count toward their limit | After `open_store.timeout_s` (default 240), or Imagen's `failed`, `cancelled` or `awaiting_face_selection` (themes for the open store must not ask to pick faces) |
| Limit reached | "You've made {n} pictures today. Come back tomorrow, or add one you've made to your cart." | Per visitor and per IP, below |

Changing the variant redraws the picture at once (same picture, new template and crop); it never calls Imagen again. Changing the name or photo needs a new picture.

### Generation settings in Shopify

Each product's generation is set in product metafields, namespace `mmp_shop`, edited in Shopify admin or in Settings › Open store:

| Metafield | Type | Example | Notes |
|---|---|---|---|
| `imagen_theme` | single line text | `the-admiral` | The Imagen theme slug sent as `theme_id`. Required for a product people make pictures on |
| `generation` | JSON | below | Optional; defaults in brackets |
| `open_store_related` | boolean | `true` | Shown only under "On more gifts", with the visitor's picture, never in the grid |
| `badge` (variant) | single line text | `Bestseller` | Optional chip label |
| `lead_days` (variant) | single line text | `4-6` | Working days to make it |
| `details` | multi-line text | | Optional "Size and materials" |

```json
{
  "name_field": { "label": "Pet's name (optional)", "placeholder": "Teddy", "max": 15 },
  "photo_tips": "A clear, front-facing photo works best",
  "subject": "pet",
  "images_to_show": 4,
  "step_labels": ["Uploading your photo", "Painting {name} as The Admiral", "Putting it on your pillow"]
}
```

`subject` is `pet`, `person` or `any` and only changes the copy. `images_to_show` caps the "Pick your favourite" strip (Imagen decides how many it makes). Settings › Open store checks each value against the theme list from Imagen (`GET /api-themes`) and flags unknown or inactive themes.

### Imagen API

The server, never the browser, calls Imagen's public API, the same one the main site uses (`/functions/v1/api-generate`, `/api-sessions/<id>`, `/api-themes`):

- **Generate:** `POST /api-generate`, multipart `theme_id` (the slug) and `source_image`, plus the name if the API accepts it (open question). Header `X-Client-User-Id: open-store:<visitor id hash>`. Returns `session_id` and `status`.
- **Status:** `GET /api-sessions/<session_id>`: `status`, `expected_image_count`, `images` (id, url, width, height), `total_cost_usd`.
- **Key:** `IMAGEN_API_KEY`, a key for this app only (its own Imagen app id), in Vercel env, Sensitive. Base URL `IMAGEN_API_URL`. Neither reaches the browser.
- **Fixtures:** `DATA_SOURCE=fixtures` returns sample pictures from `public/shop-samples/scenes/` after a short delay, with `failed` and slow cases for tests.

We keep one row per generation in `open_store_generations`: id, visitor id hash, product handle, theme, Imagen session id, status, image ids and sizes, chosen image id, cost, created and finished times, and the Shopify order id once paid. No photo, no name, no email. The photo goes straight to Imagen and isn't stored here.

### Drawing their picture on products

The same template module as the shop (`lib/shop/preview.ts`): the chosen image is cropped to the variant's print area by the product rules and warped into the template, in the browser, so changing the size or the picked result redraws at once. The server draws the same for the cart and the order line (`_shop_preview_url`, stored in `open-store-previews`, private, signed links).

## On more gifts

Three products drawn with the visitor's picture, under the product details:

1. Products set in the current product's `mmp_shop.related` (a list of product references), if any, in that order.
2. Then the other open-store products in the same collection, in collection order, skipping the current one.
3. Only products whose rules pass for this image (`docs/shop.md` › Product rules); the first three that pass.

Each card shows the product drawn with their picture, its title and "From" price, and **View**. Tapping it opens that product's page with the same picture already on it (no new generation, the session carries over), where they choose the variant and add to cart. Before a picture exists, the section shows the same three products with their placeholders and the title "You might also like".

## Cart and checkout

- **One cart per visitor**, held only in Shopify: the server creates it with the Storefront API (`cartCreate`, no buyer) on the first Add to cart and keeps its id in an httpOnly cookie, `mmp_store_cart`, for `open_store.keep_days`. If Shopify has expired it, the next Add to cart starts a new one.
- **The drawer** shows each line's preview, title, variant, quantity (1 to `shop.cart_line_max_qty`), Shopify's line price and discount, **Remove**, the subtotal and "Shipping and tax at checkout", and **Checkout**, which goes to the cart's `checkoutUrl`.
- **Order lines** carry the keys in `docs/shop.md` › What goes on the order, with `_image_kind` = `generated`, `_shop_image_id` and `_shop_session_id` (the Imagen ids), `_image_url` (Imagen's public URL) and `_shop_theme` (the theme slug). The cart carries `_source` = `open_store` and `_open_store_visitor` (the visitor id hash). Never today's portrait keys.
- **Prices:** Shopify's own figures from the cart. Product cards and the product page show the compare-at price and, when `open_store.discount_code` is set, the price after it with `open_store.discount_label`. The code goes on every open-store cart. With no code, an automatic Shopify discount still applies at checkout.
- **Paid:** the existing `orders/paid` webhook matches `_source` = `open_store`, marks the generations ordered and saves the order's email against them, so the pictures appear in My portraits when that email signs in (open question: how My portraits reads them).

## Limits, security and privacy

- **Visitor id:** a random 32-byte value in an httpOnly, SameSite=Lax cookie, `mmp_visitor`, for `open_store.keep_days`. Stored only hashed (`HMAC(VISITOR_SECRET, id)`). Every generation and cart call checks the cookie owns what it touches.
- **Bot check** on `POST /api/store/generations` (Vercel BotID). Bots get a polite refusal and nothing reaches Imagen.
- **Limits:** `open_store.generations_per_visitor_per_day` (default 5), `open_store.generations_per_ip_per_day` (default 15), and a daily total across everyone, `open_store.generations_daily_cap` (default 1,500), after which the page says the studio is busy and shows placeholders. Settings › Open store shows today's count and Imagen's cost.
- **Uploads:** checked by content; HEIC refused with "save it as JPEG"; nothing kept on our side.
- **Consent** under the upload: "Use a photo you have the right to use. We only use it to make your picture. Privacy policy". Photos of children are likely, so the copy says what happens to the photo.
- **What Imagen keeps:** today Imagen stores uploads under `user-uploads/` and results in the public `images` bucket, permanently. For visitors who don't buy, that needs a retention rule on Imagen's side (open question). Until then, Settings shows the number of unpaid open-store sessions older than `open_store.keep_days`.
- **No personal data in tracking:** no photo, picture URL or name in PostHog, Klaviyo or logs; only the product, theme, status and our ids. Session replay masks the picture area and the upload.
- **Not indexed while hidden;** when on, product pages carry the product's SEO title and description and an Open Graph image of the placeholder (never a visitor's picture).

## Settings › Open store

Switches, the menu handle, the home collection, the discount code and label, the reassurance rows, the limits, `shipping_days`, `upload_max_px`, `min_photo_px`, `slow_after_s`, `timeout_s`, `keep_days`; a product table (theme, related products, status and why hidden); today's generations, failures, median time and cost from `open_store_generations`.

## Tracking

New events (`docs/analytics.md`). PostHog only until checkout, since there's no email; the paid order goes to `activity_log` under the order's email.

| Event | When | Props |
|---|---|---|
| `page_view_store` | A store page shown | `collection`, `products_shown` |
| `store_category_tapped`, `store_sort_changed`, `store_filter_changed` | Browsing | `collection`, `value` |
| `page_view_store_product` | A product page shown | `product_handle`, `has_picture` |
| `store_variant_selected` | A chip chosen | `product_handle`, `option`, `value` |
| `store_photo_chosen` | Photo accepted or refused in the browser | `ok`, `reason` |
| `store_generation_started` (server) | Imagen called | `product_handle`, `theme`, `has_name` |
| `store_generation_ready` (server) | Imagen done | `product_handle`, `theme`, `seconds`, `images`, `cost_usd` |
| `store_generation_failed` (server) | Failed, timed out, limited or refused | `product_handle`, `reason` |
| `store_result_picked` | Another result chosen | `product_handle`, `index` |
| `store_related_tapped` | A product under "On more gifts" | `from_handle`, `to_handle`, `position` |
| `store_added_to_cart` | Add to cart | `product_handle`, `variant_id`, `price` |
| `store_cart_opened`, `store_checkout_started` | Drawer opened, Checkout | `lines`, `subtotal` |
| `store_order_paid` (server) | Paid order with `_source` = `open_store` | `order_id`, `lines`, `revenue` |

PostHog dashboard: a funnel Store page → Product page → Photo chosen → Picture ready → Added to cart → Checkout → Paid, split by product and theme.

## Routes

| Address | Screen |
|---|---|
| `/store`, `/store/c/<collection handle>` (`?type=`, `?sort=`) | Store page |
| `/store/p/<product handle>` (`?variant=`) | Product page, with its creating and ready states |
| `POST /api/store/generations`, `GET /api/store/generations/<id>` | Create a picture, ask how it's going |
| `POST /api/store/cart/lines`, `PATCH`/`DELETE /api/store/cart/lines/<id>`, `GET /api/store/cart` | The guest cart |
| `/settings/open-store` | Settings › Open store |

## Changes needed in `CLAUDE.md` (to approve)

1. **Imagen:** "Never write to Imagen" becomes "Never write to Imagen's database; the open store creates sessions only through Imagen's public API with its own key".
2. **Shop carts:** the fourth allowed write adds "or an anonymous visitor's cart, held by a cookie".
3. **Security:** "Every customer action re-checks that the signed-in email owns the thing" gains "or, in the open store, that the visitor cookie owns it".

## Build parts

| Part | What | Done when |
|---|---|---|
| Open store 1: catalogue | Storefront API reads (menu, collections, products, variants, metafields, policies) behind `lib/open-store/sources/` with fixtures; the open-store check; Settings › Open store with switches and the product table | A super user sees the menu's collections and why each product is or isn't in the store |
| Open store 2: store and product pages | Store page, product page before a picture (gallery, variants, delivery estimate, details, related with placeholders), cart icon | e2e at 390 × 844 and 1280 × 800, axe clean |
| Open store 3: pictures | `lib/sources/imagen-api.ts` (live and fixtures), visitor cookie, upload checks, bot check, limits, `open_store_generations`, the creating and ready states, drawing on the template, result strip, related products with the picture, restore on return | Fixtures cover ready, slow, failed, timed out and limited; golden images of the pillow with a square and a 3:4 result |
| Open store 4: cart and checkout | Guest Shopify cart, drawer, order-line keys, discount code, `orders/paid` match | A fixture checkout produces exactly the order-line keys |
| Open store 5: tracking and docs | Events, the PostHog funnel, `docs/analytics.md`, `docs/schema.md`, `docs/data.md`, the `CLAUDE.md` changes above | Docs match the build |

Needed from people: an Imagen API key for this app; confirmation of the Imagen API points below; the Shopify navigation menu and collections; the first products with `imagen_theme`, templates and rules; the Storefront token's sales channel publishing them.

## Open questions

The first four need answers before the build starts.

- [ ] **Imagen API.** Can we have our own app and key? Does `api-generate` accept the name (the session has a `name` column), the number of images and the shape? How long does a session take on average, and what does it cost? Does it moderate uploads?
- [ ] **Guest photos in Imagen.** Uploads and results land in public, permanent storage. Can Imagen delete or hide open-store sessions that weren't bought after N days?
- [ ] **One theme per product?** This spec assumes each Shopify product is one product in one style (e.g. "Magic Pillow · The Admiral"), like Bo & Birdie's "Dino blanket". The other way is one product with a Style option. Which?
- [ ] **Where it lives.** `my.magicportraits.ai/store`, or should the main site's home and the Magic Store emails (Store 1–3 link to `/products`, which needs sign-in) point here?
- [ ] **Discount.** A code on every open-store cart (`open_store.discount_code`), or Shopify automatic discounts only?
- [ ] **Reviews.** Which app writes the `reviews.rating` metafields? Without one, no stars show.
- [ ] **Signed-in customers.** Should the product page also offer "Use one of my portraits" when someone is signed in?
- [ ] **My portraits after buying.** Show open-store pictures in My portraits for the order's email (needs our generations table read alongside Imagen)?
- [ ] **Free card offer.** Should an open-store order unlock the free greeting card like other paid orders (`gift.unlock_rule`)?
