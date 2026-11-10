# Shop: Gifts and Products

The spec for the shop, agreed with Gavin on 5 and 10 Nov 2026 (first drafted as the "Shop: spec draft" Claude Doc). Screen mockups: the "Gifts & Products mockups" design canvas. Where this file and `SPEC.md` disagree about the shop, this file wins.

## Keeping today's app unchanged

The shop is built into this app without changing anything customers see today, until a super user turns it on. Super users get a new Settings › Shop section to set it up beforehand.

- **Two switches, both off by default.** `shop.enabled` shows the shop to customers. `shop.super_user_preview` shows it to super users only, on the live site, before customers. While a person can't see the shop, `/gifts`, `/products`, `/cart` and `/api/shop/*` return 404, and the menu items, the Home tiles, the portrait options, the header cart icon and the promotion bar don't render. Both are launch switches (`LAUNCH_SWITCHES`), so a test keeps their defaults off.
- **Additive only.** New routes, new tables (migrations create, never alter existing tables), new `shop.*` and `site.*` settings, new events. Existing screens get only small additions, each hidden while the shop is hidden.
- **Its own code.** Shop code lives in `lib/shop/`, `components/shop/`, `app/(customer)/gifts|products|cart` and `app/settings/shop`. The shop's Shopify reads sit behind their own interface (`lib/shop/sources/`), so `lib/sources/` and `ShopifySource` stay as they are.
- **Existing order handling is untouched.** Shop lines never carry `_tile_id`, `_imagegen_session_id`, `_free_gift`, `_masterpiece`, `_addon`, `_theme` or `_gelato_product_uid` (they use `_shop_*` keys instead, see What goes on the order), so nothing that reads today's portrait lines (the /redeem parser for mugs and downloads, the mug print pipeline) picks them up. A paid shop order unlocks the free card offer exactly as any paid order does today (`gift.unlock_rule`); see Open questions.
- **The main site is untouched.** magicportraits.ai, its code and the Shopify theme don't change. In Shopify the app reads products, discounts and customer tags, creates carts (a cart is not an order), and writes only the `mmp_shop` metafields on products in the Store collection.
- **Tests.** The existing unit and e2e suites pass unchanged with both switches off; the shop's own suites run with them on.

## Summary

My Magic Portraits gets a shop: new products made from the customer's own pictures, with two ways in: a Gifts page and a Products page. They are browsed differently and share one flow underneath. A customer picks an image and sees it on 4 or 5 products. They can swap the image and every preview updates. They add the ones they like to a simple cart and pay in Shopify checkout. When the cart holds something from the Gifts page, checkout first asks who the gift is for, with an optional message; Products asks nothing extra. In code it's called shop, because "gift" already means the free-gift offer here.

Shopify stays the source of truth for products, variants, prices and stock. That includes sizes, print rules, preview templates, page, occasions and discounts. This app stores only the carts and new uploads.

| Decided on 5 and 10 Nov | Choice |
|---|---|
| How items reach checkout | The base Shopify product, with the image and its rules on the order line. No copied product per item, so checkout shows the product's standard photo. |
| Who makes the products | A mix of Gelato, Prodigi and in-house. Each product has its own rules. |
| Print files and supplier orders | Not this app. It attaches the image and the product's rules to the order line; another system makes the print file and places the order. |
| Previews | Product templates set up in Settings, drawn by the same renderer as greeting cards |
| Cart | A simple cart in this app, then one Shopify checkout |
| Images | Their Magic Portraits, a new upload, and photos they uploaded before, including photo-tile photos |
| Which 4 or 5 products | The first ones on that page in the Store collection's order, with products that don't suit the image hidden automatically |
| Product data | All in Shopify: sizes and other variants, prices, the blank photo, print rules, page and occasions (metafields), all in one Store collection |
| Discounts | Two Shopify discounts on the shop's collections, one for normal customers and one for VIPs, picked from the customer's Shopify tags. The codes are set in Settings; for now both are SITEWIDE OFF (50% off). |
| Promotion bar | A bar above the header on every page, edited in Settings |

## The customer flow

Two pages, Gifts and Products, lead into the same four screens. Both are for signed-in customers only, because they need their images. Ways in: **Gifts and Products** in the menu, a "Give it as a gift" and "Put it on a product" on Home and on each portrait in My portraits, and a link from each order.

