# Open store: shop without signing in

Drafted 23 Nov 2026 from Gavin's brief, then updated the same day with his answers (Imagen API, saving visitors' data, one theme per product, routes). Screen mockups: the "Open store mockups" design canvas. The questions that blocked the build are answered; the rest are listed at the end. Where this file and `docs/shop.md` disagree about the open store, this file wins; everything else in `docs/shop.md` (product rules, templates, order-line keys) applies unchanged.

## Summary

Anyone can buy from My Magic Portraits without signing in, including people who have never ordered or made a portrait. They land on a store page, pick a product, upload a photo, and see their own picture made in that product's style by Imagen, right on the product. Below it they see the same picture on three other products. They add to cart and pay in Shopify checkout, where they give their email for the first time.

Shopify stays the source of truth: products, variants, prices, categories (collections) and each product's generation settings (metafields). This app saves what each visitor makes: every visitor gets an id, and their photos and pictures are saved against it in our own Supabase (tables `store_visitors`, `store_photos`, `store_generations`; private bucket `store-uploads`). When they buy or sign in, the visitor is linked to their email.

| Brief (23 Nov) | Choice in this spec |
|---|---|
| For people who have never bought, or don't want to sign in | No sign-in needed anywhere. Each visitor gets an id held in a cookie; their photos, pictures and cart are saved against it |
| Save the customer data: a visitor needs an id, and the images are saved against it in a new Supabase container | `store_visitors`, `store_photos`, `store_generations` and the private bucket `store-uploads` in `magic-vault` (Visitors and saved data, below). Linked to the email when they buy or sign in |
| Lives at `/store`, each product at `product/{productID}` | `/store`, and `/store/product/<Shopify product id>` for each product (Routes) |
| A general landing page, like the Bo & Birdie example | Category circles, a collection heading and intro, Filter and Sort, a two-column product grid |
| Shopify is the source of truth for products and categories | Categories are Shopify collections, listed in a Shopify navigation menu; products, prices and variants are read live |
| A standard product page | Gallery, rating, title, price, short bullets, delivery estimate, variant chips, photo upload, Add to cart |
| Generate with the Imagen API, settings per product. Art styles are Imagen themes; each product has one | Each product names its one Imagen theme and its options in `mmp_shop` metafields. The server calls Imagen's API with this app's own key, sending the photo (or photos, when the theme needs more than one) and the pet's name |
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
2. **Product page** (`/store/product/<product id>`). They pick the variant (size etc.), upload a photo, optionally type a name, and tap **Create their picture**.
3. **Creating** (same page). The picture area shows progress steps; the rest of the page stays usable.
4. **Ready** (same page). Their picture is on the product. They can pick another of the results, try another photo, change the variant, and **Add to cart**. Below: shopping info, product details and three more products with their picture.
5. **Cart** (a drawer from the right on every store page). Lines with previews, quantities, Shopify's prices and discounts, **Checkout**.
6. **Shopify checkout**, then Shopify's thank-you page as usual.

They can leave and come back: the visitor cookie brings back their pictures on each product, and their cart. On another device, signing in brings them back (Visitors and sign-in, below).

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

