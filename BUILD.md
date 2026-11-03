# Build: My Magic Portraits in one run

The whole app is built in a single Claude Code run. It works through the parts below in order and commits each one when its checks pass, so a stopped session can pick up where it left off. Nothing is sent to customers by the build: the card and free-gift switches start **off**, and turning them on is the launch. `SPEC.md` is the source of truth for what to build; this file is how.

---

## Before you start (Gavin, once, about 45 minutes)

These need an account owner. The build checks each one in Part 0. Anything missing is replaced with test data and listed in `BUILD_LOG.md`, so the build still runs; that part just can't go live until it's fixed.

1. **GitHub.** Done: `glickgavin/magicportrait-vault`, with this build pack committed.
2. **Supabase: two new projects** in the Storyboards org, same region as `imagegen-prod`:
   - `magic-vault` (production)
   - `magic-vault-dev`, used for local development, Vercel previews and every test. The build never touches production data.
   
   In both, in Auth settings:
   - Email OTP length 6, expiry 600 s.
   - The "Magic Link" and "Confirm signup" email templates show `{{ .Token }}` (the code), not a link.
   - Site URL `https://my.magicportraits.ai` (dev: the preview URL).
   - Custom SMTP: Resend (step 4).
   
   For Claude Code to run migrations, also create a Supabase personal access token. Put it, with both project refs and database passwords, in the Claude Code environment (not Vercel): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF_DEV`, `SUPABASE_PROJECT_REF_PROD`, `SUPABASE_DB_PASSWORD_DEV`, `SUPABASE_DB_PASSWORD_PROD`.
3. **Read-only access to Imagen and the events mirror.** Run this in the SQL editor of **imagegen-prod** and of **shopify-dailyreport**, keeping only the `grant`/`policy` lines for tables in that project. Use a long generated password.
   ```sql
   create role vault_reader with login password '<long random password>';
   grant usage on schema public to vault_reader;
   -- imagegen-prod:
   grant select on public.sessions, public.images, public.revenue_events, public.themes,
                   public.session_recommendations to vault_reader;
   create policy vault_reader_select on public.sessions                for select to vault_reader using (true);
   create policy vault_reader_select on public.images                  for select to vault_reader using (true);
   create policy vault_reader_select on public.revenue_events          for select to vault_reader using (true);
   create policy vault_reader_select on public.themes                  for select to vault_reader using (true);
   create policy vault_reader_select on public.session_recommendations for select to vault_reader using (true);
   -- shopify-dailyreport:
   grant select on public.analytics_events_mirror, public.mug_fulfillment_jobs to vault_reader;
   create policy vault_reader_select on public.analytics_events_mirror for select to vault_reader using (true);
   create policy vault_reader_select on public.mug_fulfillment_jobs    for select to vault_reader using (true);
   ```
   Connection strings use the pooler (transaction mode), user `vault_reader.<project-ref>`. They go in `IMAGEGEN_DATABASE_URL` and `MIRROR_DATABASE_URL`. Imagen images are in a public bucket, so no Storage key is needed.
4. **Resend.**
   - Account; verify `magicportraits.ai` as a sending domain (add its DNS records in Cloudflare).
   - API key.
   - A webhook to `https://my.magicportraits.ai/api/webhooks/resend` for delivered, opened, bounced and complained, and keep its signing secret.
   - Turn on open tracking.
5. **Shopify (r_orders app).**
   - Confirm the Admin API token has `read_orders`, `read_all_orders` (orders older than 60 days), `write_orders` (the mug choice) and `read_customers`. Add any that are missing. Note the store's `.myshopify.com` domain and the app's API secret, which signs webhooks.
   - The webhook itself is registered after the build (see After the build).
6. **Vercel.**
   - New project in the Storyboards team, linked to the repo.
   - Add every variable in `.env.example`: Production gets the `magic-vault` keys, Preview gets the `magic-vault-dev` keys.
   - Add the domain `my.magicportraits.ai`.
   - In Cloudflare, add a CNAME `my` → `cname.vercel-dns.com`, DNS only (grey cloud).
