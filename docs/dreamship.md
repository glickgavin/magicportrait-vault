# Dreamship

Dreamship is a new printer (24 Nov). Products are designed in Dreamship's designer and published to Shopify by Dreamship's Shopify app, which also stocks them at Shopify's **Dreamship** fulfilment location. Status: Part A and Part B below are **approved, not built** (24 Nov). Gavin chose B1 (swap the artwork on Dreamship's imported order), approved allowed write 7 (now in `CLAUDE.md`), and asked for a 2:3 2K version of Royal Flush for the poster. Later on 24 Nov he added the app's Dreamship API key, asked that printers get their own Settings page (Part C), and decided that **the app doesn't control order status**: whether an order waits as a draft or goes to print is set in Shopify and Dreamship (Dreamship's own auto-submit setting). The app only puts the customer's picture on the order and never submits it.

**Build status (24 Nov):** Parts A, B and C are built (`feat(dreamship-1…3)`, BUILD_LOG › Dreamship) against Dreamship fixtures that use this account's real field names. The REST paths and the two write bodies are still to confirm against the schema (BUILD_LOG › Blocked), so until then keep the manual step below (Until Part B exists) and the Flush poster off the Storefront channel.

## The two problems this solves

1. **Typing Dreamship's numbers by hand.** Each size's print rules (`docs/shop.md` › Product rules) come from Dreamship: the item variant, the print area in pixels, the print area key, the making time. Today they're copied by hand, and they go stale when the product changes in Dreamship. Cost and margin aren't visible anywhere in the app.
2. **The wrong picture gets printed.** Dreamship's Shopify app imports every paid order for its products (shop setting "Auto Import Orders with Dreamship Products" is on) and auto-submits it (order-import orders auto-submit). It prints the Dreamship product's own artwork. For a Magic Store order, that's the sample in the listing photos, not the visitor's picture. The visitor's picture is only on the order line (`_image_url`, `_shop_*`, `docs/shop.md` › What goes on the order), and Dreamship's app ignores those.

## Live today (24 Nov)

- `dreamship` is an allowed maker: in `lib/shop/fields.ts`, the rules editor, and the choices on Shopify's `mmp_shop.maker` definition.
- **Framed Dog Poster "Flush"** (Shopify 8916063289540, Dreamship product 9972256, catalog item 958 Framed Poster, black frame). It's in the Magic Store and Magic Store · Wall art collections, with every field filled in. It's **not on the Storefront channel** (Headless 03), so it stays hidden until fulfilment is settled.

| Size | Shopify variant | Dreamship product variant (= Shopify SKU) | Item variant (`maker_sku`) | Print area | `print_px` | Cost | Price |
|---|---|---|---|---|---|---|---|
| 8x10 | 47352410734788 | 45378125 | 17383 | `8x10` | 1800x2400 | $22.99 | $59.99 |
| 12x16 | 47352410767556 | 45378127 | 17398 | `12x16` | 3000x4200 | $32.19 | $69.99 |
| 16x24 | 47352410800324 | 45378126 | 17418 | `16x24` | 4200x6600 | $64.79 | $89.99 |
| 24x36 | 47352410833092 | 45378124 | 17428 | `24x36` | 6600x10200 | $135.69 | $129.99 |

- **Every size:** `extra` = `{"item_id":958,"print_area":"<key>","product_variant_id":<Dreamship product variant>}`, `adjustable` false, `lead_days` `1-3` (Dreamship's production days for item 958).
- **16x24 and 24x36:** `max_crop_pct` is 40. Royal Flush paints 1024 × 1024 squares, and these sizes cut about 36% of a square (the default limit of 30 would hide them).
- **Product fields:** `imagen_theme` `royal-flush`, `short_description`, `details`, and `template`.
  - **Template:** the first Dreamship mockup (the 8x10, straight on, 2048 × 2048) as the background, with the zone on the art inside the frame. Measured from the photo's pixels: inner frame x 544–1514, y 418–1627. Blend is normal with no overlay, so the picture covers the sample art.
- **Fleece Blanket** (Shopify 8914933874884, Dreamship product 9967304, catalog item 18, also the Flush art). Print rules and text filled in on 24 Nov:
  - 30x40: item variant 746, print area 5100x6600, product variant 45370843.
  - 50x60: item variant 747, print area 8100x9600, product variant 45370844.
  - 60x80: item variant 748, print area 9600x12600, product variant 45370842.
  - `extra` with `item_id` 18, `lead_days` 1-3, theme `royal-flush` (set by Gavin).
  - **No template yet**, so the Magic Store hides it, although it's on the Storefront channel. Adding a template puts it on sale: wait for Part B, or take it off the channel first.
  - Dreamship's minimum for blankets is 150 dpi, with 600 px of safe margin and 300 px of bleed per side.
  - Cost $14.09 / $29.39 / $38.59 against $59.99 / $79.99 / $99.99.
- **Museum Quality "Mona Lisa" Poster** (Shopify 8916356464836, Dreamship product 9974634, catalog item 287 Standard Poster, theme `mona-lisa`). Print rules and text filled in on 24 Nov:
  - 8x10: item variant 12915, print area 2400x3000, product variant 45380612, cost $2.89, price $29.99.
  - 12x18: item variant 4324, print area 3600x5400, product variant 45380613, cost $6.69, price $39.99.
  - 16x24: item variant 4329, print area 4800x7200, product variant 45380610, cost $7.99, price $45.99.
  - 20x30: item variant 12917, print area 6000x9000, product variant 45380611, cost $6.29, price $69.99.
  - `extra` with `item_id` 287, `lead_days` 1-3.
  - `max_crop_pct` 40 on the three 2:3 sizes, because Mona Lisa paints 1024 × 1024 squares and those sizes cut a third.
  - Minimum 250 dpi. No template yet, and not on the Storefront channel, so it's hidden.
- **Dreamship's print rules:** every area is printed at 300 dpi with a minimum of 250 dpi. The safe area is about 2% in from each edge, and the art must run to the edges (`get_print_areas`, item 958).

## Part A: Link and sync (reads Dreamship; writes only `mmp_shop`)

- **Link.** New product metafield `mmp_shop.dreamship_product_id` (number_integer): the Dreamship product the Shopify product was published from.
  - Settings › Shop › a product gets a **Dreamship** card where a super user pastes the id or the designer link.
  - The card finds the id when it isn't linked: the Dreamship product listed on this Shopify product (`shop_products[].marketplace_id` in Dreamship's product list), else the one owning its SKUs (Dreamship's app sets SKU = product variant id).
- **Sync from Dreamship** (button on the card; also a daily `/api/cron/dreamship-sync` when `dreamship.sync_enabled` is on).
  - Reads the Dreamship product (variants, print areas used, costs, prices), the catalog item's print areas and its production days.
  - Matches Shopify variants by SKU = `product_variant_id`.
  - Proposes, per size: `maker` = dreamship, `maker_sku` = item variant id, `print_px` = print area width x height, `extra` as above, and `lead_days` = production days min–max.
  - Shows a diff. **Save to Shopify** writes only what changed, through the same `metafieldsSet` path as the rules editor (allowed write 5, no new write).
  - The daily run never writes. It records what differs and shows it as a warning on Settings › Shop › Products.
- **Check all Dreamship products** (Settings › Printers, added 26 Nov): the same check for every product made by Dreamship at once.
  - A product is checked when it's linked, has a size made by Dreamship, or every SKU looks like a Dreamship variant id.
  - An unlinked one is found on Dreamship as on the card ("found, not linked"); one that can't be found is listed as such.
  - Checking writes nothing. **Save all to Shopify** (with a confirm) links each found product and writes what differs on every product, worked out again on the server. Event `admin_dreamship_saved_all`.
  - Why it's needed: Copy settings never copies print rules, and Dreamship's listing updates rebuild a product's sizes in Shopify, which drops their `mmp_shop` fields. Run it after making or editing a product in Dreamship.
- **Shown, never written:**
  - Cost and price per size.
  - The margin at full price and at `dreamship.sale_pct` (default 60, the Black Friday sale).
  - Dreamship's minimum dpi against the picture the product's Imagen theme makes. For example, Royal Flush's 1024 px on a 10 in edge is about 102 dpi, below 250.
  - Whether `ai_upscale` is on for each print area.
- **Flags** on Settings › Shop › Products:
  - a Shopify size with no Dreamship variant, or the other way round;
  - cost at or above price, or a loss at the sale price;
  - the theme's pictures below the size's minimum dpi;
  - the template's background photo no longer among the product's media. Dreamship's listing updates are on, so editing the Dreamship product can replace the Shopify photos.
- **Source:** `lib/sources/dreamship.ts`, with an interface, `live` and `fixtures` as for every source.
  - Dreamship REST API (`https://api.dreamship.com/v1`) with `DREAMSHIP_API_KEY` (Vercel only, never `NEXT_PUBLIC_`).
  - Field names checked against Dreamship's API reference on 26 Nov (Dreamship's public API, below).
- **Settings:** listed under Part C; they're edited on Settings › Printers.
- **Analytics:** new business events `admin_dreamship_linked` and `admin_dreamship_synced`, props `product_id` and `fields_changed` (added to `docs/analytics.md` when built).

## Part B: Send the customer's picture to Dreamship (allowed write 7)

**Chosen (B1): keep Dreamship's own import and swap the artwork.**
1. **Order status is Shopify's and Dreamship's.** Whether an imported order waits as a draft or goes straight to print is Dreamship's own setting (auto-submit for order-import orders), together with Shopify's fulfilment request. Gavin sets it in Dreamship; the app never changes it. For the picture to be set before printing, imported orders need to wait as drafts. That's the plan for now; it can be changed in Dreamship later. **Still on at 13:30 on 24 Nov** (Dreamship reports `auto_submit_order_import_orders: true`).
2. On Shopify `orders/paid` (the existing verified webhook), for each line with `_shop` = true whose variant has maker `dreamship`, the app queues an outbox job `dreamship_artwork`.
3. The job finds the Dreamship order imported for that Shopify order, by its reference id. It retries with backoff while Dreamship hasn't imported it yet, for up to `dreamship.import_wait_hours` (default 6), then alerts.
4. For each personalised line, it uploads the print file as artwork and sets it as the line's artwork for the size's print area. That's all: the app **never submits, cancels or otherwise changes the order's status**. What happens next (a person submitting the draft, or Dreamship printing it automatically) is set in Dreamship and Shopify.
   - If Dreamship has already submitted the order (auto-submit on), the artwork may no longer be changeable. The job records "needs attention: Dreamship had already sent it to print", and Settings › Printers shows it.
   - The print file is the chosen picture cropped by `_shop_crop` and resized to `print_px`, from the private bucket through a short-lived signed link.
   - Lines without a picture keep Dreamship's artwork.
5. It records the Dreamship order id and the result on the order's activity (`activity_log`, new event `shop_order_sent_to_maker`, props `maker`, `status` = `picture_set` | `failed`, `lines`; added to `docs/analytics.md` when built). Dreamship's app keeps syncing tracking to Shopify, as today.
6. The job is idempotent: keyed by Shopify order id and line id. A line whose artwork is already the customer's picture is skipped.

**Not chosen (B2): the app places the order itself.**
- Take Magic Store Dreamship products off the Dreamship location, so Dreamship's app ignores them.
- The app creates the Dreamship order through the API from the Shopify order: item variant + print area + artwork URL, and the shipping address.
- More control, but the app then owns tracking and fulfilment updates back to Shopify, which Dreamship's app does today.

**Print quality.** Dreamship wants 250 dpi or more. Royal Flush's 1024 px squares give about 102 dpi on 8x10 and about 28 dpi on 24x36. Either:
- (a) switch the product to a 2:3, 2K version of the theme. `royal-flush-2k-test` makes 1696 × 2528, which crops less than 11% on every size and gives about 212 dpi on 8x10;
- (b) turn on Dreamship's AI upscale for the print area ($0.20 per print area);
- (c) or both.

**`CLAUDE.md` allowed write 7** (approved and added 24 Nov; narrowed the same day: the app never submits, as order status is Shopify's and Dreamship's):
> 7. Dreamship orders: for a paid Shopify order line whose variant's maker is `dreamship`, upload the customer's picture as artwork and set it on that line of the Dreamship order imported for it, through Dreamship's API with this app's key (`docs/dreamship.md`). Never submit or cancel a Dreamship order, and never change any other Dreamship product, order or setting.

## Part C: Settings › Printers

A new Settings page, `/settings/printers` (404 unless super user, like every Settings page), with one card per maker in `MAKERS`: the connection, the app's printer settings, and what the app has done. It doesn't control order status; that stays in Shopify and Dreamship.

**Dreamship card**
- **Connection:** whether `DREAMSHIP_API_KEY` is set (never shown), and **Check connection**, which reads Dreamship's account. It shows the business name, the plan, and when it was last checked. Settings › Data sources gets the same check as a row.
- **Dreamship's own order settings**, read live and shown read-only:
  - auto-import orders with Dreamship products;
  - auto-submit imported orders;
  - auto-submit API orders.
- **Note, information only:** while Dreamship auto-submits imported orders, the card says:
  > Dreamship sends imported orders to print straight away, so the customer's picture may not be on them in time.

  It's a note, not a block. The setting is Dreamship's, and the app changes nothing because of it.
- **This app's settings** (in `lib/settings/registry.ts`, group `printers`):

| Key | Default | What |
|---|---|---|
| `dreamship.sync_enabled` | `false` | Daily check of linked products against Dreamship (Part A); it only reports |
| `dreamship.import_wait_hours` | `6` | How long to wait for Dreamship to import a paid order before flagging it |
| `dreamship.sale_pct` | `60` | The sale used for the margin check |
| `dreamship.min_margin_pct` | `30` | Margins below this are flagged |
| `dreamship.api_url` | `https://api.dreamship.com/v1` | The API base |

- **Products:** every Shopify product with a `dreamship` size, each showing:
  - its linked Dreamship product (link to the designer);
  - when it was last synced;
  - its warning count, linking to its Dreamship card in Settings › Shop.
- **Orders:** the latest 50 Shopify orders with Dreamship lines, each showing:
  - the Shopify order name;
  - the Dreamship order (link);
  - what the app did: waiting for Dreamship to import it, picture set, or needs attention (with the reason);
  - Dreamship's own status for the order, read live and shown as it is (draft, in production, shipped…);
  - when that happened.

  Read from `activity_log` (`shop_order_sent_to_maker`). **Retry** re-queues a failed picture job. There's no submit or cancel: order status is handled in Shopify and Dreamship.
- Event: `admin_printer_settings_updated`, props `maker` and `keys` (new, added to `docs/analytics.md` when built).

**Prodigi, Gelato and In house cards**
- How many products and sizes use each maker.
- "Orders go to the existing print system straight from Shopify." No settings yet. The cards are there so a printer's settings have one home when they're added.

## Dreamship's public API (checked 24 Nov)

From docs.dreamship.com (its `llms.txt` index) after the first live connection check failed. Base `https://api.dreamship.com/v1`, `Authorization: Bearer <key>`.

- **What exists:**
  - **Orders:**
    - list, filtered by `reference_id`, `status`, `shop` and others;
    - create;
    - get, cancel, submit a draft, move to draft, update address or shipping, estimate.
  - **Shops:** list, get, create and update.
  - **Products:** list, get, create, update, delete and reprocess.
  - **Categories, items (with ship zones), and mockup template groups.**
  - **Line items:** create a ticket, and **match a line to a product variant** (`POST /orders/{order_id}/line-items/{id}/match/` with `product_variant` and `save_match`, for a draft order's line).
  - **Creating an order or a product** takes artwork as print areas: `{key, url, resize, position, rotate, background_hex, ai_upscale}`.
- **What doesn't exist:**
  - an account or business endpoint, or Dreamship's order settings (auto-import and auto-submit);
  - an artwork upload;
  - any way to change an existing line's artwork;
  - product-variant or item print-area endpoints.
- **Fixed 24 Nov:** Check connection used `/business/` and `/business/settings/`, which return 404, so it always failed. It now lists the shops, which proves the key works and names the account. Dreamship's order settings show as "Not reported"; check them in Dreamship.
- **Part B as built can't work:** it uploads to `/artworks/` and patches the line item, and neither exists.
  - **Fix (needs a new approval):** for each personalised line, **create a Dreamship product** with the customer's picture (`POST /products/`: the item, that one item variant, the print area with the picture's URL, `resize` fill, `ai_upscale`). Then **match the imported line to it**.
  - The order stays where Dreamship put it; a draft waits for a person.
  - This creates one Dreamship product per personalised line, so allowed write 7 needs rewording first.
- **Part A:** reading a product works (`/products/{id}/`). Print areas come from the product's design. The item print-areas and product-variant paths it also tries may 404, and it falls back without them.
- **Fixed 26 Nov (Sync from Dreamship):** the app read the product in the connector's shape (`variants` with `product_variant_id`, print areas with `width_px`), but the REST API returns another, so every sync failed with "Dreamship has no product with that id". It now reads the documented shapes, and still reads the old one:
  - `GET /products/{id}/`: `item.id`; `product_variants[]` with `id`, `item_variant`, `size`, `color`, `cost`, `price`; `print_areas[]` without pixel sizes.
  - `GET /items/{id}/`: `production_days_min`/`_max`; `print_areas[]` with `key`, `w`, `h`, `dpi` (the pixel sizes `print_px` comes from). The `/items/{id}/print-areas/` and `/product-variants/{id}/` calls are gone.
  - `GET /products/?limit=100&page=N`: `{paging: {next}, data: [...]}`, each with `shop_products[].marketplace_id`. Read once per check to find unlinked products.
  - Orders: line items carry `product_variant` and `item_variant` (Part B reads either).

## Build parts

Build in this order, one commit per part (`feat(dreamship-N): …`), each leaving every existing screen and test unchanged.

| Part | What | Done when |
|---|---|---|
| Dreamship 1: source and Settings › Printers | `lib/sources/dreamship.ts` (interface, live, fixtures: account and its order settings, product design, catalog item print areas and production days, find an order by reference and read its status, upload artwork, set a line's artwork; no submit or cancel). The `printers` settings group. `/settings/printers` with all four maker cards, Check connection, Dreamship's own order settings and the auto-submit note. A Data sources row. | Unit tests on the fixtures and the settings. e2e at 390 and 1280: super user sees the page and the note, others get 404, a setting saves. Axe clean. |
| Dreamship 2: link and sync (Part A) | `mmp_shop.dreamship_product_id` (definition created by Settings › Shop like the others), the Dreamship card on a Settings › Shop product (suggest, link, Sync from Dreamship with a diff, Save to Shopify), cost, margin and dpi, the flags on Products, and the daily report-only cron. | Unit tests for matching by SKU, the proposed fields, margins and dpi. e2e: link the fixture Flush poster, sync, see the diff and save. |
| Dreamship 3: the customer's picture on the order (Part B) | The `dreamship_artwork` outbox job from `orders/paid`: wait for the import, make the print file (crop and size), upload, set each personalised line, record `shop_order_sent_to_maker`. Never submit or cancel. The Orders list and Retry on Settings › Printers. | Unit tests: the picture set on each personalised line; the Dreamship source has no submit or cancel; idempotent re-runs; import not there yet, then there; an order Dreamship already submitted is flagged; a non-Dreamship line untouched. e2e: a fixture paid order shows on Settings › Printers with its picture set and Dreamship's status. |

The Dreamship API's exact paths and fields aren't confirmed yet (the schema at `https://api.dreamship.com/v1/schema/` couldn't be read from the design session). Read it first. If the build session can't reach it either, build against the fixture interface, and list the paths to confirm under "Blocked" in `BUILD_LOG.md`.

## Until Part B exists

A Magic Store order for a Dreamship product would print the sample art. So Dreamship products stay off the Storefront channel. If one goes on sale before Part B:
- turn off auto-submit for order-import orders in Dreamship;
- set each Magic Store order's artwork by hand from the line's `_image_url` before submitting.

## Open questions

- [x] Allowed write 7 approved, B1 chosen (24 Nov).
- [x] Picture quality: a 2:3 2K version of Royal Flush (24 Nov). Waiting on Imagen: activate `royal-flush-2k-test` or make a production copy, then set the product's `imagen_theme` to it (the theme must be active to appear in the field's choices). Then `max_crop_pct` 40 on 16x24 and 24x36 can go back to the default.
- [ ] 24x36 costs $135.69 against a $129.99 price (16x24 leaves $25.20 at full price). At 60% off, 12x16 and up lose money on cost alone, and 8x10 clears about $1 before shipping. Raise the 24x36 price, drop the size, or move to Dreamship Plus (24x36 $108.49)?
- [ ] Add square sizes for square themes? Framed Poster comes in 8x8 ($20.69), 12x12 ($24.29), 16x16 and 20x20, which fit Royal Flush's 1024 × 1024 squares with no crop.
- [x] Dreamship API key for this app: Gavin added `DREAMSHIP_API_KEY` in Vercel (24 Nov). Check connection on Settings › Printers confirms it after deploy.
- [x] Print automatically or not: handled in Shopify and Dreamship, not by the app (24 Nov). The app never submits.
- [ ] In Dreamship, set imported orders to wait as drafts (auto-submit for order-import orders off) before the Flush poster goes on sale, so the picture is on the order before it prints.