1. **Gallery.** Before a picture: the product's Shopify media, the first being its placeholder (a sample picture on the product). After: the first slot is their picture drawn on the product with the variant's template, with their photo in a small circle in the corner (from their saved photo); the second is their picture on its own; then the product's remaining media, marked "Example".
2. **Rating** (when the review metafields exist), **title**, **price** with compare-at struck through and the discount label (see Prices), "VAT included" where the shop's prices include tax.
3. **Bullets** from `mmp_shop.short_description` (as in the shop), e.g. "Your pet as The Admiral in about a minute".
4. **Delivery estimate**: "Delivery approx. 27 Nov – 30 Nov": today plus the variant's `mmp_shop.lead_days` (e.g. `4-6`, working days) plus `open_store.shipping_days` (e.g. `2-3`), skipping weekends. Hidden when either is missing.
5. **Variant chips**, one group per Shopify option (Size, Colour). A variant can carry a badge from `mmp_shop.badge` (e.g. "Bestseller"). Sold-out variants show but can't be chosen.
6. **Your photo** (required): a tap target that opens the camera roll, with tips from the product's settings ("A clear, front-facing photo works best"). After choosing: the thumbnail, "Photo added" and **Change**. When the product's theme takes more than one photo (two pets, say), one slot per photo, each with its own label (Photos and names, below).
7. **Name** (optional, only when the product's settings define it): label, placeholder and limit from settings, e.g. "Their name (optional, shown on the picture)", 14 characters. One per photo slot. It goes to Imagen with the photo, for themes that print the name.
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
| Photo chosen | The thumbnail under **Your photo**; **Create their picture** turns on once every required photo slot is filled | The browser shrinks it to `open_store.upload_max_px` (default 2048) if bigger. Nothing is sent yet |
| Create their picture | The picture area dims and shows three steps: "Uploading your photo", "Painting {name} as The Admiral", "Putting it on your pillow", around their photo in a spinning ring. The button reads "Creating their picture…" and is disabled. The page below stays usable | `POST /api/store/generations` with the photo(s), the product and the name(s). The server checks each photo (as `docs/shop.md` › Images: type by content, up to 20 MB, at least `open_store.min_photo_px`, default 600, on the short side), the bot check and the limits; creates the visitor row if it's their first action; saves each photo in `store-uploads` as a `store_photos` row (JPEG, location and camera data removed); then calls Imagen |
| Waiting | The steps tick as Imagen's status moves (`pending` → `preprocessing` → `generating` → `done`) | The browser asks `GET /api/store/generations/<id>` every 2 s; the server asks Imagen |
| Ready | The picture fades in on the product; a strip of the results to choose from ("Pick your favourite") when Imagen returned more than one; **Add to cart** | The server copies Imagen's results into `store-uploads` and records them on the `store_generations` row |
| Slow | After `open_store.slow_after_s` (default 90): "Still painting. This one's taking a little longer." | |
| Failed or timed out | "We couldn't make this one. Try a different photo, ideally a clear, front-facing one." with **Try another photo**. A failure doesn't count toward their limit | After `open_store.timeout_s` (default 240), or Imagen's `failed`, `cancelled` or `awaiting_face_selection` (themes for the open store must not ask to pick faces) |
| Limit reached | "You've made {n} pictures today. Come back tomorrow, or add one you've made to your cart." | Per visitor and per IP, below |

Changing the variant redraws the picture at once (same picture, new template and crop); it never calls Imagen again. Changing the name or photo needs a new picture. A visitor's earlier photos are offered again ("Use a photo you've added before") so they don't have to upload twice on the next product.

### Generation settings in Shopify

Each product's generation is set in product metafields, namespace `mmp_shop`, edited in Shopify admin or in Settings › Open store:

| Metafield | Type | Example | Notes |
|---|---|---|---|
| `imagen_theme` | single line text | `the-admiral` | The Imagen theme slug sent as `theme_id`. One per product: the product's art style. Required for a product people make pictures on |
| `generation` | JSON | below | Optional; defaults in brackets |
| `open_store_related` | boolean | `true` | Shown only under "On more gifts", with the visitor's picture, never in the grid |
| `badge` (variant) | single line text | `Bestseller` | Optional chip label |
| `lead_days` (variant) | single line text | `4-6` | Working days to make it |
| `details` | multi-line text | | Optional "Size and materials" |

```json
{
  "photos": [
    { "label": "Add their photo", "name_label": "Their name (optional, shown on the picture)", "name_placeholder": "Teddy" }
  ],
  "name_max": 14,
  "photo_tips": "Best results: one pet, facing the camera, in good light, with the whole head in the picture.",
  "subject": "pet",
  "images_to_show": 4,
  "step_labels": ["Uploading your photo", "Painting {name} as The Admiral", "Putting it on your pillow"]
}
```

`subject` is `pet`, `person` or `any` and only changes the copy. `images_to_show` caps the "Pick your favourite" strip (Imagen decides how many it makes). Settings › Open store checks each value against the theme list from Imagen (`GET /api-themes`) and flags unknown or inactive themes.

#### Photos and names

**How many photos a product needs is set on the Imagen theme, not in Shopify.** The theme already knows what it paints (one pet, two pets, a person and a pet), so Imagen's theme list is the one place that says how many photos it takes and which are required (the field name is in Imagen's API docs). The product page shows that many photo slots. Shopify's `generation.photos` only words them: slot 1 uses the first entry's label and name label, slot 2 the second, and so on; a slot without an entry is "Photo 2", "Photo 3". If Imagen's theme list turns out not to say, `generation.photos` sets the count instead (one entry per photo), and Settings › Open store warns when Shopify and Imagen disagree.

