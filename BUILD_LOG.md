# Build log: My Magic Portraits

One Claude Code cloud session, branch `claude/cool-volta-69zljg`, working through `BUILD.md` Parts 0–13.

## Progress

| Part | Name | Status |
|---|---|---|
| 0 | Preflight | done |
| 1 | App shell | done |
| 2 | Database and settings | done |
| 3 | Data sources | done |
| 4 | Sign-in and account | done |
| 5 | Home and My portraits | done |
| 6 | Card builder and renderer | done |
| 7 | Email and delivery | done |
| 8 | Orders, downloads and mugs | done |
| 9 | Free gift offer | done |
| 10 | Settings | done |
| 11 | Insights | done |
| 12 | Analytics pass | done |
| 13 | Final check and preview | done |

## Part 0: Preflight (3 Nov 2026)

| Source | Status | Detail |
|---|---|---|
| Supabase Management API (`magic-vault`, `koudexolfdvzmrglzhaz`) | **OK** | `GET /v1/projects/{ref}` → 200, `ACTIVE_HEALTHY`, Postgres 17.11, us-east-1. `POST /database/query` works; public schema was empty. |
| Docker | **OK** | `dockerd` was not running at session start; started it by hand. Docker Hub returns 429 (rate limit) but Supabase images come from `public.ecr.aws`, which works. |
| Local Supabase stack | **OK** | Supabase CLI 3.0.0 (`pnpm exec supabase`). `supabase start` runs without Studio, Realtime, edge runtime, analytics/vector, imgproxy, pooler and pg-meta. Mail catcher (Mailpit) on :54324. |
| Shopify Admin API | **Check after deploy** | No Shopify network secret in this environment; the store domain isn't known to the session. Scopes (`read_orders`, `read_all_orders`, `write_orders`, `read_customers`) are checked from Settings › Data sources on the preview. |
| Klaviyo | **Check after deploy** | `a.klaviyo.com` is refused by the session's egress proxy (no network secret). `klaviyo.api_revision` keeps the documented default `2024-10-15` until Settings › Data sources › Klaviyo "Test" confirms a newer one. |
| AgentMail | **Check after deploy** | `api.agentmail.to` is refused by the egress proxy (no network secret). Domain verification and the `cards@magicportraitspartners.com` inbox are checked with Settings › Emails "Send me a test". |
| Imagen (`imagegen-prod`) | **Check after deploy** | Postgres; not reachable from the session by design. Test from Settings › Data sources. |
| Events mirror (`shopify-dailyreport`) | **Check after deploy** | Same as Imagen. |
| Google Fonts / GitHub raw | OK | Font TTFs for the renderer fetched from `google/fonts` (OFL, licences committed beside them). |

## Part 1: App shell

- Next.js 16 App Router, Tailwind v4 tokens in `app/globals.css`, fonts via `next/font/google` (Plus Jakarta Sans, DM Serif Display, League Gothic).
- `Header`, `MenuSheet` (Radix Dialog), `Footer`, `Avatar`, `AccountMenu`, `SignOutButton`, ported from `reference/live-site/`, with the MY MAGIC PORTRAITS group.
- `t()` with one English dictionary; 404, error and global-error pages; `X-Robots-Tag: noindex` on everything except `/signin`.
- PostHog provider (`/ingest` rewrite, cross-subdomain cookie, inputs masked, `.ph-no-capture` blocks the card preview, `before_send` strips tokens and query strings on `/g/` and `/c/`). `lib/track-client.ts` for the browser; server `lib/track.ts` comes with the database in Part 2.
- e2e: shell at 360, 390 and 1280 px, axe clean, menu opens and closes, 404 page.

## Part 2: Database and settings

- Migration `20261103000001_core.sql`: every table in `docs/schema.md`, plus `processed_webhooks` (webhook idempotency) and `data_source_checks` (Settings › Data sources). Email checks, indexes (trigram for admin search), `updated_at` triggers, `settings_history` trigger, `is_super_user()`, `hit_rate_limit()`, `prune_rate_limits()`, `record_activity()` (activity row + Klaviyo outbox row in one transaction, deduped), `anonymise_activity()` (the only allowed activity_log mutation; the guard blocks update/delete/truncate otherwise), buckets `theme-assets` (public), `portraits`, `cards`.
- RLS on every table with no policies; `anon`/`authenticated` have no grants on tables or functions. The Supabase security advisor shows only the expected "RLS enabled, no policies" notices.
- `lib/settings/registry.ts` declares all 98 keys (type, section, default, Zod validation). `getSetting`/`getSettings` (15 s cache, invalid values fall back to the default), `setSetting` (validation, read-only keys refused, history via trigger), `listSettings`, `settingHistory`.
- `supabase/seed.sql` and `seed.test.sql` are **generated** (`pnpm db:seed:gen`) from the registry and `lib/seed-data.ts`; a test fails if they drift.
- `lib/track.ts`: server `track()` → PostHog (posthog-node) and, for business events, `activity_log` via `record_activity`, with an optional outbox row. Unknown names throw in dev/test; message text and recipient fields are stripped.
- `scripts/db-apply-remote.ts` applied the migration and `seed.sql` to **magic-vault** (3 Nov). Re-running is a no-op. Result: all six launch switches false, 0 live theme versions.
- Tests: registry validation, seed sync and idempotency, and integration tests on the local stack (history, append-only guard, anonymisation, outbox dedupe, rate limit, super-user check, RLS denies the browser key).

## Part 3: Data sources

- `lib/sources/`: `ShopifySource`, `MirrorSource`, `ImagenSource` interfaces; live clients (`shopify-live.ts` with the exact §5 queries, line-item paging, throttle retry; `pg-live.ts` with the §2.4 and §3.6 SQL through `postgres`, `prepare: false`, read-only role) and fixtures (`fixtures.ts`, `fixtures-data.ts`: six made-up people, generated cartoon portraits in `public/fixtures/portraits`). Fixture Shopify records every write instead of sending it.
- `lib/redeem/order.ts`: the pure port of `parseRedeemOrder`, `lineTileId`, dedupe, "counts as ordered", "is a customer" and the free-gift unlock rule.
- `getVaultProfile(email)` (`lib/vault/profile.ts` + pure `profile-core.ts`): orders, mirror sessions (cached in `vault_members` for `vault.lookup_cache_minutes`) plus `_imagegen_session_id` from order lines, recommendation children, the `ordered` flag per §3.6 (revenue events or order lines; cancelled/refunded excluded; other-email orders count), name, initials, customer / creator / nobody state.
- `lib/sources/health.ts`: `testSource()` for shopify (scopes), imagen, mirror and a cold/warm lookup timing (target < 1.5 s warm), recording only counts and timings in `data_source_checks`. The Settings › Data sources page with its "Test" buttons is built in Part 10 (it needs the super-user guard from Part 4).
- Tests: every row of the order rules, and profiles for a customer, a creator, a cancelled-only buyer, nobody, and an image ordered in one session but not another.

## Part 4: Sign-in and account

