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
