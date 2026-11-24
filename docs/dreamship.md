# Dreamship

Dreamship is a new printer (24 Nov). Products are designed in Dreamship's designer and published to Shopify by Dreamship's Shopify app, which also stocks them at Shopify's **Dreamship** fulfilment location. Status: Part A and Part B below are **approved, not built** (24 Nov). Gavin chose B1 (swap the artwork on Dreamship's imported order), approved allowed write 7 (now in `CLAUDE.md`), and asked for a 2:3 2K version of Royal Flush for the poster.

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
- **Dreamship's print rules:** every area is printed at 300 dpi with a minimum of 250 dpi. The safe area is about 2% in from each edge, and the art must run to the edges (`get_print_areas`, item 958).

## Part A: Link and sync (reads Dreamship; writes only `mmp_shop`)

- **Link.** New product metafield `mmp_shop.dreamship_product_id` (number_integer): the Dreamship product the Shopify product was published from.
  - Settings › Shop › a product gets a **Dreamship** card where a super user pastes the id or the designer link.
  - The card suggests the id when every variant is stocked at the Dreamship location and its SKU is a Dreamship product variant id. Dreamship's app sets SKU = product variant id.
- **Sync from Dreamship** (button on the card; also a daily `/api/cron/dreamship-sync` when `dreamship.sync_enabled` is on).
  - Reads the Dreamship product (variants, print areas used, costs, prices), the catalog item's print areas and its production days.
  - Matches Shopify variants by SKU = `product_variant_id`.
  - Proposes, per size: `maker` = dreamship, `maker_sku` = item variant id, `print_px` = print area width x height, `extra` as above, and `lead_days` = production days min–max.
  - Shows a diff. **Save to Shopify** writes only what changed, through the same `metafieldsSet` path as the rules editor (allowed write 5, no new write).
  - The daily run never writes. It records what differs and shows it as a warning on Settings › Shop › Products.
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
  - Dreamship REST API (`https://api.dreamship.com/v1`, schema at `/v1/schema/`) with `DREAMSHIP_API_KEY` (Vercel only, never `NEXT_PUBLIC_`).
  - Confirm the field names against the schema when building. The schema couldn't be read from the design session.
- **Settings:** `dreamship.api_url`, `dreamship.sync_enabled` (default off), `dreamship.sale_pct` (60), `dreamship.min_margin_pct` (warning threshold, default 30).
- **Analytics:** new business events `admin_dreamship_linked` and `admin_dreamship_synced`, props `product_id` and `fields_changed` (added to `docs/analytics.md` when built).

## Part B: Send the customer's picture to Dreamship (allowed write 7)

**Chosen (B1): keep Dreamship's own import and swap the artwork.**
1. In Dreamship, turn **off** auto-submit for order-import orders. Gavin does this in the Dreamship app; the MCP and API can't change it. Imported orders then wait as drafts instead of printing the sample.
2. On Shopify `orders/paid` (the existing verified webhook), for each line with `_shop` = true whose variant has maker `dreamship`, the app queues an outbox job `dreamship_artwork`.
3. The job finds the Dreamship order imported for that Shopify order, by its reference id. It retries with backoff while Dreamship hasn't imported it yet, for up to `dreamship.import_wait_hours` (default 6), then alerts.
4. For each personalised line, it uploads the print file as artwork and sets it as the line's artwork for the size's print area. Then it submits the order.
   - The print file is the chosen picture cropped by `_shop_crop` and resized to `print_px`, from the private bucket through a short-lived signed link.
   - Lines without a picture keep Dreamship's artwork.
5. It records the Dreamship order id and the result on the order's activity (`activity_log`, new event `shop_order_sent_to_maker`, added to `docs/analytics.md` when built). Dreamship's app keeps syncing tracking to Shopify, as today.

**Not chosen (B2): the app places the order itself.**
- Take Magic Store Dreamship products off the Dreamship location, so Dreamship's app ignores them.
- The app creates the Dreamship order through the API from the Shopify order: item variant + print area + artwork URL, and the shipping address.
- More control, but the app then owns tracking and fulfilment updates back to Shopify, which Dreamship's app does today.

**Print quality.** Dreamship wants 250 dpi or more. Royal Flush's 1024 px squares give about 102 dpi on 8x10 and about 28 dpi on 24x36. Either:
- (a) switch the product to a 2:3, 2K version of the theme. `royal-flush-2k-test` makes 1696 × 2528, which crops less than 11% on every size and gives about 212 dpi on 8x10;
- (b) turn on Dreamship's AI upscale for the print area ($0.20 per print area);
- (c) or both.

**`CLAUDE.md` allowed write 7** (approved and added 24 Nov):
> 7. Dreamship orders: for a paid Shopify order line whose variant's maker is `dreamship`, upload the customer's picture as artwork, set it on that line of the Dreamship order imported for it, and submit that order, through Dreamship's API with this app's key (`docs/dreamship.md`). Never change any other Dreamship product, order or setting.

## Until Part B exists

A Magic Store order for a Dreamship product would print the sample art. So Dreamship products stay off the Storefront channel. If one goes on sale before Part B:
- turn off auto-submit for order-import orders in Dreamship;
- set each Magic Store order's artwork by hand from the line's `_image_url` before submitting.

## Open questions

- [x] Allowed write 7 approved, B1 chosen (24 Nov).
- [x] Picture quality: a 2:3 2K version of Royal Flush (24 Nov). Waiting on Imagen: activate `royal-flush-2k-test` or make a production copy, then set the product's `imagen_theme` to it (the theme must be active to appear in the field's choices). Then `max_crop_pct` 40 on 16x24 and 24x36 can go back to the default.
- [ ] 24x36 costs $135.69 against a $129.99 price (16x24 leaves $25.20 at full price). At 60% off, 12x16 and up lose money on cost alone, and 8x10 clears about $1 before shipping. Raise the 24x36 price, drop the size, or move to Dreamship Plus (24x36 $108.49)?
- [ ] Add square sizes for square themes? Framed Poster comes in 8x8 ($20.69), 12x12 ($24.29), 16x16 and 20x20, which fit Royal Flush's 1024 × 1024 squares with no crop.
- [ ] Dreamship API key for this app (`DREAMSHIP_API_KEY` in Vercel).
