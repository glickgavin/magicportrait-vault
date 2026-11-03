# Analytics plan: My Magic Portraits and greeting cards

PostHog is the analytics tool for the whole of My Magic Portraits: page views, every step of the card flow, server events, session replay, heatmaps, errors and experiments.

Verified on 3 Nov 2026 against the live PostHog project:
- Project **"Default project"** (id `540098`), US cloud (`https://us.i.posthog.com`), app URL `magicportraits.ai`.
- Session replay, heatmaps, web vitals and console logs are already on. Error tracking is not in use (no `$exception` events in 30 days).
- The main site already sends its funnel here (`page_view_*`, `funnel_*`, `masterpiece_*`, `redeem_*`, `checkout_*`, `purchase_completed`). People carry an `email` person property.
- The same events appear in Supabase `shopify-dailyreport.analytics_events_mirror`.

**Rule: My Magic Portraits reports into the same PostHog project as magicportraits.ai, so one person's journey runs from first upload → order → card → recipient → next customer.**

---

## 1. Setup

| Item | Decision |
|---|---|
| Client SDK | `posthog-js` (Next.js provider), project key from env `NEXT_PUBLIC_POSTHOG_KEY` |
| Server SDK | `posthog-node` for events that happen on the server (render, email sent, webhook) |
| Reverse proxy | Route through the app (`/ingest/*` rewrite to `us.i.posthog.com`) so ad blockers don't drop events. Not set up on the main site yet. |
| Domain | My Magic Portraits lives at `my.magicportraits.ai`. Keep PostHog's cross-subdomain cookie on (cookie on `.magicportraits.ai`) so the main site and My Magic Portraits share one anonymous ID |
| Autocapture | On (clicks, page views, page leave). Custom events below are the source of truth for funnels |
| Session replay | On, with masking (see Privacy) |
| Heatmaps, web vitals | On |
| Error tracking | Turn on exception autocapture for My Magic Portraits and add `error_*` events below |
| Super properties | Every event carries `app: "vault"`, `entry_point`, `is_customer`, `utm_*` |

One wrapper, `track(event, props)`, is the only way the app sends events. It adds the super properties and checks names against the list below. The app never writes to the events mirror; it is read-only (`CLAUDE.md`).

Business events that happen in the browser (share, copy link, download, mug tile picked) are sent to `POST /api/track`. The server checks the name against this list, takes the email from the session (never from the request), and writes PostHog and `activity_log` server-side. Pure UI events go straight to PostHog from the browser.

## 2. Identity

- On sign-in (signed link from the order email or the 6-digit code), call `identify(email.toLowerCase())`. This matches the main site, so My Magic Portraits joins the person's existing history.
- Set person properties: `email`, `is_customer`, `first_order_at`, `portrait_count`, `session_count`, `cards_created` (increment), `vault_first_seen_at` (set once).
- Card recipients stay anonymous. Their events carry `card_id` only. The server credits the sender by looking up the card, so the sender's email never reaches the recipient's browser.

## 3. Naming rules (match the existing site)

- Screens: `page_view_<screen>` (existing: `page_view_redeem`, `page_view_orders`…)
- Actions: `<area>_<object>_<action>`, snake_case, past tense (existing: `redeem_lookup_succeeded`, `masterpiece_style_selected`)
- Areas: `vault_` for the My Magic Portraits area (internal code name), `card_` for greeting cards, `gift_` for the free gift offer
- Reuse existing property names: `email`, `session_id` (Imagen session), `image_id`, `order_id`, `order_name`, `portrait_count`, `theme_slug`, `currency`
- Errors: `error_<what>` (existing: `error_generation_failed`)

## 4. Events by screen

### Entry points
| Event | When | Key properties |
|---|---|---|
| `gift_offer_email_sent` (server) | Gift email sent after an order | `order_id`, `order_name` |
| `gift_popup_shown` | Thank-you page sheet opens | `order_id` |
| `gift_popup_cta_tapped` / `gift_popup_dismissed` | Taps on the sheet | `order_id`, `action` |
| `menu_create_card_tapped` | "Create a card" in the site menu | `signed_in` |
| `gift_popup_email_link_requested` | "Later, email me the link" on the sheet | `order_id` |
| `gift_reminder_email_sent` (server) | Seasonal reminder sent | `category`, `theme_slug` |