|  | Gifts page | Products page |
|---|---|---|
| Menu item and address | Gifts, `/gifts` | Products, `/products` |
| Browsed by | Occasion and person, e.g. Christmas, Birthday, For Mom | Product type, e.g. Mugs, Wall art, Apparel |
| Products it shows | Products set to Gifts or All, by occasion | Products set to Products or All, by product type |
| "Who's it for?" | Asked before checkout: their name and an optional gift message | Not asked |
| Copy | Written for giving | Written for owning |

After the page, both run the same screens: Choose a picture, Product ideas, Product sheet and Cart. A product can appear on both pages.

*(Diagram: shop flow · 7 steps, 1 loop)*

Changing the picture loops back to Product ideas and redraws every preview. The cart can hold products made from several pictures.

1. **Choose a picture** (`/gifts, /products`). Three tabs: **Portraits** (the My portraits list), **My photos** (photos they uploaded before, including photo-tile photos) and **Upload**. Coming from a portrait skips this screen.
2. **Product ideas** (`/gifts/[image], /products/[image]`). The chosen picture sits at the top with **Change picture**, which opens a strip of their other images. Below it are 4 or 5 product previews showing that picture, each with its name and "from" price. Changing the picture redraws every preview. **See all products** shows the rest by category.
3. **Product** (a sheet over Product ideas). A large preview, the Shopify options (size, colour), price and quantity. **Adjust** lets them zoom and move the picture inside the print area, within the product's limits. **Add to cart**.
4. **Cart** (`/cart`). Each line shows its preview, product, options, quantity and price after their discount, with **Remove**. **Checkout** first asks "Who's it for?" if the cart holds anything from the Gifts page: the person's name and an optional message for the packing slip. Carts with only Products lines skip it. It then sends them to Shopify checkout, where a gift buyer enters the recipient's address.

After payment, Shopify's thank-you page shows as usual. The order then appears in My orders and the cart empties. The header cart icon, removed in the 4 Nov review, comes back only while the cart has something in it, with the item count.

## Images

All four kinds of image can be found from the customer's email.

| Kind | Where it lives | How we find it for this customer |
|---|---|---|
| Magic Portraits | Imagen bucket `images` (public) | Same as My portraits today |
| Photos uploaded to make a portrait | Imagen bucket `images`, under `user-uploads/` (public) | The events mirror: `original_image_url` on `funnel_portrait_generated` for their email (13,697 events in the last 30 days, all in this bucket) |
| Photo-tile photos, uploaded or ordered | Main site bucket `tiles-uploads` (public) | Ordered: their Shopify orders, lines with `_tile_type` = `photo`, `_image_url` Uploaded: the events mirror, `tile_dropped` with `tile_type` = `photo`; its `tile_id` is the file name in `tiles-uploads/order-uploads/` |
| A new upload | Our own bucket `shop-uploads` (private) | Saved against their member id |

Rules for every image:

- **One list.** My photos shows past uploads and photo-tile photos together, newest first, with duplicates (the same URL) shown once.
- **New uploads.** JPEG, PNG, WEBP or HEIC up to 20 MB. We convert to JPEG, remove location and camera data, and check the size with `sharp`. Anything under 1,000 px on the short side is refused with a friendly message.
- **Size is known.** We record each image's width and height, because the fit rules depend on them. Imagen rows mostly have them; for the others we read them once and keep them.
- **Owner only.** An image is only shown to, and only accepted in a cart from, the email it belongs to. The server checks this on every request.
- **Photo tiles never ordered.** The mirror event gives the tile id but not the file's extension, so we check once which file exists (.jpg, .jpeg or .png) and keep it.

## Products, pages, occasions and rules in Shopify

Everything about a product lives in Shopify, including its sizes and the rules for printing it. Every shop product sits in one Shopify collection, **Store** (handle `store`), and each product's metafields say which page it belongs on and which occasions it suits.

| What | Where in Shopify | Notes |
|---|---|---|
| Which products are in the shop | The **Store** collection | Add or remove products there. Set it to sort manually: its order is the order on both pages |
| Title, description, options, sizes and other variants, prices, compare-at prices, stock, status | The product and its variants | Read live through the Admin API and cached for 5 minutes; never copied into our database |
| Product images, including a photo of the blank product | The product's media | The template editor picks the blank photo from these |
| Which page: Gifts, Products or All | Product metafield `mmp_shop.page` | All shows it on both pages |
| Occasions, e.g. Christmas, Birthday, For Mom | Product metafield `mmp_shop.occasions`, a list | The Gifts page's chips and sections |
| Product type, e.g. Mugs, Wall art | Shopify's own Product type field | The Products page's chips and sections |
| Maker, maker's code, print size and fit rules | Variant metafields, namespace `mmp_shop` | See Product rules |
| Where the picture sits on the blank photo | Product metafield `mmp_shop.template` | Saved by the template editor in Settings |
| Discounts | Two discounts limited to the Store collection | See Discounts |