Names go one per photo, when the theme prints names; `name_max` applies to each.

### Imagen API

The server, never the browser, calls Imagen's public API, the same one the main site uses (`/functions/v1/api-generate`, `/api-sessions/<id>`, `/api-themes`):

- **Generate:** `POST /api-generate`, multipart `theme_id` (the slug), the photo (`source_image`, and the extra photos when the theme takes more than one) and the name(s). Exact field names come from Imagen's API docs. Header `X-Client-User-Id: open-store:<visitor id>`. Returns `session_id` and `status`.
- **Status:** `GET /api-sessions/<session_id>`: `status`, `expected_image_count`, `images` (id, url, width, height), `total_cost_usd`.
- **Themes:** `GET /api-themes` (and `?category=`): the theme list, including how many photos each theme takes.
- **Key:** `IMAGEN_API_KEY`, a key Imagen issues for this app only, in Vercel env, Sensitive. Base URL `IMAGEN_API_URL`. Neither reaches the browser.
- **Fixtures:** `DATA_SOURCE=fixtures` returns sample pictures from `public/shop-samples/scenes/` after a short delay, with a two-photo theme and `failed` and slow cases for tests.

## Visitors and saved data

### The visitor id

- On the first store page a visitor opens, the app sets the cookie `mmp_visitor`: a random 32-byte token, httpOnly, Secure, SameSite=Lax, for `open_store.visitor_cookie_days` (default 365).
- The `store_visitors` row is created on their first real action (a photo or an Add to cart), not on a page view, so bots and passers-by leave nothing behind.
- The row's `id` (a uuid) is the **visitor id** used everywhere: storage paths, generations, the cart attribute, Imagen's client user id and PostHog's distinct id. The cookie holds the token, and the table stores only `HMAC(VISITOR_SECRET, token)`, so an id seen in an admin page or an order can't be used to act as that visitor.

### Tables and bucket (new migration in `magic-vault`)

| Table | Columns |
|---|---|
| `store_visitors` | `id uuid pk`, `token_hash text unique`, `email text null` (lower-cased; set when they sign in or buy), `linked_via` (`sign_in` · `order`, null until linked), `shopify_cart_id`, `shopify_checkout_url`, `first_seen_at`, `last_seen_at`, `created_at`, `updated_at` |
| `store_photos` | `id uuid pk`, `visitor_id` → `store_visitors` (cascade), `storage_path`, `width`, `height`, `created_at` |
| `store_generations` | `id uuid pk`, `visitor_id` → `store_visitors` (cascade), `product_id` (Shopify gid), `theme`, `photo_ids uuid[]`, `names text[]` (private: never in analytics or logs), `imagen_session_id`, `status`, `images jsonb` (per result: Imagen image id, width, height, our `storage_path`), `chosen_index`, `cost_usd`, `order_id`, `ordered_at`, `created_at`, `finished_at` |