`entry_point` super property (the same list as `cards.entry_point` in `docs/schema.md`): `order_email` · `thankyou_popup` · `reminder_email` · `site_menu` · `home` · `my_cards` · `my_portraits` · `order_page` · `make_another` · `use_again`. Recipient pages use `recipient_page`.

### Sign-in
| Event | When | Key properties |
|---|---|---|
| `page_view_vault_signin` | Email screen shown | |
| `vault_code_requested` | Code sent | |
| `vault_code_verified` / `vault_code_failed` | Code checked | `attempt`, `reason` |
| `vault_signed_in` | Signed in | `method` (`link` / `code`) |
| `vault_lookup_succeeded` / `vault_lookup_empty` | Portraits found or not | `session_count`, `portrait_count`, `orders_count`, `is_customer`, `lookup_ms` |

### My Magic Portraits area
| Event | When | Key properties |
|---|---|---|
| `page_view_vault_home` | | `is_customer`, `cards_created` |
| `page_view_vault_portraits` | | `session_count`, `portrait_count`, `ordered_count` |
| `vault_filter_changed` | All / Ordered / Not ordered | `filter` |
| `vault_order_wall_art_tapped` | "Order as wall art" / "Order more" | `session_id`, `theme_slug`, `ordered_before` |
| `vault_new_portrait_tapped` | "Create a new portrait" | |
| `page_view_vault_guest` | Home for a creator with no order | `portrait_count` |
| `vault_cards_locked_viewed` | Locked cards shown | |
| `vault_offer_tapped` | First-order offer tapped | `offer_code` |

`vault_order_wall_art_tapped` is the upsell event; it joins the existing `checkout_started` → `purchase_completed` funnel.

### Card builder
| Event | When | Key properties |
|---|---|---|
| `page_view_card_theme` | Step 1 | `categories_shown` |
| `card_category_selected` | Tab or "See all" | `category`, `via` (`tab` / `see_all`) |
| `card_theme_selected` | Card tapped | `theme_slug`, `version_slug`, `category`, `position`, `is_new`, `in_season` |
| `page_view_card_portrait` | Step 2 | `portrait_count` |
| `card_portrait_selected` | Portrait tapped | `session_id`, `image_id`, `was_ordered` |
| `card_crop_adjusted` | Zoom or move | `zoom` |
| `page_view_card_message` | Step 3 | |
| `card_message_idea_used` | Idea chip tapped | `idea` |
| `card_delivery_selected` | Email it / I'll share it | `delivery` |
| `card_create_tapped` | "Create my card" | `theme_slug`, `delivery`, `message_length`, `scheduled` |
| `card_render_completed` (server) | JPEG ready | `card_id`, `render_ms` |
| `error_card_render_failed` (server) | Render failed | `card_id`, `reason` |
| `page_view_card_ready` | Step 5 | `card_id` |
| `card_step_back` | Back button | `from_step` |

### After creating
| Event | When | Key properties |
|---|---|---|
| `card_email_sent` (server) | Card emailed to the recipient | `card_id`, `scheduled` |
| `card_downloaded` | Download JPEG | `card_id` |
| `card_link_copied` | Copy link | `card_id` |
| `card_shared` | Share sheet or app button | `card_id`, `channel` (`whatsapp` / `messages` / `facebook` / `instagram` / `native`) |
| `card_another_tapped` | "Make another card" | `cards_created` |
| `page_view_vault_cards` | My cards | `cards_count` |
| `card_reused` / `card_resent` | From My cards | `card_id` |

### Recipient (the growth loop)
| Event | When | Key properties |
|---|---|---|
| `card_recipient_email_opened` (server) | Recipient opens the email | `card_id` |
| `page_view_card_received` | Recipient opens the card page | `card_id` |
| `card_recipient_saved` | Recipient saves it | `card_id` |
| `card_recipient_cta_tapped` (server) | "Try Magic Portraits", recorded by `/c/[slug]/try` before the redirect | `card_id`, `via` (`email` / `page`) |