**Settings › Shop › Products** lists every product in the Store collection with its page, occasions and product type, and lets super users change them there. Settings writes each change straight to the product in Shopify, so Shopify admin and Settings always show the same thing.

**Occasions** are one list, kept in Shopify as the allowed values of the `mmp_shop.occasions` metafield definition. Settings › Shop › Occasions adds, renames, orders and retires them, and the Gifts page shows them in that order.

A product is hidden automatically when it isn't active or published to the cart's sales channel, has no variant Shopify marks as available for sale (not the stock count: some products sell with 0 in stock), has variants without the `mmp_shop` metafields, or has no template. Settings › Shop › Products lists every product in the shop's collections and says why any of them is hidden.

The template editor and Settings › Shop write to Shopify, so the app needs write access to products (`write_products`). That is an allowed write in `CLAUDE.md`, limited to the `mmp_shop` metafields (and their definitions) on products in the Store collection. The app never changes a product's title, description, price, media, variants, status or anything else the main site uses.

To start with, the existing Shopify products that could go in the shop include the photo mug, the posters, the acrylic print and prism, the face-swap tees, photo tiles and the photo book. Some may need new Shopify products made for the shop (see Open questions).

## Product rules

Each Shopify variant carries its rules as metafields in the namespace mmp_shop. They decide whether the product suits an image, how the image sits on it, and what we tell the maker on the order line.

| Rule | Example | Used for |
|---|---|---|
| Maker | Gelato, Prodigi or in-house | The order line, so the fulfilment system routes it |
| Maker's product code | Gelato `mug_product_msz_11-oz_mmat_ceramic-black_cl_4-0`, a Prodigi SKU, or an in-house code | The order line |
| Print area, in pixels | From the maker's spec, e.g. the mug's wrap | Cropping, the preview and the order line |
| Placement | Fill and crop (default), fit whole on a background colour, or a zone inside a wrap | How the image sits in the print area |
| Smallest image | Short side at least 1,000 px | Hides the variant for images that would print blurry |
| Most it may crop | 30% of the image | Hides the variant when the image's shape is too far from the print area's |
| Can customers adjust | Yes or no | Shows or hides Adjust on the Product sheet |
| Which images | Portraits, photos, or both | Some products may only suit portraits |
| Extra for the maker | Free-form JSON, e.g. Prodigi `sizing` | Passed through on the order line untouched |

How the 4 or 5 products are chosen for an image:

1. Take the products in the Store collection that are on that page (Gifts, Products or All), in the collection's order.
2. Drop any product with no variant that passes every rule for this image. A product that passes keeps only its passing variants.
3. Show the first `shop.top_picks_count` (default 5). **See all products** shows every passing product, by category.

The same check runs again when the image changes, when a cart line is added, and at checkout, on the server.

## Previews

Each product has a template: a photo of the blank product with the print zone marked, drawn in the browser so a new image shows at once.

A template has:

- **Background**: a photo of the blank product, picked from the product's images in Shopify, e.g. a white mug on a table.
- **Print zone**: where the image goes on that photo. Either four corners (a flat product seen at an angle, like a poster or tile) or a curved wrap (a mug), set by dragging handles in the editor and saved to the product's mmp_shop.template metafield.
- **Overlay** (optional): a transparent PNG drawn on top, for gloss, a handle or a frame edge.
- **Mask** (optional): the visible shape, e.g. rounded corners or a circle.

How it's drawn:

- The image is cropped to the variant's print area by the rules (Product rules), then warped into the print zone. The cropping and warping live in one shared module, as the card layout does today.
- The browser draws previews with that module, so changing the image or the crop redraws the 4 or 5 previews without a round trip.
- The server draws the same thing with `@napi-rs/canvas` for cart thumbnails and for a preview image on the order line.

The template editor in Settings works like the card template editor. A draft stays in the app until Publish writes it to Shopify. It has test renders with a square, a 3:4 and a landscape sample, and a warning when the zone's shape doesn't match the variant's print area.

## Cart and checkout

Our cart and a Shopify cart move together. Ours holds the pictures and crops; Shopify's holds the prices and discounts, so the cart always shows what checkout will charge.

