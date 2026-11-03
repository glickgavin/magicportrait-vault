# My Magic Portraits: product and build spec

**Version:** 3 November 2026 · **Owner:** Gavin Glick · **Repo:** `glickgavin/magicportrait-vault` · **Lives at:** `my.magicportraits.ai`

This is the master spec. It covers every decision made so far, every screen and rule, and what is still open. The detailed references sit beside it:

| File | What it holds |
|---|---|
| `docs/data.md` | Exact tables, columns, SQL and GraphQL for Shopify, Imagen and the events mirror; the live /redeem rules, ported line by line; constants |
| `docs/schema.md` | The app's own database tables, storage buckets, card layout JSON, seed data |
| `docs/analytics.md` | Every PostHog event and property; the activity log |
| `docs/design.md` | Brand tokens, header, menu, footer, shared components |
| `designs/` | The approved mockups (`screens/`) and a PNG of each (`screenshots/`) |
| `reference/live-site/` | The live site's header, menu, footer and tokens, copied from its code |
| `BUILD.md` | Set-up checklist, the one build prompt for Claude Code, and the launch steps |
| `CLAUDE.md` | Standing rules Claude Code follows while building |

Where this spec and a detail file disagree, this spec wins. Fix the detail file when you notice.

---

## 1. Summary

**My Magic Portraits** is a new signed-in area for Magic Portraits customers. It's the start of a customer portal. Version 1 does four things:

1. **Greeting cards.** Customers put their own portrait on a greeting card (Christmas, birthday, New Year and more), add a message, and we email it or they share it. It's a free gift with an order, and they can make as many as they like. It's the first digital gift; more will follow.
2. **My portraits.** Every portrait the person ever generated, ordered or not, with a way to order the ones they haven't.
3. **Orders, downloads and mugs.** A rebuild of the live site's `/redeem`: choose the free mug photo and download hi-res files, with the live site's security problems fixed.
4. **Settings, for super users.** Insights, every card ever made, a timeline of each customer, the theme library, and all master data and variables, so nothing is hard-coded.

People are identified by **email**. Shopify and Imagen stay the sources of truth. The app reads them live and stores only what is new: cards, themes, settings and the activity log.

## 2. Decisions so far

| # | Decision |
|---|---|
| D1 | A new app in a new GitHub repo, hosted on Vercel (team Storyboards), with its own new Supabase project. It is not built inside Lovable. |
| D2 | Address: `my.magicportraits.ai`, a subdomain, because the main site is run by an outside team. DNS is on Cloudflare. |
| D3 | It looks like part of magicportraits.ai: the same header, menu, footer, fonts, colours and buttons. |
| D4 | Mobile first. The desktop layout is the same flow, scaled up. |
| D5 | Customer-facing name: **My Magic Portraits**. "Vault" is only the internal code name (repo, some table and setting names, `vault_` events). |
| D6 | The product is a **greeting card** ("card" in buttons and labels). It is not a gift card: gift cards hold money, and Shopify and the VIP Portal already use "gift". The **free gift** is the offer that unlocks cards. |
| D7 | Opening My Magic Portraits and creating a card are one flow. The main call to action everywhere is **Create a card**. |
| D8 | Themes are grouped into four categories: Holidays, New Year, Birthdays, General. Each theme has versions; a version is one card design. |
| D9 | Theme artwork is a background JPEG (or PNG) at 1500 × 2100, an optional transparent overlay PNG, and a layout set in Settings. The system adds the portrait and the text. |
| D10 | Data comes from the existing Shopify app **r_orders**, Imagen (`imagegen-prod`) and the events mirror (`shopify-dailyreport.analytics_events_mirror`). No new third-party connections apart from email sending. |
| D11 | People who made portraits but never ordered can also sign in. They see their portraits, and cards are shown locked until their first order. |
| D12 | The live `/redeem` (free mug choice and downloads) moves in, matching its behaviour exactly, with its security problems fixed. |
| D13 | Super users: gavin@storyboards.io and gideon@storyboards.io. More can be added in Settings. |
| D14 | Settings holds master data and variables, so nothing a super user might change is hard-coded. Secrets stay in Vercel. |
| D15 | A circle with the person's initials shows they are signed in. It opens the account menu with Sign out. |
| D16 | Analytics has two layers: PostHog (clicks, funnels, replays), plus our own `activity_log` table, which is permanent and powers Settings › Insights. |
| D17 | Every card is kept forever. Super users can see all of them. A card is only removed on the customer's data-deletion request. |
| D18 | The whole app is built in one Claude Code run, in ordered parts with a commit after each (`BUILD.md`). |
| D19 | Email sending: **Resend** (proposed; confirm in §20). |

