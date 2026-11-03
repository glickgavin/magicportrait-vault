# Build log: My Magic Portraits

One Claude Code cloud session, branch `claude/cool-volta-69zljg`, working through `BUILD.md` Parts 0–13.

## Progress

| Part | Name | Status |
|---|---|---|
| 0 | Preflight | done |
| 1 | App shell | pending |
| 2 | Database and settings | pending |
| 3 | Data sources | pending |
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

## Decisions

- **TypeScript 5.9** rather than 7.x (native preview), because Next 16's type plugin targets 5.x.
- **Playwright pinned to 1.63.0** to match the Chromium preinstalled at `/opt/pw-browsers`.
- **Local seeds:** `supabase/config.toml` runs `seed.sql` then `seed.test.sql` on `db reset`, so the test stack gets the production seed plus the test overlay (live versions, `cards.enabled` on, fixture people). `magic-vault` only ever gets `seed.sql`.

## Blocked

- Shopify, Klaviyo and AgentMail can't be reached from this session (see Part 0). Each sits behind an interface with a fixtures implementation; the live clients are checked after deploy.

## Open questions

(none yet)