**The cart**

- One open cart per signed-in customer, shared by the Gifts and Products pages and the same on every device.
- Each line holds the Shopify variant, quantity, the image, the crop and the template version it was made with.
- When the first line is added, the server creates a Shopify cart with the Storefront API (`cartCreate`), with the customer's email and their discount code (see Discounts). Every later change updates that cart.
- Line prices, discounts and the subtotal on screen are Shopify's own figures from that cart, with "Shipping and tax at checkout".
- Limits come from settings: `shop.cart_max_lines` (default 20) and `shop.cart_line_max_qty` (default 10). A cart left alone for `shop.cart_expiry_days` (default 30) is cleared. If Shopify has expired its cart, the server makes a new one from ours.
- A line whose product was switched off, sold out or no longer suits its image shows a note and can't go to checkout until it's removed.

**Checkout**

1. The server checks every line again: the image belongs to them, the rules still pass, the variant is in stock, and the discount code still matches their customer type.
2. When the cart holds Gifts-page lines, it asks "Who's it for?" and saves the answers on the Shopify cart.
3. It confirms every line carries the order-line details below, then sends them to the Shopify cart's `checkoutUrl`. Shipping, payment and any extra discount code happen there.
4. If they come back without paying, the cart is still here to change.
5. When the `orders/paid` webhook (already registered) brings an order with our `_vault_cart_id`, the cart is marked paid and emptied.

What this needs:

- A Storefront API token (`SHOPIFY_STOREFRONT_TOKEN`), and every shop product published to that token's sales channel.
- An allowed write outside our database in `CLAUDE.md`: creating and updating Shopify carts.

## Discounts

Two Shopify discounts cover the shop: one for normal customers and one for VIPs. The app picks one from the customer's Shopify tags, shows prices with it, and puts it on their Shopify cart.

| Setting | Example | Notes |
|---|---|---|
| `shop.discount_code_normal` | [code] | A Shopify discount code limited to the Store collection |
| `shop.discount_code_vip` | [code] | Limited to the Store collection and, in Shopify, to customers with the VIP tag |
| `shop.vip_customer_tag` | `VIP` | The Shopify customer tag that marks a VIP |
| `shop.discount_label_normal`, `shop.discount_label_vip` | "Member price", "VIP price" | Shown beside discounted prices |

**For now (10 Nov)** both codes are the same: `SITEWIDE OFF`, 50% off everything in the Store collection. It has been active since 11 Jan with no end date and no usage limit, any customer can use it, and it combines with other discounts. The VIP code comes later. Until then, an empty `shop.discount_code_vip` falls back to the normal code.

- **Customer type.** At sign-in, and again before checkout, the server reads the customer's tags from Shopify by their email. That needs read access to customers (`read_customers`). A customer with the VIP tag is a VIP; everyone else, including people with no Shopify customer yet, is normal.
- **Prices.** The app reads each code's value and products from Shopify (`codeDiscountNodeByCode`, which needs `read_discounts`). Product cards and the product sheet show the full price struck through, the discounted price and the label. The cart shows Shopify's own figures.
- **Checkout.** The code is already on the Shopify cart, so checkout opens with it applied. The customer can add another code only where Shopify's combination rules allow.
- **Fallback.** If a code is switched off, expired or used up in Shopify, prices simply show without it.
- **Shopify enforces it.** Because the VIP code is limited to VIP customers in Shopify, nobody else can use it even if it's shared.

## Promotion bar

A thin bar above the header on every page of My Magic Portraits, edited in Settings › Site › Promotion bar. Settings can hold one bar for everyone, or one for normal customers and one for VIPs.

| Field (per bar) | Example | Notes |
|---|---|---|
| On or off | On |  |
| Text | [promotion text] | Up to `site.promo_bar_max_chars` (default 90) |
| Link label and address | "Shop gifts", `/gifts` | Optional; the whole bar is the link |
| Who sees it | Everyone, normal or VIP | Uses the same customer type as Discounts |
| Start and end | Dates | Shown only between them |
| Style | Gradient or pink tint | The two brand styles |

- It can be closed. It stays closed for that visit and comes back when its text changes.
- It never covers the page: the header and any pinned bars move down by its height.
- Taps and closes are tracked as `promo_bar_tapped` and `promo_bar_closed` (PostHog only), with the bar's id and audience.

## What goes on the order