## 3. Words we use

| Word | Meaning |
|---|---|
| **My Magic Portraits** | The signed-in area at `my.magicportraits.ai`. Internal code name "vault". |
| **Greeting card / card** | A JPEG made from a theme version, one portrait and a message. |
| **Free gift** | The offer after an order: "Your free gift: a greeting card with your portrait." |
| **Theme / version** | A theme (Christmas) has versions (Snowfall, Classic star). Customers pick a version. |
| **Customer** | Has at least one paid Shopify order on their email. |
| **Creator** | Has made portraits in Imagen but has no order. |
| **Super user** | Can open Settings. |
| **Session** | One Imagen portrait session: a set of portraits from one photo and one theme. |
| **Ordered** | A portrait that appears in a Shopify order (rule in `docs/data.md` §1). |

## 4. Scope

**In version 1**
- Sign-in with a 6-digit email code, and a signed one-tap link from emails.
- Home, My portraits, My cards, account menu, site menu.
- The card builder (theme, portrait, message, ready) and server-side JPEG rendering.
- Card delivery: email (now or scheduled), download, copy link, share. A public card page.
- Orders, downloads and mugs (the rebuilt /redeem). Old /redeem links still work.
- The free gift offer: email after an order, a thank-you-page pop-up link, and an optional seasonal reminder (off by default).
- Settings: Insights (dashboard, customers, all cards), general and variables, theme library, template editor, redeem rules, emails, tracking, data sources, super users, activity log.
- PostHog across every page, plus our own activity log.
- Data export and deletion on request.

**Not in version 1** (designed so they can be added without a rebuild)
- Charging for cards. A `cards.price` setting exists; only "free" is built.
- Other digital gifts. The home page has a "More digital gifts coming" slot.
- Languages other than English. All copy goes through `t()`.
- Merging the VIP Portal (store credit, membership) into My Magic Portraits.
- Printed or physical cards.

## 5. People and access

| Person | How they're found | What they see |
|---|---|---|
| **Customer** | Shopify orders by email (r_orders) | Everything. Cards are unlocked. |
| **Creator** | email → events mirror → Imagen session ids | Home and all their portraits. Cards are locked, with the first-order offer (`cards.who_can_create`). |
| **Nobody found** | No orders and no sessions | A kind empty state: "We couldn't find portraits on this email", with "Try another email" and "Create a portrait". |
| **Super user** | Email in `super_users` | Everything above, plus Settings. |
| **Card recipient** | Not signed in | Only the public card page `/c/[slug]`. |

## 6. How it fits together

```
 Customer's phone ──► my.magicportraits.ai  (Next.js on Vercel)
                         │
                         ├── Supabase "magic-vault" (new): auth, cards, themes, settings,
                         │       activity_log, storage (theme art, portrait copies, card JPEGs)
                         │
                         ├── reads, live and server-side only:
                         │     • Shopify Admin API (r_orders token): orders by email, mug metafield
                         │     • imagegen-prod (read-only role): sessions, images, ordered flag, themes
                         │     • shopify-dailyreport (read-only role): email → Imagen sessions; mug print status
                         │
                         ├── writes outside its own database (only these):
                         │     • Shopify order: mug choice metafield + "mug:ready" tag
                         │
                         ├── sends: Resend (sign-in codes, offer emails, card emails)
                         └── tracks: PostHog project 540098 (same as the main site), via /ingest

 Shopify ──orders/paid webhook──► /api/webhooks/shopify/orders-paid ──► free gift offer email
 Resend  ──delivery webhooks────► /api/webhooks/resend ──► card status, bounces, opens
 Vercel Cron ──► scheduled cards, offer emails, reminders
```

