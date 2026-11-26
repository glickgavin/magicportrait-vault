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
| A spinner while it generates | Progress steps around their photo, about a minute: on phones where they added the photo (the page scrolls there, then up to the finished picture); on desktop over the gallery beside the form (26 Nov) |
| The result replaces the placeholder | Their picture is drawn onto the product with the product's template and becomes the first gallery image |
| Shopping info, product info, and more products with the picture | Delivery and returns, product details, and "Teddy on more gifts": four products drawn with their picture (2 × 2 on phones), and **See more gifts** for the next four |

Customer-facing name: **Magic Store**, as in the Black Friday "Introducing the Magic Store" emails. In code and settings it is the **open store** (`open_store.*`), so it isn't confused with the signed-in shop (`shop.*`) or the Shopify **Store** collection.

## Keeping today's app unchanged

The same rules as the signed-in shop (`docs/shop.md` › Keeping today's app unchanged):

- **Two switches, both off.** `open_store.enabled` shows it to everyone; `open_store.super_user_preview` shows it to super users only. While hidden, `/store/*` and `/api/store/*` return 404. Both are launch switches.
- **Additive only.** New routes, new tables, new `open_store.*` settings, new events. No existing screen changes.
- **Its own code.** `lib/open-store/`, `components/open-store/`, `app/(store)/store/`. The Imagen API sits behind `lib/sources/imagen-api.ts` with a fixtures implementation, like every other source.
- **The main site is untouched.** magicportraits.ai and the Shopify theme don't change.

## The customer flow

1. **Store page** (`/store`, `/store/c/<collection>`). Category circles, collection heading and intro, Filter and Sort, product grid. Tapping a product opens its page.
2. **Product page** (`/store/product/<product id>`). They pick the variant (size etc.), upload a photo, optionally type a name, and tap **Generate**.
3. **Creating** (same page). The picture area shows progress steps; the rest of the page stays usable.
4. **Ready** (same page). Their picture is on the product. They can pick another of the results, change the photo (in the same place they added it), change the variant, and **Add to cart**. Below: shopping info, product details and three more products with their picture.
5. **Cart** (a drawer from the right on every store page). Lines with previews, quantities, Shopify's prices and discounts, **Checkout**.
6. **Shopify checkout**, then Shopify's thank-you page as usual.

They can leave and come back: the visitor cookie brings back their pictures on each product, and their cart. On another device, signing in brings them back (Visitors and sign-in, below).

## Store page

| Part | Source |
|---|---|
| Promotion bar | The existing `site.promo_bar*` settings (`docs/shop.md` › Promotion bar), audience "everyone" |
| Header | The app's header with the cart icon (count, shown when the cart has lines). No sign-in needed; "Sign in" stays in the menu |
| Category circles | Shopify navigation menu `open_store.menu_handle` (default `magic-store`): each item links to a collection. Circle image = the collection's image; label = the menu item's title; order = the menu's order. Edited in Shopify admin › Online Store › Navigation. Reading menus needs the app's `read_online_store_navigation` access (added to the checks on 24 Nov) |
| Heading and intro | The collection's title and description. At `/store` the line under the heading is `open_store.home_intro` (26 Nov: "Create humorous pet photos on 100s of products."), edited on Settings › Shop › Magic Store; empty uses the collection's description |
| Products | The collection's products in its sort order, 24 per page, "Show more" for the next 24 |
| Filter | Chips for the product types in the collection (Shopify's Product type field) |
| Sort | Featured (collection order), Price low to high, Price high to low, Newest |
| Product card | First product image, title, "From" the cheapest available variant's price, the compare-at price struck through when higher, and stars with a count only when the product has the standard `reviews.rating` and `reviews.rating_count` metafields |

**The Magic Store collection** (`magic-store`, created in Shopify on 23 Nov with the Store collection's 10 products) is the store's product list: `open_store.collection`. Only products in it appear anywhere in the store, and only they use the Magic Store fields. It's a manual collection, so a product joins or leaves the store by being added to or removed from it. Category collections in the menu narrow it down; a product in a category but not in Magic Store doesn't show. Like every new collection it's unpublished, which doesn't matter while the app reads it through the Admin API.

`/store` shows the collection in `open_store.home_collection` (default `magic-store`). Only products that pass the open-store check appear (below); a collection with none shows "Nothing here yet" and the circles.

**A product is in the open store** when it's in the Magic Store collection, active, published to the Storefront token's sales channel (carts need it, as in the shop), has an available variant, every variant has the `mmp_shop` rules (`docs/shop.md` › Product rules), it has a template (`mmp_shop.template`), and it has an Imagen theme (`mmp_shop.imagen_theme`) or is marked `mmp_shop.open_store_related = true` (shown only as a related product). Settings › Shop › Products lists every product and says why any is hidden in each store. Products are read the same way the shop reads them: live through the Admin API, cached for 5 minutes, never copied into our database.

## Product page

Top to bottom, mobile first:

1. **Gallery.** Before a picture: the product's Shopify media, the first being its placeholder (a sample picture on the product). After: the first slot is their picture drawn on the product with the variant's template, with their photo in a small circle in the corner (from their saved photo); the second is their picture on its own; then the product's remaining media, marked "Example". On phones the pictures sit in a row to swipe through, with dots under them (the current one longer, in pink) and a small, light "Swipe" hint on the picture until the first swipe; no thumbnails (26 Nov). On desktop the thumbnails stay in a column beside the picture.
2. **Rating** (when the review metafields exist; else, 26 Nov, Trustpilot's stars and "4.1 on Trustpilot · read reviews", a link down to the reviews, or to the customer photos when there are no reviews), **title** (the product's name in Shopify, nothing added: no theme name; on one line, the type getting smaller until it fits, down to 15 px, then cut with "…"; 26 Nov), **price** with compare-at struck through and the discount label (see Prices), "VAT included" where the shop's prices include tax.
3. **Bullets** from `mmp_shop.short_description` (as in the shop), e.g. "Your pet as The Admiral in about a minute".
4. **Delivery estimate**: "Delivery approx. 27 Nov – 30 Nov": today plus the variant's `mmp_shop.lead_days` (e.g. `4-6`, working days) plus `open_store.shipping_days` (e.g. `2-3`), skipping weekends. Hidden when either is missing.
5. **Variant chips**, one group per Shopify option (Size, Colour), 4 in a row when the values come in fours (4, 8, 12), else 3 (26 Nov). An option with only one value across the product's variants (Color: White on a blanket) isn't shown, since there's nothing to pick (`open_store.hide_single_options`, on by default; 26 Nov). A variant can carry a badge from `mmp_shop.badge` (e.g. "Bestseller"). Sold-out variants show but can't be chosen. **Pictures on chips** (26 Nov): the options named in `open_store.picture_options` (default Frame, Color, Colour, any case) show a small picture above each value: the value's swatch in Shopify if it has one (Shopify admin › the product › the option, linked to a category metafield, with a colour or an image), else the photo of the variant that value would pick. Any other option whose values all have Shopify swatches shows them too. All or nothing per option, so the chips line up.
6. **Their photo** (required). It stays in the same place in every state, under the variant chips and above the main button, so the visitor always finds their photo where they added it (26 Nov: it used to disappear once the picture was ready, with "Try another photo" in a note above the title instead):
   - **No photo yet:** a tap target, **Choose a photo**, that opens the camera roll, with tips from the product's settings ("A clear, front-facing photo works best"). A visitor with earlier photos also sees "Or use a photo you've added before" with them as thumbnails.
   - **Photo chosen** (redesigned 26 Nov, as it wasn't clear what to do next): one row with the thumbnail, "Photo added", a pencil button (**Change photo**, its label for screen readers) and **Generate**, with "Free to try. Takes about a minute. You'll see it before you buy." under the row. With two photo slots, Generate is in the second photo's row.
   - **Creating:** on phones the progress (their photo in the spinning ring, the steps, then the email offer) takes this spot (26 Nov); on desktop the progress sits over the gallery and the row stays here, with **Change photo** turned off until the picture is ready or fails.
   - **Ready:** the same row, "Teddy is ready" (or "Your picture is ready" without a name) with a check on the thumbnail, and the pencil (**Change photo**). This row is the only way to change the photo; there's no separate "Try another photo" note or link.
   - **Change photo** opens a sheet from the bottom on phones (a dialog on desktop), "Choose another photo": **Upload a new photo** (the camera roll), and "Or use a photo you've added before", their saved photos newest first, the one in use marked "In use". Picking one closes the sheet and fills the row ("New photo added"), with **Generate** back in the row and **Keep Teddy's picture** under it to undo the change; the picture they had stays on show until they create a new one, and stays saved either way. Real buttons, so it works with a keyboard; Escape and the close button shut it with nothing changed.
   - When the product's theme takes more than one photo (two pets, say), there's one such row per photo, each with its own label (Photos and names, below).
7. **Name** (optional, only when the product's settings define it): label, placeholder and limit from settings, e.g. "Their name (optional, shown on the picture)", 14 characters. One per photo slot, right under its photo row in every state. It goes to Imagen with the photo, for themes that print the name. It comes back with the picture on return (the picture's status sends the names to the visitor who made it, and to no one else; never tracked or logged). Changing it once the picture is ready works like changing the photo: **Generate** comes back in the photo row, with **Keep Teddy's picture** under it.
8. **Add to cart** (26 Nov: Generate moved into the photo row, item 6; there's no Generate button here any more). A quantity stepper and **Add to cart · $24.00**, always shown: greyed, with "Generate your picture first, then add it to your cart." under it, until the picture is ready; then gradient, with the accepted payment methods under it. Generate (in the photo row) turns grey with a small spinner while creating. Why a picture couldn't be made (failed, the daily limit, busy) shows under the photo row.
9. **Trust card** (26 Nov), right under the button: three short facts from `open_store.trust_stats` ("1M+ tiles shipped", "6+ years making wall art", "Baltimore, our US facility"), then a line with Trustpilot's mark, its stars and its own words ("Great · 4.1 out of 5") from `open_store.trustpilot`. The Trustpilot figures are copied from Trustpilot exactly and kept up to date by hand (26 Nov 2026: Storyboards Photo Tiles, 4.1, Great, 2,474 reviews); with no score in settings there's no Trustpilot line anywhere on the page. The stars are Trustpilot's, rounded to the nearest half star.
10. **Shopping info**: three short rows from settings (`open_store.reassurance`, e.g. "Free shipping until 1 Dec" with the delivery estimate, "Printed to order, just for you", "Secure checkout with Shopify"), each with an icon, on a cream panel.
11. **Product details**: accordions. "Product details" (the Shopify description, then `mmp_shop.details` when set) and "Shipping and returns" (Shopify's shipping and refund policies). (26 Nov: "How it works" moved out of the accordions into its own section, item 12.)

The lower page (26 Nov), every part from settings or the product's own fields, each left out when it has nothing to show:

12. **How it works**, before their first picture: a cream band with up to four steps, each a photo, a title and a line (`open_store.how_steps`: "Snap", "See it, free", "Meet your personalised product", with the live site's photos). **After their first picture, "On more gifts" takes its place**: "Teddy on more gifts" (or "Your picture on more gifts" without a name), four products drawn with their picture, 2 × 2 on phones, with **See more gifts** for the next four (below).
13. **Real product, real quality**: this product's own photo and up to four features (icon, title, a few words), from the product's `mmp_shop.generation` › `quality`, edited in Settings › Shop › the product › Magic Store. Products without it skip the section.
14. **Already in their homes**: "Loved by pet parents" (or "Loved by our customers" when the product's subject isn't a pet), the Trustpilot line with **Read all reviews on Trustpilot** when there are no reviews on the page, and customers' photos in two rows drifting in opposite directions (`open_store.wall_photos`, the live site's photos by default). A **Pause the photos** button stops them; with reduced motion they don't move at all. A photo whose link stops working is dropped.
15. **From our customers**: real reviews only, copied word for word into `open_store.reviews` with the reviewer's first name and initial and where they left it, never written by us; with the Trustpilot score and count and **Read all reviews on Trustpilot**. Empty by default, so the section is left out until real ones are added. (The live site's quoted reviews weren't used: the same names appear with different reviews on different pages.)
16. **We've got you covered**: up to four promises with icons (`open_store.guarantees`), 2 × 2 on phones, one row on desktop.
17. **Quick questions**: up to eight questions that open in place (`open_store.faq`). Opening one is tracked as `store_info_opened` with `section` `faq-1` to `faq-8`.
18. **Closing card**: the same next step as the main button. With a picture: "Teddy's personalised product is ready" and **Add to cart · $24.00**. Before: "See your pet on it, free" and **Add their photo** (opens the camera roll for the first empty photo slot), which becomes **Generate** once there's a photo. Tracked as `store_lower_cta_tapped`.
19. The app's footer.

Mockups: the "Open store mockups" design canvas (store page, product page before a photo, creating, ready, the Change photo sheet, another photo chosen, cart drawer; store and product pages on desktop; the full product page with its State switch).

### Creating the picture

| Step | What the visitor sees | What happens |
|---|---|---|
| Photo chosen | The thumbnail in the **Their photo** row; **Generate** turns on once every required photo slot is filled | The browser shrinks it to `open_store.upload_max_px` (default 2048) if bigger. Nothing is sent yet |
| Generate | The picture area dims and shows three steps: "Uploading your photo", "Painting {name} as The Admiral", "Putting it on your pillow", around their photo in a spinning ring. The button reads "Generating…" and is disabled. The page below stays usable | `POST /api/store/generations` with the photo(s), the product and the name(s). The server checks each photo (as `docs/shop.md` › Images: type by content, up to 20 MB, at least `open_store.min_photo_px`, default 600, on the short side), the bot check and the limits; creates the visitor row if it's their first action; saves each photo in `store-uploads` as a `store_photos` row (JPEG, location and camera data removed); then calls Imagen |
| Waiting | The steps tick as Imagen's status moves (`pending` → `preprocessing` → `generating` → `done`) | The browser asks `GET /api/store/generations/<id>` every 2 s; the server asks Imagen |
| Ready | The picture fades in on the product; a strip of the results to choose from ("Pick your favourite") when Imagen returned more than one; **Add to cart** | The server copies Imagen's results into `store-uploads` and records them on the `store_generations` row |
| Slow | After `open_store.slow_after_s` (default 90): "Still painting. This one's taking a little longer." | |
| Failed or timed out | "We couldn't make this one. Try a different photo, ideally a clear, front-facing one." with **Choose another photo**, which opens the same sheet as **Change photo**. A failure doesn't count toward their limit | After `open_store.timeout_s` (default 240), or Imagen's `failed`, `cancelled` or `awaiting_face_selection` (themes for the open store must not ask to pick faces) |
| Limit reached | "You've made {n} pictures today. Come back tomorrow, or add one you've made to your cart." | Per visitor and per IP, below |

Changing the variant redraws the picture at once (same picture, new template and crop); it never calls Imagen again. Changing the name or photo needs a new picture. A visitor's earlier photos are offered again ("Or use a photo you've added before", under **Choose a photo** and in the **Change photo** sheet) so they don't have to upload twice, on this product or the next.

### Personalise (25 Nov)

When the product's template has a personalisation layer (`docs/shop.md` › Personalisation layer), the layer's fields show under the photo slots from the start, with no heading of their own (26 Nov: just the pet's name box, or the picture choice) (fixed 25 Nov: it first appeared only once the picture was ready), and stays above Add to cart afterwards; what they type first is kept: each text box with its question, "(required)" or "(optional)", the example words as a placeholder and a character count; and the picture choice as a row of up to 3 thumbnails (plus **None** unless it's required). The preview on the product redraws a moment after each change (and switches to their picture on the product), with no new picture made. Add to cart checks required boxes first and says which one; the server checks everything again against the live template and puts it on the line (`_shop_layer_t1`, `_shop_layer_t2`, `_shop_layer_art`, `_shop_layer_v`); the cart thumbnail is drawn with it. The words are masked in session replay and never tracked: `store_layer_filled` says only which parts were filled in, and `store_added_to_cart` carries `personalised`.

**Border (26 Nov).** When the template's layer has a border choice, the step shows it as two chips, **No border** and **Add border** (each with a tiny print, edge to edge or with a margin), with the template's question as the legend and its starting pick chosen. Picking one redraws the preview on the product a moment later, with their picture inside the margin. The width is the template's for the chosen variant (`docs/shop.md` › Personalisation layer); a variant whose width is 0 doesn't show the choice. Add to cart sends only yes or no; the server works the width out again for the variant and puts it on the line as `_shop_layer_border`, so the cart thumbnail and the print file carry the same border. `store_layer_filled` gains `has_border`.

**Reposition (26 Nov).** When the template's layer has **Let customers reposition it** ticked, each text box's label has a **Reposition** button at the end of its line (always; an empty box shows its example words), and the picture choice has one once a picture is picked. It opens a sheet (a dialog on desktop) with the flat print area, drawn with their picture (else the photo they added, else a plain background) and the layer, by the same routine as the previews and the print file. They drag the item to move it (or use the arrow keys, Shift for bigger steps), and set **Turn** (−180° to 180°) and **Size** (50% up to 250%, or as wide as the print area allows) with sliders; with more than one item, chips pick which one. **Reset** puts the item back where the template has it; **Cancel** keeps nothing; **Done** keeps it, and the product preview redraws. The item always stays inside the print area. What they set goes to the cart with the words and is checked again on the server (only with the switch on, and only for what's filled in), then rides on the line as `_shop_layer_pos` (`docs/shop.md` › What goes on the order), so the cart thumbnail, the print file and the Dreamship artwork all show it where they put it. Tracked as `store_reposition_opened` and `store_reposition_saved` (never the words).

### Asking for their email while we paint

While the picture is being made, a box under the picture area asks for their email. It's optional and on by default (`open_store.ask_email_while_painting`). The mockup is in the "Creating the picture" board.

- **The box:** "While we paint: want Teddy's picture by email?", "We'll send it the moment it's ready, so you can come back to it on any device.", an email field, **Email it to me**, and an unticked box "Send me offers and new designs too. Unsubscribe any time." A close button hides it for this visitor. It never blocks or delays the picture.
- **Saving:** `POST /api/store/email` (Zod, rate-limited per visitor and IP) saves it as `email_given` on the visitor. It isn't proven, since anyone can type anyone's address, so it doesn't link the visitor to that email's account.
- **The email:** when the picture is ready, the app sends one "Your picture is ready" email through AgentMail (React Email). It shows the picture (Imagen's public URL, as on order lines), the product, and **See it on your pillow**.
- **The link in it** works like gift links (`/g/<token>`): random, stored hashed, expires after `open_store.email_link_days` (default 30), and stripped from the address after use. Opening it proves the email, signs them in, links the visitor (`linked_via` = `email_link`), and opens the product with their picture, on any device.
- **Email limits:** one email per generation, and at most `open_store.emails_per_address_per_day` (default 3) to one address. If the picture is already ready when they give the email, it goes at once.
- **Offers box ticked:** an outbox job subscribes the address in Klaviyo with consent (source "Magic Store: while painting") and sends the event `Store Picture Ready` with the product, theme and product page link, for the store's future flows. Without the tick, nothing goes to Klaviyo.
- **Ready state:** under the "Teddy is ready" note: "We've emailed it to you too." The address isn't shown.

### Generation settings in Shopify

Each product's generation is set in product metafields, namespace `mmp_shop`, next to the shop's own fields.

**The definitions exist in Shopify** (created 23 Nov). They're named "Magic Store …" and each description starts "Only for products in the Magic Store collection".
- Shopify can't limit a field to one collection, so the fields exist on every product. They're unpinned, like the shop's fields, so they don't crowd other products' pages; in Shopify admin they sit under the product's Metafields › Show all.
- They're filled in only for Magic Store products, and the app reads them only for those.
- Like the shop's fields, they aren't readable by the storefront.

**The Imagen theme becomes a dropdown** (`mmp_shop.imagen_theme`): its allowed values (Shopify's `choices` validation) will be the theme slugs from Imagen's theme list. Settings › Shop › Magic Store fills and refreshes them with **Refresh themes from Imagen**, so nobody types a slug by hand. Until then it's plain text.

#### Product settings use the store's settings framework

Product fields are declared in `lib/settings/registry.ts` next to the store's settings, with the same parts: key, type, default, validation, label and help text. The only differences are their scope (`product` or `variant`) and where the value is stored (a `mmp_shop` metafield instead of the `settings` table).

- **Defaults:** each product field falls back to a store-level setting, e.g. a product's `images_to_show` falls back to `open_store.images_to_show`, and its photo tips to `open_store.photo_tips`. Code calls `getProductSetting(product, 'images_to_show')` and gets the product's value or the store's default, as `getSetting()` does for the store.
- **Editing:** a product's Magic Store fields sit on its one product page in Settings › Shop, next to its shop fields (Settings: one area for both stores, below). They use the same form controls as the store settings and save through `metafieldsSet` (`CLAUDE.md`, allowed write 5), like the shop's fields.
- **Validation:** a product field is checked by the same Zod rules whether it's set in Settings or read back from Shopify. A bad value set by hand in Shopify admin is flagged in the product table, and the store default is used instead.

| Metafield (name in Shopify) | Type | Example | Notes |
|---|---|---|---|
| `imagen_theme` (Magic Store theme) | single line text | `bathroom-01` | The Imagen theme slug sent as `theme_id`. One per product: the product's art style. Required for a product people make pictures on |
| `generation` (Magic Store picture settings) | JSON | below | Optional; each key falls back to the store setting of the same name |
| `related` (Magic Store more gifts) | list of products | | The products under "On more gifts", in order. Empty: chosen automatically (On more gifts, below) |
| `open_store_related` (Magic Store related only) | boolean | `true` | Shown only under "On more gifts", with the visitor's picture, never in the grid |
| `details` (Magic Store size and materials) | multi-line text | | Optional, under Product details |
| `badge` (variant; Magic Store badge) | single line text | `Bestseller` | Optional chip label |
| `lead_days` (variant; Magic Store making time) | single line text | `4-6` | Working days to make it |

```json
{
  "photos": [
    { "label": "Their photo", "name_label": "Their name (optional, shown on the picture)", "name_placeholder": "Teddy" }
  ],
  "name_max": 14,
  "photo_tips": "Best results: one pet, facing the camera, in good light, with the whole head in the picture.",
  "subject": "pet",
  "images_to_show": 4,
  "step_labels": ["Uploading your photo", "Painting {name} as The Admiral", "Putting it on your pillow"]
}
```

`subject` is `pet`, `person` or `any` and only changes the copy. `images_to_show` caps the "Pick your favourite" strip (Imagen decides how many it makes). Settings › Shop › Products checks each value against the theme list from Imagen (`GET /api-themes`) and flags unknown or inactive themes.

#### Photos and names

**How many photos a product needs is set on the Imagen theme, not in Shopify.** The theme already knows what it paints (one pet, two pets, a person and a pet), so Imagen's theme list is the one place that says how many photos it takes and which are required (`input_count`, with the named roles in `inputs`). The product page shows that many photo slots. Shopify's `generation.photos` only words them: slot 1 uses the first entry's label and name label, slot 2 the second, and so on; a slot without an entry is "Photo 2", "Photo 3". If Imagen's theme list turns out not to say, `generation.photos` sets the count instead (one entry per photo), and Settings › Shop › Products warns when Shopify and Imagen disagree.

Names go one per photo, when the theme prints names; `name_max` applies to each.

**`ask_name`** (25 Nov; boolean, store default `open_store.ask_name`, on): whether the product asks for the pet's name next to the photo, which Imagen uses to make the picture. Off: no name box, and the server sends no names to Imagen whatever the browser sends. It's for products whose personalisation layer asks for the name, so customers are never asked twice. Settings › Shop › product shows a checkbox, and a note while it's on and the template's layer has a text box (the template editor's layer section shows the same note). Copy settings carries it.

### Imagen API

The server, never the browser, calls Imagen's public API, the same one the main site uses (`/functions/v1/api-generate`, `/api-sessions/<id>`, `/api-themes`):

- **Generate** (checked against Imagen's api-generate code, 24 Nov): `POST {IMAGEN_API_URL}/api-generate` with `Authorization: Bearer <IMAGEN_API_KEY>`, multipart. Fields: `theme_id` (the slug, e.g. `bathroom-01`) and `name` (left out when empty). A one-photo theme takes the photo as `source_image` and the name as a string. A multi-photo theme takes one file field per declared role (its `inputs[].role`), refuses `source_image` and unknown fields, and takes the names as a JSON object keyed by role (`{"pet_1":"Teddy","pet_2":"Bella"}`). We also send `X-Client-User-Id: open-store:<visitor id>`, as the main site sends its own user id. Returns `session_id`, `status`, `poll_url` and `sources`.
- **Status:** `GET /api-sessions/<session_id>`: `status`, `expected_image_count`, `images` (id, url, width, height), `total_cost_usd`.
- **Themes:** `GET /api-themes` (and `?category=`) returns `{ themes: [{ id, slug, name, is_active, category: { id, slug, name } | null, input_count, inputs?: [{ role, label, required }], images, … }] }`. `input_count` (always at least 1) is how many photos a theme takes; `inputs` is only there for multi-photo themes, and its labels are Imagen's own wording for each slot.
- **Key:** `IMAGEN_API_KEY` (an `ik_live_…` key Imagen issued for this app), in Vercel env only, Sensitive. Base URL `IMAGEN_API_URL` = `https://ngyunrirwrjudbgaijek.supabase.co/functions/v1`. Neither reaches the browser, and the key is never written in the repo, logs or docs.
- **Fixtures:** `DATA_SOURCE=fixtures` returns sample pictures from `public/shop-samples/scenes/` after a short delay, with a two-photo theme and `failed` and slow cases for tests.

## Visitors and saved data

### The visitor id

- On the first store page a visitor opens, the app sets the cookie `mmp_visitor`: a random 32-byte token, httpOnly, Secure, SameSite=Lax, for `open_store.visitor_cookie_days` (default 365).
- The `store_visitors` row is created on their first real action (a photo or an Add to cart), not on a page view, so bots and passers-by leave nothing behind.
- The row's `id` (a uuid) is the **visitor id** used everywhere: storage paths, generations, the cart attribute, Imagen's client user id, and PostHog's `store_visitor_id` property (Analytics and PostHog). The cookie holds the token, and the table stores only `HMAC(VISITOR_SECRET, token)`, so an id seen in an admin page or an order can't be used to act as that visitor.

### Tables and bucket (new migration in `magic-vault`)

| Table | Columns |
|---|---|
| `store_visitors` | `id uuid pk`, `token_hash text unique`, `email text null` (lower-cased; set when they sign in or buy, so it's proven), `linked_via` (`sign_in` · `order` · `email_link`, null until linked), `email_given text null` (typed while painting, not proven), `email_given_at`, `marketing_consent_at`, `first_touch jsonb`, `posthog_distinct_id`, `shopify_cart_id`, `shopify_checkout_url`, `first_seen_at`, `last_seen_at`, `created_at`, `updated_at` |
| `store_photos` | `id uuid pk`, `visitor_id` → `store_visitors` (cascade), `storage_path`, `width`, `height`, `created_at` |
| `store_generations` | `id uuid pk`, `visitor_id` → `store_visitors` (cascade), `product_id` (Shopify gid), `theme`, `photo_ids uuid[]`, `names text[]` (private: never in analytics or logs), `imagen_session_id`, `status`, `images jsonb` (per result: Imagen image id, width, height, our `storage_path`), `chosen_index`, `cost_usd`, `order_id`, `ordered_at`, `created_at`, `finished_at` |

RLS on all three, deny by default, as every table.

**Bucket `store-uploads`** (private):
- `<visitor id>/photos/<photo id>.jpg` for their photos.
- `<visitor id>/pictures/<generation id>/<n>.png` for our copies of Imagen's results.
- `<visitor id>/previews/<line id>.jpg` for the product previews on cart and order lines.

The pages load them through an app route that checks the cookie (or a signed-in email linked to the visitor, or a super user). Fulfilment gets short-lived signed links.

### Keeping and deleting

- **Everything is kept, bought or not** (Gavin, 23 Nov), for future marketing. There is no clean-up job.
- **What "marketing" may use:** a visitor's own photo and pictures may be shown back to that visitor, on the site and in emails to an address they gave us. Using them anywhere public (ads, social, the site's examples) needs that person's separate permission. The privacy policy has to say we keep photos and pictures and why, before launch.
- **Data-deletion requests** for an email delete its linked visitors (and those that only gave that email), their rows and their files.
- **Testing reset** (26 Nov): Settings › Magic Store › Testing › **Start again as a new visitor** lets a super user remove their own state. That covers this browser's visitor and the visitors linked to their email (rows, photos, pictures, previews), their Gifts & Products cart and uploads, the `mmp_visitor`, `mmp_ft` and `mmp_entry` cookies, and the store's notes in the browser. They stay signed in; cards, Shopify orders and the activity log are untouched. Recorded as `admin_test_reset` (counts only).
- **Imagen's copy:** Imagen keeps its own copy, in public storage (open question for deletion requests).

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

Products drawn with the visitor's picture, under the product details, four at a time (26 Nov: it was three):

1. Products set in the current product's `mmp_shop.related` (a list of product references), if any, in that order.
2. Then the other open-store products in the same collection, in collection order, skipping the current one.
3. Only products whose rules pass for this image (`docs/shop.md` › Product rules).

**Layout:** a 2 × 2 grid on phones, one row of four on desktop. Under it, **See more gifts** (an outline button, full width on phones) adds the next four from the same list, drawn the same way, and moves focus to the first new card. When nothing is left, the button goes away; with four or fewer products there's no button. The number per step is `open_store.more_gifts_step` (default 4). Each tap is tracked as `store_more_gifts_shown`.

Each card shows the product drawn with their picture, its title and "From" price, and **See it**. Tapping it opens that product's page with the same picture already on it (no new generation, the session carries over), where they choose the variant and add to cart. Before a picture exists, How it works is shown in this place instead (26 Nov; it was "Also made from one photo" with the products' placeholders).

## Cart and checkout

- **One cart per visitor**, held in Shopify: the server creates it with the Storefront API (`cartCreate`, no buyer unless they're signed in) on the first Add to cart and keeps its id on the visitor row (`store_visitors.shopify_cart_id`). If Shopify has expired it, the next Add to cart starts a new one.
- **The drawer** shows each line's preview, title, variant, quantity (1 to `shop.cart_line_max_qty`), Shopify's line price and discount, **Remove**, the subtotal and "Shipping and tax at checkout", and **Checkout**, which goes to the cart's `checkoutUrl`.
- **Order lines** carry the keys in `docs/shop.md` › What goes on the order, with `_image_kind` = `generated`, `_shop_image_id` and `_shop_session_id` (the Imagen ids), `_image_url` (Imagen's public URL) and `_shop_theme` (the theme slug). The cart carries `_source` = `open_store` and `_open_store_visitor` (the visitor id). Never today's portrait keys.
- **Prices:** Shopify's own figures from the cart. Product cards and the product page show the compare-at price and, when `open_store.discount_code` is set, the price after it with `open_store.discount_label`. The code goes on every open-store cart. With no code, an automatic Shopify discount still applies at checkout.
- **Paid:** the existing `orders/paid` webhook matches `_source` = `open_store`, marks the generations ordered and links the visitor to the order's email (Visitors and sign-in).

## Limits, security and privacy

- **Visitor id:** as in Visitors and saved data. Every generation, picture, photo and cart call checks that the cookie (or the signed-in email linked to the visitor) owns what it touches.
- **Bot check** on `POST /api/store/generations` (Vercel BotID). Bots get a polite refusal and nothing reaches Imagen.
- **Limits:** `open_store.generations_per_visitor_per_day` (default 5), `open_store.generations_per_ip_per_day` (default 15), and a daily total across everyone, `open_store.generations_daily_cap` (default 1,500), after which the page says the studio is busy and shows placeholders. Settings › Shop › Magic Store shows today's count and Imagen's cost.
- **Uploads:** checked by content; HEIC converted on the server (or refused with "save it as JPEG" if conversion fails); saved as JPEG in `store-uploads` with location and camera data removed.
- **Consent line removed (26 Nov, the owner's call):** the line under the upload ("Use a photo you have the right to use. We keep your photo and picture so you can come back to them. Privacy policy") is gone from the product page. The privacy policy stays linked from the footer.
- **What Imagen keeps:** Imagen stores uploads under `user-uploads/` and results in the public `images` bucket, permanently. A data-deletion request needs a delete call on Imagen's side too (open question).
- **No personal data in tracking:** no photo, picture URL or name in PostHog, Klaviyo or logs; only the product, theme, status and our ids. Session replay masks the picture area and the upload.
- **Not indexed while hidden;** when on, product pages carry the product's SEO title and description and an Open Graph image of the placeholder (never a visitor's picture).

## Settings: one area for both stores

Decided 23 Nov: the same product can be in both the Store collection (the signed-in Gifts and Products pages) and the Magic Store collection. So there's **one Settings area, Settings › Shop, for everything about products and both stores**, rather than a separate Settings › Shop › Magic Store. Every page in it uses the same settings framework (the registry, `getSetting`, `getProductSetting`, the same form controls).

The SHOP group in the Settings menu:

| Page | Route | What's on it |
|---|---|---|
| **Products** | `/settings/shop` | One list of every product in either collection, each product once. Chips show where it's sold ("Gifts & Products", "Magic Store", or both) and, for each, whether it's shown or hidden and why. Filters: All · Gifts & Products · Magic Store · Hidden. Columns: picture, title, page and occasions, Magic Store theme |
| **One product** | `/settings/shop/products/<product id>` | Every field of that product, for both stores, on one page (below) |
| **Template editor** | `/settings/shop/template/<product id>` | As today; used by both stores |
| **Gifts & Products pages** | `/settings/shop/pages` | That store's own settings: who sees it (switches), discount codes and labels, the VIP tag, the occasion list. They move here from today's Settings › Shop page |
| **Magic Store** | `/settings/shop/magic-store` | That store's own settings: who sees it (switches), its collection (`open_store.collection`, default `magic-store`), the menu, the home collection, the discount, the reassurance rows, the product page's trust card and lower page (Product page: trust and the lower page: the three facts, the Trustpilot score, How it works, the customer photos, real reviews, the guarantees and the questions; 26 Nov), the limits, timings, photo sizes, the visitor cookie, the email ask, how many "On more gifts" products show per step (`open_store.more_gifts_step`), and the store defaults for every product field. **Imagen themes**: only those in Imagen's category `open_store.theme_category` (default `magicshop`, Imagen's "Magic Shop" category, matched without case, spaces or dashes; empty lists them all), plus any theme a product already uses; the same filter applies to the theme dropdown on each product and to Shopify's dropdown (26 Nov). It only shortens the lists: a product's theme outside the category keeps working. **Refresh themes from Imagen**. The numbers (Settings › Shop › Magic Store numbers, below) and the PostHog dashboard link |
| **Photo library**, **AI room photos** | as today | Unchanged |

**The Products page is grouped** (26 Nov). It opens on one card per Shopify collection whose handle starts with `open_store.admin_group_prefix` (default `magic`). The Magic Store collection itself and empty collections are left out, and the card shows the title after "Magic Store · ". Each card shows how many products, hidden and warnings it has. Clicking one (`?group=<handle>`) lists its products in the collection's order, with the same filters. A product in two collections is in both groups. Products in none are under **Not in a group**, and **All products** (`?group=all`, or any `?filter=`) is the full list as before.

**One product page** (re-laid out 26 Nov: a header, then tabs):

1. **Header:**
   - **Status** for each store (Gifts & Products pages, Magic Store): SHOWN, HIDDEN with the reasons, RELATED ONLY, or NOT IN COLLECTION. It uses the same checks the pages use. Collection membership is changed in Shopify, not here, because collections aren't an allowed write.
   - Warnings, such as the name being asked for twice.
   - **Open template editor** (the main button, with whether a template is set) and **Open in Shopify**.
   - **Copy settings from…**, folded until opened.
2. **Tabs.** The open tab is kept in the address as `?tab=magic|pages|print`, so links open the right one. Every tab stays mounted, so unsaved edits survive switching. On phones, the middle tab reads "Gifts & Products".
   - **Magic Store** (opens first for products in the Magic Store):
     - theme (a dropdown of Imagen's themes, with how many photos each takes);
     - picture settings: photo and name labels, "Ask for the pet's name", name length, photo tips, step labels, results to show;
     - more gifts (a picker of Magic Store products), related only, size and materials;
     - per variant: badge and making time;
     - the **short description**, noted as also shown on the Gifts & Products pages.

     An empty field shows the store default in grey (Product settings use the store's settings framework, above).
   - **Gifts & Products pages** (opens first otherwise): page, occasions, categories. The short description is here when the product isn't in the Magic Store.
   - **Print rules:** each variant's print rules (maker, print area, picture zone, placement, smallest image, most it may crop, can adjust, which pictures, background, extra), shared by both stores. Below them is the **Dreamship** card for Dreamship products. Links from Settings › Printers open this tab at the card.

A tab for a store the product isn't in says so: "Not in the Magic Store collection. Add it in Shopify to sell it there." (or the same for Store). Saving writes only the fields that changed, through `metafieldsSet` (`CLAUDE.md`, allowed write 5), and records `admin_shop_product_updated` with the field names.

## Analytics and PostHog

The store reports into the same PostHog project as the main site and the rest of this app (`docs/analytics.md`: project 540098, US cloud, `/ingest` proxy, `track()` as the only way to send an event). The full event list with properties is in `docs/analytics.md` › Open store; this section says what it's for and how it's set up.

### What it has to answer

1. **Conversion at each step:** of the people who land, how many open a product, add a photo, get a picture, add to cart, start checkout and pay?
2. **Products and themes:** which products and themes get pictures made, and which pictures people actually buy?
3. **Picture health and cost:** how long pictures take, how often they fail and why, and what Imagen costs per picture and per paid order.
4. **Channels:** where visitors come from (the store emails, ads, the main site, direct), and the pictures, orders and revenue per channel.
5. **More gifts:** how often "On more gifts" adds a second product, and what it does to the order value.
6. **The email ask:** how many give an email while painting, how many tick for offers, and how many of those come back and buy.
7. **Coming back:** how many visitors return, and how many orders come on a later visit.

### Identity

- **Anonymous visitors** keep PostHog's own anonymous id, shared with magicportraits.ai through the cross-subdomain cookie, so a visitor who arrives from the main site keeps their history. The visitor id is set once as the person property `store_visitor_id` and sent on every store event.
- **Server events** (pictures, cart, orders) use the PostHog id the browser sends with each store API call. It's kept on the visitor row (`store_visitors.posthog_distinct_id`), so `orders/paid`, which has no browser, can still credit the right person.
- **Proven email** (sign-in, the email's link, or a paid order): the browser calls `identify(email)` on sign-in, as today. For a paid order the server aliases the visitor's PostHog id to the order's email, so the whole journey from first visit to order sits on one person.
- **An email typed while painting is never used to identify anyone**, because it isn't proven. It sets only the person property `store_email_given: true`.
- **Person properties:** `store_visitor_id`, `store_first_seen_at` (set once), `store_first_touch_source` (set once), `store_pictures_made` (increment), `store_orders` (increment), `store_email_given`, `store_marketing_consent`.
- **Super properties on every store event:** `app: "vault"`, `area: "open_store"`, `signed_in`, `returning`, `preview`, and the `utm_*` of the visit.

### First touch

Each visitor's first touch is saved on their row as `store_visitors.first_touch` (jsonb): `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, the referrer's host (never its full address), the landing path, and the time. It goes on `store_order_paid` as `first_touch_source`. Settings › Shop › Magic Store can then show orders and revenue by channel from our own tables, without PostHog. The store emails and ads use UTM tags on every link: `utm_source=klaviyo`, `utm_campaign=<email name>`.

### Where each event goes

| Destination | What |
|---|---|
| PostHog | Every store event |
| `activity_log` | The "business" events. Until the visitor has a proven email, rows have `email` null, `ref_type` = `store_visitor` and `ref_id` = the visitor id. The customer timeline in Settings shows them under an email through `store_visitors.email`, so rows are never rewritten |
| Klaviyo | `Store Picture Ready` for visitors who ticked for offers (Asking for their email while we paint). `store_added_to_cart` and `store_checkout_started` only once they're in `klaviyo.events` and the visitor has a proven email or ticked for offers, for abandoned-picture and abandoned-cart flows later |

### PostHog dashboard: "Magic Store"

1. **Main funnel** (per person, 7-day window): `page_view_store_product` → `store_photo_chosen` (ok) → `store_generation_started` → `store_generation_ready` → `store_added_to_cart` → `store_checkout_started` → `store_order_paid`. Break down by product, `theme_slug`, first-touch `utm_source` and device type. A second version starts at `page_view_store` to see grid-to-product clicks.
2. **Picture health:** generations started, ready and failed per day; failure reasons; p50 and p95 `seconds`; how many leave while painting (`store_generation_left`); Imagen cost per day.
3. **Money:**
   - Imagen cost per paid order: the sum of `cost_usd`, divided by `store_order_paid`.
   - Pictures made per order.
   - Revenue per visitor.
   - Average order value.
   - Share of orders with a second product added from "On more gifts" (`from: related`).
4. **Channels:** visitors, picture rate, paid rate and revenue by first-touch `utm_source` and `utm_campaign`.
5. **Products and themes:**
   - Grid click rate by position.
   - Picture rate by product: pictures started per product page view.
   - Buy rate by theme: added to cart per picture ready, which shows which themes people like enough to buy.
6. **Email ask:** shown → given → ticked for offers. Then emailed → link opened → paid within 30 days.
7. **Coming back:** share of orders on a second or later visit; time from first picture to order.
8. **Replay playlists:**
   - sessions with `store_generation_failed`;
   - sessions with `store_generation_ready` but no `store_added_to_cart`;
   - `$rageclick` on product pages;
   - phone sessions that leave while painting.
9. **Web vitals** for `/store` pages, especially LCP on product pages, which have large pictures.

The dashboard is set up in PostHog by hand at the end of Open store 5; its link goes in Settings › Shop › Magic Store.

### Experiments (PostHog feature flags)

The store's settings stay the defaults; a flag only overrides them for its test group. Each test reports **paid orders per visitor who started a picture**, with Imagen cost per order as the guardrail.

- **Email ask:** on vs off. Does asking while painting change orders?
- **Button wording:** "Generate" (since 26 Nov) vs "See it on your pillow".
- **Results:** one picture vs "Pick your favourite" of up to four. More choice, but more cost.
- **More gifts:** with their picture vs the products' sample pictures.

### Privacy in analytics

- **Never in an event, person property or log:** the photo, the picture or its URL, the pet's name, or an email address (typed or proven). Send `has_name`, `photos`, `marketing_consent` instead.
- **Session replay:** masks every input (name and email). The photo slots, the Change photo sheet, the picture area, the circle with their photo, the cart and order previews, and the "On more gifts" pictures carry `ph-no-capture`. Product sample pictures may show.
- **Addresses:** `before_send` drops query strings on `/store` pages except `utm_*` and `variant`, and the path token on `/g/`.
- **Bots:** requests Vercel BotID flags as bots send no server events.
- **Super users:** preview sessions carry `preview: true` and sit in the test-account cohort, so they never count.

### Settings › Shop › Magic Store numbers

Today, 7 days and 30 days, from our own tables and Shopify orders with `_source` = `open_store`, so they don't depend on PostHog:
- visitors;
- pictures started, ready and failed, with median seconds;
- Imagen cost;
- emails given, and the share who ticked for offers;
- carts, paid orders and revenue;
- cost per order.

Each by product, theme and first-touch channel, with a link to the PostHog dashboard.

## Routes

| Address | Screen |
|---|---|
| `/store`, `/store/c/<collection handle>` (`?type=`, `?sort=`) | Store page |
| `/store/product/<product id>` (`?variant=<variant id>`) | Product page, with its creating and ready states. The ids are Shopify's numeric ids |
| `POST /api/store/generations`, `GET /api/store/generations/<id>` | Create a picture, ask how it's going |
| `GET /api/store/files/<photo or picture id>` | A visitor's photo, picture or preview, after the ownership check |
| `POST /api/store/cart/lines`, `PATCH`/`DELETE /api/store/cart/lines/<id>`, `GET /api/store/cart` | The guest cart |
| `POST /api/store/email` | The optional email given while painting |
| `/settings/shop/magic-store`, `/settings/shop/products/<product id>` | Settings › Shop › Magic Store, and one product for both stores |

Product pages sit under `/store/` rather than at `/product/<id>` so that one switch hides the whole store, and so they don't sit next to the signed-in shop's `/products`.

## Changes to `CLAUDE.md` (approved and made 23 Nov)

1. **Imagen:** "Never write to Imagen" becomes "Never write to Imagen's database; the open store creates sessions only through Imagen's public API with its own key".
2. **Shop carts:** the fourth allowed write adds "or an anonymous visitor's cart, held by a cookie".
3. **Security:** "Every customer action re-checks that the signed-in email owns the thing" gains "or, in the open store, that the visitor cookie owns it".
4. **Data:** the exceptions to "never copy orders, products or portraits into our database" gain "and the open store's visitors, photos and pictures (`docs/open-store.md`)".
5. **Klaviyo:** the second allowed write ("Klaviyo events, profile properties and deletion jobs") gains "and a marketing subscription that a store visitor ticked for". The "This app sends no offer emails" rule stays: the "Your picture is ready" email is the one the visitor asked for, sent at once through AgentMail.

## Build parts

| Part | What | Done when |
|---|---|---|
| Open store 1: catalogue | Admin API reads, as the shop's (the Magic Store collection, the menu, collections, products, variants, metafields, policies), behind `lib/open-store/sources/` with fixtures; the open-store check; product fields in the settings registry with `getProductSetting`; Settings › Shop as one area: the Products list for both collections, one product page for both stores, today's shop settings moved to Gifts & Products pages, and the new Magic Store page | A super user sees every product once with where it's sold and why it's hidden in each store, sets a product's shop and Magic Store fields on one page, and the Gifts and Products pages behave exactly as before |
| Open store 2: store and product pages | Store page, product page before a picture (gallery, variants, delivery estimate, details, related with placeholders), cart icon | e2e at 390 × 844 and 1280 × 800, axe clean |
| Open store 3: pictures | `lib/sources/imagen-api.ts` (live and fixtures), the visitor cookie and `store_visitors`, `store_photos`, `store_generations`, the `store-uploads` bucket and its file route, upload checks, bot check, limits, the creating and ready states, several photo slots, drawing on the template, result strip, related products with the picture, restore on return | Fixtures cover ready, slow, failed, timed out, limited and a two-photo theme; golden images of the pillow with a square and a 3:4 result; another visitor's cookie gets 404 on every file |
| Open store 4: cart, checkout, sign-in and email | Guest Shopify cart on the visitor row, drawer, order-line keys, discount code, `orders/paid` linking the visitor, linking on sign-in, pictures on another device, the email ask while painting, the "Your picture is ready" email, the Klaviyo subscription through the outbox | A fixture checkout produces exactly the order-line keys; signing in on a second browser shows the first browser's pictures; the email's link opens the picture in a fresh browser |
| Open store 5: analytics and docs | Every event in `docs/analytics.md` › Open store with its properties; identity (PostHog id on the visitor row, alias on paid orders); first touch; the replay masks; the "Magic Store" dashboard, funnels and playlists in PostHog; the Settings numbers; `docs/schema.md`, `docs/data.md` | Each event checked in PostHog Live events with a test visitor; a test order shows the whole journey on one person; replays show no photo, picture, name or email; the `track()` wrapper rejects an unknown store event in tests |

Needed from people: Imagen's API docs (the key is in Vercel); the Shopify navigation menu and category collections (the Magic Store collection and the product fields exist since 23 Nov); each product's theme; the Storefront token's sales channel publishing the products, for carts.

## Running the build

Like the rest of the app (`BUILD.md` › The prompt): start a Claude Code cloud session on this repo in the `magic-vault` environment, on the branch `claude/shop`, and paste:

> Read `CLAUDE.md`, then `docs/open-store.md` (the source of truth for this build), `SPEC.md` §23, `docs/shop.md`, `docs/analytics.md`, `docs/schema.md`, `docs/design.md` and `designs/README.md` › Magic Store. The mockups are the "Open store mockups" design canvas, https://claude.ai/artifact/8U6PKdW5mnnn64Zq5UA4CH (read it with the Artifact tool); copies of its boards are in `designs/screens/open-store/`. Build the open store through Open store 1–5 of `docs/open-store.md` › Build parts, in order, on a new branch `claude/open-store` made from `claude/shop`.
>
> - For each part: build it, write its tests, run `pnpm typecheck && pnpm lint && pnpm test` (and the e2e suite at 390 and 1280 when it adds screens), fix until green, commit `feat(open-store-N): <name>`, push, and update `BUILD_LOG.md` under "Open store".
> - After Open store 1, open a draft pull request into `claude/shop` and keep pushing to it. Don't merge anything.
> - Keep `open_store.enabled` and `open_store.super_user_preview` off. With them off, every existing screen and test must stay as it is, including the Gifts and Products pages after Settings › Shop is reorganised.
> - Don't stop to ask questions. Shopify and Imagen run on fixtures (`DATA_SOURCE=fixtures`). Don't call Imagen's live API, send email, or write to Shopify or Klaviyo from this session. If something is missing or unclear, take the most reasonable reading, write it in `BUILD_LOG.md` under "Blocked" or "Decisions", and carry on.
> - Tests and e2e run against the local Supabase stack. The live project (`magic-vault`) only gets the new migrations, through `scripts/db-apply-remote.ts`; never test data.
> - If `BUILD_LOG.md` already has an "Open store" section, you are resuming: read it and continue from the first unfinished part.

When it's done: open the pull request's Vercel preview, sign in as a super user, turn on **Magic Store preview** in Settings › Shop › Magic Store, set a theme on a product, and try the store at `/store`. On the preview, pictures come from the live Imagen API with the key in Vercel.

## Open questions

Answered 23 Nov:

- [x] **Imagen API.** This app has its own key (issued 23 Nov, kept in Vercel only). Confirmed: the endpoint, Bearer auth, and the `theme_id`, `name` and `source_image` fields (Imagen API, above). Confirmed 24 Nov from its code: how extra photos are sent and where a theme says how many it takes. Still to learn from real use: average time and cost, and whether it moderates uploads. None of this blocks the build, which runs on fixtures.
- [x] **Saving visitors' data.** Each visitor gets an id; photos and pictures are saved against it in `magic-vault` (Visitors and saved data).
- [x] **One theme per product.** Art styles are Imagen themes, and each product has one.
- [x] **Where it lives.** `/store`, with each product at `/store/product/<product id>`.

Still open (none blocks the build):

- [x] **Keeping unbought pictures.** Kept, for future marketing (Keeping and deleting).
- [x] **Asking for the email.** An optional email box while painting (Asking for their email while we paint). A Klaviyo sign-up form can come later.
- [ ] **Main site and emails.** The store needs its own set of emails (written later in Klaviyo). Still to decide: how the main site links to `/store`, and whether Store 1–3 move from `/products` to `/store`.
- [ ] **Klaviyo sign-up form (later).** Klaviyo's own form on store pages needs Klaviyo's public key in the browser, which `CLAUDE.md` doesn't allow today.
- [ ] **Imagen's copy on deletion requests.** Can Imagen delete a session when someone asks us to delete their data?
- [ ] **Discount.** A code on every open-store cart (`open_store.discount_code`), or Shopify automatic discounts only?
- [ ] **Reviews.** Which app writes the `reviews.rating` metafields? Without one, no stars show.
- [ ] **Signed-in customers.** Should the product page also offer the photos behind their existing portraits, so they don't upload again?
- [ ] **My portraits after buying.** Show bought store pictures in My portraits for the linked email? Recommended: yes, as their own group, read from `store_generations` alongside Imagen.
- [ ] **Free card offer.** Should an open-store order unlock the free greeting card like other paid orders (`gift.unlock_rule`)?