7. **PostHog.** The project key for project 540098 (the one the main site uses). Optional: a personal API key, so Settings › Tracking can show counts and the setup script can create dashboards.
8. **Intercom.** The app id the main site uses for "Chat With Us" (`NEXT_PUBLIC_INTERCOM_APP_ID`).
9. **Klaviyo.**
   - In Klaviyo › Settings › API keys, create a private key just for this app (name it "My Magic Portraits") with scopes `events:write`, `profiles:write`, `data-privacy:write` and `metrics:read`.
   - Put it in Vercel as `KLAVIYO_PRIVATE_KEY`.
   - No flows are needed now: the app only sends events. The emails get written in Klaviyo later.

---

## The prompt

Open Claude Code in the repo and paste:

> Read `CLAUDE.md`, then `SPEC.md` (the source of truth), `BUILD.md`, `docs/*`, `designs/README.md` and `reference/live-site/README.md`. Build the whole app described there in one run, working through Parts 0–13 of `BUILD.md` in order.
>
> - For each part: build it, write its tests, run `pnpm typecheck && pnpm lint && pnpm test` (and the e2e suite when the part adds screens), fix until green, commit `feat(part-N): <name>`, push, and update `BUILD_LOG.md`.
> - Don't stop to ask questions. If something is missing (a secret, a permission, an unclear rule), use the fixture or the most reasonable reading, write it in `BUILD_LOG.md` under "Blocked" or "Decisions", and continue.
> - Run migrations, seeds and every test against the **dev** project (`magic-vault-dev`). In **production** (`magic-vault`), apply migrations and `supabase/seed.sql` only, and never turn on `cards.enabled` or any `gift.*` switch. Never send email to anyone but the test address in `SMOKE_TEST_EMAIL`. Never write to Shopify except the mug choice on a test order named in `SMOKE_TEST_ORDER` (skip it if that isn't set).
> - If `BUILD_LOG.md` already exists, you are resuming: read it and continue from the first unfinished part.

---

## Parts

Each part lists what to build and what has to be true before it's committed.

### Part 0: Preflight
- Read every doc.
- Check that each env var in `.env.example` is present (don't print values).
- Test each connection with one harmless read:
  - Shopify: shop name
  - Imagen: `select 1 from sessions limit 1`
  - Mirror: `select 1 from analytics_events_mirror limit 1`
  - Our Supabase project: connect
  - Shopify token scopes: `currentAppInstallation { accessScopes { handle } }` (list any of the four in step 5 that are missing)
  - Resend: domain status
  - Klaviyo: `GET /api/metrics/?page[size]=1` with the private key; try the newest API revision and save the one that works in `klaviyo.api_revision`
  - PostHog: key format.
- **Done when** `BUILD_LOG.md` lists each source as OK or Blocked, with the reason.

### Part 1: App shell
- Next.js app, Tailwind tokens and fonts (`docs/design.md`).
- `Header`, `MenuSheet`, `Footer`, `Avatar`/`AccountMenu`, ported from `reference/live-site/`.
- `t()` helper; 404 and error pages; `noindex` defaults.
- PostHog provider with the `/ingest` rewrite, cross-subdomain cookie and replay masking.
- `lib/track.ts` (PostHog side only for now).
- **Done when** a placeholder `/` renders the shell at 360, 390 and 1280 px and matches `VaultHome`'s header, menu and footer; axe shows no violations.

### Part 2: Database and settings
- Migrations for everything in `docs/schema.md`: tables, checks, indexes, RLS, `is_super_user`, `settings_history` trigger, the activity_log append-only guard, `rate_limits` with `hit_rate_limit()`, buckets.
- `supabase/seed.sql` (production: drafts, switches off) and `supabase/seed.dev.sql` (dev: one live version per category, `cards.enabled` on, fixture people).
- Apply to `magic-vault-dev` with the Supabase CLI (`supabase link` + `db push`, using the `SUPABASE_*` variables). Apply to production at the end of Part 13.
- `lib/settings/registry.ts` with every key from `docs/schema.md` § Seed and `docs/data.md` § Constants, plus typed `getSetting`/`setSetting` (short cache, validation, history).
- `track()` now also writes `activity_log` for business events.
- **Done when** migrations apply cleanly to a fresh database and the seed loads; unit tests cover settings validation, history and the activity_log guard.

### Part 3: Data sources
- `lib/sources/shopify.ts`, `imagen.ts`, `mirror.ts`, each implementing the queries in `docs/data.md`, plus fixtures.
- `getVaultProfile(email)`: orders, sessions (including recommendation children), images with the `ordered` flag, `is_customer`, display name and initials. Cached in `vault_members` for `vault.lookup_cache_minutes`.
- **Done when**:
  - unit tests on fixtures pass for a customer, a creator with no order, nobody, and a customer whose image is ordered in one session but not another
  - a live smoke check with `SMOKE_TEST_EMAIL` logs only counts and timings, and the lookup takes under 1.5 s warm.

### Part 4: Sign-in and account
- `/signin` (email → 6-digit code, resend, change email, `purpose=gift|redeem`).
- `/g/[token]` links: random opaque tokens, stored hashed on `gift_offers`, expiry from `gift.link_valid_days`. A server-side session exchange, then a redirect that strips the token from the address.
- `/redeem`, `/redeem?order=…` and `/redeem/[order]` → `RedeemEntry`. A wrong or unknown order shows one generic message.
- Middleware; avatar and initials; account menu; sign out (with `posthog.reset()`); super-user guard; rate limits via `hit_rate_limit()`.
- **Done when**:
  - e2e signs in with a 6-digit code, fetched in the test through the Supabase admin API (`auth.admin.generateLink` returns `email_otp`) against the dev project. No Docker or mail catcher is needed.
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
- **Done when** there are template snapshot tests, webhook signature and idempotency tests, and a cron test with a fake clock; one real test email goes to `SMOKE_TEST_EMAIL` if set.

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

### Part 13: Final check and preview deploy
- Full e2e at 390 and 1280 px; axe on every route.
- Walk the security list in `CLAUDE.md`, item by item, and record the results in `BUILD_LOG.md`.
- Search the client bundle for secret prefixes.
- Lighthouse on `/`, `/create` and `/orders` (mobile): performance ≥ 85, accessibility ≥ 95.
- Apply the migrations and `supabase/seed.sql` to production (`magic-vault`), with every switch off.
- Deploy a Vercel preview.
- Screenshot every route at 390 px into `docs/build-screens/` (fixture data only).
- **Done when** `BUILD_LOG.md` ends with:
  - what works
  - what's stubbed or blocked and why
  - the preview URL
  - the launch checklist below with each item marked.

---

## After the build (launch, with Gavin)

1. Review the preview on a phone. Add real theme artwork via Settings › Theme library and publish the first versions.
2. Run `scripts/register-shopify-webhook.ts` against production (orders/paid → My Magic Portraits).
3. Point the live site's `/redeem` at `https://my.magicportraits.ai/redeem` (keep the query string), and add the MY MAGIC PORTRAITS links to its menu. This is a change in the Lovable project.
4. Add the thank-you pop-up (`GiftSheet`) to the Shopify thank-you page, calling `/api/gift/offer-link`.
5. **Klaviyo** (events now, emails later).
   - Turn on `klaviyo.enabled` and send one test event of each kind from the preview to a staff profile, so the metrics show up in Klaviyo.
   - Later, when the emails are written:
     - Add `magicportraits.ai` as a Klaviyo sending domain (DNS in Cloudflare), or send as "Magic Portraits" <hi@storyboards.io>.
     - Build the flows, named like the account's other flows: "MP Free Gift - Make Your Card" (`free_gift_unlocked`, exit on `card_created`; copy the `Main` design), "MP Seasonal Card Reminder" (`gift_reminder_due`), "MP Choose Your Mug Photo" (`mug_photo_needed`, exit on `redeem_mug_saved`).
     - Then turn on `gift.popup_email_later_enabled`.
6. Add a line to the privacy policy: greeting cards and their messages are stored, and may be viewed by staff for support.
7. In Settings, turn on `cards.enabled`, then `gift.popup_enabled` and `gift.offer_email_enabled` (sends the `free_gift_unlocked` event; no email until the Klaviyo flow exists). Watch Settings › Insights and the PostHog card funnel for the first day.