How a person's portraits are found: email → `analytics_events_mirror` (`properties->>'imagegen_session_id'`, available from 12 May 2026) → Imagen sessions and images → ordered when the image is in `revenue_events` or appears in one of their Shopify orders. The exact SQL is in `docs/data.md` §2–3.

## 7. Sign-in and the account menu

- **6-digit code.** Supabase Auth email OTP, sent from our domain via Resend. The sign-in screen (`SignIn`) has two steps: email, then code. It has "Resend code" and "Change email".
- **One-tap link.** The offer email and the thank-you pop-up carry `/g/[token]`. The token is HMAC-signed, holds the email and the Shopify order id, and expires after `gift.link_valid_days` (`0` = never). Opening it signs the person in (server-side magic-link exchange) and goes straight to the card builder.
- **Old redeem links.** `/redeem?…` lands on `RedeemEntry`: the sign-in screen worded for an order. After sign-in it opens that order. If the order is on another email it says so and offers "Switch account". It never says whose email the order is on.
- **Initials circle.** In the header, left of the bag, on every page. Initials come from the Shopify customer's first and last name, or else the first two letters of the email. When signed out, the same spot shows a person icon labelled "Sign in".
- **Account menu** (`Account`), opened from the circle: name and email, then My cards, My portraits, Orders/downloads & mugs, Settings (super users only, with a "Super user" tag), and Sign out.
- **Sign out** clears the session and calls `posthog.reset()`.

## 8. Greeting cards

### 8.1 Three ways in, one flow
| Way in | Screen | Goes to |
|---|---|---|
| Free gift email after an order | `Main` | `/g/[token]`, then builder step 1 |
| Thank-you page pop-up | `GiftSheet` | `/g/[token]`, then step 1. "Later, email me the link" sends the offer email now. |
| Site menu, home, My cards, order page | `Menu`, `VaultHome`, `MyCards`, `OrderDetail` | `/create` (signs in first if needed) |

### 8.2 Builder steps
Steps are mobile first; the desktop step bar reads Theme · Portrait · Message · Ready (`DesktopVault`).

1. **Theme** (`M1Theme`).
   - Tabs: All · Holidays · New Year · Birthdays · General, each with a count.
   - "All" shows one horizontal row per category, with an "In season" tag and "See all". A category tab shows a 2-column grid.
   - Each tile is one version (e.g. Christmas · Snowfall), with a "New" badge when set.
   - Shown: only live versions of live themes inside their date window.
   - In season: a category is in season when one of its live themes starts within `themes.in_season_days_before` days, or is already inside its window. In-season categories sort first.
2. **Portrait** (`M2Portrait`).
   - Every portrait the person made, grouped by session, newest first, with an ORDERED badge on ordered ones.
   - Tap to pick; optional zoom and move inside the photo zone.