- `/signin` (`SignIn`): email → 6-digit code, resend, change email, `purpose=gift|redeem`, wording per purpose; the sample card fan is drawn by the real card renderer.
- `POST /api/auth/code` (rate-limited per email hash and IP hash; same answer whether or not the email is known), `POST /api/auth/verify` (rate-limited), `POST /api/auth/signout` (+ `posthog.reset()` in the browser).
- `/g/[token]`: 32-byte random tokens, stored only as `HMAC-SHA256(GIFT_LINK_SECRET, token)` in a new `signin_links` table (migration 2; gift offers keep their hash on `gift_offers` too). Server-side session exchange (admin `generateLink` → `verifyOtp` with the hashed token, nothing emailed), then a 303 to a clean path; expired → `/signin?expired=1`, unknown → `/signin`. Rate-limited per IP.
- `/redeem`, `/redeem?order=…`, `/redeem/[order]` → `RedeemEntry` (fires the live `page_view_redeem` with `order_id_in_url`, never the raw order). After sign-in it opens `/orders/[order]`; not found and not yours show one identical message.
- `proxy.ts` (Next 16's middleware) refreshes auth cookies; `getSessionUser()` verifies with the auth server; `requireUser`, `requireSuperUser` (404), `safeNext` (same-site only). Header shows initials; account menu with the Super user tag.
- Local stack: the code template (`supabase/templates/signin-code.html`, shows `{{ .Token }}`), 600 s expiry, higher local rate limits for tests.
- Migration 2 applied to `magic-vault`.
- Tests: token valid / expired / unknown / reused-after-expiry, HMAC-only storage, `safeNext`; e2e signs in with a code read from the mail catcher, wrong code, one-tap link with the token never left in the address bar, expired and unknown links, 404 on `/settings` for non-super users, old redeem links, generic order message.

## Part 5: Home and My portraits

- `/` picks one of four states: `FirstHome` (customer with no cards: "Hi Sam", one big "Make my card" panel with a live preview of their first card, My portraits, Orders with "Choose your free mug photo" when needed), `VaultHome` (tabs, cards panel, recent cards, portraits, "More digital gifts coming"), `VaultGuest` (latest session, All my portraits, locked cards, first-order offer when `vault.first_order_offer` is set) and the empty state ("Try another email", "Create a portrait").
- `/portraits`: summary, a real radio-group filter (All · Ordered · Not ordered, kept in `?filter=`), session groups newest first (theme, pet, date, order badge, ORDERED tiles, "More looks" for recommendation children), "Order as wall art"/"Order more" deep links (`links.order_session_url_template` with the lptemp id, else `links.start_portrait_url`), "Make a card", "Create a new portrait", and the "may not show yet" note.
- Theme catalog (`lib/db/themes.ts`) and season rules (`lib/themes/season.ts`, windows that wrap the year), card access rules (`lib/cards/rules.ts`: paused, locked, monthly limit with the next date).
- `cards.enabled = false` hides every card entry point (home panels, menu). Fixed a one-tap-link bug found here: brand-new users get a `signup` token, so the exchange now verifies with type `email`.
- e2e: all four states plus paused, portraits filters and links, at 390 and 1280 px, axe clean.

## Part 6: Card builder and renderer

- **One drawing routine** (`lib/render/draw.ts`) used by the server (`@napi-rs/canvas`, fonts from `assets/fonts`) and by `CardPreview` (an HTML canvas with the page's own fonts), so the preview is the JPEG. Layout maths in `lib/render/layout.ts`: Zod schema for the layout JSON, text that shrinks before it wraps and never overflows (falls back to an ellipsis below 30%), cover/zoom/pan crop, photo shapes (rect, rounded, circle, arch), `{pet}` ideas skipped without a pet name.
- `FirstCard` (`/create` with no cards and `cards.first_card_mode = one_screen`): in-season design, newest ordered portrait, first usable idea, their first name; "Change design" cycles once, then (or on long-press) opens the picker sheet; "Change photo", "Try another", "From … change", "I'll share it" / "Email it for me" (one email field, sends now), "See all designs" hands the draft to the full builder.
- Full builder: `/create` (`M1Theme`: tabs with counts, "All" rows with In season + See all, category grids, radio tiles, sticky footer), `/create/portrait` (`M2Portrait`: sessions, ORDERED, optional zoom/move sliders), `/create/message` (`M3Message`: To/From/Message with counter and idea chips, live preview, Email it (now or a date) / I'll share it). The draft lives in session storage plus each step's URL.
- `POST /api/cards` re-checks everything on the server (switch, who can create, monthly limit, the version is live and on sale today, the portrait is one of theirs, message length, schedule window, suppressed recipients), copies the portrait into `portraits/` as a normalised JPEG and creates the row; `/create/creating/[id]` (`M4Creating`) calls `POST /api/cards/[id]/render` (idempotent; "Try again" on failure) which renders, saves `cards/<id>.jpg`, sets `ready` / `scheduled`, queues a `card_deliveries` email row for "email now", and records `card_render_completed` and `card_created`.
- `/cards/[publicId]` (`M5Ready`): status line, Share (native share with the JPEG), Download, Copy link, WhatsApp, Messages, Facebook, Instagram (share sheet, else download + tip), Make another, Go to My cards.
- `/c/[slug]` public page (noindex, no-referrer, sender's first name only), `/c/[slug]/image` (404 when hidden), `/c/[slug]/try` (records `card_recipient_cta_tapped` against the sender server-side, then redirects with `utm_source=greetingcard&utm_medium=referral&utm_campaign=<theme>&card=<public id>`). `?d=<delivery id>` marks an email delivery opened and redirects to the clean URL.
- `POST /api/track`: browser business events only, email from the session, card ownership checked; share/download/copy also add `card_deliveries` rows.
- Tests: golden images for all 10 seed versions (0.5% pixel tolerance), text-fitting and overflow tests up to 1000 characters, crop maths; e2e for `/g` → FirstCard (no cards) and → step 1 (has cards), name-only Create, email delivery up to a queued row, a scheduled card, the public page, hidden links, `/try`, other people's cards and portraits (404), and the paused / locked / everyone_with_portrait / monthly-limit rules.

## Part 7: Email and delivery

- React Email templates in `emails/`: `card-delivery` (RecipientEmail: the card, "Save the card", "Open full size", the Try block, "Don't email me cards"), `card-scheduled` (to the sender), `signin-code` (rendered with `{{ .Token }}` into `supabase/templates/signin-code.html` by `scripts/gen-auth-template.tsx`), `signin-link`. Snapshot tests.
- `lib/email/`: `EmailSender` interface with AgentMail (SDK, inbox `email.from_cards`, reply-to `email.reply_to`, idempotency keys) and a fixtures sender that writes each message to `.tmp/sent-emails/` instead of sending (used whenever `EMAIL_PROVIDER=fixtures` or no `AGENTMAIL_API_KEY`).
- Card emails link to `/c/[slug]?d=<delivery id>`; the first visit marks the delivery and card opened, records `card_recipient_email_opened`, then redirects to the clean URL. Suppressed recipients (bounce, complaint, "Don't email me cards") are never emailed.
- "Email now" sends as soon as the JPEG exists; scheduled cards get a confirmation email to the sender. Cron `/api/cron/send-scheduled` (every 5 min, claims each card before sending so two runs never double-send; retries stale queued deliveries). Cron auth: `Authorization: Bearer $CRON_SECRET`. `vercel.json` lists every cron.
- Klaviyo (`lib/klaviyo.ts`): `track()` builds the outbox row automatically for the nine Klaviyo events, with the fixed property list per event (one-tap links only via a Klaviyo-only `extra`, never into PostHog or `activity_log`), dedupe keys, `unique_id` = outbox row id, sent at once and retried by `/api/cron/flush-outbox` with exponential backoff (honours `Retry-After`, 4xx fails at once, gives up after `klaviyo.max_attempts` and logs `error_klaviyo_send_failed`); `klaviyo.enabled = false` writes rows as `skipped`. Profile properties (the five "My MP" ones) after sign-in and after each card. Deletion jobs queued for Part 11.
- `/api/webhooks/agentmail`: Svix signature checked, idempotent on `svix-id` (`processed_webhooks`), handles delivered / bounced (delivery bounced, card failed, address suppressed) / complained (suppressed).
- `/c/[slug]/unsubscribe?d=…`: "Don't email me cards" needs a tap (so link scanners don't unsubscribe people), adds a `card_emails` suppression and records `card_recipient_unsubscribed`.
- My cards (`/cards`): statuses Emailed · Opened · Scheduled · Shared · Downloaded · Failed · Cancelled; Share, Download, Use again (same theme, portrait and message, blank recipient), Resend (rate-limited), and a "Manage" menu for scheduled cards with Change (reopens the builder on that card, re-renders, keeps or updates the time; `card_schedule_changed`) and Cancel.
- Tests: template snapshots, Svix valid/forged/wrong-secret, idempotency, bounce/delivered/complaint handling, scheduled send with a fake clock (not early, once, never twice), suppression, Klaviyo skip/send/property list/link handling/dedupe/backoff/give-up/4xx/cron/profile; e2e for email-now, opened via the email link, unsubscribe, resend, use again, change and cancel, cron and webhook auth.

## Part 8: Orders, downloads and mugs

- `/orders` (`Orders`): every order newest first, status chips ("Free mug · choose photo", "N downloads ready", "Mug printed", fulfilment), the gradient banner when a mug photo is needed, "Missing an order? … Switch account".
- `/orders/[orderName]` (`OrderDetail`): the free mug (a real radio group, deduped by tile id; Save disabled when nothing changed; "Saved. This is the photo we'll print."; locked → "Your mug is being printed with this photo"; `redeem.mug_offer_active` off → read-only), downloads (one row per portrait with the live file name, "Download all (.zip)"), then "Create a greeting card".
- `lib/redeem/service.ts`: every constant from settings; `viewOrder` (parse all lines, mug lock rule, kill switch); `saveMugChoice` re-checks owned → has mug → not cancelled → not locked → offer open → tile in this order, then `metafieldsSet` (same value and key order as live, with `compareDigest`) and `tagsAdd ["mug:ready"]`; tag errors go to the activity log. Codes: 404 not found/not yours, 409 locked/not eligible, 422 invalid tile, 502 Shopify error. Responses carry only `{ error }`.
- `lib/redeem/downloads.ts`: single files and a streamed zip through access-checked app routes (never the raw `_image_url`), fetching only from `redeem.allowed_image_hosts`, same numbering in both, missing files listed in `missing-files.txt` inside the zip, rate-limited per person.
- Fixed versus live: all lines read; Masterpiece `_image_id` tiles work for the mug and downloads; "Download all" works for all three products, the add-on and Masterpiece; downloads re-check eligibility; mug saves check the mug, cancellation and the print lock.
- Tests: every row of the eligibility rules (downloads by each product, add-on, Masterpiece, prints-only, kill switch; mug present/absent, none_selected, metafield vs line attribute), the lock rule in both modes, exact Shopify writes on fixtures, file names; e2e for choose, save, saved state, locked state, downloads, another email's order (404 on view, mug save and both downloads), signed-out calls, and a no-debug/no-PII check on every error body.

## Part 9: Free gift offer

- `/api/webhooks/shopify/orders-paid`: HMAC of the raw body checked first, idempotent on `X-Shopify-Webhook-Id` and on the order id; one `gift_offers` row per order: qualifying → `pending`, otherwise `skipped` with the reason (test order, cancelled, not paid, no email, no qualifying product) and `gift_offer_skipped`. Respects `gift.unlock_rule` and `gift.qualifying_product_ids`.
- `/api/cron/send-gift-offers` (every 5 min): due offers get a fresh one-tap link and exactly one `free_gift_unlocked` (dedupe `free_gift_unlocked:<order id>`) with `card_link`, `link_expires_at`, `portrait_image_url` and `suggested_design` for Klaviyo only. With `gift.offer_email_enabled` off nothing is sent and the offer is marked skipped. This app sends no offer email.
- `POST /api/gift/offer-link`: only with a valid checkout-extension session token (HS256 with the app secret, `exp`/`nbf`, `dest` = the store) for an order paid within `gift.popup_window_minutes` that unlocks the gift; rate-limited per IP; generic errors; CORS for the extension; off unless `gift.popup_enabled`. "Later, email me the link" (`action: email_later`) is built but returns 404 until `gift.popup_email_later_enabled`. Wiring notes in `docs/gift-sheet.md`.
- Seasonal reminder (`/api/cron/send-reminders`, daily): when `gift.reminder_email_enabled`, `gift.reminder_days_before` days before a category with `reminder_enabled` comes into season, queues `gift_reminder_due` (once per category, year and person) for customers with the free gift and no card in `gift.reminder_skip_if_card_within_days`.
- Mug photo reminder (`/api/cron/mug-reminders`, daily): when `redeem.mug_reminder_enabled`, `mug_photo_needed` once per order `redeem.mug_reminder_after_days` after payment, while no photo is chosen and the mug isn't locked, with a one-tap link to the order.
- `scripts/register-shopify-webhook.ts`: written, **not run**.
- Tests: HMAC and session-token verification (valid, forged, expired, wrong shop, `alg: none`), webhook replay ignored, skipped reasons, unlock rule, switches off → nothing sent, on → exactly one event per qualifying order (also after replays), delay, the offer-link endpoint rejecting a missing, forged or expired token and an old order, email-later gating, mug reminder once per order.

## Part 10: Settings

- `AdminShell` (dark sidebar: INSIGHTS · SETUP · GREETING CARDS · REDEEM · SYSTEM, "Back to My Magic Portraits"); `/settings/*` layout and every `/api/admin/*` route return 404 unless `is_super_user(email)`.
- **General & variables** (`/settings`): card and redeem switches, the searchable table of every setting edited inline with the registry's type checks (validated again on the server), "Add variable", super users, data-source status and recent changes. Every change goes to `settings_history` (trigger) and `setting_changed` (key and section, never the value).
- **Theme library** (`/settings/themes`): themes by category with dates, status, versions (thumbnail, status, NEW, use counts, up/down ordering), new theme and new version forms, the gift panel (same `cards.*`/`gift.*` settings), "Manage categories" (seasonal reminder per category).
- **Template editor** (`/settings/themes/[themeId]/versions/[versionId]`): live preview with draggable/resizable photo and text zones (also keyboard-movable), zone fields (x/y/w/h, shape, radius, frame; font from the approved list, size, colour, alignment, template), message max chars, message ideas, background/overlay upload checked on the server (1500 × 2100, sRGB, under 2 MB, overlay PNG with real transparency), "Test render JPEG" (real renderer, sample portrait), "Publish version" (renders and stores a thumbnail, sets live), back to draft / archive, and the designer rules as help text. `/settings/template` lists versions to edit.
- **Downloads & mugs** (`/settings/redeem`): the redeem constants with validation and a read-only order lookup (what the customer would see, no personal details).
- **Emails**: sender and reply-to settings, a live preview of each template, "Send me a test" (to the super user's own address), the bounce and unsubscribe list.
- **Tracking**: PostHog project and links; counts from PostHog when `POSTHOG_PERSONAL_API_KEY` is set, plus counts from `activity_log`.
- **Data sources**: a card per source (Shopify scopes, Imagen, mirror, a cold/warm portrait lookup, Klaviyo, AgentMail, PostHog) with "Test", last success and "Test all"; the Klaviyo outbox per event over 7 days with "Retry failed".
- **Super users**: add, remove; you can't remove yourself or the last one. **Activity log**: filter by email (sent in a short-lived cookie, never the URL), event, source and actor; paging.
- e2e (against a production build): 404 on every page and admin API for others; every page renders for a super user with no axe violations; a setting change appears in history and pauses the builder; super users add/remove guard; data sources "Test all"; a version published from uploaded files appears in `/create`.

## Part 11: Insights

- Migration 3 (applied to `magic-vault`): `insights_kpis`, `insights_cards_per_day`, `insights_top_themes`, `insights_funnel` (security definer, service role only).
- `/settings/insights`: Today / 7 days / 30 days / All time; tiles with change vs the previous period (cards created, people creating, emailed, recipient opens, recipients who tapped Try MP, sign-ins, mug photos chosen, downloads), cards per day, the card funnel (people per step) with a link to PostHog, top themes and a live feed. All from our database.
- `/settings/customers`: search sent in the request body; a full email we don't know yet is looked up live and, if Shopify or Imagen know the person, gets a `vault_members` row with `created_via = 'admin_lookup'`. `/settings/customers/[id]` (opaque id): badges, orders / spent / cards / portraits, links to PostHog and Shopify, Resend sign-in link (AgentMail, `admin_signin_link_resent`), Export data (JSON: cards with 7-day image links, activity, settings changes), Delete data (type the email to confirm), and one timeline merged by time (activity_log as My MP/Email, live Shopify orders, live Imagen sessions) with filter chips. Opening it records `admin_customer_viewed` with a hash of the email.
- `/settings/cards`: search (in the body), category/status/date filters, paging, CSV export (posted form; no message text or recipient email; formula-injection safe), card detail with message, sender (links to the customer), recipient, portrait, deliveries and timeline; Download JPEG, Resend email, Hide/Show link, Delete on request (type the card id). Opening a card records `admin_card_viewed`.
- **Delete on request** (customer): deletes their cards, card JPEGs and portrait copies, anonymises their activity (`anonymise_activity`), deletes their outbox rows, queues the Klaviyo deletion job, suppresses the address (`all`, `deletion`), removes sign-in links and the member row, pseudonymises the email on `gift_offers`, and records the request in `data_requests`.
- Tests: KPI queries against seeded rows (this and the previous period), cards per day, top themes, funnel; timeline order across sources; export; deletion (files gone, rows anonymised, outbox cleared, email suppressed, Klaviyo job queued, request recorded); e2e for the pages, customer search to an opaque URL, timeline filters, logged card views, hiding a link.

## Part 12: Analytics pass

- Audited every event in `docs/analytics.md` against the code. Added the missing ones: `vault_lookup_succeeded` / `vault_lookup_empty` (after each sign-in, with counts and `lookup_ms`), `redeem_lookup_submitted` (RedeemEntry), `redeem_lookup_succeeded` / `redeem_lookup_failed` (order page), and `attempt` on `vault_code_failed`. `gift_popup_shown` / `_cta_tapped` / `_dismissed` belong to the Shopify thank-you extension (outside this repo; listed in `docs/gift-sheet.md`).
- Identity: `identify(email)` on sign-in and on every signed-in page (`Identify`), with `email`, `is_customer`, `first_order_at`, `portrait_count`, `session_count`, `cards_created` and `vault_first_seen_at` (set once). Super properties: `app: "vault"`, `is_customer`, `entry_point` (from `?entry=`, `recipient_page` on card pages) and `utm_*`.
- Replay: inputs masked, `.ph-no-capture` on every card preview and card image, `data-ph-mask` on names and messages; URLs scrubbed on `/g/` and `/c/`.
- `scripts/posthog-setup.ts` creates the "My Magic Portraits" dashboard with the §5 funnels and trends. **Not run**: `POSTHOG_PERSONAL_API_KEY` isn't available in this session.
- `prebuild` runs the event-name check, so `pnpm build` (and Vercel) fails on any event name that isn't in the list; `pnpm lint` runs it too.
- Tests: e2e asserts every customer page fires its `page_view_*` (19 screens and states) and every Settings page fires `settings_viewed` with a section; signed-in pages identify the person; a card made with a distinctive message, recipient name and email leaves none of them in browser events, `activity_log` or the Klaviyo outbox (with Klaviyo switched on for the test); replay-masking checks.

## Part 13: Final check and preview

- **Full e2e** against a production build, at 390 × 844 and 1280 × 800: **96 passed** (the 18 skipped are the on-demand screenshot spec). axe (WCAG 2.2 AA tags) runs on every customer screen and every Settings page with no violations.
- **Unit and integration tests:** 171 passed (local Supabase stack, fixtures).
- **Client bundle:** `scripts/check-bundle.mjs` scans `.next/static` for secret patterns (Supabase secret/service-role keys, Shopify tokens, Svix and Klaviyo keys, Postgres URLs, server env names) and the actual local secret values: none found. Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`/`_HOST` and `NEXT_PUBLIC_INTERCOM_APP_ID` reach the browser.
- **Lighthouse (mobile, signed in, production build):** `/` (VaultHome) 92 / 100, `/create?step=theme` 89 / 100, `/orders` 93 / 100; first-time screens `/` (FirstHome) 87 / 100 and `/create` (FirstCard) 93 / 100 (performance / accessibility). CLS 0 everywhere. `posthog-js` is now loaded lazily after the page is idle, which lifted `/` from 83 to 92.
- **`magic-vault`:** all 3 migrations recorded in `supabase_migrations.schema_migrations`, `seed.sql` applied; 101 settings, 10 theme versions all draft, 0 cards, 0 activity rows (no test data), super users gavin@ and gideon@; every launch switch off (`cards.enabled`, `gift.offer_email_enabled`, `gift.popup_enabled`, `gift.popup_email_later_enabled`, `gift.reminder_email_enabled`, `klaviyo.enabled`, `redeem.mug_reminder_enabled`).
- **Screenshots** of every route at 390 px (fixture data only) are in `docs/build-screens/` (35 images: 21 customer screens and states, 13 Settings pages, the menu).
- **Preview:** Vercel builds every push of this branch (all READY up to Part 12; the final commit was building when this was written).

## Review fixes (4 Nov)

From Gavin and Gideon's walk-through (`review-fixes-2026-11-04.md`), reviewed against the live system first, then built on the branch restarted from `main` (PRs #2–#5 were already merged). Row 3 (the 12-template theme pack) stays skipped: `assets/themes/` is in the repo (it came with `main`) but nothing is imported into the theme library.

| # | Change | Notes |
|---|---|---|
| 1 | Sign-in heading "Create my greeting card" | Default and `purpose=gift`; people heading to `/orders` or `/redeem` keep the old wording (decision 4). |
| 2 | Portrait count + "See all" on every home | VaultHome title shows "N portraits"; FirstHome and VaultGuest rows get a "See all". Fixes "1 portraits". |
| 4 | Step bar pinned | `sticky top-14`, tight padding, "Step N of 3". |
| 5 | Plain back arrow | No container; 44 px target, focus ring, label kept. |
| 6–7 | One portrait grid, real shapes | Newest first, 3 across; each portrait whole (`object-contain`) in an equal cell (decision 6). `ClientPortrait` carries Imagen width/height. |
| 8 | Pinned compact preview on the Portrait step | Only on screens ≥ 700 px tall, so small phones keep room for the grid. |
| 9 | Placeholders | To "Name", From "Your name" (FirstCard's "Who is it for?" too). |
| 10 | "Change message" | One button cycling the version's ideas (FirstCard's "Try another" renamed the same). |
| 11–14 | Create first, then send | 3 steps; no delivery choice before the card exists; Ready screen: Send (one recipient per card; same address = resend, another = refused; `cards.email_sends_per_day`, default 20, shared with resends and the scheduling path), Share (share sheet with the image where supported, link in the text) or Copy link, Download, Make another. Scheduling behind `cards.scheduling_enabled` (off; nothing was scheduled on magic-vault). New route `POST /api/cards/[id]/send` (owner check, suppression, claim-once). WhatsApp/Messages/Facebook/Instagram buttons removed. Draft key bumped to v2. |
| 15 | Cart removed | Avatar / Sign in at the top right. |
| 16 | Menu pictures | Migration `20261104000002_menu_thumbnails.sql` (writes only while `[]`). Kept `alt=""`: the product name is printed next to each picture (decision 8); lazy, `referrerPolicy="no-referrer"`. |
| 17 | Photo window follows the image | `photo.fit` adapt/cover in `lib/render/layout.ts` (`fittedPhoto`), used by `drawLayers`, so preview and render match; sizes come from the loaded image (no extra `sharp` read needed). Arch radius capped at h/2 (decision 7). Unset `fit` = cover when `frame.width` is 0. Editor: "Maximum photo area", Photo fit, square / 3:4 samples. Goldens: `fit-adapt-square`, `fit-adapt-3x4`, `fit-cover-3x4`, `fit-adapt-arch-3x4`; the 10 seed goldens are unchanged (their areas are square). |

- **Shopify sign-in** (the doc's last section) was already done (client credentials). Webhooks deliberately accept the store's notification key as well as the client secret, because the live webhook was made in Shopify Admin.
- **Tests:** unit 205 (new: send-now, photo fit); e2e 106 at 390 × 844 and 1280 × 800 with axe, updated for the 3-step builder and the Ready screen (incl. a test for `cards.scheduling_enabled`). Screenshots refreshed in `docs/build-screens/` (new `14b-card-ready-unsent`).
- **Docs:** SPEC §5 (sign-in, header), §8.0, §8.2, §8.4, §9; `docs/design.md`; `docs/analytics.md` (`card_delivery_selected` now = Send tapped, funnel note, `card_shared` channel); `docs/schema.md` (`photo.fit`).

## Decisions

- **Dashboard leaves out super users (10 Nov, requested by Gavin):** every dashboard number (KPIs, cards per day, funnel, top themes, what people did, where people came from) and the live feed exclude super users' own activity and cards by default; an "Include super users" switch (`?staff=1`) shows everything. New overloads of the insights functions take `p_staff` with no default (migration `20261110000001_insights_without_staff.sql`), so calls without it still hit the earlier versions while a deploy is in flight. A card counts as staff by its sender; an event by its email; the live feed also hides `super_user:` admin actions.

- **Business time is Pacific (9 Nov, requested by Gavin):** setting `brand.timezone` (default `America/Los_Angeles`; PST/PDT handled by Intl, no fixed offsets). The dashboard's ranges start at Pacific midnight ("7 days" = today plus the 6 days before), "Cards per day" buckets by Pacific day (`insights_cards_per_day_tz`, migration `20261109000003_insights_business_tz.sql`), and every date/time in Settings is shown in that zone with its label (e.g. "9 Nov 2026, 14:52 PST"), server and client components alike (`lib/biztime.ts`, `BizTimeProvider`). Customer-facing pages keep the customer's own local time.

- **Show / hide per item (9 Nov, requested by Gavin):** `show` on `layout.photo` and each text zone, switched in the template editor ("Show … on this design"; hidden boxes stay editable, greyed and labelled "(hidden)"). Not drawn when off (shared draw routine). Builder: no photo → the Portrait step is skipped and the card has no portrait (`imageId` optional on the server only for such designs); no message → no message box, stored empty; hidden To/From are still asked ("not printed on this design") because the email and My cards use them.

- **Placeholder image per design (9 Nov, requested by Gavin):** `theme_versions.sample_portrait_path` (migration `20261109000002_version_placeholder.sql`). The template editor can upload (JPEG/PNG/WebP, stored as a ≤1200 px JPEG) and remove it; when set it's the default sample in the editor preview ("Your placeholder"), the test render and the published thumbnail. None, or a missing file: the built-in square sample. Customers' cards always use their own portrait.

- **Card fonts (9 Nov, requested by Gavin):** 12 Google Fonts added next to the two brand fonts, listed once in `lib/render/fonts.ts` and fetched from Fontsource (`scripts/fetch-card-fonts.mjs`, latin `.woff2`, 652 KB with licences) into `public/fonts/card/`. The server renderer registers the same files the browser preview loads (on demand, only the fonts a design uses). The template editor's font menu is grouped (Serif / Sans / Script & handwriting) with a Weight choice. Also: **Remove overlay** button in the editor, and the test stack's `cards.email_sends_per_day` is high (seed.test.sql), like its other rate limits.

- **Template editor fixes (9 Nov, requested by Gavin):** (1) cards no longer carry "Made with Magic Portraits AI": `cards.footer_text` defaults to empty and migration `20261109000001_no_card_footer.sql` clears the old default on magic-vault. (2) Dragging or resizing a zone snaps it to the horizontal centre (within 1.5% of the width) with a dashed guide, plus a "Centre … horizontally" button. (3) An "Edit (show boxes) / Preview (hide boxes)" switch above the preview. (4) The overlay is now the top layer (after the text and footer) in the shared drawing routine, so the card and the editor preview match; zone boxes stay above it in the editor. No live design had an overlay stored: the 9 Nov uploads on Thank you › Botanical were all backgrounds. Uploads are now friendlier: a see-through picture in the Background slot is refused with a pointer to the Overlay slot; overlays over 2 MB are compressed (lossless, then palette) and accepted up to 4 MB; 5:7 pictures of another size are resized.

- **Signed invoice link signs the customer straight in (8 Nov, requested by Gavin):** `/from/invoice?o=<order id>&t=<unix time>&s=<hex HMAC-SHA256(ENTRY_LINK_SECRET, "o.t")>&to=/create`, built in the Shopify invoice template with Liquid `hmac_sha256`. Valid `tracking.entry_link_valid_hours` (24) after `t`; the order is read live from Shopify (by id, else by number), test and cancelled orders refused; signs in the order's email only; super users never; rate-limited per IP; the address is cleaned by the redirect. An order number alone is never enough (numbers are sequential and guessable). Without `s`, or when it's expired, wrong or `ENTRY_LINK_SECRET` isn't set, it's the plain tracked link (expired → sign-in page). `vault_signed_in.method = entry_link`; `vault_entry_link_opened` gets `signed` and `link_check`. `ENTRY_LINK_SECRET` (≥ 32 chars) lives in Vercel and in the Shopify template only.

- **Where people came from (7 Nov, requested by Gavin):** two links bring people in: the free gift offer email (already counted exactly: its one-tap link marks the offer opened) and the invoice email's link. The invoice link becomes `https://my.magicportraits.ai/from/invoice` (names allowed in `tracking.entry_links`, default `["invoice"]`): it records `vault_entry_link_opened` (at most 5 per address per hour, so link scanners and repeat taps don't inflate it), sets a 1-hour `mmp_entry` cookie, and redirects to `?to=` or home. The next sign-in carries `entry` on `vault_signed_in` (`offer_email` for the offer's one-tap link). Dashboard panel "Where people came from" (`insights_entries`): offer email sent → clicked → made a card; each link clicks → signed in → made a card.

- **orders/paid accepts the store's notification key too (4 Nov):** the webhook was created in Shopify Admin › Settings › Notifications › Webhooks, whose deliveries (and "Send test notification") are signed with the store's notification key, not the app's client secret, so they were rejected silently. The handler now accepts either `SHOPIFY_CLIENT_SECRET` or `SHOPIFY_WEBHOOK_SECRET` (the store key, set in Vercel only), and logs one line (topic only) when neither matches. Checkout session tokens still use the client secret only.

- **Email redesign (4 Nov, from Gavin's mockup):** every email uses the new layout in `emails/Layout.tsx`: logo, white rounded card with a pill badge, big headline and full-width gradient button, optional numbered rows under the card, and a grey footer band (logo, why-you-got-this note, "company · address", Chat with us · Email preferences · Privacy Policy). Footer text and links are settings (`email.footer_company`, `email.footer_address`, `email.chat_url`, `email.privacy_url`). The offer email follows the mockup: "🎁 Free gift unlocked", "Turn your portrait into a greeting card", a fan of three theme-pack previews (`public/email/card-fan.jpg`, made by `scripts/gen-email-art.ts` from the illustrated sample portrait, never a customer's), "Create my card", three steps. Subject `gift.offer_email_subject` = "A free gift with your order {order}". The card email keeps its content ("Don't email me cards" stays as its preferences link). `supabase/templates/signin-code.html` was regenerated; it reaches Supabase Auth only when `pnpm auth:configure` is run again.

- **Free gift offer email sent by the app via AgentMail (4 Nov, Gavin's decision; changes SPEC §14a):** after a qualifying paid order (Shopify `orders/paid` webhook → `gift_offers`), the cron sends the offer email itself from the cards inbox when `gift.offer_email_channel = agentmail` (the default; `klaviyo` keeps the old route where a Klaviyo flow on `free_gift_unlocked` sends it — never both). Still off until `gift.offer_email_enabled` is on. Tracking: sent (`gift_offers.email_status`, `provider_message_id`), delivered / bounced / complained (AgentMail webhook), clicked (first use of the one-tap link, `first_used_at`), and cards made after it; shown in Settings › Emails. "Don't email me offers" (`/gift/unsubscribe?o=<offer id>`, needs a tap) adds an `offer_emails` suppression; bounces and complaints suppress all email. Migration `20261104000001_gift_offer_email.sql`.

- **Theme library Live switch (4 Nov, requested by Gavin):** each theme card has a Live switch. On: the theme goes live and every draft version is published (thumbnail rendered, as the template editor does). Off (with a confirm): the theme goes to draft and customers stop seeing it; versions keep their status, so on again is instant. Archived versions are never touched. A theme that's live with new drafts shows "Publish N drafts". `POST /api/admin/themes/[id]/live`, logged as `admin_version_published` per version plus `admin_theme_updated`. The status dropdown stays for archiving. Same day, all 10 seeded versions on `magic-vault` were set live by SQL at Gavin's request (they keep their built-in thumbnails).

- **Shopify auth by client credentials (4 Nov):** r_orders is a Dev Dashboard app (client id + secret, no permanent token), which is why the preview got `shopify_http_401`. `lib/sources/shopify-auth.ts` gets the Admin token with the client credentials grant, caches it in memory until 5 min before `expires_in`, shares one in-flight request, and `ShopifyLive` retries once with a fresh token on a 401. Env: `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` (the secret also verifies webhooks and checkout session tokens); `SHOPIFY_ADMIN_ACCESS_TOKEN` still works when no id/secret is set; `SHOPIFY_WEBHOOK_SECRET` is read only as a fallback name for the secret. The Data sources test shows the auth mode and shop, and a hint on token failures.

- **Failing sources degrade, not crash (4 Nov):** the first preview showed an error page because Shopify answered 401 (Preview's `SHOPIFY_ADMIN_ACCESS_TOKEN` / `SHOPIFY_STORE_DOMAIN`). `getVaultProfile` now catches each source (Shopify, mirror, Imagen), logs a masked error, returns a partial profile with `unavailable`, skips the member-cache write, and `/` and `/portraits` show a notice instead of the empty state.
- **Test sign-in (4 Nov, requested by Gavin):** `auth.test_signin_enabled` (default off, Settings › General › Testing) adds a "Test sign-in (no code)" button to /signin that signs in as any typed email. It is hard-blocked in code when `VERCEL_ENV=production`, because settings are shared between previews and production. Rate-limited per IP; logged as `vault_test_signin` (activity_log only, never Klaviyo). Turn it off and remove it before launch.

- **TypeScript 5.9** rather than 7.x (native preview), because Next 16's type plugin targets 5.x.
- **Playwright pinned to 1.63.0** to match the Chromium preinstalled at `/opt/pw-browsers`.
- **Local seeds:** `supabase/config.toml` runs `seed.sql` then `seed.test.sql` on `db reset`, so the test stack gets the production seed plus the test overlay (live versions, `cards.enabled` on, fixture people). `magic-vault` only ever gets `seed.sql`.

- **Contrast:** the live footer's muted text (black at 50%) and the menu's magenta lead label and faint numerals fail WCAG AA on the cream background. We use black at 60% for footer links, `#B8059F` for "Make something", and black at 50% for the 01–06 numerals. Everything else matches the live site.
- **Menu product rows** follow the `Menu` mockup (compact rows with thumbnail tiles) rather than the live site's large editorial list, since the mockup adds the MY MAGIC PORTRAITS group above it. Thumbnails are placeholder tiles until `links.menu_thumbnails` is set (SPEC Q9).
- **Brand icons** (Instagram, Facebook, WhatsApp) are inline SVGs: the current `lucide-react` no longer ships brand marks.

- **`cards.first_card_default_version`** default is `with-love-love` (full `theme-version` slug) rather than `general-love`, because the seed themes are named after the occasion (With love › Hearts). `docs/schema.md` updated.
- **Seed artwork** is the 10 looks from the `CardPreview` mockup across 7 themes, as placeholder images shipped in `public/theme-placeholders` (`builtin:` paths), since `magic-vault` only receives SQL. Themes are `live`, versions `draft` in the live seed.
- **Extra settings** beyond the docs, so nothing is hard-coded: rate limits (`auth.code_rate_limit_per_hour`, `auth.code_ip_rate_limit_per_hour`, `auth.verify_rate_limit_per_hour`, `vault.lookup_rate_limit_per_hour`, `redeem.download_rate_limit_per_hour`, `gift.offer_link_rate_limit_per_hour`), `cards.schedule_max_days`, `cards.signed_url_seconds`, `email.from_system`, `links.vip_login_url`, `vault.first_order_offer_code`, `tracking.*`, `klaviyo.max_attempts`. A `klaviyo` settings section was added to the allowed list.
- **Local env**: `scripts/local-env.mjs` reads the running stack's keys (`supabase status`) for tests, e2e and `.env.local`, so no keys are committed. `scripts/dev-up.sh` restarts Docker and the stack after a session restart.

- **"In season"** counts only themes with a date window. Always-available themes (Birthday, Thank you…) never make their category "in season", otherwise Birthdays and General would always sort first.
- **Settings cache** is 15 s in production; `SETTINGS_CACHE_MS=0` in tests so e2e can flip settings. The local test seed lifts the per-IP rate limits (every e2e request comes from one IP); `auth.link_ip_rate_limit_per_hour` is now a setting.
- **Message idea chips** are labelled "Idea 1/2/3" (the mockup's Warm/Funny/Heartfelt labels aren't in the data model); the full text shows as the chip's title and fills the message.
- **"Change design"** on FirstCard: the first tap cycles to the next in-season design; later taps (or a long-press) open the picker sheet.
- **Rendering is its own request** (`/api/cards/[id]/render`) rather than background work, so it works on serverless without `waitUntil` and gives the Creating screen a real result and "Try again".
- **AgentMail sender name:** the AgentMail send API sends as the inbox and has no per-message From display name, so "{from} via Magic Portraits" (`email.from_cards`) can't be applied through the API; the recipient sees the inbox's display name. The subject still says "Sam sent you a Christmas card". If the per-sender name matters, either set the inbox display name to "Magic Portraits" or switch card sends to AgentMail's SMTP relay (which accepts a From name). Listed under Open questions.
- **`agentmail` and `svix`** are server-external packages: the AgentMail SDK has an optional dynamic import (`@x402/fetch`) that the bundler can't resolve.
- **Mug lock in `days_after_order` mode** still locks once printing has started or the mug line is fulfilled (the print pipeline wins over the day count), so a choice can never change after printing.
- **`/api/test/reset-fixtures`** exists only when `DATA_SOURCE=fixtures` and `E2E_FIXTURE_RESET=1` (set only by the local test env); otherwise 404.
- **New switches** `redeem.mug_reminder_enabled` (off) and `redeem.mug_reminder_max_age_days` (30): the spec says the mug reminder is off by default but names no switch.
- **Pop-up request shape:** the session token proves the request comes from the store's checkout; the order id comes in the body and must be recent and paid. Shopify's checkout session token doesn't carry the order id itself.
- **Settings copy** (super users only) is written inline in English in the admin components rather than through `t()`; every customer-facing string goes through `t()`. Moving the admin strings into the dictionary is mechanical if a second language is ever needed there.
- **e2e runs against a production build** (`scripts/prod-server.sh`), and Playwright writes its artefacts to the OS temp folder; the fixture email/Klaviyo recorders do too. In dev mode the on-demand compiler reloads open pages, which made browser tests flaky.
- **Placeholder artwork and the sample portrait are traced into the serverless bundle** (`outputFileTracingIncludes`), because the renderer reads them from disk at runtime.
- **"Delete on request" on a single card** (All cards) deletes that card and its files only; the full person deletion (SPEC §15) is on the customer page.
- **Rate-limit settings** accept up to 1,000,000 per hour (the local test seed lifts them; a test now checks every test-seed value validates).
- **Test-only browser hook:** when `NEXT_PUBLIC_E2E_EVENTS=1` (set only in the local test env) the browser keeps a copy of tracked events in `window.__vaultEvents` for the analytics tests. Vercel builds don't set it.
- **`signin_links` table** in addition to `gift_offers.token_hash`, because one-tap links are also needed for admin "Resend sign-in link" and the mug-photo reminder's order link, which aren't gift offers.

## Blocked
- ~~Live Auth settings for `magic-vault`~~ **Resolved 3 Nov:** `pnpm auth:configure` applied after Gavin allowed it. Verified: 6-digit codes, 600 s, site URL `https://my.magicportraits.ai`, preview redirect URLs, Magic Link and Confirm signup templates showing `{{ .Token }}`. SMTP untouched.
- **SMTP sender name** on `magic-vault` reads "Magic Cards"; the spec says "My Magic Portraits". Left alone (SMTP is Gavin's to set).

- Shopify, Klaviyo and AgentMail can't be reached from this session (see Part 0). Each sits behind an interface with a fixtures implementation; the live clients are checked after deploy.

## Open questions

- AgentMail per-message From display name (see Decisions). Default: inbox display name, subject carries the sender's name.

- Fixture portraits are local files (`/fixtures/portraits/…`); in fixtures mode the app treats those paths as an allowed image source. Live mode only fetches from `redeem.allowed_image_hosts`.

## Security walk-through (CLAUDE.md, item by item)

| Rule | Result |
|---|---|
| Every customer action re-checks ownership and that it's allowed | ✅ Cards: `getOwnedCard` on render, image, resend, cancel, change, track; portraits must be in the person's own profile (`POST /api/cards`, e2e). Orders: `findOwnedOrder` re-reads the order on every view, mug save and download; mug present, not cancelled, not locked, offer open, tile in order; downloads re-check eligibility and the kill switch (unit + e2e). |
| No debug fields; never another person's data; errors don't reveal whether an email or order exists | ✅ Error bodies are `{ error }` only (e2e asserts no `debug`, emails or gids); "not yours" and "not found" are the same 404 and the same page; code requests answer the same for any email; the pop-up endpoint answers `unavailable`. |
| Downloads and card images use short-lived signed URLs or access-checked routes; no permanent public links to private files | ✅ Card images via `/api/cards/[id]/image` (owner or super user) and `/c/[slug]/image` (share link, 404 when hidden); downloads via `/api/orders/[name]/download*`; exports use 7-day signed URLs; `portraits` and `cards` buckets are private. |
| Only the allowed `NEXT_PUBLIC_*` values reach the browser | ✅ Bundle scan (above). |
| RLS on every table, deny by default; the browser never queries tables | ✅ RLS on all 18 tables with no policies; `anon`/`authenticated` grants revoked on tables and functions (integration test with the browser key). All reads/writes are server-side with the service role. |
| Verify Shopify and AgentMail webhook signatures; idempotent handlers | ✅ HMAC on the raw body / Svix signatures; `processed_webhooks` on `X-Shopify-Webhook-Id` and `svix-id`, plus the order id unique key (tests: forged, wrong secret, replay). |
| `/settings/*` and `/api/admin/*` 404 unless super user | ✅ Layout guard and `adminOr404` on all 28 admin routes (e2e for anonymous and a signed-in customer). |
| `/g/[token]`: random 32+ bytes, stored only as HMAC, expire, stripped from the address | ✅ 32-byte base64url, HMAC-SHA256 with `GIFT_LINK_SECRET`, `expires_at`, 303 to a clean path with `no-referrer`; PostHog drops `/g/` paths (tests). |
| Share slugs random, 16+ chars | ✅ 16 random bytes → 22 chars, DB check `length >= 16`. |
| No emails or tokens in URLs; admin pages use opaque ids | ✅ Customer search and card search in request bodies, activity-log email filter in a cookie, customers by `vault_members.id`, CSV export posted. Email links carry only an opaque delivery id. |
| Pop-up link endpoint: only a verified checkout session token for a recent order | ✅ HS256 verified with the app secret, `exp`/`nbf`/`dest` checked, paid within `gift.popup_window_minutes` (tests: missing, forged, expired, `alg: none`, old order). |
| Rate-limit code requests, lookups and downloads per email and IP | ✅ `hit_rate_limit()`: code per email and IP, verify per email, one-tap links per IP, downloads per person, mug saves, resends, track calls, pop-up per IP; limits are settings. |
| Never put message text or recipient details into PostHog, Klaviyo, `activity_log` or logs; no Klaviyo profile for recipients | ✅ `scrubProps` in every sender, fixed Klaviyo property lists, recipient events credited to the sender; e2e checks browser events, `activity_log` and the outbox for a distinctive message, name and address. |
| Mask emails in server logs | ✅ `maskEmail()` in every log line that mentions a person; health checks strip emails from error text. |
| Session replay masks inputs and the card preview | ✅ `maskAllInputs`, `.ph-no-capture` on previews and card images, `data-ph-mask` on names and messages (tests). |
| Klaviyo and Shopify writes only in the allowed places | ✅ Shopify writes only in `saveMugChoice` (`metafieldsSet` + `tagsAdd`); Klaviyo only through the outbox; `scripts/register-shopify-webhook.ts` written and not run. Nothing writes to Imagen, the mirror or the live site. |

## Summary

### What works
- Sign-in with a 6-digit code and one-tap links; old `/redeem` links; account menu and site menu.
- Home in all four states, My portraits, the first card on one screen, the full card builder with a live canvas preview identical to the server JPEG, scheduled and immediate email delivery, sharing, the public card page and referral redirect, My cards with change/cancel/resend/use again.
- Orders, the free-mug picker with the print lock and exact Shopify writes, downloads and streamed zips.
- The free gift offer (webhook, cron, pop-up endpoint, reminders) behind switches, all off; the Klaviyo outbox with retries.
- Settings: insights, customers with timelines, all cards, general settings, theme library and template editor, redeem, emails, tracking, data sources, super users, activity log; export and deletion on request.
- Analytics: every documented event, identity, super properties, replay masking.

### Stubbed or blocked, and why
- **Shopify, Imagen, events mirror, Klaviyo, AgentMail:** not reachable from this session (no secrets / not allowed by the egress proxy). Live clients are built to `docs/data.md`; check each with Settings › Data sources › "Test" and Settings › Emails › "Send me a test" on the preview once the Vercel secrets are in.
- **AgentMail per-sender display name** isn't supported by its send API (see Decisions).
- **PostHog dashboards:** `scripts/posthog-setup.ts` needs `POSTHOG_PERSONAL_API_KEY`.
- **Thank-you pop-up:** the Shopify checkout extension is outside this repo (`docs/gift-sheet.md`).
- **Theme artwork** is placeholder art; real artwork is uploaded in the template editor.

### Preview
- Branch previews: the Vercel project `magic-vault` (team Storyboards) builds every push of `claude/cool-volta-69zljg`, e.g. https://magic-vault-2jlhil01t-storyboards-a409a671.vercel.app (final commit) and https://magic-vault-aje83422k-storyboards-a409a671.vercel.app (Part 12, READY). Previews use `magic-vault` with every switch off and are behind Vercel Authentication.

### Launch checklist (BUILD.md › After the build)
| # | Step | Status |
|---|---|---|
| 0 | Apply the live Auth settings (`pnpm auth:configure`) | ✅ Done 3 Nov, verified |
| 1 | Review the preview on a phone; run every "Test" in Settings › Data sources and "Send me a test" in Settings › Emails; upload real theme artwork and publish the first versions | ⬜ Ready to do (needs the Vercel secrets from BUILD.md steps 2–8) |
| 2 | Merge the pull request into `main` (deploys my.magicportraits.ai; nothing is switched on) | ⬜ Not done, on purpose |
| 3 | Run `scripts/register-shopify-webhook.ts` against production | ⬜ Script ready, not run |
| 4 | Point the live `/redeem` to `https://my.magicportraits.ai/redeem` and add the MY MAGIC PORTRAITS menu links (Lovable) | ⬜ Outside this repo; `/redeem`, `/redeem?order=` and `/redeem/[order]` are ready |
| 5 | Add the thank-you pop-up calling `/api/gift/offer-link` | ⬜ Endpoint ready; notes in `docs/gift-sheet.md` |
| 6 | Klaviyo: turn on `klaviyo.enabled`, send one test event of each kind; later build the flows and turn on `gift.popup_email_later_enabled` | ⬜ Outbox, events and Data sources card ready |
| 7 | Privacy policy line about stored cards and staff access | ⬜ Outside this repo |
| 8 | Turn on `cards.enabled`, then `gift.popup_enabled` and `gift.offer_email_enabled`; watch Insights and PostHog | ⬜ All off in `magic-vault` (verified) |

---

# Shop (Gifts and Products), from 10 Nov 2026

Spec: `docs/shop.md`. Branch `claude/shop`. Mockups: the "Gifts & Products mockups" design canvas.

| Part | Name | Status |
|---|---|---|
| Shop 1 | Switches, settings, tables, Store collection reader, Settings › Shop | done (see Not run) |
| Shop 2 | Images and fit | done (see Not run) |
| Shop 3 | Templates and previews | done (see Not run) |
| Shop 4 | Customer screens | done (see Not run) |
| Shop 5 | Cart and checkout | done (see Not run) |
| Shop 6 | Tracking and docs | done, except the PostHog funnel (see below) |

## Shop 1
- **Hidden by default.** `shop.enabled` (customers) and `shop.super_user_preview` (super users) are launch switches, both off. `lib/shop/access.ts` decides; `lib/shop/index.ts` › `shopUserOrNull()` is what shop routes will call before anything else.
- **Settings:** 24 `shop.*` keys and `site.promo_bar_max_chars`; sections `shop` and `site`. Discount codes default to `SITEWIDE OFF` for normal customers and empty for VIPs (falls back to normal). Rule defaults (`shop.default_min_short_side_px` 1000, `shop.default_max_crop_pct` 30) are settings, not code.
- **Tables:** `shop_images`, `shop_carts`, `shop_cart_lines`, RLS on with no policies; private bucket `shop-uploads`. Migration `20261110000002_shop.sql` (not applied to `magic-vault`).
- **Shopify:** `lib/shop/sources/` (its own interface, fixtures and live), so `lib/sources` is unchanged. Reads the Store collection (products, media, variants, `mmp_shop` metafields), the `mmp_shop` definitions, a discount by code and a customer's tags. Writes only `mmp_shop.page`, `mmp_shop.occasions`, the occasions definition's choices and missing `mmp_shop` definitions (CLAUDE.md allowed write 5). The product and definition queries and the discount query were run read-only against the live store on 10 Nov and match the code's types.
- **Settings › Shop** (`/settings/shop`, new SHOP group in the sidebar): the two switches; each product in the collection's order with Shown/Hidden and why, sizes ready, page and occasions saved to Shopify; the occasion list (add, rename, reorder, remove; refuses to remove one a product still uses); "Create N shop fields in Shopify" when definitions are missing; both discount codes with what Shopify says about them.
- **Events:** `admin_shop_product_updated`, `admin_shop_occasions_updated`, `admin_shop_fields_created` (business, Settings).
- **Live store on 10 Nov (read-only check):** 10 products in the Store collection, none with any `mmp_shop` metafield yet and no `mmp_shop` definitions, so all 10 show as hidden until set up. `SITEWIDE OFF` is active: 50% off, limited to the Store collection, combines with product, order and shipping discounts, no end date. The shop's mug is its own product (`magic-mug-with-photo-copy-1`), not the free-gift mug that /redeem uses.

## Shop 2
- **Pictures** (`lib/shop/pictures.ts`, pure merge in `lib/shop/images.ts`): portraits from the existing profile lookup; photo tiles on the person's paid orders (`_tile_type` = photo, allowed hosts only, never signed links); past portrait uploads and dropped photo tiles from the events mirror through their own read-only source (`lib/shop/sources/images*.ts`, same index rules as docs/data.md §2.4); and new uploads. My photos lists them together, newest first, each URL once (an ordered tile keeps its label). Photo-tile file extensions are checked once with HEAD and remembered.
- **Opaque ids:** a hash of kind and URL (`p_`, `u_`, `t_`) or `n_<row id>` for new uploads. An id is only resolved against the signed-in person's own list, so it can't reach anyone else's picture.
- **Sizes:** read once per picture (allowed hosts, timeout and size cap from settings) and kept in `shop_images`.
- **Uploads** (`lib/shop/upload.ts`): checked by content with `sharp` (JPEG, PNG, WEBP, HEIC where the server can decode it), turned upright, converted to JPEG with camera and location data removed, transparent areas on white, refused under `shop.upload_min_short_side_px`. Stored in the private `shop-uploads` bucket as `u/<uuid>.jpg` (no email in the path) and shown through short-lived signed links. Rate-limited per email and IP.
- **Fit rules** (`lib/shop/fit.ts`, pure): picture kind, smallest short side, most it may crop, contain never crops, and for mugs the picture zone (`zone_px`, new variant field) rather than the whole wrap. `ideasFor` keeps the collection's order and only the sizes that pass; `cropAllowed` checks an Adjust crop. Tests cover square, 3:4, landscape and small pictures.
- **Routes:** `GET /api/shop/pictures`, `POST /api/shop/uploads`, both 404 unless the person can see the shop. Event `shop_image_uploaded`.
- **Deletion:** Settings › Customers › delete now also removes the person's shop carts, remembered pictures and uploads; it skips quietly if the shop migration isn't applied yet.

## Shop 3
- **Templates** (`lib/shop/template.ts`): one schema for `mmp_shop.template`; four-corner zones use a projective map, mug wraps a cylinder map with curve and spread. `zoneAspect` measures the zone so the editor can warn when it doesn't match a size's print shape.
- **One drawing routine** (`lib/shop/preview.ts`) for the browser and the server: the picture is cropped (or fitted, for contain) to the print shape on a flat canvas with the mask, then warped onto the blank product photo as a mesh of small triangles (8 × 8 flat, 32 × 12 for a wrap) with plain affine transforms. Each triangle is grown along its edges so no seams show; multiply is applied to the finished warp in one go, for the same reason. Server rendering in `lib/shop/render.ts` (`@napi-rs/canvas`), template photos only from `shop.template_image_hosts` (Shopify's CDN) or, in fixtures, `public/fixtures/shop/`.
- **Golden images** (`tests/fixtures/golden/shop/`): poster, tile and mug, each with a square and a 3:4 picture, plus a landscape picture on a poster with contain. Checked by eye before they were saved.
- **Template editor** (`/settings/shop/template/<product id>`, linked from each product in Settings › Shop): pick the blank photo and an optional overlay from the product's Shopify photos; flat or mug zone; drag the handles (or move them with the arrow keys, Shift for bigger steps); mask, corner size and shading; test renders with square, 3:4 and landscape sample pictures for any size that has rules; the shape warning; the draft kept in the browser; Publish writes `mmp_shop.template` (allowed write 5) and refuses photos that aren't the product's own. Event `admin_shop_template_published`. Tried in Chromium through a stand-alone harness (keyboard, drag, test renders, warning, draft restore; no console errors); not yet inside the app, which needs the local database.
- **Fixtures:** made-up blank product photos (`scripts/gen-shop-fixtures.ts` → `public/fixtures/shop/`) and their templates (`lib/shop/fixture-scenes.ts`).

## Shop 4
- **Screens** (`components/shop/`, routes in `docs/shop.md` › Routes): the Gifts and Products pages (chips by occasion or product type, "Start with a picture", sections with the customer's price); Choose a picture (Portraits, My photos with ORDERED / PHOTO TILE / SMALL labels, Upload with progress and every refusal in plain words); Product ideas (the picture with Change picture, the first `shop.top_picks_count` previews drawn live in the browser, See all); the product sheet (big preview, sizes as a radio group with prices, quantity, Add to cart); Adjust (drag or arrow keys, zoom capped so the crop never drops under the size's smallest-picture rule); the cart.
- **Header and menu:** Gifts and Products (NEW) in the menu, the cart icon with its count only while the cart has items, and the promotion bar above the header (`site.promo_bars`, edited in Settings › Shop; closed bars stay closed for the visit and come back when the text changes). All of it only while the shop is visible to the person (`lib/shop/shell.ts`, kept light because the customer layout calls it on every page).
- **Existing screens touched** (each only renders shop things while the shop is visible): `Header` (optional `shop` prop), `MenuSheet` (optional `shopVisible`), the customer layout, Home (two tiles after the page, never on the first-time home) and My portraits (a banner).
- **Checked** in Chromium through a stand-alone harness with the app's own CSS, on fixtures, at 390, 360 and 1280 px: every screen renders with no console errors, axe (WCAG 2.2 AA) is clean on all of them, Adjust (zoom, drag, arrow keys), changing size, the gift-name check and the cart's notices work. Not yet inside the running app (needs the local database).

## Shop 5
- **Cart** (`lib/shop/cart.ts`, rows in `lib/db/shop.ts`): one open cart per email. Add to cart re-checks on the server that the picture is the person's, the size suits it and an Adjust crop is allowed, then draws the order line's preview on the server and keeps it in `shop-uploads` (`p/<line id>.jpg`). Quantity and removal only touch the person's own open cart. Limits and rate limits come from settings.
- **Shopify's cart** (`lib/shop/sources/cart*.ts`, Storefront API, allowed write 4): created when the cart is first shown, then kept in step by `_vault_line_id` (add, change, remove), with the customer's discount code and our cart attributes. The cart page shows Shopify's own figures; if Shopify can't be reached it shows our prices and says so, and Checkout says it isn't available.
- **Checkout:** every line checked again (picture still theirs, product still for sale, rules still pass); the VIP tag read fresh so the code matches who's paying; "Who's it for?" required only when the cart holds a Gifts-page line (name required, message optional, `shop.gift_message_max_chars`), saved as `Gift for` / `Gift message` on Shopify's cart; then Shopify's `checkoutUrl`. The cart stays open, so coming back without paying keeps it.
- **What goes on the order** is one pure function (`lib/shop/order-lines.ts`) with a test that pins the exact keys, checks none is a portrait key, and runs a shop line through the /redeem parser to prove it isn't read as a portrait, mug or download.
- **orders/paid:** the existing webhook now also marks a shop cart paid when the order carries `_source` = shop and our `_vault_cart_id` (`shop_order_paid`); any failure there is logged and never changes the webhook's reply. The gift-offer handling is unchanged.
- **Fulfilment:** `POST /api/shop/fulfilment/image` (shared secret `SHOP_FULFILMENT_SECRET`) hands out fresh signed links for new uploads and previews. Daily cron `/api/cron/shop-carts` (new entry in `vercel.json`) clears carts untouched for `shop.cart_expiry_days`.

## Shop 6
- **Events** (`docs/analytics.md` › Shop): page views for every screen, picture chosen and uploaded, product opened, added to cart, cart changed, checkout started, order paid, promotion bar tapped and closed. Never a picture URL, gift name or message. `shop_added_to_cart` and `shop_checkout_started` can go to Klaviyo but only once someone adds them to `klaviyo.events`.
- **Docs:** `docs/shop.md` (switches, routes, order keys), `docs/data.md` §11 (Admin and Storefront calls, webhook, fulfilment endpoint, mirror reads), `docs/schema.md` (tables, bucket), `docs/analytics.md`, `SPEC.md` §22, `.env.example` (`SHOPIFY_STOREFRONT_TOKEN`, `SHOPIFY_STOREFRONT_PRIVATE_TOKEN`, `SHOP_FULFILMENT_SECRET`), CLAUDE.md (allowed writes 4–5, the switch rule).
- **PostHog funnel not created yet:** none of the shop events exist in PostHog until the shop is used, and a funnel on events PostHog hasn't seen would be empty. Its definition is in `docs/analytics.md`; add it to the dashboard after the first super-user preview.
- **Settings › Shop › Shopify access** lists the four Admin permissions the shop needs, whether a Storefront token is set and whether the fulfilment secret is set.

## Studio templates (11 Nov)
- **Why:** the product previews are what sell the shop, and corners dragged onto stock photos never line up exactly. Each Store product now has a studio scene rendered in Blender (`scripts/mockups/`, docs/shop.md › Studio templates). Because the print area is known in 3D, the zone matches it to the pixel, the picture takes the product's real shading (`blend: multiply`), and the overlay adds the shine and clips the edges.
- **Checked** through the shop's own `drawPreview` with a made-up picture for all 11 products, at draft and at final size.
- **Live since 11 Nov (Gavin's OK):** the 22 files are in Shopify Files (`mmp-shop-<product>-base.jpg` / `-overlay.webp`, uploaded from `assets/shop-templates/` at commit cf9a479), and all 11 products' `mmp_shop.template` now use them, replacing the 9 drawn by hand on 10 Nov (each write checked the template hadn't changed since it was read). Acrylic Print (no page), Magic Puzzle and Acrylic Glass Art (no print rules) stay hidden until those are filled in; the puzzle's zone is 4:3 landscape, so its print areas should be too.
- **Smallest picture:** `shop.default_min_short_side_px` set to 512 (Gavin, 11 Nov): 95% of portraits are 512 × 512 and the live tiles print from them. When nothing fits, the Ideas page now says whether the picture is too small ("This picture is 512 px across, and our products need at least … px") or the wrong shape.
- **Editor change:** a template's background and overlay may now be Shopify Files (not the product's gallery), so the studio photos never show on product pages. Settings › Shop › the template editor lists them beside the product's photos, and Publish accepts only the product's own photos or the ones its saved template already uses.

## Product sheet copy (11 Nov)
- The sheet shows Shopify's description as paragraphs and bullet lists (`lib/shop/description.ts`, text only, never raw HTML).
- New `mmp_shop.short_description` (multi-line text) wins over it: Gavin asked for 4 to 5 lines on a phone. Written for all 11 Store products from their existing descriptions, sizes and SKUs and measured at 390 px with the site font (4 lines each, 5 for Acrylic Print). The products' own descriptions were left as they are, because six of them are also on the Lovable, Shop and TikTok channels.

## Decisions (shop)
- **Shop lines don't reuse portrait keys** (`_tile_id`, `_imagegen_session_id`, `_gelato_product_uid`…); they use `_shop_*` keys, so /redeem and the existing print pipelines can't pick them up. Changed from the first spec draft.
- **A size with no print rules is dropped, not the whole product;** the product is hidden only when no available size has rules. Settings lists the sizes that need rules.
- **Shop orders unlock the free card offer** like any paid order (unchanged behaviour), until Gavin says otherwise.
- **Mugs fill a zone, not the wrap.** Measuring a square portrait against a whole 2475 × 1155 mug wrap hid every mug; the new `zone_px` rule is the shape the picture fills.
- **Landscape photos** see fewer ideas on portrait-shaped prints (open question in docs/shop.md).
- **Activity rows** for shop admin events carry the product id in props, not `ref`, so `activity_log`'s ref types stay as they are.

## Not run (this session)
- The local Supabase stack can't start here: the network blocks the container registries (ghcr.io, Docker Hub). So the DB-backed unit tests (74 on `main` too) and every e2e, including the new `tests/e2e/shop-settings.spec.ts`, `shop-pictures.spec.ts` and `shop-flow.spec.ts`, haven't run. Typecheck, lint and the 147 other unit tests plus the new shop tests pass. Run `pnpm test` and `pnpm e2e` in a session that can reach the registries before merging.

## Blocked / needed from people (shop)
- **Shopify app permissions.** The r_orders app has `read_orders`, `read_all_orders`, `write_orders` and `read_customers` (Settings › Data sources, 8 Nov). The shop also needs `read_products` (the Store collection), `read_discounts` (SITEWIDE OFF / VIP code) and `write_products` (Settings › Shop and the template editor save `mmp_shop` fields). Until then the shop can't read its products and stays empty for super users.
- **Storefront token** for carts: done 11 Nov. Headless storefront "My Magic Portrait Store" (Shopify admin › Headless › 424297; its sales channel shows as "Storyboards Headless 03", publication 192604864708), its private token in Vercel as `SHOPIFY_STOREFRONT_PRIVATE_TOKEN` (Gavin), and the 11 Store products made available on it. A new Store product must be added to that channel too, or Shopify won't accept it in a cart.
- **Preview templates** for all 10 products (Settings › Shop › template editor). Every product is hidden until it has one. This session can't open Shopify's product photos (cdn.shopify.com isn't reachable), so they weren't drawn here.
- **Smallest picture.** 95% of portraits made in the last 60 days are 512 × 512 px (the rest 1024 × 1024). With `shop.default_min_short_side_px` at 1000 every size is hidden for them. Today's tiles already print from the same 512 px pictures; Gavin to choose the minimum.
- **Magic Puzzle** has no print rules yet (its print area for 30 / 252 / 500 pieces isn't known), so it stays hidden.
- **Print system.** It takes orders from Shopify on its own (Gavin, 10 Nov), so there's no fulfilment secret or endpoint to set up. It must take the picture from `_image_url` on shop lines, the same key today's portrait lines use. Adjust is off on every size (`mmp_shop.adjustable = false`), so what prints is the default crop the preview shows (top kept, sides trimmed evenly; centred before 16 Nov), whether or not it reads `_shop_crop`.
- **Tests** still can't run here: the image downloads come from `pkg-containers.githubusercontent.com` (GitHub) and `production.cloudfront.docker.com` (Docker Hub), which are blocked, and Docker Hub rate-limits. `api.supabase.com` is now blocked too, so `pnpm db:apply-remote` can't run from this session.

## Done on the live systems (10 Nov, with Gavin's OK)
- **magic-vault:** migration `20261110000002_shop.sql` applied through the Supabase connection (recorded in `supabase_migrations.schema_migrations` under the same version, so `db:apply-remote` skips it) and the 41 `shop.*` / `site.*` seed rows added (insert-only). Checked: 3 shop tables with RLS on, private `shop-uploads` bucket, `shop.enabled` and `shop.super_user_preview` off. The rows show in main's Settings › Variables as extra rows; nothing else on main reads them.
- **Shopify:** the 14 `mmp_shop` metafield definitions (occasions: Christmas, Birthday, New Year, For Mom, For Dad, Pet lovers) and 111 values on the Store collection, through the Shopify connection. No other product field was changed (product types were left as they are; they only group the Products page).

| Product | Page | Occasions | Maker · print area per size |
|---|---|---|---|
| Magic Xmas Ornaments (set of 2) | Gifts | Christmas, New Year | Gelato · 900×900 |
| Magic Mug with Photo | All | Christmas, Birthday, For Mom, For Dad, Pet lovers | Gelato (from the SKU's form) · 2475×1155 wrap, 1155×1155 picture |
| Magic Pillow with Photo | All | Christmas, Birthday, For Mom, Pet lovers | Prodigi `GLOBAL-CUSH-12X12-LIN` · 3600×3600 |
| Magic Puzzle | All | Christmas, Birthday, For Dad | **not set** |
| Acrylic Block | All | Christmas, Birthday, For Mom, For Dad | Prodigi · 4×6 1200×1800, 5×7 1500×2100, 6×8 1800×2400 |
| Acrylic Square Block | All | Birthday, For Mom, For Dad, Pet lovers | Prodigi · 4×4, 6×6, 8×8 at 300 dpi |
| Masterpiece | All | Christmas, Birthday, For Mom, For Dad | In-house · 8×12, 12×16, 16×24, 20×30 at 300 dpi |
| Magic Poster | Products | | Prodigi · 8×10, 12×16, 18×24, 24×36 at 300 dpi |
| Acrylic Print | Products | | Gelato (from the SKU's form) · 8×12, 12×16, 16×20 at 300 dpi |
| Magic Portrait Tile | Products | | In-house · 8×8, 12×12, 16×16 at 300 dpi |

Every size: maker's code = the variant's SKU, Adjust off, placement cover (the mug: wrap_zone). Smallest picture and most crop are left to the settings (`shop.default_min_short_side_px`, `shop.default_max_crop_pct` 30%), so a square portrait won't be offered on 2:3 sizes (4×6, 8×12, 16×24, 20×30, 24×36), which would lose a third of it.

## Shop launch checklist
| # | Step | Status |
|---|---|---|
| 1 | Apply the shop migration and seed to `magic-vault` | Done 10 Nov |
| 2 | `mmp_shop` field definitions and values on the Store products | Done 10 Nov, except the puzzle's print areas |
| 3 | Shopify: add `read_products`, `read_discounts`, `write_products` to the r_orders app; Storefront token in Vercel; Store products published to its channel; redeploy | Done 11 Nov |
| 4 | Choose the smallest picture (`shop.default_min_short_side_px`) | Done 11 Nov: 512 px |
| 5 | Templates for each product | Done 11 Nov: studio templates for all 11 |
| 6 | Turn on `shop.super_user_preview`, test on the branch preview, buy one item end to end (VIP code, `SITEWIDE OFF`, the order prints, the cart shows paid) | |
| 7 | Run `pnpm test` and `pnpm e2e` in a session that can reach the container registries | |
| 8 | Merge `claude/shop`; add the shop funnel to the PostHog dashboard | Merged 11 Nov; funnel still to add once shop events arrive |
| 9 | Turn on `shop.enabled`; add a promotion bar if wanted | Live for everyone on merge, 11 Nov (Gavin's choice, with `shop.enabled` already on) |

## Speed (11 Nov)
Gavin: "slow to react when a button is pressed". Measured before changing anything:
- PostHog web vitals for my.magicportraits.ai (7 days): first paint p75 3.9 s, LCP p75 4.0 s; INP p75 0.14 s, so taps themselves were fine and the wait was the server.
- Timed from Gavin's browser (Israel → fra1 → iad1): `/` 1.8 s, `/gifts` 2.4–3.1 s, `/products` 2.1 s, `/portraits` 2.0 s, `/cart` 1.0 s, `/cards` 0.6–0.9 s, `/api/health` 0.2 s.
- Supabase edge logs line up each page: our own queries take 10–30 ms; the gap is the person's Shopify orders and Imagen portraits read one after the other (1.2–1.4 s on every page), then on shop pages the pricing/catalog (0.2–0.6 s) and the mirror's pictures (0.2–0.6 s), also one after the other.
- Bug found on the way: Storefront `cartDiscountCodesUpdate` was declared `$codes: [String!]` (Shopify wants `[String!]!`), so every cart whose code had changed logged "Shopify cart unavailable" and its checkout returned `shopify_unavailable`. Fixed; all seven cart operations now checked against Shopify's published Storefront schema (`@shopify/hydrogen-react` 2026.4).

What changed:
- **Profile** (`lib/vault/profile.ts`): Imagen starts on the known sessions while Shopify is still answering (extra sessions from order lines after); kept in the server's memory for `vault.profile_memory_seconds` (new, default 60, memory only, never in the database; 0 = live every page); requests arriving together share one read; the member-cache write runs after the response (`after`). `forgetProfile` after a mug choice. Health's warm timing skips the memory.
- **Shop**: picture list reads profile, mirror and new uploads side by side, photo-tile lookups 8 at a time, memoised per request; landing, ideas, cart and add to cart read side by side; Gifts/Products stream the "Start with a picture" tiles (Suspense) so products show first; shared in-flight catalog, VIP and discount reads; one mirror pool kept open 60 s.
- **Add to cart** answers before drawing the preview (drawn after the response; checkout draws any still missing and Shopify's line gets the preview attribute when it appears); the header cart badge updates in place instead of reloading the page.
- **Cart**: + / − / Remove change the line, prices and badge at once; quick taps are saved together; Checkout waits until the cart is saved.
- **Every customer page** shows a loading placeholder the moment a link is tapped (`app/(customer)/loading.tsx`).
- **Cold starts**: the layout no longer loads the canvas and image libraries (light `lib/shop/cart-count.ts`, renderer and sharp imported only when used).
- **Logs**: `[perf] <step> <ms>ms` for any outside call slower than `vault.slow_call_log_ms` (new, default 500): Shopify Admin/Storefront by operation name, the Shopify token, Imagen, the mirror, preview drawing. Step and time only.
- **Portraits without Shopify** (`knownPortraits`): add to cart and Product ideas find the picture from Imagen for the sessions already cached on the member row (full profile only if it isn't there); the "Change picture" strip streams in (React `use`).
- **Events**: `track()` writes `activity_log` first and sends the PostHog capture and the immediate Klaviyo send after the response.
- **Bug: adding the same thing twice made a new line** every time, because the crop was compared as JSON text and jsonb hands keys back as `{h, w, x, y}`. Now compared by value (`sameCrop`).

Measured on the branch preview from Gavin's browser (same data as live):
| | Before (live code) | After, fresh server | After, warm |
|---|---|---|---|
| Something on screen after tapping a link | 2.9 s (nothing until the page) | 0.02–0.09 s (placeholder) | same |
| `/` | 1.8 s | 3.2 s (first request on a new server) | 0.66–0.93 s |
| `/gifts` | 2.2–3.1 s | products 0.6 s, pictures 2.3 s | 0.7 s |
| `/products`, `/portraits` | 1.8–2.1 s | 0.9–1.2 s | 0.6–0.8 s |
| `/cart` | 1.0–1.9 s | 1.8 s | 0.76–0.92 s |
| Product ideas after tapping a picture | 2.1–2.3 s | 0.85 s | |
| Add to cart (badge updated) | 3.4 s, then a full page reload | 1.85 s, no reload | |
| Cart + / − / Remove | nothing until the reload | 0.04 s on screen; saved within 4 s | |

Still slow, and why: Shopify's orders search is 1.1–1.4 s per read, the mirror (us-west-1) 0.6 s on a new connection, and Storefront cart mutations 0.9–1.7 s each. A server only remembers what it read itself, and Vercel spreads one person's requests (pages and their prefetches) across several servers, so the 60-second memory often misses.

## Newest first, Show more (11 Nov)
Gavin's idea: read only the newest 3 Imagen sessions and 3 orders, with "Show more" in the gallery. The data before building: 292 of 307 members (95%) have 3 or fewer sessions (about 6 portraits each); 9 have 4–10 and 6 have 11+ (about 300 portraits each). Gavin's own account has 73 sessions (77 with recommendation children) and 482 portraits, which is why the app was much slower for the team than for a typical customer (PostHog: sign-in lookup p50 0.8 s for 1–3 orders and ≤3 sessions, 3.7 s for 11+ of both).
- `vault.recent_sessions` (3) and `vault.recent_orders` (3), both 0 = everything. Pages get the newest sessions (Imagen `portraits(…, { newestSessions })`, children counted as sessions) plus `portraitTotals` for the counts, and the newest orders (`recentOrdersByEmail`).
- **Free gift:** when the newest orders don't show it and older ones exist, the rest are read (`needsOlderOrders`), so nobody loses card access because their qualifying order is older.
- `VaultProfile` gains `sessionCount` and `more { sessions, orders }`; `portraitCount`/`orderedCount` are the totals. The member cache keeps `is_customer` / `first_order_at` from the last full read when older orders weren't read.
- **Show more:** Portraits (`?all=1`, kept when the filter changes), the card builder's portrait step and first-card photo sheet (`GET /api/portraits`, own sessions only, rate-limited like lookups), and the shop's Choose a picture (`?all=1`). Card create/edit, a builder link to an older portrait, and shop `pictureFor` look through everything when the picture isn't in the newest.
- Everything else reads all: Settings › Customers, sign-in (refresh, which also feeds Klaviyo), the health check, `/api/shop/pictures`.
- Known limits of the newest-only view: the home page's "choose your mug photo" count covers the newest orders only (the Orders page lists them all), and a portrait whose only order is an older, cancelled one on the same email can show "Ordered" until Show more.

### AI room photos (11 Nov, parked)
- Settings › Shop › AI room photos: AI lifestyle photos of Store products (pillow on a sofa, Masterpiece on a wall, puzzle on a table, acrylic block on a sideboard or desk), made through Vercel AI Gateway with the deployment's OIDC token. 12 starter scenes with 12 sample pictures; scenes, product wording, model, size and daily limit are settings. Photos are kept in theme-assets/shop-scenes/.
- Decision: the model gets the product's studio render for shape only and the picture pre-cropped to the print shape, so the printed area matches what the customer orders.
- Next: pick favourites, then use them as product photos and/or as templates (a blank version of the same room, with the zone fitted).
- Parked: the team's AI Gateway is on the free tier, which doesn't allow image models. Gavin chose 3D rooms instead; the page stays super-user only and works once paid credit is added.

### Furnished 3D rooms (11 Nov)
- `scripts/mockups/rooms.py`: five furnished rooms built on the studio-template pipeline (pillow on a velvet sofa, Masterpiece over a walnut sideboard, puzzle on a dining table, acrylic block on a sideboard and on a desk), with scanned Wayfair/Khronos furniture (CC BY 4.0, credit line in `scripts/mockups/ASSETS.md`), window daylight and a photo wood texture. Each comes out as a normal template (background, overlay, zone).
- 12 sample pictures in `public/shop-samples/scenes/`; `room_gallery.sh` draws every room with each.
- Decision: the room puzzle is upright (3:4) to suit portrait pictures. Its print rules still need a 3:4 print area.
- Next: Gavin picks the rooms to use, then they're uploaded as each product's template (Shopify Files, like the studio ones) or kept as extra product photos.

### Photo library (12 Nov)
- Settings › Shop › Photo library: the 5 furnished rooms (60 photos with sample pictures, plus each empty template) and the 11 studio photos, in `public/shop-library/` (8 MB) with `lib/shop/photo-library.ts` made by `scripts/mockups/export_library.py`.
- The template editor lists the rooms for its product: Use this room uploads the room's photo and overlay through the existing upload route and sets zone, mask and blend, as a draft until Publish.

### Blank linen cushion template, curved edges (15 Nov)
- Gavin's Prodigi blank linen cushion photo made into a Magic Pillow template by `scripts/mockups/blank_template.py`: outline from the fabric's texture, fabric evened toward white for multiply, overlay see-through inside the outline, corners just outside it.
- Gavin asked for the top of the picture to be the top of the cushion: with straight edges the dip in the cushion's top and its pulled-in sides trimmed up to about 100 px of the picture (dogs' ears). Four-corner zones now take optional curved edges (`zone.bend`, 1–9 points per edge, `lib/shop/template.ts`); the fitted curves leave at most about 10 px trimmed along the top. Templates without `bend` draw exactly as before (golden images unchanged).
- Editor: "Curved edges, for a cushion or other soft product" adds draggable curve points (also arrow keys). The shape warning measures a curved zone across its middle (the cushion is 1.02 wide for 1 tall, not the 1.10 its corners suggest).
- Photo library: the cushion is in it as a blank product (`public/shop-library/blanks/blank-pillow-linen/`, 12 sample photos), so "Use this photo" in the Magic Pillow editor sets photo, overlay, corners and curves in one go. Not published to Shopify.


## 16 Nov: the customer's own picture on Gifts and Products
- **Done.** Gifts and Products pick the person's newest picture (or `?pic=`, checked as theirs) and draw it on every product card that suits it; a bar shows it, their other pictures (one tap switches) and **Change photo**. Cards open Product ideas with that product's sheet open. No pictures yet: the old "Start with a picture" box. `landingPictures` in `lib/shop/pages.ts`.
- **Fixed: hidden shop pages answered 200.** The loading placeholders (perf work) make every customer page stream, so a page's own `notFound()` showed the not-found page with status 200. `proxy.ts` now answers `/gifts`, `/products` and `/cart` with a real 404 while the shop is hidden from that person.
- **Known:** a shop page for a picture that isn't theirs still shows the not-found page with status 200 (same streaming cause). The server re-checks ownership and shows nothing of the picture; checking ownership in the proxy would need Imagen calls on every request.
- **Shop e2e fixed:** the local stack needed `supabase db reset` (it predated the shop settings, so the tests' setting changes did nothing); the test seed lifts the shop upload/cart/checkout limits; `getByLabel("Page", { exact: true })`; the cart helper waits for the cart's refresh; the template test accepts Make or Edit. All 29 shop e2e tests pass at 390 and 1280.

## 17 Nov: Products page categories work like Gifts occasions
- **Done.** New product field `mmp_shop.categories` (a list, like occasions). Settings › Shop has a **Categories** editor next to Occasions (add, rename, reorder, remove; refused while a product uses it) and category chips on each product. The Products page groups and orders by category. A product with no category falls back to its Shopify product type, so the live page is unchanged until categories are set. Event `admin_shop_categories_updated`.
- **To switch it on live:** Settings › Shop › **Create 1 shop field in Shopify** (creates `mmp_shop.categories`, seeded with today's product types), then tick categories on each product.
- **Print rules entered in Shopify** (17 Nov, at Gavin's request): Magic Puzzle (`JIGSAW-PUZZLE-30/252/500`) and Acrylic Glass Art (`GLOBAL-MOU-ACRY-4X6 … 20X30`), maker prodigi, print areas from the Prodigi API.
- **Open:** Next.js 16.4.4 reports a known security vulnerability (`next dev`/`next build` stop once on an upgrade notice; a retry continues, and this was why the e2e web server sometimes "failed to start"). Upgrade as its own change.
- **Tests:** the shop e2e cart helper waits for the cart to load; the print-rules test presses Save with the keyboard (a dev-only Next.js badge can cover it at 390 px).

## 17 Nov: Settings › Shop changes show at once; landing shows only their own picture
- **Fixed: categories didn't show on Products after saving.** Each server kept its own copy of the Shopify products for `shop.product_cache_minutes` (5), and a save only cleared the copy on the server that handled it. Now every Settings › Shop save to Shopify also stamps the new read-only setting `shop.catalog_changed_at`; every server re-reads Shopify when its copy is older than the stamp (settings are re-read within seconds). The live row is created on the first save (upsert); `seed.sql` has it too.
- **Gifts and Products load without flashing the plain product photos.** While their pictures load, the "Choose your picture" box shows placeholder tiles and each product card shows a pulsing placeholder; then every card shows their own picture. Product photos only appear for products the picture doesn't suit, or for someone with no pictures yet.
- Shop e2e: the cart helper repeats (reload, remove) until a fresh load shows an empty cart.

## 18 Nov: Next.js security upgrade
- **Done.** `next` and `eslint-config-next` 16.4.4 → 16.4.6. Fixes GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8 (moderate; both are cache leaks in `'use cache'` / `unstable_cache`, which this app doesn't use). `next dev` and `next build` no longer stop on the upgrade notice.
- **Still open:** `pnpm audit` reports two moderate advisories in `glob` / `minimatch`, pulled in by `archiver` (hi-res download zips). They need an `archiver` upgrade; separate change.

## Open store

Built on `claude/open-store` (from `claude/shop`) through `docs/open-store.md` › Build parts. Draft PR into `claude/shop`. `open_store.enabled` and `open_store.super_user_preview` stay off; with them off every existing screen and test is unchanged.

### Decisions
- **`main` merged in first.** `claude/shop` was 19 commits behind `main` (print rules editor, Products page categories, the landing pages, the cross-server product refresh, Next.js 16.4.6), and the spec's one product page needs print rules and categories. Conflicts: `lib/shop/preview.ts` (kept the curved-zone mesh from `claude/shop` and the no-stretch crop from `main`), `docs/shop.md`, `docs/analytics.md`, this file (kept both sides).
- **One set of products for both stores.** The fixtures hold each product once, marked Store, Magic Store or both (`fx-canvas` is Magic Store only, `fx-tee` Store only), so a Settings save shows in both stores, as in Shopify. Magic Store fields ride on `ShopProduct.store` (optional), read only by the open store's own query.
- **Writes go through the shop's source.** `setProductMetafields` (shared and Magic Store fields) and `setThemeChoices` (the `imagen_theme` dropdown) were added to `ShopCatalogSource`, so both stores save one way (CLAUDE.md allowed write 5). The open store's reads use the shop's authenticated client (`adminQuery`, read-only).
- **Sales channel check:** the open-store check needs "published to the Storefront token's channel", but which publication that is can't be read from the token. New setting `open_store.storefront_publication_id` (empty: not checked). The live store has several "Storyboards Headless" channels; fill it in once you know which one the token uses.
- **Theme check:** an unknown or inactive theme hides the product ("Its Imagen theme isn't in Imagen's list"), since it couldn't make a picture. When Imagen's list can't be read, themes aren't checked.
- **"Every size has rules"** is taken literally for the Magic Store (sold-out sizes too, since they still show as chips), unlike the shop, which needs one.
- **Imagen's theme list:** `parseThemes` reads Imagen's real shape (confirmed 24 Nov, see Blocked): `slug`, `is_active`, `category.slug`, `input_count` and `inputs`.
- **Settings keys with an underscore:** the settings table only allowed `[a-z]+` before the dot, so `open_store.*` couldn't be stored. Migration `20261123000001_open_store_settings.sql` relaxes the key and section checks (additive).
- **Print rules and the template editor** now find a product in either collection (`adminProducts()`), since both stores share them; they said "not in the Store collection" for a Magic Store-only product before.
- **The Settings menu's SHOP group:** Products, Gifts & Products pages, Magic Store, Photo library, AI room photos.
- **Visitor key:** the cookie's HMAC uses `VISITOR_SECRET` when set, else a key derived from `GIFT_LINK_SECRET` for this one purpose, so the store works on previews without a new secret. Setting `VISITOR_SECRET` later signs everyone out of their visitor (their pictures stay, unreachable from the old cookie), so set it before launch.
- **Limits count rows, not requests:** per visitor, per IP and in total, "today" is the business day in `brand.timezone`, counted from `store_generations` without failed or timed-out ones (so a failure never counts). A separate hourly request cap per IP (4 × the daily IP limit, at least 60) stops bad uploads being hammered in.
- **Fixture cases by name:** with `DATA_SOURCE=fixtures`, the pet's name picks Imagen's behaviour (`Oops` fails, `Slowpoke` takes 20 s, `Forever` never finishes, `Faces` asks to pick faces; anything else is ready in about 3 s with a 3:4 and a square result, three for two-photo themes). The session id carries the case and start time, so it survives a dev-server reload.
- **Extra photos for Imagen** go one file field per role of the theme (`inputs[].role`), with the names as `{ "<role>": "<name>" }`; a one-photo theme gets `source_image` and the name as a string (confirmed 24 Nov).
- **Pictures are copied** to `store-uploads` as PNG on the first status check that sees `done`; the page only ever loads our copies through `/api/store/files/<id>`, never Imagen's URL.
- **Bot check:** Vercel BotID on `POST /api/store/generations` (`instrumentation-client.ts`, `withBotId` in `next.config.ts`). It's skipped with fixtures and in development, where BotID always says human.
- **The cart lives in Shopify only:** each line's picture, rules and preview ride on the line's hidden attributes, and the drawer reads Shopify's cart (no cart tables of our own, unlike the shop). The preview is drawn on Add to cart and kept at `<visitor>/previews/<line>.jpg`; the order line gets a signed link for `shop.fulfilment_link_days`.
- **Lines on the order** carry `_shop_page` = `open_store` and the `_shop_theme` key besides the shop's keys (`lib/open-store/order-lines.ts`); `orders/paid` finds the pictures by `_shop_session_id`, only on the paying visitor's own rows.
- **Linking on sign-in happens in `proxy.ts`** on the next store page a signed-in person opens (the visitor cookie is httpOnly, and only the proxy or a route can replace it on a shared device). "Sign in" on store pages returns to the same page.
- **"Your picture is ready"** goes from the first status check that sees the picture done (or at once if it's done when the address is given). One per picture (claimed in the row), at most `open_store.emails_per_address_per_day` per address per business day. The link is a sign-in link with purpose `store_picture`; it links the picture's visitor only when its address matches the one typed.
- **Klaviyo for store subscribers:** a new outbox kind `subscription` (`profile-subscription-bulk-create-jobs`), plus the `Store Picture Ready` event, both only when the box was ticked; new settings `open_store.klaviyo_list_id` (optional list) and `open_store.klaviyo_source`. The email subject is `open_store.picture_email_subject`.
- **Server events credit the browser's PostHog id:** the store's API calls send the anonymous id as `x-ph-id`; it's kept on the visitor row (never an email: identified ids are ignored) and used for every server event until the visitor has a proven email, then the email. A paid order calls PostHog `alias(email, anonymous id)`. Person profiles are kept for store visitors (`$process_person_profile` true on their events), as the spec's person properties need them.
- **First touch** is kept in a 30-day httpOnly cookie (`mmp_ft`) from the first store page and saved on the visitor row with the first photo or Add to cart; then the cookie is removed.
- **`returning`** is true when this browser first saw the store on an earlier day (a per-browser note in localStorage, as the spec only needs it as a super property).
- **Settings numbers** come from `store_visitors`, `store_generations` and the `store_added_to_cart` / `store_order_paid` rows of `activity_log` (revenue from the paid event), never PostHog; test orders aren't counted.

### Blocked
Resolved 24 Nov (from a separate session, with Gavin):
- ✅ **Live migrations applied.** All four open-store migrations are on `magic-vault`, each with its bookkeeping row in `supabase_migrations.schema_migrations` exactly as `db:apply-remote` writes it, so the script sees them as applied. Checked first that every re-added check constraint keeps all of today's values. The Management API token still needs renewing for the next `pnpm db:apply-remote`.
- ✅ **`magic-store` navigation menu** made in Shopify: All (the Magic Store collection), Wall art, Pillows & blankets, Acrylic, Puzzles, Mugs, Ornaments. Each category is its own manual collection (`magic-store-wall-art`, `magic-store-pillows-blankets`, `magic-store-acrylic`, `magic-store-puzzles`, `magic-store-mugs`, `magic-store-ornaments`) with a product photo as its image, for the circles; the Magic Store collection got an image too.
- ✅ **Storefront sales channel:** it's "Storyboards Headless 03", `gid://shopify/Publication/192604864708` (the shop's cart token, 11 Nov). All 11 Magic Store products are published to it (the Fleece Blanket was added). Set `open_store.storefront_publication_id` to that value in Settings › Shop › Magic Store.
- ✅ **Imagen's fields confirmed** from Imagen's own api-themes, api-generate and api-sessions code: the theme list is `{ themes: [{ slug, name, is_active, category: { slug, … }, input_count, inputs?: [{ role, label, required }] }] }`; a one-photo theme takes `source_image`; a multi-photo theme takes one file field per role and refuses `source_image`; `name` is a string, or a JSON object of parts for several pets. `lib/sources/imagen-api.ts` now follows that (`parseThemes` read `category` as a string and dropped every live theme; `source_image_2` would have been refused). Imagen's own slot labels fill in when Shopify's words have none.
- ✅ **PostHog "Magic Store" dashboard** (https://us.posthog.com/project/540098/dashboard/2405106): paid orders, revenue, Imagen cost per order, the main funnel, store page to product page, pictures per day, why pictures fail, how long pictures take, buy rate by theme, orders and revenue by first-touch channel, the email ask, and own product vs more gifts. Four replay playlists ("Magic Store: …"). Put the dashboard link in `open_store.posthog_dashboard_url`.

Still open:
- **No product has a theme yet:** the store shows nothing until each Magic Store product's "Magic Store theme" is set (Settings › Shop › Products, after Refresh themes from Imagen).
- **Experiments** need the store to read PostHog feature flags, which it doesn't yet; they're set up when one is chosen.
- **Live events** are checked once the store is deployed, with a test visitor and a test order.
- **`VISITOR_SECRET`** is set in Vercel (Gavin, 23 Nov), before any visitor exists.

### Open store 1: catalogue (done)
- `lib/open-store/sources/` (types, live, fixtures): the Magic Store collection with its fields, a collection by handle, the navigation menu with collection images, Shopify's shipping and refund policies. Live queries checked read-only against the real store (`collectionByIdentifier`, `menus`, `shopPolicies`, `reviews.rating`).
- `lib/sources/imagen-api.ts`: Imagen's theme list (live and fixtures, including a two-photo theme and an inactive one). Picture sessions come in Open store 3.
- `lib/open-store/catalog.ts`: the open-store check (`evaluateStoreProduct`) with reasons, and `gridProducts` (no related-only products). `lib/open-store/index.ts`: the catalogue, cached like the shop's and refreshed with it everywhere on a Settings save.
- Product fields in `lib/settings/registry.ts` (`PRODUCT_FIELDS`: scope, metafield, type, validation, label, store fallback) with `getProductSetting()` / `getVariantSetting()` (`lib/settings/product.ts`); a bad value set in Shopify is flagged and the store default used. New `open_store.*` settings (switches, collection, menu, limits, timings, email ask, store defaults for every product field).
- Settings › Shop as one area: **Products** (every product in either collection once; chips for where it's sold and whether each store shows it, with reasons; filters All · Gifts & Products · Magic Store · Hidden), **one product page** (where it's sold, both stores' shared fields, Gifts & Products fields, Magic Store fields with the theme dropdown and photo slots from the theme, status), **Gifts & Products pages** (today's shop settings, moved), **Magic Store** (its settings, what's in Shopify now, Imagen's themes with **Refresh themes from Imagen**, numbers placeholder and the dashboard link).
- All open-store event names from `docs/analytics.md` declared in `lib/events.ts` (properties wired as each part uses them; checked in Open store 5).
- Tests: `tests/unit/open-store-catalogue.test.ts` (16); `shop-settings.spec.ts` reworked for the new layout plus 3 new tests (Magic Store fields, folded sections and photo slots, the Magic Store page). The template-editor test expected the old handle name ("Top left: …"); the editor on `claude/shop` calls it "Top left corner: …", so it was already failing there; fixed.

### Open store 2: store and product pages (done)
- `proxy.ts` answers a real 404 for `/store/*` (and JSON 404 for `/api/store/*`) unless the store is visible to this person, so streaming pages can't turn a hidden route into a 200. Pages check again (`requireStoreVisible`).
- `/store` (the home collection) and `/store/c/[handle]` (any collection, narrowed to the Magic Store's products in it): its own header with the cart icon, category circles from the `open_store.menu_handle` menu, filter by product type, sort (featured · price · newest), "Show more" by `open_store.products_per_page`, the store discount as "N% OFF" and a struck-through price. Related-only and hidden products never show in a grid. Unknown handles are 404.
- `/store/product/[productId]` (Shopify's numeric id, as in the shop): gallery, title "Product · Theme", stars, price, option chips with the size badge (`?variant=` keeps the choice), delivery estimate (today + the size's `lead_days` + `open_store.shipping_days`, working days in `brand.timezone`), photo slots from the theme's photo count with Shopify's words, the browser checks (type, size, `open_store.min_photo_px`), the optional name (`name_max`), Create (turned on with every photo in; it makes the picture in Open store 3), reassurance rows, Product details / Shipping and returns (Shopify's policies) accordions, the how-it-works band on desktop, and "Also made from one photo" (the product's own list, then the collection's order; related-only products are allowed here). SEO title and description from the product's `seo`.
- The cart drawer shell (empty state); the guest cart comes in Open store 4.
- **Decision:** `?from=` on product links (`grid`, `related`, `cart`, `email_link`; anything else is `direct`) is kept for the analytics properties in Open store 5.
- Tests: `tests/unit/open-store-view.test.ts` (10: who sees it, badge, delivery with weekends, chips, first variant, photo slots, steps); `tests/e2e/open-store.spec.ts` (7 × 390 and 1280: hidden 404s and the super-user preview, store grid order/filter/sort, category page, product page, size chips, two-photo theme, cart drawer; axe clean).

### Open store 3: pictures (done)
- Migration `20261123000002_open_store_visitors.sql`: `store_visitors` (token hash only), `store_photos`, `store_generations` (names private), RLS on with no policies, and the private `store-uploads` bucket (JPEG and PNG).
- The visitor cookie `mmp_visitor` (32 random bytes, httpOnly, SameSite=Lax, `open_store.visitor_cookie_days`), set by `proxy.ts` on the first store page; the row is created on the first photo (`lib/open-store/visitor.ts`, `lib/db/store.ts`).
- `lib/sources/imagen-api.ts`: generate, session status and download (live and fixtures). Live downloads only from Imagen's own host.
- `POST /api/store/generations` (bot check, request cap, limits per visitor, IP and day, photo checks by content with HEIC conversion or refusal, earlier photos by id), `GET`/`PATCH /api/store/generations/<id>` (status with slow and time-out; pick a result), `GET /api/store/files/<id>` (photo or picture, after the ownership check; super users can see them, never act).
- Product page: creating state (their photo in a spinning ring, the three steps, "Still painting"), failed, limited and busy messages, ready state (their picture drawn on the product with the variant's template, the picture on its own, the rest marked Example, their photo in the corner), "Pick your favourite", "{name} is ready" with Try another photo, the quantity and Add to cart button, "Use a photo you've added before", "{name} on more gifts" drawn with their picture (only products whose rules suit it) carrying the picture over with `?g=`, and the picture restored on return. Changing size redraws without calling Imagen.
- Server events: `store_photo_uploaded`, `store_generation_started`, `store_generation_ready`, `store_generation_failed` (with the reason); browser: slow, left, result picked, try again (identity completed in Open store 5).
- Tests: `tests/unit/open-store-pictures.test.ts` (10: every fixture case, the session body, statuses, cookie token, file ids, golden images of the pillow with a 3:4 and a square result in `tests/fixtures/golden/open-store/`); `tests/e2e/open-store-pictures.spec.ts` (8 × 390 and 1280: ready with steps, results, more gifts and return; earlier photo reused; failed; slow; timed out; limits per visitor (a failure not counted) and per IP; two-photo theme; another visitor gets 404 on every file, status and choice).

### Open store 4: cart, checkout, sign-in and email (done)
- Migration `20261123000003_open_store_cart_email.sql`: sign-in link purpose `store_picture`, member `created_via` `store_order`, outbox kind `subscription`, and the email columns on `store_generations` (`email_to`, `email_consent`, `emailed_at`).
- `lib/open-store/cart.ts`: one Shopify cart per visitor (`cartCreate` with no buyer unless signed in, the store's discount code, `_source` = `open_store` and `_open_store_visitor`), Add to cart with the ownership, ready, sold and fit checks and a preview, quantity and remove, checkout, a new cart when Shopify has expired it, and `recordStoreOrderPaid` (pictures ordered, visitor linked to the order email, member created, cart cleared). Routes `GET /api/store/cart`, `POST /api/store/cart/lines`, `PATCH`/`DELETE /api/store/cart/lines/<id>`, `POST /api/store/checkout`; previews through `/api/store/files/v_…` with the same ownership check.
- The drawer: preview, title, size, quantity, Shopify's line price and discount, Remove, the subtotal, "Shipping and tax at checkout", Checkout; the header count from the visitor's cart. Product page: quantity and **Add to cart · price** open the drawer.
- Sign-in: the visitor is linked to the signed-in email (or a fresh visitor starts on a shared device); a signed-in person sees the pictures, photos and newest cart of every visitor linked to their email, on any device.
- Email while painting: the box under the picture area (close hides it for this browser), `POST /api/store/email`, the React Email template `emails/store-picture.tsx` through AgentMail (fixtures in tests), "We've emailed it to you too.", the link that signs in, links the visitor and opens the picture; Klaviyo subscription and event only when ticked.
- Tests: `tests/unit/open-store-cart.test.ts` (4: a fixture checkout's exact line and cart keys with no portrait keys; reading the order back; `orders/paid` marking only the payer's pictures, linking, the member and idempotence; other orders ignored). `tests/e2e/open-store-cart.spec.ts` (5 × 390 and 1280: drawer, quantity, remove, reload, checkout to Shopify; another visitor can't see the cart or previews; a second browser signed in as the same person sees the picture, the photo and the cart; a shared device starts a fresh visitor; the email while painting, its link in a fresh browser).

### Open store 5: analytics and docs (done)
- `lib/open-store/analytics.ts` `storeTrack()` for every server-side store event (identity, `area`, `preview`, person properties, `ref_type` = `store_visitor` before a proven email); `aliasPerson()` in `lib/track.ts` on paid orders; `x-ph-id` from `components/open-store/store-fetch.ts` on every store API call.
- First touch: `lib/open-store/first-touch.ts`, set by `proxy.ts`, saved on the visitor row; `first_touch_source` on `store_order_paid`.
- Store pages: `StoreAnalytics` registers the super properties; `lib/posthog-sanitize.ts` keeps only `utm_*` and `variant` on `/store` addresses; replay masks on the picture area, photo slots, results, related pictures, cart previews and the email box.
- Settings › Shop › Magic Store: the numbers (today, 7 and 30 days; by product, theme and first-touch channel) from our own tables (`lib/open-store/numbers.ts`, `components/admin/shop/StoreNumbers.tsx`).
- Migration `20261123000004_open_store_analytics.sql`. Docs: `docs/schema.md` (store tables, bucket, outbox kind), `docs/data.md` §12 (the open store's sources), `docs/analytics.md` (how store events are wired).
- Tests: `tests/unit/open-store-analytics.test.ts` (6: first touch and its cookie, the channel, `/store` addresses in PostHog, `track()` rejecting an unknown store event, the numbers and their splits); `tests/e2e/open-store-analytics.spec.ts` (2 × 390 and 1280: first touch on the row, business events under the visitor with no email, replay masks, no name or typed email anywhere; the Settings numbers, axe clean).

## Dreamship (24 Nov)
- **Done in code** (branch `claude/dreamship-maker`): `dreamship` added to `MAKERS` (`lib/shop/fields.ts`), the rules editor's Maker list and `docs/shop.md`; unit test in `tests/unit/shop-catalog.test.ts`. The DB-backed unit tests still can't run in a cloud session without the local Supabase stack (same failures as main).
- **Done in Shopify:**
  - the `mmp_shop.maker` definition's choices now include `dreamship`;
  - Framed Dog Poster "Flush" (8916063289540) has every `mmp_shop` field: rules on all four sizes, `imagen_theme` royal-flush, short description, details, and a template measured from the Dreamship 8x10 mockup;
  - it's in Magic Store and Magic Store · Wall art. Values are in `docs/dreamship.md` › Live today.
- **Held:** the product isn't on the Storefront channel (Headless 03), so it stays hidden. Its variants are stocked at Shopify's Dreamship location, and Dreamship's app imports and auto-submits orders with the sample art.
- **Proposed:** `docs/dreamship.md`. Part A syncs the rules from the linked Dreamship product and shows cost, margin and dpi (no new write). Part B sends the customer's picture to Dreamship and needs allowed write 7.
- **Decided (24 Nov, Gavin):** merge the maker change; keep the poster hidden until Part B works; B1 (swap the artwork on Dreamship's imported order), so allowed write 7 is now in `CLAUDE.md`; a 2:3 2K Royal Flush for posters.
- **Decided later on 24 Nov (Gavin):** `DREAMSHIP_API_KEY` added in Vercel. The app doesn't control order status (Shopify and Dreamship do): it only puts the customer's picture on the imported order and never submits or cancels (write 7 narrowed to match). New page Settings › Printers (`docs/dreamship.md` › Part C).
- **Blocked:** Dreamship still auto-submits imported orders (its own setting; Gavin sets imported orders to wait as drafts before the poster goes on sale); the 2:3 2K theme active in Imagen; the Royal Flush resolution (1024 × 1024) against Dreamship's 250 dpi minimum; 24x36 priced below cost.

## 24 Nov: Magic Store category menu
- Settings › Shop › Magic Store said "Menu magic-store wasn't found", but the menu exists in Shopify. The app can't read it: Shopify's `menus` needs `read_online_store_navigation`, and the r_orders app doesn't have it. The read failed and was shown as "not found".
- `read_online_store_navigation` is now in the Shopify access checks (Gifts & Products pages). The Magic Store page tells "couldn't be read" (missing access) apart from "wasn't found".
- **Blocked:** add `read_online_store_navigation` to the r_orders app in Shopify's Dev Dashboard, release the version, then redeploy so the app gets a token with it (the token is cached up to 24 h).

## Dreamship

Built on `claude/cool-volta-69zljg` from `main` through `docs/dreamship.md` › Build parts. CLAUDE.md allowed write 7: the app only uploads the customer's picture as artwork and sets it on a line of the Dreamship order imported for a paid Shopify order. It never submits, cancels or changes an order's status (order status is Shopify's and Dreamship's).

### Decisions
- **Field names from the real account, paths still to confirm.** Dreamship's schema (`https://api.dreamship.com/v1/schema/`) couldn't be read from this session (the proxy refuses `api.dreamship.com`; Dreamship's connector reported "Could not load API schema"; a web fetch couldn't resolve the host). The field names were read through Dreamship's own connector for this account (read-only calls, 24 Nov): business settings (`auto_submit_order_import_orders`, `auto_submit_api_orders`, `subscription_plan`), a product's design (`variants[].product_variant_id`, `item_variant_id`, `retail_price`, `cost`; `print_areas[].key`, `width_px`, `height_px`, `dpi`, `min_dpi`, `ai_upscale`, `artwork_id`), a catalog item (`production_days_min`/`_max`) and its print areas. The fixtures use the Flush poster's real numbers. The live client parses tolerantly; its REST paths are in `PATHS` (`lib/sources/dreamship.ts`) so confirming them is one small change.
- **No submit or cancel, by construction.** The Dreamship source has no such method or path; a unit test fails if one appears, and checks the live client's only writes are the artwork upload (POST) and the line update (PATCH).
- **Check connection** is the Data sources check (new `dreamship` row), so Settings › Printers and Settings › Data sources show the same result.
- **Auto-import** isn't reported in Dreamship's business settings (it's a per-shop setting in Dreamship's Shopify app), so it shows "Not reported" unless Dreamship returns it.
- **Settings › Printers** sits in the SHOP group of the Settings menu. Changing a `dreamship.*` setting records `admin_printer_settings_updated` (`maker`, `keys`) besides `setting_changed`.
- **The link suggestion** comes from the sizes' SKUs: when every SKU is a number, the app asks Dreamship which product the first one belongs to (`productForVariant`). The Dreamship-location check in the spec isn't made: the shop's product reads don't include inventory locations, and a SKU that Dreamship recognises is the stronger sign.
- **dpi is against the size's own inches**, as Dreamship rates it (an "8x10" area is 8 × 10 in), using the size of a recent picture the product's Imagen theme made. Royal Flush's 1024 squares come out at 102 dpi on 8x10 and 28 on 24x36, matching `docs/dreamship.md`. With no picture made yet, dpi shows as unknown.
- **Save to Shopify** works the proposal out again on the server and writes only the fields that differ (`maker`, `maker_sku`, `print_px`, `extra`, `lead_days`) through `setVariantRules`, the rules editor's own write (allowed write 5). The browser never sends values.
- **Sync reports are kept** in a new table `dreamship_sync` (one row per linked product: the report, warning count, fields that differ, when and by whom), which Settings › Shop › Products and Settings › Printers read. The daily `/api/cron/dreamship-sync` (05:37 UTC, only when `dreamship.sync_enabled`) refreshes it and never writes to Shopify.
- **Fixture Flush poster** (`fx-flush-poster`, Shopify 8710000000) added to the shop fixtures with the real SKUs and half its rules, in the Magic Store collection; its theme `royal-flush` isn't in the fixture theme list, so the Magic Store hides it, as the real one is hidden today. Every existing fixture keeps its id.
- **The product page's faded sections** (a store the product isn't in) were faded with 80% opacity, which took their grey text below AA contrast (axe found it on the first Magic-Store-only product it checked). They now use a light tint instead.
- **Picture jobs live in their own table** (`printer_jobs`), not the Klaviyo outbox (`outbound_events` is Klaviyo's and only allows that destination). The Orders list on Settings › Printers reads the jobs (they hold the Dreamship order, the per-line result and the reason); `shop_order_sent_to_maker` still goes to `activity_log` and PostHog for each outcome, as the spec asks.
- **Which lines get the picture:** `_shop` = true and `_shop_maker` = `dreamship` (already on every shop and open-store line), with a picture we hold and a print area in `_shop_extra`. The print file is made from our own copy (open-store pictures in `store-uploads`, shop pictures through the shop's own picture read), cropped by `_shop_crop` and sized to `_shop_print_px`, and handed to Dreamship as a one-day signed link.
- **Finding Dreamship's order:** by reference id = the Shopify order id, then the order name; which one Dreamship's Shopify app stores is to confirm (Blocked). Lines match by Dreamship product variant id, in order.
- **Retries:** after the webhook's reply, then every 5 minutes (`/api/cron/printer-jobs`) with backoff (1, 2, 4… up to 30 minutes), for `dreamship.import_wait_hours`; then "needs attention". An order Dreamship has already submitted (or that refuses the change) is flagged, never changed. **Retry** on Settings › Printers re-queues a flagged or failed job and runs it at once (`admin_printer_job_retried`).

### Blocked
- **Dreamship API:** Gavin confirmed on 24 Nov that the API is done (the schema still can't be read from this session). After deploy, **Check connection** on Settings › Printers and Settings › Data sources is the first live test of the paths below; if it fails, its error names the path. Paths and write bodies as built (`lib/sources/dreamship.ts` › `PATHS`): `GET /business/`, `GET /business/settings/`, `GET /products/{id}/`, `GET /items/{id}/`, `GET /items/{id}/print-areas/`, `GET /orders/?reference_id=…` (the filter name, and whether the reference id Dreamship's Shopify app stores is the Shopify order id or its name), `GET /orders/{id}/`, `POST /artworks/` with `{url, name}` (from a URL, or does it need a file upload?), `PATCH /orders/{id}/line-items/{line_id}/` with `{print_areas: [{key, artwork_id}]}`, the auth header (`Authorization: Bearer`), and which error Dreamship returns when an order can't be edited any more. Until confirmed, Check connection may fail on the live key: the page and the rest of the app don't depend on it.
- ~~Migration `20261124000001_printers.sql` needs applying~~ **Applied to `magic-vault` on 24 Nov**, with `…0002_dreamship_sync.sql` and `…0003_printer_jobs.sql`, each recorded under its file's version in `supabase_migrations.schema_migrations` (so `pnpm db:apply-remote` sees them as applied). The script's own token still returned 401 from this session, so they went through the Supabase connector's SQL with the same statements.
- **Also to confirm:** `GET /product-variants/{id}/` (the product a variant belongs to, for the link suggestion). **Migration `20261124000002_dreamship_sync.sql`** waits for the same renewed token.
- **Also to confirm for the picture:** whether Dreamship's Shopify app stores the Shopify order id or its name as the order's reference id; whether `POST /artworks/` takes a URL; the line update body; and the error Dreamship returns for an order it no longer lets you change (treated as "not editable" on 400/409 mentioning submit, production, status or draft). **Migration `20261124000003_printer_jobs.sql`** waits for the renewed Supabase token too. Until confirmed, Dreamship orders keep needing the manual step in `docs/dreamship.md` › Until Part B exists, and the Flush poster stays off the Storefront channel.

### Dreamship 1: source and Settings › Printers (done)
- `lib/sources/dreamship.ts`: interface, live and fixtures: the account and Dreamship's own order settings, a product's design, a catalog item's print areas and production days, an order by reference and its status, upload artwork, set a line's artwork. No submit, cancel or status change.
- Settings: `dreamship.sync_enabled`, `dreamship.import_wait_hours`, `dreamship.sale_pct`, `dreamship.min_margin_pct`, `dreamship.api_url` in the new `printers` group (migration `20261124000001_printers.sql`).
- `/settings/printers` (404 unless super user): the Dreamship card (API key set or not, business, plan, last checked, **Check connection**, Dreamship's own order settings read-only, the auto-submit note, this app's settings) and the Prodigi, Gelato and In house cards with their product and size counts. A Dreamship row on Settings › Data sources.
- Tests: `tests/unit/dreamship-source.test.ts` (11: fixtures, order import timing, artwork on a draft and refused once submitted, no submit/cancel/status methods or paths, response parsing, the settings); `tests/e2e/printers.spec.ts` (3 × 390 and 1280: 404 for visitors and customers; the page, the four cards, Dreamship's settings and the note, Check connection; a setting saves; axe clean).
- Dev note: the local dev server got into a reload loop twice; clearing `.next/dev` fixed it (a stale build cache, not app code).

### Dreamship 2: link and sync (done)
- `mmp_shop.dreamship_product_id` (number_integer) added to the field definitions Settings › Shop creates, read with every product.
- The **Dreamship** card on a Settings › Shop product: the suggestion, Link (id or designer link, checked with Dreamship), **Sync from Dreamship** (per size: Dreamship variant, cost, price, margin, profit at `dreamship.sale_pct` off, dpi against Dreamship's minimum, AI upscale, and what differs), **Save to Shopify**, and the flags. `lib/dreamship/sync.ts` (pure) and `lib/dreamship/link.ts`.
- Flags (a size with no Dreamship variant and the other way round, cost at or above price, a loss at the sale, a margin below `dreamship.min_margin_pct`, dpi below Dreamship's minimum, the template's photo no longer among the product's photos) on the card, on Settings › Shop › Products, and the product's warning count on Settings › Printers › Products.
- The daily report-only `/api/cron/dreamship-sync`. Events `admin_dreamship_linked` and `admin_dreamship_synced` (`product_id`, `fields_changed`).
- Tests: `tests/unit/dreamship-sync.test.ts` (9: matching by SKU, the proposed fields and the diff, an `extra` in another order isn't a change, unmatched sizes both ways, margins and the money flags, dpi, the template photo, the link input and the suggestion); `tests/e2e/dreamship-link.spec.ts` (2 × 390 and 1280: link the Flush poster from the suggestion, sync, see the diff, save 14 fields, sync again matches, flags on Products and the product on Printers, axe clean; a wrong id is refused).

### Dreamship 3: the customer's picture on the order (done)
- `lib/dreamship/artwork.ts`: from `orders/paid`, one job per order with personalised Dreamship lines; it waits for Dreamship's import, makes the print file (crop and size), uploads it, sets it on each personalised line, and records `shop_order_sent_to_maker` (`maker`, `status`, `lines`, and `reason` when it fails). It never submits or cancels. Idempotent per order and per line. `/api/cron/printer-jobs` every 5 minutes.
- Settings › Printers › Orders: the latest 50, with the Shopify order, the Dreamship order link, the picture's state (waiting, picture set, needs attention with the reason, lines done), Dreamship's own status read live, when, and **Retry**.
- Tests: `tests/unit/dreamship-artwork.test.ts` (7: only personalised Dreamship lines; the print file's size; not imported then imported, the picture set on each line, only uploads and line updates, the event; idempotent re-runs and a repeated webhook; an order already sent to print flagged and untouched; never imported, flagged after the wait; nothing queued without a Dreamship line) and the source's no-submit/cancel test from Dreamship 1; `tests/e2e/dreamship-orders.spec.ts` (2 × 390 and 1280: a signed fixture paid order shows on Settings › Printers with its picture set, the Dreamship order link and Dreamship's status "draft", axe clean; an order already "accepted" is flagged with Retry and stays unchanged).

## Copy settings and the personalisation layer (25 Nov)

Plan approved 24 Nov: "Copy settings from…" first, then a personalisation layer (two text boxes and one picture slot) set up in the template editor, filled in on the Magic Store, and printed.

### Copy settings from… (done)
- **Done:** a "Copy settings from…" card on Settings › Shop › one product. It copies the template (onto this product's own first photo), the Magic Store fields, and badges and lead times matched by size name; it can also copy page, occasions and categories. It never copies the theme, the Dreamship link or the print rules. Writes go through `updateStoreFields`, `updateProductFields` and `setProductTemplate` only (allowed write 5). New event `admin_shop_settings_copied`.
- **Tests:** unit `copy-settings.test.ts` (7); e2e `shop-copy.spec.ts` (2 × 2 widths).

### Layer 1: schema, art library, drawing (done)
- **Done:** the template's optional `layer` (`lib/shop/layer.ts`: two text boxes and a picture slot, boxes as fractions of the print area, checks for what the customer fills in, `drawLayer`), drawn by `flatPicture` over the picture and under the mask, in the browser and on the server (`lib/shop/layer-server.ts`: fonts registered, art read from our bucket). The art library: table `layer_art` (migration `20261125000001`), uploads checked and SVGs cleaned and drawn as 2400 px PNGs (`lib/shop/layer-art.ts`), `GET/POST/PATCH /api/admin/layer-art`. Publish checks the layer's pictures are in the library. The browser font loader moved out of CardPreview into `lib/render/fonts-browser.ts` for both. New event `admin_layer_art_changed`; `admin_shop_template_published` says whether the layer is on.
- **Decision:** the cleaned SVG is kept as text in `layer_art.svg`, not in the bucket: `theme-assets` serves only raster pictures, and every canvas draws the PNG anyway.
- **Tests:** unit `layer.test.ts` (9, including a real canvas: unchanged without a layer, changed only inside the box with one), `layer-art.test.ts` (3).

### Layer 2: template editor (done)
- **Done:** a "Personalisation layer" section in the template editor (`components/admin/shop/LayerEditor.tsx`): on/off, Text 1 and Text 2 (question, example words, font, size, colour, line-up, most characters and lines, required), a picture slot with up to 3 pictures from the art library and an upload in place, and boxes dragged, resized or typed as numbers over a flat view of the print area. The live preview and test renders draw the layer with the example words. Publish is held back while the layer has a problem, with the reason shown.
- **Tests:** e2e `layer-editor.spec.ts` (set up, publish and read back; an unsafe SVG refused; 390 and 1280).

### Layer 3: Magic Store customer (done)
- **Done:** a "Personalise it" step on the Magic Store product page once the picture is ready (`components/open-store/Personalise.tsx`): the text boxes and the picture choice, drawn on the preview a moment after each change. Add to cart sends them; `addStoreLine` checks them against the live template and puts them on the line (`_shop_layer_*`), and the cart thumbnail is drawn with them. New UI event `store_layer_filled` (which parts, never the words); `store_added_to_cart` gains `personalised`. Test-only `GET /api/test/cart` reads a fixture cart's line attributes (404 outside fixtures + the e2e flag).
- **Tests:** e2e `store-layer.spec.ts` (required name blocks Add to cart, the preview changes, the line carries the words and the picture, the activity log doesn't; 390 and 1280).

### Layer 4: the print file for every printer (done, one switch off)
- **Done:** `composePrintFile` (`lib/shop/print-file.ts`): the picture cropped and sized to `print_px`, with the layer drawn at print size by the same `drawLayer`; plain lines are made exactly as before. Dreamship lines now carry what the customer filled in and the product's layer (kept on the job when the order is paid), so Dreamship's artwork has the words on. For other printers (Prodigi, Gelato, in house) a new job kind `print_file` (migration `20261125000002`, `lib/shop/print-jobs.ts`) makes each personalised line's file after the webhook's reply, keeps it in `shop-uploads`, and lists it on Settings › Printers › Personalised print files with Retry. New event `shop_print_file_made` (never the words). A line whose product has lost its layer is flagged, never printed without the words.
- **Tests:** unit `print-file.test.ts` (5) and a layered line in `dreamship-artwork.test.ts`; e2e `print-files.spec.ts` (paid order → file → Printers page; 390 and 1280).

### Blocked
- **Linking the print files from the Shopify order** (`mmp_shop.print_files` on the order, `metafieldsSet`) is built, but behind the setting `printers.print_files_to_order`, **off**. CLAUDE.md's allowed write 1 covers only the mug choice on an order, so it needs Gavin's OK to extend it (the proposed wording is in the summary). Also to confirm with whoever runs the print system: that it reads that metafield and uses the app's file for those lines instead of building its own. Until both, the files are made and listed on Settings › Printers, and Dreamship lines (allowed write 7) already get the composed file.
- Migrations `20261125000001_layer_art.sql` and `…0002_print_files.sql` and the new seed row are applied locally only; magic-vault gets them with the next merge.

## 24 Nov: Dreamship connection check
- Settings › Printers › Check connection failed on every try. Dreamship's public API has no `/business/` or `/business/settings/` (both return 404), so the account came back empty.
- The check now lists the shops (`/shops/`) to prove the key and name the account. Dreamship's order settings aren't in its API and show as "Not reported". Test added.
- **Blocked:** Part B uploads to `/artworks/` and patches line items, and neither exists in Dreamship's public API. The fix is a product per personalised line plus the documented line match (`docs/dreamship.md` › Dreamship's public API). It waits for Gavin to approve rewording allowed write 7.


### 25 Nov: Personalise it shows from the start
- **Fixed:** the Magic Store showed "Personalise it" only after the picture was made, so on the posters it looked missing. It now shows under the photo slots from the start ("you'll see it on your picture once it's made"); what's typed first is kept. The required check stays at Add to cart, so it never stops a picture being made. e2e `store-layer.spec.ts` checks it before upload.

### 25 Nov: "Ask for the pet's name" per product
- **Done:** product field `ask_name` (in `generation`, store default `open_store.ask_name`, on, new seed row). A checkbox on Settings › Shop › product; off hides the name box next to the photo and `startGeneration` sends Imagen no names. A note on the product page and in the template editor's layer section while it's on and the layer has a text box. Copy settings carries it.
- **Fixed with it:** after a plain save on the product page, "Saved to Shopify." vanished because Part A keyed the editors on their saved values (it broke `shop-settings.spec`). They're now keyed on a `?copied=` marker that only Copy settings sets.
- **Tests:** unit `ask-name.test.ts` (3); e2e `store-layer.spec.ts` (turn it off: one name box, no names sent), `shop-settings`, `shop-copy` and the open-store suites pass.

### 26 Nov: product page corrections
- **Progress where the photo is (phones):** while the picture is made, the spinning photo and the steps (and the email offer) replace the uploaded-photo row, and the page scrolls there instead of up to the gallery. When it's ready, the page scrolls up to the finished picture. Desktop is unchanged: over the gallery beside the form. One `Progress` component for both.
- **No "Personalise it" heading:** the layer's fields sit with the photo's own, so it's just the pet's name box (or the picture choice). The `store.personaliseSub`/`personaliseLater` copy is gone.
- **Tests:** `open-store-pictures` checks where the progress is at each width. `expectNoAxeViolations` now waits for smooth scrolling to stop: the longer scroll up to the finished picture made the breadcrumb sit briefly under the sticky header. Also removed an unused `sharp` import in `lib/dreamship/artwork.ts`.

### 26 Nov: Settings › Shop › product, re-laid out
- **Header:** status for each store at the top (it replaces "Where it's sold" and "Status"), warnings, **Open template editor**, **Open in Shopify**, and **Copy settings from…** folded into the header.
- **Tabs:** Magic Store, Gifts & Products pages, Print rules (with the Dreamship card), kept in `?tab=` (`components/admin/shop/ProductTabs.tsx`). The address is updated with `history.replaceState(null, …)`: Next.js syncs its router only with a null state, and passing the old state lost the tab on the refresh after a save. The short description moved into the Magic Store tab ("also shown on the Gifts & Products pages"). Links from Printers and Products open `?tab=print#dreamship`; old `#dreamship` links still open the right tab.
- **Tests:** `shop-settings`, `shop-copy`, `dreamship-link` updated (open the tab first; status at the top; the Printers link opens Print rules). They pass at 390 and 1280, with `shop-settings` stable over repeated runs.
