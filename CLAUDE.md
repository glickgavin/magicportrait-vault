# My Magic Portraits: instructions for Claude Code

This repo is **My Magic Portraits** at **my.magicportraits.ai** (internal code name "vault"). Signed-in customers can create free greeting cards from their portraits, see every portrait they've made, and redeem orders (free mug photo, hi-res downloads). Super users get Settings: insights, every card, customer timelines, the theme library, and all master data.

## Read these first
| File | What |
|---|---|
| `BUILD.md` | The build, in order, with what "done" means for each part |
| `SPEC.md` | **The source of truth:** decisions, every screen and rule, open questions |
| `docs/data.md` | Shopify, Imagen and events-mirror sources, exact queries, live /redeem rules and constants |
| `docs/schema.md` | The app's own tables, buckets, layout JSON, seed data |
| `docs/analytics.md` | PostHog events and the `activity_log` |
| `docs/design.md` | Brand tokens, header, menu, footer, components |
| `designs/README.md` | Screen mockups → routes |
| `reference/live-site/` | The live site's header, menu, footer and tokens, copied from its code |

## Stack
- **Next.js** (latest stable, App Router, TypeScript `strict`), pnpm, deployed on **Vercel** (team Storyboards).
- **Tailwind + shadcn/ui**, matching the live site (`reference/live-site/`).
- **Supabase** (the app's own new project, `magic-vault`): Postgres, Auth (email OTP), Storage. Use `@supabase/ssr` for auth cookies.
- **External reads:** Imagen and the events mirror through the read-only `vault_reader` Postgres role (`IMAGEGEN_DATABASE_URL`, `MIRROR_DATABASE_URL`; `postgres` driver via the Supabase pooler); Shopify Admin GraphQL with the r_orders app token.
- **Card render:** `@napi-rs/canvas` (fonts registered from `assets/fonts/`). Use `sharp` for upload checks and thumbnails.
- **Email:** React Email + Resend. Supabase Auth sends its codes through Resend SMTP.
- **Analytics:** `posthog-js` + `posthog-node`, proxied at `/ingest`.
- **Validation:** Zod on every input. **Tests:** Vitest (unit) and Playwright (e2e at 390 × 844 and 1280 × 800).
- **Scheduled work:** Vercel Cron → `/api/cron/*`, protected by `CRON_SECRET`.

## Layout
```
app/                 routes (customer pages, /c/[slug], /settings/*, /api/*)
components/          UI (Header, MenuSheet, Footer, AccountMenu, CardPreview, admin/*)
lib/sources/         shopify.ts, imagen.ts, mirror.ts  (interface + live + fixtures each)
lib/db/              our own tables (the only place that queries our database)
lib/settings/        registry.ts (every key, type, default, validation), get/set
lib/render/          card renderer (shared layout maths with CardPreview)
lib/track.ts         the only way to record an event (PostHog + activity_log)
lib/auth/            session, gift-link tokens, super-user guard
emails/              React Email templates
supabase/migrations/ SQL migrations; supabase/seed.sql
assets/fonts/        TTFs for the renderer
tests/               unit + e2e; tests/fixtures/ fake data only
```

## Words
- Customer-facing name: **My Magic Portraits**. Never show "vault" to customers; it's only the internal code name (repo, `vault_` events, `vault.*` settings, `vault_members`).
- The product is a **greeting card** ("card" in buttons). Never call it a "gift card". The **free gift** is the offer that unlocks cards.
- Setting keys: `cards.*` for the product, `gift.*` for the offer (`SPEC.md` §13).

## Rules

**Data**
- Shopify and Imagen are the sources of truth. Read them live; never copy orders or portraits into our database, except the cached session-id list and the copy of a portrait used on a card.
- Writes outside our database are allowed in exactly two places:
  1. The mug choice on a Shopify order: `metafieldsSet` + `tagsAdd`, as in `docs/data.md`.
  2. The webhook-registration script, which a human runs.
  
  Never write to Imagen, the events mirror or the live site's databases.
- Every external source sits behind an interface in `lib/sources/` with a `fixtures` implementation. Tests and local dev use fixtures (`DATA_SOURCE=fixtures`); fixtures contain made-up people only.

**No hard-coding**
- Anything a super user might change lives in `settings`, declared once in `lib/settings/registry.ts` with type, default and validation. This covers ids, limits, copy toggles, product lists, links and timings.
- Code calls `getSetting('cards.message_max_chars')`. Secrets live only in Vercel env vars.

**Security** (lessons from the live /redeem)
- Every customer action re-checks on the server that the signed-in email owns the thing (card, order) and that the action is allowed: mug present and not locked; downloads enabled.
- No debug fields in responses. Never return another person's email or data. Error messages don't reveal whether an email or order exists.
- Downloads and card images use short-lived signed URLs or app routes that check access. Never hand out permanent public links to private files.
- Only `NEXT_PUBLIC_*` values reach the browser, and those are the Supabase URL and anon key, the PostHog key and host. No other keys in client code.
- RLS on every table in our database, deny by default. The browser never queries tables directly.
- Verify Shopify and Resend webhook signatures. Make webhook handlers idempotent.
- `/settings/*` and `/api/admin/*` return 404 unless `is_super_user(email)`.
- Gift links are HMAC-signed with `GIFT_LINK_SECRET` and checked with a constant-time compare. Share slugs are random, 16+ chars.
- Rate-limit code requests, lookups and downloads per email and IP.

**Privacy**
- Never put message text, recipient name or recipient email into PostHog, `activity_log.props` or server logs.
- Mask emails in server logs (`s***@example.com`).
- Session replay masks inputs and the card preview.

**Analytics**
- Use `track(event, props, { email, source, ref })` from `lib/track.ts` for everything.
- Event names come only from `docs/analytics.md`. The wrapper rejects unknown names in dev and test.
- Business events go to both PostHog and `activity_log`; UI-only events go to PostHog only (the list is in `docs/analytics.md`).

**UI**
- Mobile first: build at 390 px, check at 360 px, then desktop. Match the mockups and `docs/design.md`; reuse the live site's header, menu and footer.
- All copy goes through `t()` (English only for now).
- Accessible: real radio groups and buttons, labels, focus states, AA contrast.

**Working**
- Before each commit, all of these pass: `pnpm typecheck && pnpm lint && pnpm test`. The e2e suite runs at the end of each part that adds a screen.
- One commit per finished part (`feat(part-N): …`), pushed. Keep `BUILD_LOG.md` up to date: done, stubbed, decisions, open questions.
- If something needed is missing (a secret, a permission, a design decision), don't stop the build. Put it behind its interface, use the fixture, write it in `BUILD_LOG.md` under "Blocked", and carry on.
- Never print secrets, never commit `.env*` (except `.env.example`), and never put real customer data in code, tests, fixtures, screenshots or logs.