3. **Message** (`M3Message`).
   - Fields: To, From (prefilled with the first name), Message (counter; max `cards.message_max_chars` or the version's own max).
   - Idea chips from the version, and a live preview.
   - "How should it reach them?": **Email it for me** (their email; When: Send now or Pick a date) or **I'll share it**.
   - Button: **Create my card**.
4. **Creating** (`M4Creating`).
   - The server renders the JPEG while three progress lines show.
   - On failure: "Try again", and the error is logged.
5. **Ready** (`M5Ready`).
   - The card with Share (native share sheet), Download, Copy link, and WhatsApp, Messages, Facebook and Instagram buttons. Instagram uses the share sheet, or download plus a tip.
   - Shows "Emailed to …" or "Sends 31 Dec, 18:00".
   - Then "Make another card" and "Go to My cards".

### 8.3 Rules
- `cards.enabled` off → the builder says "Cards are paused" and every entry point is hidden.
- `cards.who_can_create`: `customers_with_order` (default) or `everyone_with_portrait`.
- `cards.per_customer`: `unlimited` (default) or a number per month. Over the limit, say when the next one is available.
- `cards.price`: `free` only in v1.
- The chosen portrait is **copied** into our storage when the card is made, so old cards never break.
- **Every card is kept forever** (D17).
- The card shows a small footer line, `cards.footer_text` (default "Made with Magic Portraits AI").
- Scheduled cards go out within 5 minutes of their time. Until then the sender can change or cancel them.

### 8.4 Card rendering
- Size: `cards.size_px` (1500 × 2100), JPEG at `cards.jpeg_quality` (90).
- Layers: background, then the portrait clipped to the photo zone's shape, then the overlay, then the text zones (`docs/schema.md` § Layout JSON).
- Text shrinks before it wraps and never overflows its box.
- The live preview and the server render share one layout module, so what you see is what you get.

## 9. After creating

- **My cards** (`MyCards`).
  - Every card the person made, newest first, with status: Emailed · Opened <date> · Scheduled <date> · Shared · Downloaded · Failed.
  - Actions: Share, Download, **Use again** (same theme, portrait and message, blank recipient), Resend (emailed cards), **Change or Cancel** (scheduled cards; not in the mockup, add a "…" menu).
- **What the recipient gets** (`RecipientEmail`).
  - From "<Sender> via Magic Portraits"; subject "<Sender> sent you a <theme> card".
  - The card, "Save the card" and "Open full size" (both open `/c/[slug]`).
  - A "Love the portrait? Try Magic Portraits" block, with a link carrying `utm_source=greetingcard&utm_medium=referral&utm_campaign=<theme_slug>&card=<public_id>`.
  - Footer: "Don't email me cards", which blocks future card emails to that address.
- **Public card page** `/c/[slug]`.
  - The card full size, Save image, and the same "Try Magic Portraits" block.
  - If a super user has hidden the link: "This card is no longer available".
  - No sign-in, `noindex`.

## 10. My portraits (`VaultPortraits`, `VaultGuest`)

- Summary ("3 sessions · 18 portraits · 3 ordered") and a filter: All · Ordered · Not ordered.
- Grouped by session: theme name, pet name if known, date, and the order number if ordered.
- Each group has:
  - "Order as wall art" (not ordered) or "Order more" (ordered), which deep-links to the main site's order page for that session (`docs/data.md` §6.10)
  - "Make a card".
- "Create a new portrait" links to `links.start_portrait_url`.
- **Creators without an order** see their latest session, "All my portraits", the locked cards block ("Free gift with your first order · Unlock greeting cards") and the first-order offer (`vault.first_order_offer`).
- Portraits made before 12 May 2026 may be missing (the mirror starts then). Say so in a small note when nothing older is found.

## 11. Orders, downloads and mugs (the rebuilt /redeem)

Behaviour matches the live `/redeem`; the exact rules are in `docs/data.md` §4 and §6.

- **Orders** (`Orders`).
  - Every Shopify order on the email, newest first, with status chips: "Free mug · choose photo", "N downloads ready", "Mug printed", and the fulfilment status.
  - A gradient banner when any order still needs a mug photo.
  - "Missing an order? It may be on another email. Switch account".
- **Order detail** (`OrderDetail`).
  - **Your free mug.** Shown when the order includes the free mug.
    - Pick one of the order's portraits and save. Saving writes `custom.mug_choice` and the `mug:ready` tag exactly as live.
    - It locks once printing starts. The lock is read from the mug print pipeline (`mug_fulfillment_jobs`, `docs/data.md` §6.6). Locked text: "Your mug is being printed with this photo".
  - **Your downloads.** Shown when downloads are enabled for the order: one row per portrait, plus "Download all (.zip)". Live's file names are kept.
  - Then a "Create a greeting card" call to action.
- **Fixed compared with live:**
  - Every action re-checks on the server that the signed-in email owns the order and that the action is allowed: mug present and not locked, not cancelled; downloads enabled.
  - Short-lived download links; image fetches only from allowed hosts.
  - "Download all" works for every eligible product.
  - All line items are read, not just the first 50.
  - No debug data or other people's details in responses.
  - Proper error codes.

## 12. The free gift offer

- **After an order.** The Shopify `orders/paid` webhook creates one `gift_offers` row per order (HMAC checked, idempotent). The offer email (`Main`) is sent after `gift.offer_email_delay_minutes`, with a personal `/g/[token]` link.
- **Thank-you pop-up.** `GET /api/gift/offer-link?order=…` returns the personal link for the Shopify thank-you page (`GiftSheet`). Wiring it into Shopify is a launch step outside this repo.
- **Seasonal reminder** (built, off by default). `gift.reminder_days_before` days before a category comes into season, email customers who have the free gift and haven't made a card in 60 days. Turned on per category in the theme library.
- **Switches** `cards.enabled`, `gift.offer_email_enabled`, `gift.popup_enabled` and `gift.reminder_email_enabled` all start **off**. Turning them on is the launch.

## 13. Settings (super users only)

At `/settings`; desktop first, with a dark sidebar. Anyone else gets a 404. Every change is recorded in `settings_history` and `activity_log` with the super user's email.

**Sidebar:**
- INSIGHTS: Dashboard · Customers · All cards
- SETUP: General & variables
- GREETING CARDS: Theme library · Template editor
- REDEEM: Downloads & mugs
- SYSTEM: Emails · Tracking (PostHog) · Data sources · Super users · Activity log
- "Back to My Magic Portraits" at the bottom.

**Insights**
- **Dashboard** (`AdminInsights`).
  - Date range: Today, 7 days, 30 days, All time.
  - Tiles with change vs the previous period: cards created, people creating, emailed, recipient opens, recipients who tapped "Try Magic Portraits", sign-ins, mug photos chosen, downloads.
  - Also: cards per day, the card funnel (with a link to PostHog), top themes, and a live feed.
  - All numbers come from our database.
- **Customers** (`AdminCustomer`).
  - Search by email or name.
  - Header: badges, plus stats for orders, spent, cards and portraits.
  - Links: Open in PostHog (replays), Open in Shopify, Resend sign-in link, Export or delete data.
  - **One timeline** merged by time: activity_log (My MP, Email) plus live Shopify orders plus live Imagen sessions, with filter chips.
- **All cards** (`AdminCards`).
  - Every card ever made. Search, filters (category, status, date), paging and CSV export.
  - Card detail: large preview with message, sender (links to the customer), recipient, portrait, delivery and timeline.
  - Actions: Download JPEG, Resend email, Hide/Show link, Delete on request (with a confirm step).
  - **Opening a card's message is logged.**

**Setup: General & variables** (`Settings`)
- Card and redeem switches.
- A searchable table of every setting (key, value, type, updated by and when), edited inline with type checks, plus "Add variable".
- Super users and data source status at a glance; recent changes.

**Greeting cards**
- **Theme library** (`AdminThemes`).
  - Themes with category, versions, the dates they're shown, status; category filter; "Manage categories".
  - Versions in drag order, with use counts.
  - The gift panel edits the same `cards.*` and `gift.*` settings. There is one value per setting, not a second copy.
- **Template editor** (`AdminTemplate`).
  - Upload the background and an optional overlay, checked on upload: 1500 × 2100, sRGB, under 2 MB, overlay has transparency.
  - Drag the photo zone and the text zones. Photo zone shape and frame; fonts from the approved list; size, colour, alignment and max characters.
  - Message ideas.
  - "Test render JPEG"; "Publish version" (makes the thumbnail).
  - Status Draft / Live / Archived; "New" badge.
  - The designer rules (`ThemeSpec`) show as help text.

**Redeem: Downloads & mugs**
- The redeem constants, with validation.
- A read-only "look up an order" box that shows what the customer would see.

**System**
- **Emails:** sender, reply-to, a preview of each template, "Send me a test", the bounce and unsubscribe list.
- **Tracking:** PostHog project, proxy status, recent counts, links to dashboards.
- **Data sources:** a status card per source with "Test" and its last success; "Test all".
- **Super users:** add by email, remove. You can't remove yourself or the last one.
- **Activity log:** the full log, filterable by email, event, source and who did it.

**Setting keys** (full list and defaults in `docs/schema.md` and `docs/data.md` §7):
- `cards.*`: the product. `enabled`, `who_can_create`, `per_customer`, `price`, `message_max_chars`, `size_px`, `jpeg_quality`, `email_sender_name`, `footer_text`.
- `gift.*`: the offer. `offer_email_enabled`, `popup_enabled`, `reminder_email_enabled`, `reminder_days_before`, `unlock_rule`, `link_valid_days`, `offer_email_delay_minutes`.
- `redeem.*`: the /redeem rules and constants.
- `vault.*`: data-source plumbing and the first-order offer.
- Also `themes.*`, `auth.*`, `brand.*`, `email.*`, `links.*`.

## 14. Analytics and the activity log

- **PostHog** (project 540098, the same as the main site), so one person's journey runs from first upload → order → card → recipient → their own order.
  - Same identity (`identify(email)`) and a cross-subdomain cookie; proxied at `/ingest`; replay with inputs and the card preview masked.
  - Event prefixes: `vault_` (My Magic Portraits area), `card_` (greeting cards), `gift_` (the offer), `redeem_` (kept from live so old charts continue).
  - Full list in `docs/analytics.md`.
- **Our own `activity_log`.** Every business event is written server-side with who did it. It is permanent and joins with cards and orders. It powers Settings › Insights.
- **Never tracked:** message text, recipient names or recipient emails, in either system.

## 15. Data export and deletion

- **Export:** a JSON file with the person's cards (with image links), activity rows and any settings changes they made.
- **Delete:**
  - Removes their cards and the card and portrait files.
  - Anonymises their activity rows.
  - Blocks future card emails to them.
  - Records the request.
- Shopify and Imagen data are not touched; those have their own processes.

## 16. Security and privacy

The live /redeem's problems are listed in `docs/data.md` §8. This app must not repeat them.

- Everything external is read **server-side only**:
  - Imagen and the mirror through a read-only database role
  - Shopify with the r_orders token.
  
  The browser gets only the Supabase URL and anon key and the PostHog key.
- Every customer action re-checks ownership and eligibility on the server.
- Error messages never reveal whether an email or order exists. No debug fields.
- Private files use short-lived signed URLs; image fetches only from allowed hosts.
- RLS on every table in our database, deny by default; the browser never queries tables directly.
- Webhooks are signature-checked and idempotent. Gift links are signed. Share slugs are random and 16+ characters.
- Code requests, lookups and downloads are rate-limited.
- Card messages are personal. Super users can read them for support; every view is logged; the privacy policy must say so (launch step).
- Server logs mask emails; no message text in logs.

## 17. Quality bar

- **Screens:** works from 360 px wide up, designed at 390. On desktop, content is at most 1200 px wide.
- **Header:** the logo is 30 px tall when the initials circle shows, so they never overlap.
- **Footer:** every customer page has the live site's footer.
- **Speed:**
  - Home is interactive in under 2 s on 4G.
  - The portrait lookup is cached for 10 minutes and takes under 1.5 s warm.
  - A card renders in under 4 s.
  - Lighthouse mobile: performance ≥ 85, accessibility ≥ 95.
- **Accessibility:** WCAG 2.2 AA; keyboard reachable; real radio groups for theme, portrait and mug; visible focus; reduced motion respected.
- **Copy and SEO:** English only, via `t()`; `noindex` everywhere except the sign-in page.

## 18. Review: what changed in this pass

This pass reviewed all 28 screens against the decisions above.

**Fixed in the designs**
- The initials circle overlapped the logo on every phone screen. The logo is now 30 px tall.
- The three Insights screens had an old, shorter Settings menu. They now share the full sidebar.
- "Recipients who tried MP" became "Recipients who tapped Try MP". We can only count the tap; what they did next is in PostHog.
- The desktop step bar said "Send"; it now says "Ready", matching mobile.
- The blueprint's `cards` table now matches the real schema.
- The email sender shows "Resend".
- Every "vault" and "gift card" label is renamed (D5, D6). Settings keys are split into `cards.*` and `gift.*`.

**In this spec but not drawn (build to the spec)**
- Changing or cancelling scheduled cards in My cards (§9).
- The footer on My portraits and the creator home (§17).
- The settings pages without a mockup (Downloads & mugs, Emails, Tracking, Data sources, Super users, Activity log). Build them in the `Settings` style.
- The "nobody found" empty state (§5) and the "Cards are paused" state (§8.3).
- The "Later, email me the link" action (§8.1).

## 19. Launch plan

1. **Before the build**, Gavin sets up accounts, keys and DNS (`BUILD.md` › Before you start).
2. **The build:** one Claude Code run, Parts 0–13, all switches off, test data only.
3. **Review the preview** on a phone. Load real theme artwork and publish the first versions.
4. **Connect production:**
   - Register the Shopify webhook.
   - Point the live `/redeem` to `my.magicportraits.ai/redeem`.
   - Add the MY MAGIC PORTRAITS links to the main site's menu.
   - Add the thank-you pop-up.
5. **Update the privacy policy** (§16).
6. **Turn on**, in Settings, `cards.enabled`, then the pop-up, then the offer email. Watch Insights and PostHog for the first day.

## 20. Open questions

| # | Question | Default if not answered |
|---|---|---|
| Q1 | Email sender: Resend, or Klaviyo for the marketing emails? | Resend for everything |
| Q2 | Does the r_orders token have `write_orders` (mug save), `read_all_orders` (orders older than 60 days) and `read_customers`? | Checked in Part 0; mug save is blocked until confirmed |
| Q3 | At which print status should the mug choice lock? `generating` and `file_ready` let 7 changes through. | Lock from `draft_created` (setting `redeem.mug_lock_states`) |
| Q4 | May we add a `lower(email)` index on the events mirror? Without it, 2.3% of emails stored in mixed case are missed. | Search both spellings, no index |
| Q5 | Should cancelled or refunded orders still count as "ordered" and still unlock cards? | No |
| Q6 | Does the main site's order page still open old sessions from their link? | Fall back to "Create a new portrait" |
| Q7 | Does the free gift unlock with any order, or only some products? | Any paid order |
| Q8 | Later: should My Magic Portraits absorb the VIP Portal (store credit), so there's one sign-in? | Not in v1 |

## 21. Problems found on the live systems (outside this build, needs an owner)

These came up while reading the live code and databases. They affect customers today, whatever happens with this build.

1. **Customer data is readable by anyone.**
   - The events mirror (`analytics_events_mirror`: emails and session ids) has an "anon read" rule.
   - Imagen `images` and `sessions` are readable with the public anon key.
   - The anon keys ship in the live site's code, so anyone can list customer emails, sessions and every image path. **Urgent.**
2. **/redeem leaks the order's email.** A wrong-email lookup returns a `debug` block with the order's real email, and order numbers are sequential. **Urgent.**
3. **Free hi-res downloads.** `redeem-download` never checks that downloads were bought. It will also fetch any URL it's given.
4. **Mug choice changes after printing.** Nothing stops changes after printing starts: 9 changes landed after the mug went to print. No check that the order even has a mug.
5. **"Download all" is broken** for current products: 500 of 520 attempts failed.
6. **RLS disabled** on `paypal_subscription_ledger`, `daily_discounts` (shopify-dailyreport) and `dashboard_users` (imagegen-prod).
7. **Imagen API key** in the live site's browser code (`src/lib/imagegen.ts`), and `user_sessions` readable and writable without sign-in.