The CTA link carries `utm_source=greetingcard&utm_medium=referral&utm_campaign=<theme_slug>`. Recipients who then upload show up in the existing `page_view_start` → `funnel_generation_started` events.

### Orders, downloads & mugs (rebuilt /redeem)
Keep the live site's event names so existing PostHog charts continue: `page_view_redeem`, `redeem_lookup_submitted`, `redeem_lookup_succeeded`, `redeem_lookup_failed`, `redeem_download_clicked`, `redeem_download_completed`, `redeem_download_failed`, `redeem_download_all_clicked`, `redeem_download_all_completed`, `redeem_download_all_failed`, `redeem_mug_section_viewed`, `redeem_mug_tile_selected`, `redeem_mug_save_clicked`, `redeem_mug_saved`, `redeem_mug_save_failed`. Reuse their properties: `order_id`, `order_name`, `portrait_count`, `downloads_enabled`, `mug_present`, `mug_already_chosen`.

New ones:
| Event | When | Key properties |
|---|---|---|
| `page_view_vault_orders` | Orders list | `orders_count`, `mug_pending_count` |
| `redeem_mug_locked_viewed` | Mug already printed | `order_id` |

### Account & sign-out
| Event | When | Key properties |
|---|---|---|
| `account_menu_opened` | Initials tapped | `is_super_user` |
| `vault_signed_out` | Sign out | |

On sign-out call `posthog.reset()` so the next person on the device starts fresh.

### Settings (super users, internal)
`settings_viewed`, `setting_changed` (`key`, `section`; never the value), `super_user_added` / `super_user_removed`, `admin_theme_created`, `admin_version_published`, `admin_version_archived`, `data_source_tested` (`source`, `ok`). Super users sit in the existing test-account cohort so they never count as customers.

Insights actions (all carry `actor = super_user:<email>` in `activity_log`):

| Event | When | Key properties |
|---|---|---|
| `admin_customer_viewed` | A customer timeline is opened | `customer_email_hash` |
| `admin_card_viewed` | A card's detail (with its message) is opened | `card_id` |
| `admin_card_resent` | Resend from All cards | `card_id` |
| `admin_card_share_hidden` / `admin_card_share_shown` | Share link hidden or restored | `card_id` |
| `admin_cards_exported` | CSV export | `row_count`, `filters` |
| `admin_data_exported` / `admin_data_deleted` | Customer data request carried out | `request_id` |

### Other lifecycle events (server)
| Event | When | Key properties |
|---|---|---|
| `vault_signin_link_used` | A `/g/[token]` link signs someone in | `order_id`, `expired` |
| `gift_offer_email_opened` | Gift offer email opened (Resend webhook) | `order_id` |
| `card_cancelled` | A scheduled card is cancelled | `card_id` |
| `card_schedule_changed` | A scheduled card's time or content is changed | `card_id`, `changed` (`time` / `content`) |
| `gift_offer_skipped` | An order didn't qualify for the free gift, or the offer was suppressed | `order_id`, `reason` |
| `gift_preferences_updated` | Someone changed their Email preferences | `offer_emails` (on/off) |
| `admin_signin_link_resent` | A super user resent someone's sign-in link | `customer_id` |
| `admin_theme_updated` / `admin_category_updated` / `admin_version_updated` | Theme library edits | `theme_slug` / `category` / `version_slug` |
| `card_recipient_email_bounced` | Recipient email bounced | `card_id` |
| `card_recipient_unsubscribed` | "Don't email me cards" | `card_id` |

## 5. Dashboards, funnels and replays to set up in PostHog

1. **Card funnel:** `gift_offer_email_sent` → `page_view_card_theme` → `card_theme_selected` → `card_portrait_selected` → `card_create_tapped` → `card_render_completed` → (`card_email_sent` or `card_shared` or `card_downloaded`). Break down by `entry_point` and `delivery`.
2. **Sign-in health:** `page_view_vault_signin` → `vault_code_requested` → `vault_code_verified` → `vault_lookup_succeeded`, plus the `vault_lookup_empty` rate.
3. **Vault to order:** `vault_signed_in` → `vault_order_wall_art_tapped` → `checkout_started` → `purchase_completed`. Split by `is_customer`.
4. **Theme performance:** `card_theme_selected` and completed cards by `category` and `theme_slug`, and selection rate by `position`.
5. **Referral loop:** `page_view_card_received` → `card_recipient_cta_tapped` → `page_view_start` → `funnel_generation_started` → `purchase_completed`.
6. **Repeat use:** cards per person, retention on `card_create_tapped`, stickiness by week.
7. **Quality:** `error_*` and `$exception` trends, render time (p50/p95 `render_ms`), web vitals for My Magic Portraits pages.
8. **Replay playlists:** sessions that reach the message step but don't create a card, sessions with `$rageclick` in the builder, and sessions with `vault_lookup_empty`.