Every shop line carries everything the fulfilment system needs to make the print file and place the order, as hidden line attributes. Keys start with `_`, so the customer doesn't see them. Apart from `_image_url`, shop lines use their own `_shop_*` keys, never today's portrait keys (`_tile_id`, `_imagegen_session_id`, `_gelato_product_uid` and the rest), so /redeem and the existing print pipelines read exactly what they read today. (Changed 10 Nov from the first draft, which reused `_tile_id` and `_imagegen_session_id`.)

| Key | Value | Notes |
|---|---|---|
| `_shop` | `true` | Marks a shop line |
| `_image_url` | Full-size source image | Same key as today. Imagen and photo-tile images are already public links; new uploads get a signed link (below) |
| `_image_kind` | `portrait` · `upload` · `photo_tile` · `new_upload` |  |
| `_shop_image_id`, `_shop_session_id` | Imagen image id and session id | Portraits only. The same values today's lines carry as `_tile_id` and `_imagegen_session_id`, under shop keys |
| `_image_px` | e.g. `2048x2048` | The source image's size |
| `_shop_maker` | `gelato` · `prodigi` · `in_house` |  |
| `_shop_maker_sku` | The maker's product code |  |
| `_shop_print_px` | e.g. `2400x3000` | The print area |
| `_shop_placement` | `cover` · `contain` · `wrap_zone` |  |
| `_shop_crop` | `x,y,w,h` in source pixels | What the customer chose with Adjust, or the default crop |
| `_shop_background` | A hex colour | Only for `contain` |
| `_shop_extra` | The product's free-form JSON | Passed through untouched |
| `_shop_rules_version` | When the variant's rules last changed in Shopify | So a later change to the rules can't change an order |
| `_shop_preview_url` | The preview the customer saw | For customer service and checking print files |
| `_vault_line_id` | Our cart line id |  |

The Shopify cart also carries `_vault_cart_id` and `_source` = `shop`.

