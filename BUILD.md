# Build: My Magic Portraits in one run

The whole app is built in a single Claude Code run. It works through the parts below in order and commits each one when its checks pass, so a stopped session can pick up where it left off. Nothing is sent to customers by the build: the card and free-gift switches start **off**, and turning them on is the launch. `SPEC.md` is the source of truth for what to build; this file is how.

---

## Before you start (Gavin, once)

**Already set up (3 Nov):**
- GitHub: `glickgavin/magicportrait-vault`, with this build pack.
- Supabase project **`magic-vault`** (ref `koudexolfdvzmrglzhaz`, us-east-1, Storyboards org). It is the only project: there is no dev project. Tests run against a local copy of Supabase inside the build session (Part 2), never against `magic-vault`.
- Read-only role **`vault_reader`** on `imagegen-prod` and `shopify-dailyreport`: `select` on the tables in `docs/data.md` only, read-only by default, 15 s statement timeout, 20 connections. **It has no usable password yet** (step 2).
- Vercel project **`magic-vault`** (Storyboards team), linked to the repo, with the public variables set (`APP_URL`, `DATA_SOURCE`, the Supabase URL and publishable key, the PostHog key and host) and the domain `my.magicportraits.ai` added.

**To start the build you need only steps 1 and 9.** Do the rest while it runs; until a key is in place, that part uses test data and is listed in `BUILD_LOG.md`.

1. **Supabase access token** (lets the build apply migrations to `magic-vault`).
   - supabase.com › Account › Access tokens › Generate new token, named "magic-vault build".
   - Don't paste it anywhere except the cloud environment's network secret (step 9).
2. **Passwords for `vault_reader`.** Do this for `imagegen-prod` and for `shopify-dailyreport`, with a different password for each.
   - Make a password, for example `openssl rand -hex 24` in Terminal.
   - In that project's SQL editor run `alter role vault_reader with password '<the password>';`
   - Click **Connect**, choose **Transaction pooler**, and copy the URI. Change the user `postgres.<ref>` to `vault_reader.<ref>` and put in your password.
   - Add it in Vercel (Sensitive, Production and Preview): `imagegen-prod` → `IMAGEGEN_DATABASE_URL`, `shopify-dailyreport` → `MIRROR_DATABASE_URL`.
3. **Supabase `magic-vault` keys and email.**
   - Project Settings › API Keys: copy the **secret** key into Vercel as `SUPABASE_SERVICE_ROLE_KEY` (Sensitive).
   - Authentication › Emails › SMTP settings: use Resend (host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key from step 4), with the sender from `SPEC.md` Q10.
   - The build sets the rest of Auth (6-digit codes, 600 s expiry, the email templates showing the code, site URL) through the Management API in Part 4.
4. **Resend.**
   - Verify `magicportraits.ai` as a sending domain (its DNS records go in Cloudflare).
   - Create an API key → Vercel `RESEND_API_KEY`.
   - Add a webhook to `https://my.magicportraits.ai/api/webhooks/resend` for delivered, opened, bounced and complained → its signing secret goes in Vercel as `RESEND_WEBHOOK_SECRET`.
   - Turn on open tracking.