## 6. Experiments (feature flags)

- Button label: "Create a card" vs "Make a card".
- Theme picker: grouped rows vs grid on open.
- Gift email: send after order paid vs after the portrait is delivered.
- Locked gift for non-customers vs one free card.

## 7. Privacy

- Never send the message text, recipient name or recipient email as event properties. Send `message_length`, `has_recipient_email`, `scheduled` instead.
- Replay masks every text input by default and masks the live card preview (it shows the message).
- No personal data in URLs. Sign-in tokens are stripped by redirect, and admin pages use opaque ids. PostHog's `before_send` also drops the path token and query string on `/g/`, `/email-preferences/` and `/c/` pages.
- Customer `email` is used only as the PostHog identity, as on the main site.
- Respect the main site's consent setting; don't start replay before consent where it's required.

## 8. Our own activity log (app database)

PostHog holds the click-level detail and replays. My Magic Portraits also writes every meaningful customer action to its own Supabase table, so the business record is durable, joins with cards and orders, and powers the Settings › Insights screens without depending on PostHog.

**Table `activity_log`** (append-only, never deleted except on a customer's deletion request):
`id`, `occurred_at`, `email` (lower-case), `event` (same names as PostHog), `source` (`vault` / `shopify` / `imagen` / `email`; shown to staff as My MP / Shopify / Imagen / Email), `ref_type` + `ref_id` (card, order, session, image), `props` (jsonb, no message text), `actor` (`customer` / `super_user:<email>` / `system`).

**What goes in:** sign-in and sign-out, card created / emailed / scheduled / shared / downloaded / resent, recipient opened / saved / tapped through, mug photo chosen or changed, downloads, settings changed, super user viewed a card's message, data export or deletion. Shopify orders and Imagen sessions are not copied; the customer timeline reads them live and merges them by time.

**Cards are kept forever.** Every card record and its JPEG stay in the database and storage. Super users see them all in Settings › All cards. The only removal is a customer's data-deletion request, which deletes the card and its JPEG and anonymises its activity rows.

**Settings › Insights screens:** Dashboard (counts, cards per day, funnel, top themes, live feed), Customers (one timeline across My Magic Portraits, Shopify, Imagen and email, with links to PostHog replays and Shopify), All cards (search, filter, view any card with its delivery timeline, resend, hide link, delete on request).

## 9. Which events also go to `activity_log`

Business events go to both PostHog and `activity_log`:
- all `card_*` except `card_category_selected`, `card_crop_adjusted`, `card_message_idea_used`, `card_delivery_selected` and `card_step_back`
- `vault_signed_in`, `vault_signed_out`, `vault_code_requested`, `vault_lookup_*`
- every `redeem_*_completed`, `redeem_*_saved` and `redeem_*_failed`
- every server event, every Settings event, and `admin_card_viewed`.

Everything else (`page_view_*`, taps, filters, UI-only events) goes to PostHog only.

## 10. Definition of done for the build

- Every customer page fires its `page_view_*` (list below) and its action events with the properties above. Settings pages fire `settings_viewed` with `section` instead.
- Page views not listed elsewhere: `page_view_vault_order` (order detail; `order_id`, `mug_present`, `downloads_enabled`), `page_view_card_creating` (`card_id`), `page_view_email_preferences`, `page_view_card_unsubscribe` (`card_id`), `page_view_vault_empty` (nobody found). Old redeem links (`/redeem`) fire the live name `page_view_redeem`.
- Events checked in PostHog Live events with a test account (in the test-account cohort).
- No personal message content in any event or replay.
