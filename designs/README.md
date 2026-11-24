# Screen designs

These are the approved mockups. File names still say "Vault" (the internal code name); everything customers see says My Magic Portraits and greeting cards (`SPEC.md` D5, D6). `screens/*.dc.html` are design files, not app code: read them for layout, copy, spacing and states, then build the real screens in React/Tailwind. `screenshots/<Screen>.png` shows each one rendered. Sample names, emails and numbers in the mockups are placeholders.

| Design | What it is | Route in the app |
|---|---|---|
| **Ways in** | | |
| `Main` | Free gift offer email after an order (390 px) | Not built in this app. The design to copy when the Klaviyo offer flow is written later |
| `GiftSheet` | Thank-you page bottom sheet | Snippet for the Shopify thank-you page (outside this repo); links to `/g/[token]` |
| `SignIn` | Create a card: email, then 6-digit code | `/signin` (props `purpose=gift|redeem`) |
| `RedeemEntry` | Old /redeem link: sign in with the order's email | `/redeem` → `/signin?purpose=redeem&order=…` |
| `VaultHome` | My Magic Portraits home after the first card | `/` |
| `Menu` | Site menu with the MY MAGIC PORTRAITS group | `MenuSheet` component |
| `Account` | Account menu from the initials | `AccountMenu` component |
| `VaultPortraits` | All portraits, ordered or not | `/portraits` |
| `VaultGuest` | Home for a creator with no order | `/` (creator state) |
| **First time (no cards yet)** | | |
| `FirstHome` | Home before the first card: one big "Make my card" | `/` (first-time state) |
| `FirstCard` | First card on one screen: the card is already made, they add a name | `/create` (first-time state) |
| **Card builder** | | |
| `M1Theme` | Step 1, themes grouped by occasion | `/create` (`?category=`) |
| `M2Portrait` | Step 2, portrait | `/create/portrait` |
| `M3Message` | Step 3, message and delivery | `/create/message` |
| `M4Creating` | Rendering | `/create/creating/[cardId]` |
| `M5Ready` | Ready: share, download, email | `/cards/[publicId]` (ready state) |
| **After sending** | | |
| `MyCards` | My cards | `/cards` |
| `RecipientEmail` | What the recipient receives | React Email template `card-delivery`; public page `/c/[slug]` |
| `CardPreview` | Card component with 10 sample looks | `CardPreview` component and seed themes |
| `DesktopVault` | The builder at desktop width | Same routes at ≥ 1024 px |
| **Redeem** | | |
| `Orders` | Orders, downloads & mugs | `/orders` |
| `OrderDetail` | Choose the mug photo, plus downloads | `/orders/[orderName]` |
| **Settings (super users)** | | |
| `Settings` | General & variables | `/settings` |
| `AdminInsights` | Dashboard | `/settings/insights` |
| `AdminCustomer` | Customer activity timeline | `/settings/customers`, `/settings/customers/[id]` (opaque id, never the email) |
| `AdminCards` | All cards | `/settings/cards` (`?card=`) |
| `AdminThemes` | Theme library | `/settings/themes` |
| `AdminTemplate` | Template editor | `/settings/themes/[themeId]/versions/[versionId]` |
| — | Downloads & mugs, Emails, Tracking, Data sources, Super users, Activity log | `/settings/redeem`, `/settings/emails`, `/settings/tracking`, `/settings/data-sources`, `/settings/super-users`, `/settings/activity`. These have no mockup; build them in the `Settings` style. |
| **System** | | |
| `Blueprint` | Flow, data model, rules | — (reference) |
| `ThemeSpec` | Artwork spec for designers | — (reference; also show it as help text in the template editor) |
| `ThemePack` (screenshot only) | The 12 finished theme versions (New Year, Christmas, Birthday; 2 general + 2 pet each) | Files in `assets/themes/`, loaded by Settings › Theme library › Import theme pack |

## Magic Store (open store, `docs/open-store.md`)

The approved mockups are the "Open store mockups" design canvas, https://claude.ai/artifact/8U6PKdW5mnnn64Zq5UA4CH (read it with the Artifact tool; its pictures are in the canvas's asset store). Copies of its boards are in `screens/open-store/`; their `/_blob/…` pictures only load inside the canvas. Sample data: Teddy stands in for a visitor's pet; prices are the Store collection's with 60% off; sizes, theme names and review placeholders are illustrations.

| Design | What it is | Route in the app |
|---|---|---|
| `store-page` | Store page on a phone: promo bar, category circles, Bestsellers, filter and sort, 2-column grid | `/store`, `/store/c/[collection]` |
| `product-start` | Product page before a photo: sample picture, sizes, Add their photo, name, Create their picture, shopping info, details, Also made from one photo | `/store/product/[productId]` |
| `product-creating` | Creating: their photo in a spinning ring, three steps, progress, the optional email box | `/store/product/[productId]` (creating state) |
| `product-ready` | Ready: their picture on the product, "Teddy is ready", Add to cart, How it works, Teddy on more gifts, reviews placeholder | `/store/product/[productId]` (ready state) |
| `cart` | Cart drawer: line with their picture, more gifts, subtotal, Check out | Cart drawer on every store page |
| `store-desktop` | Store page at 1280 px: 4-column grid | `/store` (≥ 1024 px) |
| `product-desktop` | Product page, ready, at 1280 px: gallery left, buy box right, more gifts in 3 columns | `/store/product/[productId]` (≥ 1024 px) |
