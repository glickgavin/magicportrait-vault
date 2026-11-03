# Build log: My Magic Portraits

One Claude Code cloud session, branch `claude/cool-volta-69zljg`, working through `BUILD.md` Parts 0–13.

## Progress

| Part | Name | Status |
|---|---|---|
| 0 | Preflight | done |
| 1 | App shell | done |
| 2 | Database and settings | done |
| 3 | Data sources | done (Test buttons UI lands with Settings, Part 10) |
| 4 | Sign-in and account | pending |
| 5 | Home and My portraits | pending |
| 6 | Card builder and renderer | pending |
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

## Blocked

- Shopify, Klaviyo and AgentMail can't be reached from this session (see Part 0). Each sits behind an interface with a fixtures implementation; the live clients are checked after deploy.

## Open questions

- Fixture portraits are local files (`/fixtures/portraits/…`); in fixtures mode the app treats those paths as an allowed image source. Live mode only fetches from `redeem.allowed_image_hosts`.
