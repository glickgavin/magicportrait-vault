# Build log: My Magic Portraits

One Claude Code cloud session, branch `claude/cool-volta-69zljg`, working through `BUILD.md` Parts 0–13.

## Progress

| Part | Name | Status |
|---|---|---|
| 0 | Preflight | done |
| 1 | App shell | done |
| 2 | Database and settings | done |
| 3 | Data sources | done (Test buttons UI lands with Settings, Part 10) |
| 4 | Sign-in and account | done (live Auth config blocked, see Blocked) |
| 5 | Home and My portraits | done |
| 6 | Card builder and renderer | done |
| 7 | Email and delivery | pending |
| 8 | Orders, downloads and mugs | pending |
| 9 | Free gift offer | pending |
| 10 | Settings | pending |
| 11 | Insights | pending |
| 12 | Analytics pass | pending |
| 13 | Final check and preview | pending |

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

## Decisions

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
- **`signin_links` table** in addition to `gift_offers.token_hash`, because one-tap links are also needed for admin "Resend sign-in link" and the mug-photo reminder's order link, which aren't gift offers.

## Blocked
- **Live Auth settings for `magic-vault` not applied.** `scripts/configure-auth.ts` (`pnpm auth:configure`) is written and dry-runs cleanly, but the session's permission policy refused the `PATCH /v1/projects/{ref}/config/auth` call. The live project currently has **8-digit codes valid for 3600 s**, `site_url = http://localhost:3000`, no redirect allow-list, and default templates without `{{ .Token }}`. Until it's applied, sign-in on the preview won't work (the form expects 6 digits). To fix: run `pnpm auth:configure` from a session allowed to change it, or set these in the Supabase dashboard (Authentication › Emails: OTP length 6, expiry 600; URL configuration: site URL `https://my.magicportraits.ai`, redirect URLs for previews; Magic Link and Confirm signup templates from `supabase/templates/signin-code.html`).
- **SMTP sender name** on `magic-vault` reads "Magic Cards"; the spec says "My Magic Portraits". Left alone (SMTP is Gavin's to set).

- Shopify, Klaviyo and AgentMail can't be reached from this session (see Part 0). Each sits behind an interface with a fixtures implementation; the live clients are checked after deploy.

## Open questions

- Fixture portraits are local files (`/fixtures/portraits/…`); in fixtures mode the app treats those paths as an allowed image source. Live mode only fetches from `redeem.allowed_image_hosts`.