5. **Shopify (r_orders app).**
   - Confirm the Admin API token has `read_orders`, `read_all_orders` (orders older than 60 days), `write_orders` (the mug choice) and `read_customers`. Add any that are missing.
   - Vercel: `SHOPIFY_STORE_DOMAIN` (the `.myshopify.com` domain), `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET` (the app's API secret, which signs webhooks).
   - The webhook itself is registered after the build (see After the build).
6. **Vercel secrets and DNS.** In the `magic-vault` project › Settings › Environment Variables, add these as **Sensitive** for Production and Preview:
   - `GIFT_LINK_SECRET`: make it with `openssl rand -base64 48`
   - `CRON_SECRET`: make it with `openssl rand -hex 32`
   - the values from steps 2–5 and 7
   - `NEXT_PUBLIC_INTERCOM_APP_ID` (Plain, not secret): the app id the main site uses for "Chat With Us".
   
   In Cloudflare, add the DNS record Vercel shows for `my.magicportraits.ai` under the project's Domains, set to **DNS only** (grey cloud).
7. **Klaviyo.** In Klaviyo › Settings › API keys, create a private key just for this app (name it "My Magic Portraits") with scopes `events:write`, `profiles:write`, `data-privacy:write` and `metrics:read`. Add it in Vercel as `KLAVIYO_PRIVATE_KEY`. No flows are needed now: the app only sends events. The emails get written in Klaviyo later.
8. **PostHog** (optional). The project key is already set. A personal API key in Vercel as `POSTHOG_PERSONAL_API_KEY` lets Settings › Tracking show counts and the setup script create dashboards.
9. **Claude Code cloud environment.** At claude.ai/code, create an environment named `magic-vault`:
   - **Network access:** Custom, keeping the default allowlist, plus:
     ```
     cdn.playwright.dev
     playwright.download.prss.microsoft.com
     objects.githubusercontent.com
     release-assets.githubusercontent.com
     ```
   - **Environment variables.** Anyone who uses the environment can read these, so they hold no secrets:
     ```
     SUPABASE_PROJECT_REF=koudexolfdvzmrglzhaz
     DATA_SOURCE=fixtures
     ```
   - **Network secrets › Add secret:** the token from step 1, host `api.supabase.com`, type Bearer (or Token). The session can then call the Supabase Management API without ever seeing the token.
   - **Optional network secrets**, so Part 0 can test them live. Without them, Part 0 marks these "check after deploy".
     - Shopify: host `<store>.myshopify.com`, header `X-Shopify-Access-Token`.
     - Klaviyo: host `a.klaviyo.com`, header `Authorization` with prefix `Klaviyo-API-Key`.
     - Resend: host `api.resend.com`, Bearer.
   - Start a session in this environment on `glickgavin/magicportrait-vault` and paste the prompt below.

**What the build session can and can't reach.** It has no app secrets. It reaches `magic-vault` only through the Management API (the token is attached outside the session). It can't open Postgres connections to Imagen or the events mirror, so those are tested from the deployed preview in Settings › Data sources.

---

## The prompt

Start a cloud session in the `magic-vault` environment (step 9) and paste:

> Read `CLAUDE.md`, then `SPEC.md` (the source of truth), `BUILD.md`, `docs/*`, `designs/README.md` and `reference/live-site/README.md`. Build the whole app described there in one run, working through Parts 0–13 of `BUILD.md` in order.
>
> - For each part: build it, write its tests, run `pnpm typecheck && pnpm lint && pnpm test` (and the e2e suite when the part adds screens), fix until green, commit `feat(part-N): <name>`, push, and update `BUILD_LOG.md`.
> - Work on one branch. After Part 1, open a draft pull request into `main` and keep pushing to it. Don't merge it: merging deploys my.magicportraits.ai.
> - Don't stop to ask questions. If something is missing (a secret, a permission, an unclear rule), use the fixture or the most reasonable reading, write it in `BUILD_LOG.md` under "Blocked" or "Decisions", and continue.
> - Tests and e2e run against the **local Supabase stack** in this session. The live project (`magic-vault`) only ever gets migrations and `supabase/seed.sql`, through `scripts/db-apply-remote.ts`. Never put test data in it, and never turn on `cards.enabled` or any `gift.*` switch. Don't send email and don't write to Shopify from this session.
> - If `BUILD_LOG.md` already exists, you are resuming: read it and continue from the first unfinished part.

---

## Parts

Each part lists what to build and what has to be true before it's committed.

### Part 0: Preflight
- Read every doc.
- Check the Supabase Management API: `GET https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF` answers. The network secret adds the token, so never put one in a header or file. If it fails, migrations can't reach the live project: record Blocked and carry on locally.
- Check that Docker runs, and start the local Supabase stack (Part 2).
- For each optional network secret that's present, one harmless read:
  - Shopify: shop name, and `currentAppInstallation { accessScopes { handle } }` (list any of the four in step 5 that are missing)
  - Klaviyo: `GET /api/metrics/?page[size]=1`; try the newest API revision and save the one that works as the default of `klaviyo.api_revision`
  - Resend: domain status.
- Imagen and the events mirror are Postgres and can't be reached from the session: mark them "check after deploy".
- **Done when** `BUILD_LOG.md` lists each source as OK, Blocked or Check after deploy, with the reason.

### Part 1: App shell
- Next.js app, Tailwind tokens and fonts (`docs/design.md`).
- `Header`, `MenuSheet`, `Footer`, `Avatar`/`AccountMenu`, ported from `reference/live-site/`.
- `t()` helper; 404 and error pages; `noindex` defaults.
- PostHog provider with the `/ingest` rewrite, cross-subdomain cookie and replay masking.
- `lib/track.ts` (PostHog side only for now).
- **Done when** a placeholder `/` renders the shell at 360, 390 and 1280 px and matches `VaultHome`'s header, menu and footer; axe shows no violations.

### Part 2: Database and settings
- Migrations for everything in `docs/schema.md`: tables, checks, indexes, RLS, `is_super_user`, `settings_history` trigger, the activity_log append-only guard, `rate_limits` with `hit_rate_limit()`, buckets.
- `supabase/seed.sql` (live project: drafts, switches off; idempotent, `on conflict do nothing`, so it never overwrites a value a super user changed) and `supabase/seed.test.sql` (local test stack only: one live version per category, `cards.enabled` on, fixture people). `supabase/config.toml` points `db reset` at `seed.test.sql`.
- **Local test stack:** the Supabase CLI's `supabase start` (Docker), without the services we don't use (Studio, Realtime, edge runtime, analytics, imgproxy). Unit, integration and e2e tests all use it; `supabase db reset` rebuilds it. If Docker can't run the stack, use the preinstalled PostgreSQL 16 with small stubs for the `auth` and `storage` schemas for the database tests, and record the e2e sign-in tests as Blocked.
- **Live project:** `scripts/db-apply-remote.ts` applies pending files from `supabase/migrations/` in order, then `supabase/seed.sql`, to `magic-vault` through the Management API (`POST https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query`). It records applied versions in `supabase_migrations.schema_migrations`, the table the Supabase CLI uses. Run it at the end of every part that adds a migration, so Vercel previews (which use the live project) keep working.
- `lib/settings/registry.ts` with every key from `docs/schema.md` § Seed and `docs/data.md` § Constants, plus typed `getSetting`/`setSetting` (short cache, validation, history).
- `track()` now also writes `activity_log` for business events.
- **Done when** migrations apply cleanly to a fresh local stack and to `magic-vault`, and both seeds load where they belong; unit tests cover settings validation, history and the activity_log guard.

### Part 3: Data sources
- `lib/sources/shopify.ts`, `imagen.ts`, `mirror.ts`, each implementing the queries in `docs/data.md`, plus fixtures.
- `getVaultProfile(email)`: orders, sessions (including recommendation children), images with the `ordered` flag, `is_customer`, display name and initials. Cached in `vault_members` for `vault.lookup_cache_minutes`.
- **Done when**:
  - unit tests on fixtures pass for a customer, a creator with no order, nobody, and a customer whose image is ordered in one session but not another
  - Settings › Data sources has a "Test" for each source that logs only counts and timings. Gavin runs it on the preview, because the session can't reach the live databases. The target is a lookup under 1.5 s warm.

### Part 4: Sign-in and account
- `/signin` (email → 6-digit code, resend, change email, `purpose=gift|redeem`).
- `/g/[token]` links: random opaque tokens, stored hashed on `gift_offers`, expiry from `gift.link_valid_days`. A server-side session exchange, then a redirect that strips the token from the address.
- `/redeem`, `/redeem?order=…` and `/redeem/[order]` → `RedeemEntry`. A wrong or unknown order shows one generic message.
- Live Auth settings for `magic-vault` through the Management API (`PATCH /v1/projects/$SUPABASE_PROJECT_REF/config/auth`): 6-digit email codes, 600 s expiry, the Magic Link and Confirm signup templates showing `{{ .Token }}`, site URL `https://my.magicportraits.ai`, and redirect URLs for previews. Leave SMTP alone: Gavin sets it, because it holds the Resend key.
- Middleware; avatar and initials; account menu; sign out (with `posthog.reset()`); super-user guard; rate limits via `hit_rate_limit()`.
- **Done when**:
  - e2e signs in with a 6-digit code against the local stack, fetched in the test through the admin API (`auth.admin.generateLink` returns `email_otp`) or the stack's mail catcher.
  - token tests cover valid, expired, unknown and reused-after-expiry
  - a non-super user gets 404 on `/settings`
  - the address bar never shows a token after sign-in.

### Part 5: Home and My portraits
- `/` for:
  - a customer with no cards yet (`FirstHome`: one big "Make my card", portraits, orders)
  - a customer with cards (`VaultHome`)
  - a creator (`VaultGuest`, with locked cards and the first-order offer)
  - nobody found (empty state).
- `/portraits` with the filters, session groups, ORDERED badges, "Order as wall art"/"Order more" deep links and "Make a card".
- **Done when** e2e covers all four states at 390 and 1280 px and screenshots match the mockups' layout and copy.

### Part 6: Card builder and renderer
- **First card, one screen** (`FirstCard`, SPEC §8.0), shown by `/create` when the person has no cards and `cards.first_card_mode = one_screen`.
  - Smart defaults: in-season version, newest ordered portrait, first usable message idea with `{pet}`, their first name.
  - Change design / photo / message.
  - "See all designs" hands everything over to the full builder.
- `/create` steps 1–3 (`M1Theme`, `M2Portrait`, `M3Message`) for later cards, state kept in the URL plus session storage.
- `CardPreview` and `lib/render` share one layout module, so the preview matches the JPEG.
- `POST /api/cards`:
  1. check the limits and settings
  2. copy the portrait to Storage
  3. create the card
  4. render the JPEG with `@napi-rs/canvas` (`cards.jpeg_quality`, `cards.footer_text`)
  5. save it.
- `/create/creating/[id]` and the ready state (share sheet, download, copy link, app buttons).
- `/c/[slug]` public page and image route; `share_hidden` handling; `/c/[slug]/try` (logs the tap, then redirects with the UTM tags).
- `POST /api/track` for business events from the browser (allow-listed names; email from the session only).
- **Done when**:
  - the renderer has golden-image tests for each seed version (small pixel tolerance) and a test that long messages shrink and never overflow
  - e2e covers both deliveries: self, and email up to a queued `card_deliveries` row. Sending is tested in Part 7.
  - a `/g/[token]` link lands on `FirstCard` for someone with no cards, and on step 1 for someone with cards
  - on `FirstCard`, typing a name and tapping Create (no other input) makes a card
  - `cards.enabled=false` and the `cards.who_can_create` and `cards.per_customer` rules work.

### Part 7: Email and delivery
- React Email templates:
  - `card-delivery` (`RecipientEmail`)
  - `card-scheduled` (confirmation to the sender)
  - `signin-code` (for Supabase SMTP, same style)
  - `signin-link` (when a super user resends someone's link).
- Sending through Resend, with `cards.email_sender_name`, `email.from_cards` and `email.reply_to`. No offer, reminder or mug emails: those come from Klaviyo later.
- Cron `/api/cron/send-scheduled` every 5 minutes.
- **Klaviyo client** (`lib/klaviyo.ts`) and the `outbound_events` outbox, `docs/data.md` §10:
  - send at once, retry from cron `/api/cron/flush-outbox` every minute
  - dedupe keys
  - a fixed property list per event
  - profile property updates
  - `klaviyo.enabled = false` marks rows `skipped`.
  
  `card_created`, `card_email_sent`, `card_recipient_email_opened` and `vault_signed_in` are wired here.
- `/api/webhooks/resend` updates `card_deliveries`, card status and `email_suppressions`.
- The recipients' "Don't email me cards" page.
- My cards (`/cards`) with Use again, Resend, Download, Copy link, and **Change** or **Cancel** for scheduled cards. Change reopens the builder on that card, re-renders it and keeps or updates the time.
- **Done when** there are template snapshot tests, webhook signature and idempotency tests, and a cron test with a fake clock. Real sending is checked after deploy with Settings › Emails › "Send me a test".

### Part 8: Orders, downloads and mugs
- `/orders`, `/orders/[orderName]`.
- Mug choice save (the Shopify writes exactly as in `docs/data.md`), lock rule, events with the live names.
- Downloads through access-checked signed URLs; a streamed `.zip` with the live naming.
- **Done when**:
  - unit tests cover every row of the eligibility rules in `docs/data.md`
  - e2e covers choose, save, saved state and locked state
  - another email's order returns 404 for view, mug save and download
  - responses contain no debug or PII fields (there's a test for this).

### Part 9: Free gift offer
- `/api/webhooks/shopify/orders-paid`: HMAC check, idempotent, creates `gift_offers`, respects every switch and `gift.unlock_rule`.
- Cron `/api/cron/send-gift-offers`: queues `free_gift_unlocked` for Klaviyo when due.
- `POST /api/gift/offer-link` for the thank-you pop-up:
  - accepts only a Shopify checkout-extension session token verified with the app secret, for an order paid within `gift.popup_window_minutes`
  - rate-limited
  - never a bare order number.
- "Later, email me the link": built but hidden behind `gift.popup_email_later_enabled` (off); when on, it queues `free_gift_link_requested` for Klaviyo.
- Non-qualifying orders are recorded as `skipped`, with the reason.
- `free_gift_unlocked` goes to Klaviyo with the one-tap link (when `klaviyo.include_signin_link`) and the portrait preview.
- Seasonal reminder: cron `/api/cron/send-reminders`, using `gift.reminder_*` and `theme_categories.reminder_enabled`; queues `gift_reminder_due` for Klaviyo. **This app sends no offer or reminder email.**
- Mug photo reminder: cron `/api/cron/mug-reminders` sends `mug_photo_needed` to Klaviyo, once per order, `redeem.mug_reminder_after_days` after the order, while no photo is chosen and the mug isn't locked.
- `scripts/register-shopify-webhook.ts`: written but **not run**.
- **Done when** tests show that:
  - with the switches off, nothing is sent
  - with them on, exactly one `free_gift_unlocked` event is queued per qualifying order
  - replayed webhooks are ignored
  - the offer-link endpoint rejects a missing, forged or expired session token and an old order.

### Part 10: Settings
- `AdminShell` and every Settings page in `SPEC.md` §13 (Setup, Greeting cards, Redeem, System).
- The template editor:
  - upload with checks (size, sRGB, under 2 MB, overlay alpha)
  - draggable zones writing `layout`
  - test render
  - publish with thumbnail generation
  - status and `is_new`.
- Data-source test buttons, including Klaviyo with outbox counts and "retry failed"; super-user add/remove with its guards; activity log browser.
- **Done when**:
  - e2e as a super user changes a setting, which shows in history and changes behaviour
  - a theme version is published from uploaded files and appears in `/create`
  - all of this is denied (404) for other users.

### Part 11: Insights
- `/settings/insights` (KPIs with period comparison, cards per day, funnel, top themes, live feed).
- `/settings/customers` search (sent in the request body) and `/settings/customers/[id]` with the opaque `vault_members.id`. Looking someone up creates their row with `created_via = 'admin_lookup'`. Then the merged timeline (activity_log + live Shopify + live Imagen).
- `/settings/cards`:
  - filters and CSV export
  - card detail with timeline; resend, hide link and download
  - delete on request (confirm, then delete files, anonymise rows, delete outbox rows, Klaviyo deletion job, `data_requests`)
  - export data
  - `admin_card_viewed` logging.
- **Done when** the KPI queries are tested against seeded rows, the timeline merges in the right order, and the delete test shows the files gone, rows anonymised and the email suppressed.

### Part 12: Analytics pass
- Wire every event in `docs/analytics.md` with its properties.
- Super properties and identity (`identify(email)`).
- Replay masking checked.
- `scripts/posthog-setup.ts` creates the dashboards and funnels in `docs/analytics.md` § 5. Run it only if `POSTHOG_PERSONAL_API_KEY` is set.
- **Done when**:
  - a test asserts every customer page fires its `page_view_*` and every Settings page fires `settings_viewed`
  - a check fails the build on any event name not in the list
  - no message text appears in any captured event (there's a test for this).

### Part 13: Final check and preview
- Full e2e at 390 and 1280 px; axe on every route.
- Walk the security list in `CLAUDE.md`, item by item, and record the results in `BUILD_LOG.md`.
- Search the client bundle for secret prefixes.
- Lighthouse on `/`, `/create` and `/orders` (mobile): performance ≥ 85, accessibility ≥ 95.
- Confirm `magic-vault` has every migration and `supabase/seed.sql`, with every switch off.
- Push the branch. Vercel builds a preview of it, which uses the live project with every switch off.
- Screenshot every route at 390 px into `docs/build-screens/` (fixture data only).
- **Done when** `BUILD_LOG.md` ends with:
  - what works
  - what's stubbed or blocked and why
  - the preview URL
  - the launch checklist below with each item marked.

---

## After the build (launch, with Gavin)

1. Review the preview on a phone. Run every "Test" in Settings › Data sources and "Send me a test" in Settings › Emails. Add real theme artwork via Settings › Theme library and publish the first versions.
2. Merge the pull request into `main`. That deploys `my.magicportraits.ai` (nothing is switched on yet).
3. Run `scripts/register-shopify-webhook.ts` against production (orders/paid → My Magic Portraits).
4. Point the live site's `/redeem` at `https://my.magicportraits.ai/redeem` (keep the query string), and add the MY MAGIC PORTRAITS links to its menu. This is a change in the Lovable project.
5. Add the thank-you pop-up (`GiftSheet`) to the Shopify thank-you page, calling `/api/gift/offer-link`.
6. **Klaviyo** (events now, emails later).
   - Turn on `klaviyo.enabled` and send one test event of each kind from the preview to a staff profile, so the metrics show up in Klaviyo.
   - Later, when the emails are written:
     - Add `magicportraits.ai` as a Klaviyo sending domain (DNS in Cloudflare), or send as "Magic Portraits" <hi@storyboards.io>.
     - Build the flows, named like the account's other flows: "MP Free Gift - Make Your Card" (`free_gift_unlocked`, exit on `card_created`; copy the `Main` design), "MP Seasonal Card Reminder" (`gift_reminder_due`), "MP Choose Your Mug Photo" (`mug_photo_needed`, exit on `redeem_mug_saved`).
     - Then turn on `gift.popup_email_later_enabled`.
7. Add a line to the privacy policy: greeting cards and their messages are stored, and may be viewed by staff for support.
8. In Settings, turn on `cards.enabled`, then `gift.popup_enabled` and `gift.offer_email_enabled` (sends the `free_gift_unlocked` event; no email until the Klaviyo flow exists). Watch Settings › Insights and the PostHog card funnel for the first day.