RLS on all three, deny by default, as every table.

**Bucket `store-uploads`** (private):
- `<visitor id>/photos/<photo id>.jpg` for their photos.
- `<visitor id>/pictures/<generation id>/<n>.png` for our copies of Imagen's results.
- `<visitor id>/previews/<line id>.jpg` for the product previews on cart and order lines.

The pages load them through an app route that checks the cookie (or a signed-in email linked to the visitor, or a super user). Fulfilment gets short-lived signed links.

### Keeping and deleting

- **Bought:** the photos, pictures and previews behind an order are kept, like the shop's new uploads.
- **Not bought:** deleted after `open_store.keep_unbought_days` (default 30) by `/api/cron/store-cleanup`. Visitor rows with no email and nothing left are deleted too.
- **Data-deletion requests** for an email delete its linked visitors, their rows and their files.
- **Imagen's copy:** Imagen keeps its own copy (open question).

### Visitors and sign-in

- **Nobody has to sign in.** The store, product pages, pictures, cart and checkout all work with only the visitor id.
- **Header:** "Sign in" for visitors (in the menu on phones, in the header on desktop); the usual account menu for signed-in customers. Signing in from the store comes back to the same page.
- **Signing in links the visitor to the email.** A visitor not linked yet is linked to the signed-in email. A visitor linked to a different email (a shared device) is left alone, and the app starts a fresh visitor for the person signing in; the other person's pictures stay theirs.
- **Buying links it too.** On `orders/paid` with `_open_store_visitor`, the order's email is set on that visitor if it has none, and a `vault_members` row is created if needed (`created_via` = `store_order`, a new value).
- **Another device:** once signed in, the store shows the pictures of every visitor linked to their email (their picture on each product they've made one for, and their photos to reuse) and the newest open cart.
- **Checkout:** for a signed-in customer the cart carries their email (`buyerIdentity.email`), so Shopify fills it in.
- **The signed-in screens** (Home, My portraits, Gifts and Products, cards) don't change. Whether bought store pictures also show in My portraits is an open question below.

### Drawing their picture on products

The same template module as the shop (`lib/shop/preview.ts`): the chosen image is cropped to the variant's print area by the product rules and warped into the template, in the browser, so changing the size or the picked result redraws at once. The server draws the same for the cart and the order line (`_shop_preview_url`, stored in `store-uploads` under `previews/`, signed links).

## On more gifts

Three products drawn with the visitor's picture, under the product details:

1. Products set in the current product's `mmp_shop.related` (a list of product references), if any, in that order.
2. Then the other open-store products in the same collection, in collection order, skipping the current one.
3. Only products whose rules pass for this image (`docs/shop.md` › Product rules); the first three that pass.

Each card shows the product drawn with their picture, its title and "From" price, and **See it**. Tapping it opens that product's page with the same picture already on it (no new generation, the session carries over), where they choose the variant and add to cart. Before a picture exists, the section shows the same three products with their placeholders and the title "Also made from one photo".

## Cart and checkout

- **One cart per visitor**, held in Shopify: the server creates it with the Storefront API (`cartCreate`, no buyer unless they're signed in) on the first Add to cart and keeps its id on the visitor row (`store_visitors.shopify_cart_id`). If Shopify has expired it, the next Add to cart starts a new one.
- **The drawer** shows each line's preview, title, variant, quantity (1 to `shop.cart_line_max_qty`), Shopify's line price and discount, **Remove**, the subtotal and "Shipping and tax at checkout", and **Checkout**, which goes to the cart's `checkoutUrl`.
- **Order lines** carry the keys in `docs/shop.md` › What goes on the order, with `_image_kind` = `generated`, `_shop_image_id` and `_shop_session_id` (the Imagen ids), `_image_url` (Imagen's public URL) and `_shop_theme` (the theme slug). The cart carries `_source` = `open_store` and `_open_store_visitor` (the visitor id). Never today's portrait keys.
- **Prices:** Shopify's own figures from the cart. Product cards and the product page show the compare-at price and, when `open_store.discount_code` is set, the price after it with `open_store.discount_label`. The code goes on every open-store cart. With no code, an automatic Shopify discount still applies at checkout.
- **Paid:** the existing `orders/paid` webhook matches `_source` = `open_store`, marks the generations ordered and links the visitor to the order's email (Visitors and sign-in).

## Limits, security and privacy

- **Visitor id:** as in Visitors and saved data. Every generation, picture, photo and cart call checks that the cookie (or the signed-in email linked to the visitor) owns what it touches.
- **Bot check** on `POST /api/store/generations` (Vercel BotID). Bots get a polite refusal and nothing reaches Imagen.
- **Limits:** `open_store.generations_per_visitor_per_day` (default 5), `open_store.generations_per_ip_per_day` (default 15), and a daily total across everyone, `open_store.generations_daily_cap` (default 1,500), after which the page says the studio is busy and shows placeholders. Settings › Open store shows today's count and Imagen's cost.
- **Uploads:** checked by content; HEIC converted on the server (or refused with "save it as JPEG" if conversion fails); saved as JPEG in `store-uploads` with location and camera data removed.
- **Consent** under the upload: "Use a photo you have the right to use. We use it only to make your picture, and delete it after 30 days unless you order. Privacy policy". Photos of children are likely, so the copy says what happens to the photo; the day count comes from `open_store.keep_unbought_days`.
- **What Imagen keeps:** today Imagen stores uploads under `user-uploads/` and results in the public `images` bucket, permanently. Our clean-up deletes our copies; Imagen's need a delete call or retention rule on its side (open question). Until then, Settings shows the number of unpaid open-store sessions older than `open_store.keep_unbought_days`.
- **No personal data in tracking:** no photo, picture URL or name in PostHog, Klaviyo or logs; only the product, theme, status and our ids. Session replay masks the picture area and the upload.
- **Not indexed while hidden;** when on, product pages carry the product's SEO title and description and an Open Graph image of the placeholder (never a visitor's picture).

## Settings › Open store

Switches, the menu handle, the home collection, the discount code and label, the reassurance rows, the limits, `shipping_days`, `upload_max_px`, `min_photo_px`, `slow_after_s`, `timeout_s`, `visitor_cookie_days`, `keep_unbought_days`; a product table (theme, photos the theme takes, related products, status and why hidden); today's visitors, generations, failures, median time and cost from `store_generations`, and the storage `store-uploads` uses.

## Tracking

New events (`docs/analytics.md`). PostHog's distinct id is the visitor id; when the visitor is linked to an email, PostHog merges the two the way it does for signed-in customers. Events go to PostHog only until the visitor has an email; the paid order goes to `activity_log` under the order's email.

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
| `/store/product/<product id>` (`?variant=<variant id>`) | Product page, with its creating and ready states. The ids are Shopify's numeric ids |
| `POST /api/store/generations`, `GET /api/store/generations/<id>` | Create a picture, ask how it's going |
| `GET /api/store/files/<photo or picture id>` | A visitor's photo, picture or preview, after the ownership check |
| `POST /api/store/cart/lines`, `PATCH`/`DELETE /api/store/cart/lines/<id>`, `GET /api/store/cart` | The guest cart |
| `/api/cron/store-cleanup` | Daily: deletes what wasn't bought after `keep_unbought_days` |
| `/settings/open-store` | Settings › Open store |

Product pages sit under `/store/` rather than at `/product/<id>` so that one switch hides the whole store, and so they don't sit next to the signed-in shop's `/products`.

## Changes needed in `CLAUDE.md` (to approve)

1. **Imagen:** "Never write to Imagen" becomes "Never write to Imagen's database; the open store creates sessions only through Imagen's public API with its own key".
2. **Shop carts:** the fourth allowed write adds "or an anonymous visitor's cart, held by a cookie".
3. **Security:** "Every customer action re-checks that the signed-in email owns the thing" gains "or, in the open store, that the visitor cookie owns it".
4. **Data:** the exceptions to "never copy orders, products or portraits into our database" gain "and the open store's visitors, photos and pictures (`docs/open-store.md`)".

## Build parts

| Part | What | Done when |
|---|---|---|
| Open store 1: catalogue | Storefront API reads (menu, collections, products, variants, metafields, policies) behind `lib/open-store/sources/` with fixtures; the open-store check; Settings › Open store with switches and the product table | A super user sees the menu's collections and why each product is or isn't in the store |
| Open store 2: store and product pages | Store page, product page before a picture (gallery, variants, delivery estimate, details, related with placeholders), cart icon | e2e at 390 × 844 and 1280 × 800, axe clean |
| Open store 3: pictures | `lib/sources/imagen-api.ts` (live and fixtures), the visitor cookie and `store_visitors`, `store_photos`, `store_generations`, the `store-uploads` bucket and its file route, upload checks, bot check, limits, the creating and ready states, several photo slots, drawing on the template, result strip, related products with the picture, restore on return, the clean-up cron | Fixtures cover ready, slow, failed, timed out, limited and a two-photo theme; golden images of the pillow with a square and a 3:4 result; another visitor's cookie gets 404 on every file |
| Open store 4: cart, checkout and sign-in | Guest Shopify cart on the visitor row, drawer, order-line keys, discount code, `orders/paid` linking the visitor, linking on sign-in, pictures on another device | A fixture checkout produces exactly the order-line keys; signing in on a second browser shows the first browser's pictures |
| Open store 5: tracking and docs | Events, the PostHog funnel, `docs/analytics.md`, `docs/schema.md`, `docs/data.md`, the `CLAUDE.md` changes above | Docs match the build |

Needed from people: the Imagen API key for this app and Imagen's API docs; the Shopify navigation menu and collections; the first products with `imagen_theme`, templates and rules; the Storefront token's sales channel publishing them.

## Open questions

Answered 23 Nov:

- [x] **Imagen API.** Imagen will give this app its own key. The API takes the pet's name, and more than one photo when a theme needs it. Still to read in its docs: the field names, where a theme says how many photos it takes, average time and cost, and whether it moderates uploads. None of this blocks the build, which runs on fixtures until the key arrives.
- [x] **Saving visitors' data.** Each visitor gets an id; photos and pictures are saved against it in `magic-vault` (Visitors and saved data).
- [x] **One theme per product.** Art styles are Imagen themes, and each product has one.
- [x] **Where it lives.** `/store`, with each product at `/store/product/<product id>`.

Still open (none blocks the build):

- [ ] **Imagen's copy of guest photos.** Imagen keeps uploads and results in public, permanent storage. Can our clean-up ask Imagen to delete a session that wasn't bought?
- [ ] **Links in.** Should the main site's home and the Magic Store emails (Store 1–3 link to `/products`, which needs sign-in) point to `/store`?
- [ ] **Email me my picture.** Offer visitors who don't buy a way to get their picture by email? It would capture emails before checkout but needs consent wording and a Klaviyo flow.
- [ ] **Discount.** A code on every open-store cart (`open_store.discount_code`), or Shopify automatic discounts only?
- [ ] **Reviews.** Which app writes the `reviews.rating` metafields? Without one, no stars show.
- [ ] **Signed-in customers.** Should the product page also offer the photos behind their existing portraits, so they don't upload again?
- [ ] **My portraits after buying.** Show bought store pictures in My portraits for the linked email? Recommended: yes, as their own group, read from `store_generations` alongside Imagen.
- [ ] **Free card offer.** Should an open-store order unlock the free greeting card like other paid orders (`gift.unlock_rule`)?