**Gift details.** When the cart holds Gifts-page lines, it also carries `Gift for` (the person's name) and `Gift message`, up to `shop.gift_message_max_chars` (default 200). They have no `_`, so the buyer sees them in checkout and can check them. Makers that support packing slips can print the message and leave the prices off. Each line also carries `_shop_page` = `gifts` or `products`, the page it was added from.

**New uploads** stay private. Their `_image_url` is a signed link valid for `shop.fulfilment_link_days` (default 90). The fulfilment system can ask for a fresh one through an endpoint protected by a shared secret.

This list is the contract with whoever builds the fulfilment side. They should confirm it before we build (see Open questions).

## Tracking, security and privacy

The shop follows the same rules as the rest of the app, plus these.

**New events** (added to `docs/analytics.md`; business events also go to `activity_log`)

| Event | When | Props |
|---|---|---|
| `page_view_gifts, page_view_products` | Choose a picture shown | `entry_point` |
| `shop_image_selected` | A picture chosen or changed | `image_kind`, `changed` |
| `shop_image_uploaded` | Upload accepted or refused | `ok`, `reason` |
| `page_view_shop_ideas` | Product ideas shown | `products_shown`, `image_kind` |
| `shop_product_opened` | Product sheet opened | `product_handle`, `position` |
| `shop_added_to_cart` | Add to cart | `product_handle`, `variant_id`, `price`, `position`, `image_kind` |
| `page_view_cart` | Cart shown | `lines`, `subtotal` |
| `shop_checkout_started` | Shopify cart created | `lines`, `subtotal` |
| `shop_order_paid` (server) | Paid order with our cart id | `order_id`, `lines`, `revenue` |

`shop_added_to_cart` and `shop_checkout_started` also go to Klaviyo as events, so an abandoned-cart flow can be built there later. Every shop event carries page = gifts or products and customer_type = normal or vip. The PostHog card dashboard gets a shop funnel, split by page: Product ideas → Product opened → Added to cart → Checkout started → Paid.

**Security**

- Every image and cart action re-checks on the server that the signed-in email owns the image and the cart.
- Images and lines are addressed by opaque ids; no emails or image URLs in our addresses.
- The Storefront token stays on the server.
- Uploads, cart changes and checkout are rate-limited per email and IP. Uploads are checked by content, not by file name.

**Privacy**

- No image URLs, uploaded photos or gift messages in PostHog, Klaviyo or logs; only the image kind, the page and our ids.
- Session replay masks previews, as it does the card preview.

## Open questions

The first three need answers before the build starts; the rest can be settled during it.

- [ ] **Fulfilment side.** Who builds the system that reads shop lines, makes the print files and places the Gelato, Prodigi and in-house orders? Do they accept the order-line keys in What goes on the order?
- [ ] **First products.** The Store collection holds the first 10 (10 Nov). Each needs its Shopify product with sizes, the mmp_shop metafields and a photo of the blank product. Products the main site already sells through copied products, such as Photo Tile, may need separate shop products. Otherwise their current fulfilment won't find the image.
- [ ] **Other rules.** "Each product has its own rules": are there rules beyond printing, such as shipping countries, lead time, a quantity limit, or portraits only?
- [ ] **Gifts and Products.** Beyond how each page is browsed and the gift question, what else differs between them? Should the Gifts page use the same occasions as the greeting card themes (New Year, Christmas, Birthday)?
- [ ] **Free offers.** Should a shop order unlock the free greeting card, as other orders do today? Assumed yes for now (10 Nov), so the offer's behaviour doesn't change; leaving shop orders out would be a new setting. Shop orders never include the free mug, which the main site's checkout adds.
- [ ] **New uploads.** Is a 90-day signed link enough for the fulfilment system, or must those images be public and permanent like today's portraits?
- [ ] **Header.** OK for the cart icon to come back, shown only while the cart has items?
- [ ] **VIP code at checkout.** Shopify only applies a customer-limited code when it knows the buyer is that customer. Test whether the email on the cart is enough, or whether VIPs need to be signed in to Shopify at checkout.
- [ ] **Discount stacking.** SITEWIDE OFF combines with other discounts. Test that a second code entered at checkout, such as MAGIC DISCOUNT, can't take a Store product below the intended price.
- [ ] **Main site.** Should the main site link into the shop, e.g. after a portrait is made?

## Build parts

Six parts for Claude Code, each one commit with tests green, as with the rest of the app. Parts 1–3 can be built and reviewed in Settings before any customer sees the shop.

| Part | What | Done when |
|---|---|---|
| Shop 1: products and Settings | Our tables (carts, cart lines, images) with RLS; Settings › Shop (each product's page and occasions written to Shopify, the occasion list, discount codes, VIP tag); Shopify reads of the Store collection, products, variants, metafields, discounts and customer tags behind `lib/sources/shopify.ts` with fixtures; `shop.*` settings | A super user sets a product's page and occasions in Settings, sees the same in Shopify admin, and sees why any product is hidden |
| Shop 2: images and fit | The image list (portraits, past uploads from the mirror, photo tiles (uploaded or ordered), new uploads to `shop-uploads`); upload checks with `sharp`; owner checks; the fit rules as one pure function | Unit tests cover every rule with square, 3:4, landscape and small images |
| Shop 3: templates and previews | The shared crop-and-warp module (flat corners and mug wrap); browser and server drawing; the template editor, which publishes to the Shopify metafield | Golden images for a poster, a tile and a mug, each with a square and a 3:4 image |
| Shop 4: customer screens | The Gifts and Products pages, Choose a picture, Product ideas, the Product sheet with Adjust, the header cart icon, the promotion bar, the ways in from Menu, Home, My portraits and orders | e2e at 390 × 844 and 1280 × 800, axe clean, screenshots in `docs/build-screens/` |
| Shop 5: cart and checkout | The cart kept in step with a Shopify cart, the normal and VIP discounts, "Who's it for?" for carts with gifts, with the gift message, Storefront `cartCreate` with the line attributes, the `orders/paid` match, rate limits | A fixture checkout produces exactly the attributes in What goes on the order |
| Shop 6: tracking and docs | The new events, Klaviyo events, the shop funnel on the PostHog dashboard; `SPEC.md`, `docs/schema.md`, `docs/data.md`, `docs/analytics.md` and the fourth allowed write in `CLAUDE.md` | Docs match the build; `BUILD_LOG.md` has a Shop section |

Needed from people before part 5 can be tested live:

- A Storefront API token, and the gift products published to its sales channel.
- Read access to products (`read_products`) on the Shopify app the build uses, if it doesn't have it yet.
- For each first product: the maker, the maker's product code, print sizes and a photo of the blank product.

- Shopify app access: `read_customers` (the VIP tag), `read_discounts`, and `write_products` (the template and product fields), added to the r_orders app the app already uses. Settings › Data sources shows the access the app has and flags anything missing.
- The two Shopify discounts, the Store collection set to sort manually, and the `mmp_shop` metafield definitions on the products.
