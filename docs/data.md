# Data and integrations (My Magic Portraits)

This is the reference for every external read and write the vault (`my.magicportraits.ai`) makes. The other docs refer to it: `SPEC.md` §10 and §11, `schema.md` (seed settings) and `analytics.md`.

- **Researched:** 2026-11-03, read-only. All counts below are from that day.
- **Not verified:** anything marked **UNVERIFIED** could not be confirmed from code or data. Do not treat it as fact. Section 9 lists every item.
- **No secrets here.** Only env var names appear. The vault reads all three sources **server-side only** (route handlers or server actions). No Supabase key or Shopify token for these sources may reach the browser.

## Environment variables (names only)

| Env var | Used for |
|---|---|
| `MIRROR_DATABASE_URL` | Postgres connection (pooler, transaction mode) to `kztxlpfrullqzphkvkiv` ("shopify-dailyreport") as the read-only role `vault_reader`: the events mirror and mug fulfilment jobs |
| `IMAGEGEN_DATABASE_URL` | the same for `ngyunrirwrjudbgaijek` ("imagegen-prod"): sessions, images, revenue events, themes, recommendations |

**Decision (3 Nov 2026):** the app reads both projects only through the read-only `vault_reader` role (created on both projects on 3 Nov: `select` on the tables named here only, a `vault_reader_select` policy per table, `default_transaction_read_only = on`, `statement_timeout = 15s`, connection limit 20; Gavin sets its passwords, `BUILD.md` step 2). It does **not** use their service-role keys, which can write.

**Known gap on both projects:** the `pg_net` extension grants `PUBLIC` (so every login role, `vault_reader` included) usage on schema `net` and all privileges on `net.http_request_queue` and `net._http_response`. A login could queue outbound HTTP requests from the database. `vault_reader`'s read-only default blocks this unless a client deliberately turns it off, and its password lives only in Vercel. Fully closing it means revoking those `PUBLIC` grants on each project, which affects every role: check nothing relies on them first (SPEC §21). Run the SQL versions of the queries below; ignore the PostgREST variants. Imagen images are in the public `images` bucket, so no Storage key is needed.

| `SHOPIFY_STORE_DOMAIN` | `storyboards.myshopify.com` (verified 4 Nov via the Admin API's `shop.myshopifyDomain`; the public domain is store.magicportraits.ai) |
| `SHOPIFY_CLIENT_ID` | Client ID of the r_orders app (a Shopify **Dev Dashboard** app: client id + secret, no permanent token) |
| `SHOPIFY_CLIENT_SECRET` | Its client secret. Used for the client credentials grant **and** to verify `orders/paid` webhook HMACs and checkout-extension session tokens |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Optional fallback: a permanent `shpat_` Admin token, used only when the client id/secret aren't set |
| `SHOPIFY_WEBHOOK_SECRET` | The store's notification key, for an `orders/paid` webhook made in Shopify Admin › Settings › Notifications › Webhooks ("Your webhooks will be signed with …"). The webhook accepts this or the client secret |

**Decision (4 Nov 2026):** r_orders is a Dev Dashboard app, so there is no permanent token (a static token was the cause of the preview's `shopify_http_401`). The vault gets its Admin API token the same way the live site's redeem functions do, with the client credentials grant (§5.1), in `lib/sources/shopify-auth.ts`.

---

## 1. Overview

```
            vault sign-in (Supabase OTP)  ->  verified email E, lower-cased
                                   |
         +-------------------------+-----------------------------------+
         |                                                             |
         v                                                             v
 [kztxlpfrullqzphkvkiv] public.analytics_events_mirror        [Shopify Admin GraphQL, r_orders token]
   WHERE email = ANY({lower(E), E as typed})                     orders(query: "email:\"E\"")  (paged)
   -> properties->>'imagegen_session_id'  (uuid text)            -> name, dates, statuses, tags,
   -> properties->>'lptemp_session_id'    (for deep links)          metafield custom.mug_choice,
         |                                                          line items + customAttributes
         | imagegen session ids (uuid[])                                |
         v                                                             |  per order (section 6):
 [ngyunrirwrjudbgaijek]                                                |   mug present?  downloads enabled?
   sessions  (+ session_recommendations.child_session_id)             |   portraits = lines with _tile_id/_image_url
     -> themes.name (theme name), sessions.name (pet name)            |
     -> images  (is_grid = false AND visibility = 'customer')          |
           image_url = public bucket "images" + image_path            |
     -> revenue_events.image_id  -> ordered = true,                    |
                                    shopify_order_id(s)               |
         |                                                             |
         +-------------> ordered flag  <-------------------------------+
                         (revenue_events OR image id appears as _tile_id / _image_id
                          in one of this email's Shopify orders)
                                                                       |
                                                                       v
                                    [kztxlpfrullqzphkvkiv] public.mug_fulfillment_jobs
                                    (mug lock state, keyed by Shopify mug line item id)
```

The vault reads all three sources live. It copies nothing except the cached lookup in `vault_members.imagen_sessions` (`schema.md`).

---

## 2. Source 1: events mirror (Supabase `kztxlpfrullqzphkvkiv`, "shopify-dailyreport")

### 2.1 Table `public.analytics_events_mirror`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | uuid | not null | (none) | primary key |
| `event_name` | text | not null | | e.g. `funnel_portrait_generated` |
| `event_category` | text | null | | |
| `session_id` | text | null | | the **browser analytics session**, not the Imagen session |
| `user_id` | text | null | | |
| `properties` | jsonb | null | | event properties (see 2.3) |
| `page_url` | text | null | | |
| `page_path` | text | null | | |
| `referrer` | text | null | | |
| `user_agent` | text | null | | |
| `device_type` | text | null | | |
| `created_at` | timestamptz | not null | | event time |
| `magic_id` | text | null | | legacy funnel id. **Not** the Imagen `sessions.client_user_id` |
| `click_id` | text | null | | affiliate click id |
| `email` | text | null | | **mixed case in places** (see 2.4) |
| `synced_at` | timestamptz | not null | `now()` | |
| `country` | text | null | | |

**Indexes** (exact definitions):

```sql
CREATE UNIQUE INDEX analytics_events_mirror_pkey ON public.analytics_events_mirror USING btree (id);
CREATE INDEX analytics_events_mirror_created_at_idx ON public.analytics_events_mirror USING btree (created_at DESC, id DESC);
CREATE INDEX analytics_events_mirror_event_name_created_idx ON public.analytics_events_mirror USING btree (event_name, created_at DESC);
CREATE INDEX analytics_events_mirror_event_category_created_idx ON public.analytics_events_mirror USING btree (event_category, created_at DESC) WHERE (event_category IS NOT NULL);
CREATE INDEX analytics_events_mirror_session_created_idx ON public.analytics_events_mirror USING btree (session_id, created_at) WHERE (session_id IS NOT NULL);
CREATE INDEX analytics_events_mirror_email_created_idx ON public.analytics_events_mirror USING btree (email, created_at) WHERE (email IS NOT NULL);
CREATE INDEX analytics_events_mirror_properties_gin_idx ON public.analytics_events_mirror USING gin (properties);
CREATE INDEX analytics_events_mirror_device_created_idx ON public.analytics_events_mirror USING btree (device_type, created_at DESC) WHERE (device_type IS NOT NULL);
```

There is **no index on `lower(email)`**.

**RLS:** enabled. There are two policies: `"anon read"` (roles `{public}`, SELECT, `USING (true)`) and `"service role full access"` (`{service_role}`, ALL, `true`). Anyone holding this project's anon key can read every event, including emails (section 8, item 12). The app reads with the read-only `vault_reader` role on the server (see the decision at the top of this file).

**Freshness:** a sync job fills the mirror. It ran 96 times in the last 24 h, so roughly every 15 minutes. The newest mirrored event was 8 minutes old when checked. Expect up to about 15 minutes of lag, so a portrait made a moment ago may not show yet.

### 2.2 Size and coverage (2026-11-03)

| measure | value |
|---|---|
| total rows | 5,015,196 (from 2026-02-12) |
| rows with `email` | 2,035,838 (40.6%) |
| rows whose `email` is not all lower-case | 71,845 |
| rows with `properties.imagegen_session_id` | 100,985 (first 2026-05-12 09:08 UTC) |
| …of which also have `email` | 98,765 (97.8%) |
| …of which are UUID-shaped | 100,935 (the other 50 are 8–9 character test ids: ignore them) |
| distinct Imagen session ids in the mirror | 83,158 |
| distinct emails (lower-cased) | 41,101 |
| emails with ≥1 Imagen session id | **37,637 (91.6%)** |
| sessions per email (emails that have any) | mean 2.16, median 1, max 200 |
| emails whose session rows exist **only** under a non-lower-case spelling | 876 (2.3% of 37,637) |

These events carry `imagegen_session_id`:

| event_name | rows |
|---|---|
| `funnel_portrait_generated` | 96,424 |
| `certificate_card_viewed` | 2,910 |
| `masterpiece_version_painted` | 1,616 |
| `certificate_enlarge_opened` | 26 |
| `certificate_added` | 9 |

For comparison, imagegen-prod holds 97,816 sessions, starting 2026-04-30. Gaps in coverage:

- Sessions before 2026-05-12 have no link.
- Sessions whose events had no email have no link. These are about 2% of rows; see the optional expansion in 2.5.
- Recommendation child sessions are never in the mirror. In a sample of 20 ready child sessions, 0 were found. Add them from imagegen (3.6).

### 2.3 Properties used by the vault

Keys seen on `funnel_portrait_generated` in the last 7 days include `imagegen_session_id`, `lptemp_session_id`, `email`, `theme_name`, `theme_slug`, `pet_name` (≈75%), `image_count`, `generated_image_url_1..8`, `generated_image_urls`, `original_image_url`, `generation_time_ms`, `session_id`, `page_path`, `currency`, `content_ids`, and the UTM and fbclid keys.

- `imagegen_session_id` is always a JSON string. When valid it is a lower-case UUID.
- `lptemp_session_id` is present on effectively every row that has `imagegen_session_id` (96,422 of 96,425 for `funnel_portrait_generated`). It is the main site's `user_sessions` id and is used for the "Order as wall art" deep link (6.10).

### 2.4 Query: distinct Imagen session ids for one email

The parameter `$1` is a `text[]` holding the distinct candidate spellings: `ARRAY[lower(trim(email)), trim(email)]`. The vault's sign-in email is already lower-case, so this is usually one element. Add the as-typed spelling if you keep it.

```sql
-- Mirror: Imagen sessions for one person. Uses analytics_events_mirror_email_created_idx (~3–6 ms measured).
select m.properties->>'imagegen_session_id'                                   as imagegen_session_id,
       (array_agg(m.properties->>'lptemp_session_id' order by m.created_at desc)
          filter (where m.properties->>'lptemp_session_id' is not null))[1]   as lptemp_session_id,
       min(m.created_at)                                                      as first_seen_at,
       max(m.created_at)                                                      as last_seen_at
from public.analytics_events_mirror m
where m.email = any ($1::text[])
  and (m.properties->>'imagegen_session_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
group by 1
order by max(m.created_at) desc;
```

Rules learned from measuring:

- **Do not** write `lower(email) = $1`. No index supports it, so the planner falls back to the GIN index plus a lossy heap scan: **31.8 s** measured.
- **Do not** add `properties ? 'imagegen_session_id'`. The planner then bitmap-ANDs the 100k-row GIN match: 78 ms, against 5.6 ms without it. The UUID regex already implies the key exists.
- Mixed case: matching only the lower-case spelling misses people whose rows were stored in another case (876 emails). The proper fix is an expression index. It needs the project owner, is **not applied**, and is listed in section 9:
  ```sql
  create index concurrently analytics_events_mirror_lower_email_idx
    on public.analytics_events_mirror (lower(email)) where email is not null;
  -- then the predicate becomes:  where lower(m.email) = lower(trim($1)) and (...regex...)
  ```
- PostgREST alternative, if you do not use a direct connection. It was not executed, so it is **UNVERIFIED**, and you must dedupe in code:
  ```ts
  mirror.from('analytics_events_mirror')
    .select('created_at, imagegen_session_id:properties->>imagegen_session_id, lptemp_session_id:properties->>lptemp_session_id')
    .in('email', candidates)
    .not('properties->>imagegen_session_id', 'is', null)
    .order('created_at', { ascending: false })
    .range(0, 999)   // page if exactly 1000 rows come back
  ```
  Then keep only values matching the UUID regex.

### 2.5 Optional expansion: browser sessions (off by default)

About 2.2k rows carry an Imagen session id but no email. The same browser `session_id` sometimes carries the email on other events. Picking those up costs one more indexed query. The risk is shared devices. Whether to enable it is a decision (section 9), and the gain is **UNVERIFIED**: the full count timed out.

```sql
with mine as (
  select distinct session_id from public.analytics_events_mirror
  where email = any ($1::text[]) and session_id is not null
)
select distinct m.properties->>'imagegen_session_id' as imagegen_session_id
from public.analytics_events_mirror m
join mine using (session_id)
where (m.properties->>'imagegen_session_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
```

### 2.6 Mug fulfilment tables (same project): the mug lock signal

The project runs a mug pipeline: received → print PDF → Gelato draft → submitted → printed/shipped → Shopify fulfilment. It records state in `public.mug_fulfillment_jobs`, with 2,480 rows, one per Shopify mug line item. RLS is on with no policies, so only the service role can read it (the `vault_reader` role gets a select policy, `BUILD.md` step 3). **The pipeline code was not found.** This project has no edge functions; it may run elsewhere (**UNVERIFIED**).

| column | type | null | default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `shopify_order_id` | text | not null | numeric legacy id, e.g. `"5551234567890"` (indexed `mug_jobs_order_idx`) |
| `shopify_order_name` | text | not null | `#1001` form |
| `shopify_line_item_id` | text | not null | numeric legacy id of the **mug** line; `UNIQUE` |
| `tile_id` | text | null | chosen tile id, or `none_selected` (1,311 rows) |
| `print_file_url` | text | null | |
| `gelato_product_uid` | text | not null | |
| `quantity` | integer | not null | `1` |
| `state` | text | not null | `'received'`; CHECK in `received, generating, file_ready, draft_created, submitted, passed, printed, shipped, delivered, failed` |
| `gelato_draft_id`, `gelato_order_id` | text | null | |
| `tracking_number`, `tracking_url`, `tracking_company` | text | null | |
| `attempts` | integer | not null | `0` |
| `last_error` | text | null | |
| `next_attempt_at` | timestamptz | null | |
| `created_at`, `updated_at` | timestamptz | not null | `now()` |
| `customer_name` | text | null | |
| `shipping_address` | jsonb | null | |
| `manual_approval` | text | null | CHECK in `pdf_only, submit, go_live, cancelled, auto_fulfill` |
| `tile_override_url` | text | null | set by staff |
| `shopify_fulfillment_id` | text | null | set when the pipeline fulfils the mug line in Shopify |
| `mug_ready` | boolean | not null | `false`; set when a customer choice is detected |
| `mug_ready_at`, `mug_ready_checked_at` | timestamptz | null | |

`public.mug_fulfillment_events` holds an audit row per step: `id, job_id, event_type, from_state, to_state, payload jsonb, error, created_at`. From it:

- Observed transitions: `received→generating→file_ready→draft_created→submitted→passed→printed→shipped→delivered`. Some steps are skipped (`submitted→shipped`, for example), and `failed→received` retries happen.
- `mug_ready_detected` (410) and `customer_reselection_applied` (377) events carry `tile_id`/`new_tile_id`, `image_url`, `metafield_updated_at` and `source` (always `"redeem"`). So the pipeline reads the order metafield `custom.mug_choice` that redeem writes (inferred from those payload keys; **UNVERIFIED** in code).
- Of the 377 reselections: 361 happened before `generating`, 7 between `generating` and `submitted`, and **9 after `submitted`**. Those 9 jobs are now printed, shipped or delivered. Customers changed their choice after the mug went to print and nothing stopped them.

Query the vault uses for lock state, keyed by the order's numeric id:

```sql
select shopify_line_item_id, tile_id, state, gelato_order_id, shopify_fulfillment_id,
       mug_ready, manual_approval, tracking_url, updated_at
from public.mug_fulfillment_jobs
where shopify_order_id = $1;   -- e.g. '5551234567890' (Order.legacyResourceId as text)
```

The lock rule is in 6.6.

---

## 3. Source 2: Imagen (Supabase `ngyunrirwrjudbgaijek`, "imagegen-prod")

The schema has more tables than the four below. The ones the vault needs, with exact columns:

### 3.1 `public.sessions` (97,816 rows)

| column | type | null | default / check |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()`; **PK**. This is the "Imagen session id" |
| `app_id` | uuid | not null | FK → `apps.id`. The main site and Masterpiece use `00000000-0000-0000-0000-000000000002` (named "Test App" but it is production: 96,312 sessions) |
| `api_key_id` | uuid | null | FK → `api_keys.id` |
| `theme_id` | uuid | null | FK → `themes.id` (`sessions_theme_id_fkey`) |
| `client_user_id` | text | not null | caller's id (not an email, not the mirror `magic_id`) |
| `status` | text | not null | `'pending'`; CHECK in `pending, preprocessing, awaiting_face_selection, generating, done, failed, cancelled` |
| `source_image_path` | text | null | |
| `metadata` | jsonb | not null | `'{}'`. Keys seen: `is_test` (`"true"`, 1,903 sessions), `is_recommendation_child` (`"true"`, 7,112), `parent_session_id`, `recommendation_id`, `failure_reason`, `failed_at`, `watchdog_*`, `optimizer_*`, `note`, `cancelled_reason` |
| `created_at`, `updated_at` | timestamptz | not null | `now()` |
| `expected_image_count` | integer | null | |
| `completed_at` | timestamptz | null | |
| `total_latency_ms` | integer | null | |
| `started_at` | timestamptz | not null | `now()` |
| `select_faces` | boolean | not null | `false` |
| `name` | text | null | display name sent by the caller, i.e. the **pet name** (≈81% of recent sessions) |
| `name_parts` | jsonb | null | structured name parts (unused so far) |

Status counts for app `…0002`: done 94,485 · failed 1,411 · awaiting_face_selection 264 · cancelled 150 · pending 2.

Indexes: `sessions_pkey (id)`, `sessions_app_status_idx (app_id, status)`, `sessions_client_user_idx (app_id, client_user_id)`, `sessions_created_at_desc_idx (created_at DESC)`.

### 3.2 `public.images` (774,742 rows)

| column | type | null | default / check |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()`; **PK**. Equals the Shopify line attribute `_tile_id`, and `_image_id` on Masterpiece lines |
| `session_id` | uuid | not null | FK → `sessions.id` |
| `generation_job_id` | uuid | not null | FK → `generation_jobs.id` |
| `provider_output_id` | uuid | null | FK → `provider_outputs.id` |
| `image_path` | text | not null | path **inside storage bucket `images`**, e.g. `sessions/<session_id>/generated/<job_id>_tile_0.png` |
| `width`, `height` | integer | null | |
| `format` | text | null | `png` or `jpg` |
| `created_at` | timestamptz | not null | `now()` |
| `is_grid` | boolean | not null | `false`. `true` = the 2×2 composite; never show it |
| `tile_index` | integer | null | 0–3, sometimes up to 7. Null for single images (e.g. Masterpiece jpgs) |
| `grid_image_id` | uuid | null | FK → `images.id` (the composite a tile was cut from) |
| `visibility` | text | not null | `'customer'`; CHECK in `customer, held_back`. `held_back` images are generated but hidden: never show them |

Counts: customer-visible tiles and singles 589,393 · grids 146,481 · held_back 38,892.

Indexes: `images_pkey (id)`, `images_session_idx (session_id)`, `images_session_user_visible_idx (session_id) WHERE is_grid = false`, `images_session_visibility_idx (session_id, visibility) WHERE is_grid = false`, `images_grid_idx (grid_image_id)`.

**Image URL:** `https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/` + `image_path`.

- Bucket `images` is `public = true`. This was confirmed for 80 sampled rows, all of them in bucket `images`.
- The URL is therefore **public and permanent**. It needs no signing, and signing would not protect anything, because the public URL keeps working.
- It is the same URL the live site writes into the Shopify line attribute `_image_url`.
- Other buckets here, all private: `generated-images`, `prepped`, `prints`, `processed-inputs`, `replacements`, `user-uploads`, `amazon-uploads`. `theme-images` is public.

### 3.3 `public.revenue_events` (18,030 rows): the link from image to Shopify order

| column | type | null | default / check |
|---|---|---|---|
| `id` | uuid | not null | PK |
| `session_id` | uuid | null | FK → `sessions.id` |
| `image_id` | uuid | null | FK → `images.id` (`revenue_events_image_id_fkey`) |
| `app_id` | uuid | not null | FK → `apps.id` |
| `source` | text | not null | `'shopify'`; CHECK in `shopify, manual` |
| `amount_usd` | numeric | not null | |
| `currency` | text | not null | `'USD'` |
| `shopify_order_id` | text | null | numeric legacy order id as text (all rows numeric) |
| `shopify_line_item_id` | text | null | numeric legacy line item id as text |
| `created_at`, `occurred_at` | timestamptz | not null | `now()` |
| `attribution_method` | text | null | CHECK in `line_item, metadata, manual, metafield_fetch, product_cache, unattributed` |
| `attribution_confidence` | numeric | null | 0–1 |
| `raw_payload` | jsonb | null | the order JSON, kept for only about 213 rows |

Indexes: `revenue_events_pkey (id)`, `revenue_events_image_idx (image_id) WHERE image_id IS NOT NULL`, **unique** `revenue_events_shopify_idempotent (source, shopify_order_id, shopify_line_item_id)`.

What the rows contain:

- 17,620 rows are `line_item` with both `image_id` and `session_id`. They cover 17,322 distinct images and 4,533 distinct orders, starting 2026-04-30.
- 410 rows are `unattributed` with no image (2026-05-11 to 05-14).
- `image_id` always equals the line attribute `_tile_id`. It was checked on 729 lines, Masterpiece included. None point at grids, held_back images or child sessions.
- About 2% of order lines carrying an imagegen `_image_url` had no revenue event (16 of 745 in the sample). Hence the second source for `ordered` in 3.6.
- There is **no refund or cancel state**. A cancelled order still counts as "ordered" here.

The rows are written by an `orders/paid` webhook worker. `public.shopify_attribution_jobs` holds 7,121 jobs: `orders/paid` since 2026-05-11, plus 3 `orders/create` before that.

### 3.4 `public.themes` (109 rows)

| column | type | null | default / check |
|---|---|---|---|
| `id` | uuid | not null | PK |
| `organization_id`, `category_id`, `model_id` | uuid | null | FKs |
| `name` | text | not null | display name, e.g. "Bathroom Bliss". **This is what the Shopify `_theme` attribute holds** (matches `name`, never `slug`) |
| `slug` | text | not null | unique (`themes_slug_unique`) |
| `crop_faces` | boolean | not null | `true` |
| `prompt_template` | text | null | |
| `is_active` | boolean | not null | `true` |
| `created_at`, `updated_at` | timestamptz | not null | `now()` |
| `generation_settings` | jsonb | not null | `'{}'` |
| `description`, `color_hex`, `image_url`, `image_url2`…`image_url5`, `carousel_image_url`, `modal_title` | text | null | |
| `display_order`, `ai_resolution` | integer | null | |
| `vip_lock`, `crop_square`, `recommendations_enabled`, `select_faces` | boolean | not null | `false` |
| `crop_mode` | text | not null | `'subject'`; CHECK in `subject, center` |
| `inputs` | jsonb | null | array, at least 1 element |
| `subheading` | text | null | ≤500 chars |
| `caption` | text | null | ≤200 chars, e.g. the film a theme is based on |

### 3.5 `public.session_recommendations` (10,450 rows): child sessions

Columns: `session_id uuid` (parent, FK → sessions) · `recommendation_id uuid` · `recommendation_revision int` · `status text` (CHECK `pending, generating, ready, failed, skipped`) · `child_session_id uuid null` (FK → sessions) · `preview_image_path`, `preview_image_url`, `error text` · `started_at`, `completed_at timestamptz`.

- PK: `(session_id, recommendation_id)`. Also indexed: `session_recommendations_child_session_idx (child_session_id) WHERE child_session_id IS NOT NULL`.
- 7,038 ready rows have a child session.
- A child session is an ordinary `sessions` row with `metadata.is_recommendation_child = "true"` and `metadata.parent_session_id`.

### 3.6 Join map and the portraits query

```
sessions.id ──< images.session_id
sessions.theme_id >── themes.id
images.id ──< revenue_events.image_id     (ordered; shopify_order_id / shopify_line_item_id)
sessions.id ──< session_recommendations.session_id ; session_recommendations.child_session_id >── sessions.id
Shopify line customAttributes: _tile_id (or _image_id on Masterpiece lines) = images.id
```

`$1` is `uuid[]` of Imagen session ids from 2.4. The query runs in 4–12 ms measured for 20–40 sessions.

```sql
with input as (
  select unnest($1::uuid[]) as id
),
all_sessions as (                       -- the person's sessions plus their recommendation children
  select id from input
  union
  select sr.child_session_id
  from public.session_recommendations sr
  join input on sr.session_id = input.id
  where sr.child_session_id is not null
)
select
  i.id                                              as image_id,
  i.session_id,
  s.created_at                                      as session_created_at,
  s.status                                          as session_status,
  coalesce((s.metadata->>'is_recommendation_child')::boolean, false) as is_recommendation_child,
  s.metadata->>'parent_session_id'                  as parent_session_id,
  s.name                                            as pet_name,
  s.theme_id,
  t.name                                            as theme_name,
  t.slug                                            as theme_slug,
  i.created_at,
  i.tile_index,
  i.width, i.height, i.format,
  i.image_path,
  'https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/' || i.image_path as image_url,
  (r.image_id is not null)                          as ordered,
  r.shopify_order_ids,                              -- text[] of numeric legacy order ids
  r.shopify_line_item_ids,                          -- text[]
  r.first_ordered_at
from public.images i
join all_sessions a       on a.id = i.session_id
join public.sessions s    on s.id = i.session_id
left join public.themes t on t.id = s.theme_id
left join lateral (
  select re.image_id,
         array_agg(distinct re.shopify_order_id)     as shopify_order_ids,
         array_agg(distinct re.shopify_line_item_id) as shopify_line_item_ids,
         min(re.occurred_at)                          as first_ordered_at
  from public.revenue_events re
  where re.image_id = i.id and re.source = 'shopify'
  group by re.image_id
) r on true
where i.is_grid = false
  and i.visibility = 'customer'
  and coalesce((s.metadata->>'is_test')::boolean, false) = false
order by i.created_at desc, i.session_id, i.tile_index nulls first;
```

**Final `ordered` flag in the vault:**

```
ordered = ( r.ordered
            OR image_id ∈ { lineTileId of every line in this email's Shopify orders } )
          AND NOT every matching order is cancelled or fully refunded
```

**Cancelled and refunded orders don't count** (decided: SPEC Q5). An order is excluded when `cancelledAt` is set or `displayFinancialStatus` is `REFUNDED` or `VOIDED`. For `revenue_events` rows, look up `shopify_order_ids` in this email's Shopify order list. If an order isn't in that list (it was placed on another email), count it as ordered. The same rule decides whether someone has the free gift (`gift.unlock_rule`, SPEC §8.3).

Here `lineTileId = _tile_id ?? (_masterpiece === 'true' ? _image_id : undefined)`, the same rule as 6.3. When ordered, show the Shopify order. Prefer the vault's own order list, matching legacy ids from `shopify_order_ids` to `Order.legacyResourceId`, so the order `name` (`#1001`) can be shown.

PostgREST alternative (not executed, **UNVERIFIED**; chunk `in()` to ≤100 ids):

```ts
imagegen.from('images')
  .select('id, session_id, image_path, created_at, tile_index, width, height, format, sessions(id, created_at, status, name, metadata, themes(name, slug)), revenue_events(shopify_order_id, shopify_line_item_id, source, occurred_at)')
  .in('session_id', allSessionIds)      // fetch children first from session_recommendations
  .eq('is_grid', false)
  .eq('visibility', 'customer')
  .order('created_at', { ascending: false })
```

### 3.7 RLS on imagegen-prod

| table | policies |
|---|---|
| `images` | `anon_can_read_images_by_session` (anon, SELECT, **`USING (true)`**) · `dashboard_admin_read` (authenticated, `is_dashboard_admin(auth.uid())`) |
| `sessions` | `anon_can_read_session_status` (anon, SELECT, **`true`**) · `dashboard_admin_read` |
| `revenue_events`, `themes`, `session_recommendations` | `dashboard_admin_read` only. The anon key **cannot** read them |

- The app reads with the read-only `vault_reader` role, which gets its own select policy on each table it needs (created 3 Nov; `BUILD.md` step 2 sets the password).
- `themes` and `revenue_events` are not readable with the anon key.
- `images` and `sessions` being world-readable is a live-site risk (section 8, item 12).
- `public.dashboard_users` has RLS **disabled**. The vault does not use it, but the project's security advisor flags it.

---

## 4. Source 3: live `/redeem` (Lovable project "Magic Shopify Studio")

- **Project:** `7e35fe57-6b58-4bb6-9c93-3f6a5d344588`, read at `HEAD`. Its edge functions run on Supabase project `afqxjwizbmpzmvzzkzdb` (see `supabase/config.toml`).
- **Files read:**
  - `src/pages/Redeem.tsx`
  - `supabase/functions/redeem-get-order/index.ts`, `redeem-download/index.ts`, `redeem-save-mug/index.ts`, `redeem-download-all/index.ts` (a fourth function the brief did not list)
  - `src/App.tsx` (routes)
  - `src/lib/analytics/index.ts` and `custom.ts` (events)
  - `src/stores/cartStore.ts` (where the line attributes are written)
  - `src/lib/mugValue.ts`, `supabase/config.toml`
- **No shared helpers.** Each function inlines its own copy of `getAccessToken`, `shopifyAdmin`, `resolveOrderGid`, `envDebug` and `FAIL`.
- **Not verified against deployed code.** Reading the deployed functions on `afqxjwizbmpzmvzzkzdb` was refused (permission denied). The repo code and the event data in 4.7 agree, but deployed = HEAD is **UNVERIFIED**.
- **Public endpoints.** All four functions have `verify_jwt = false`. The browser calls them with the publishable anon key and no other auth.

**Routes:** `/redeem` and `/redeem/:orderId`. With `:orderId` in the URL, the order field is hidden and the URL value is used.

### 4.1 Order lookup (all four functions, identical)

1. Validate the body with zod.
   - `order`: string, trimmed, 1–50 characters.
   - `email`: string, trimmed, `.email()`, at most 255 characters.
   - `tileId` (save and download only): string, trimmed, 1–200 characters.
2. `resolveOrderGid(input)`:
   - If `/^\d{10,}$/` matches the trimmed input, use `gid://shopify/Order/{input}`. The page sends the numeric id after the first lookup.
   - Otherwise set `name = input.startsWith('#') ? input : '#' + input` and run
     ```graphql
     query($q: String!) { orders(first: 1, query: $q) { edges { node { id } } } }
     ```
     with `{ q: "name:#1001" }`. No match fails with `no_gid`.
3. Fetch the order. `redeem-get-order` uses exactly this query. The others select a subset.
   ```graphql
   query($id: ID!) {
     order(id: $id) {
       id name email
       customer { email }
       metafield(namespace: "custom", key: "mug_choice") { value }
       lineItems(first: 50) {
         edges { node {
           title
           product { id }
           variant { id }
           customAttributes { key value }
         } }
       }
     }
   }
   ```
   - API version `2025-07`, endpoint `https://{SHOPIFY_STORE_DOMAIN}/admin/api/2025-07/graphql.json`, header `X-Shopify-Access-Token`.
   - Only the **first 50 line items** are read, with no pagination.
4. Ownership check: `email.trim().toLowerCase()` must equal `order.email.toLowerCase()` or `order.customer.email.toLowerCase()`. Otherwise fail with `email_mismatch`.

### 4.2 Line-item attributes: where portrait image URLs come from

- Admin GraphQL `LineItem.customAttributes {key value}`, Storefront cart line `attributes`, and the webhook's `line_items[].properties [{name, value}]` are the same data.
- They are written by `cartStore.ts` at checkout. Keys starting with `_` are hidden from the buyer.

| key | written on | value | seen in last 500 orders |
|---|---|---|---|
| `_tile_id` | portrait / photo tile lines | Imagen `images.id` (a UUID). Photo-tile uploads have a UUID that is **not** an Imagen image | 1,448 |
| `_image_url` | same | full image URL (hosts below) | 1,448 |
| `_theme` | same | Imagen `themes.name` (e.g. "Bathroom Bliss"); `"Photos"` for photo tiles | 1,448 |
| `_size` | same | tile size label | 1,448 |
| `_tile_type` | same | `portrait` · `photo` · absent (Masterpiece) | 1,334 |
| `_magic_id`, `_effect`, `_master_variant_id`, `_position`, `_funnel` (`order_sync`), `_crop_data` | various | funnel internals | |
| `_masterpiece` | Masterpiece lines | `"true"` | 114 |
| `_image_id` | Masterpiece lines | Imagen `images.id`. Older Masterpiece lines have this but **no `_tile_id`** | 114 |
| `_masterpiece_digital`, `_masterpiece_gift` | Masterpiece lines | `"true"` / `"false"` | 114 / 64 |
| `_free_gift` | mug line | `magic_mug` | 131 |
| `_mug_portrait_tile_id` | mug line | tile id or `none_selected` | 131 |
| `_print_file_status` | mug line | `pending` (tile chosen at checkout) or `none_selected`. Every recent mug line is `none_selected`: the choice now happens on /redeem | 131 |
| `_print_file_url` | mug line, only when a tile was chosen at checkout | `https://kztxlpfrullqzphkvkiv.supabase.co/storage/v1/object/public/mug-prints/mugs/{tileId lower}.pdf` | |
| `_gelato_product_uid` | mug line | `mug_product_msz_11-oz_mmat_ceramic-black_cl_4-0` | 131 |
| `_addon` | hi-res line | `hires_download` | 80 |
| `_image_count` | hi-res line | number of images (= line quantity) | 80 |
| `_imagegen_session_id` | hi-res line in `cartStore.ts`; also seen on other lines (194 > 80 hi-res lines; the writers of the others were not traced) | Imagen session id (another order → session link) | 194 |

`_image_url` hosts seen in the last 300 orders (paths are placeholders):

- `https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/sessions/<uuid>/generated/<uuid>_tile_N.png` (or `.jpg`): Imagen, public, permanent.
- `https://afqxjwizbmpzmvzzkzdb.supabase.co/storage/v1/object/public/tiles-uploads/order-uploads/<uuid>….jpg`: photo-tile uploads (the customer's own photos), public.
- `https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/sign/replacements/reship/<uuid>/<uuid>.png?token=…`: **signed, so it expires**. Used on replacement or reship lines.
- `https://storyboards-magic-portraits.s3.us-east-2.amazonaws.com/pets/<uuid>/…-generated-1.jpg`: legacy, seen once.

### 4.3 How "mug present" is decided

**Confirmed:** a line with `_free_gift === "magic_mug"`.

- The mug's variant and product are **not** checked by redeem. The mug line in recent orders is product `8600824643780`, variant `46177764769988` ("Magic Mug with Photo"). The variant id `46177764769988` is confirmed, but it appears only in `cartStore.ts` (the checkout line), not in any redeem function.
- Current choice: parse the `custom.mug_choice` value as JSON and take `tile_id`. If that is missing, use the mug line's `_mug_portrait_tile_id` unless it equals `none_selected`. If both are missing, use `null`.

### 4.4 How "downloads enabled" is decided

**Confirmed** in `redeem-get-order`. Downloads are enabled if any line has one of:

- `product.id` ∈ {`gid://shopify/Product/8596065026244` (legacy "Get All Your Portraits — High-Res Digital Files", $3.99), `gid://shopify/Product/8629738045636` (current "High-Res Download", $0.99 each, variant `46302430429380`), `gid://shopify/Product/8801988214980` ("Masterpiece Digital File", variant `46936933630148`)}
- `_addon === "hires_download"`
- `_masterpiece === "true"`: every Masterpiece line, print or digital

**But** `redeem-download-all` checks only the legacy product `8596065026244` (section 8, item 5). `redeem-download` checks nothing (item 3).

### 4.5 Mug save mutation

**Confirmed, in `redeem-save-mug`:**

1. Resolve the order and check the email, as in 4.1.
2. Find the line where `_tile_id === tileId && _image_url`.
   - This matches `_tile_id` **only**, not the Masterpiece `_image_id` fallback. Legacy Masterpiece tiles therefore show in the picker but fail to save with `invalid_tile`.
   - It does not check that the order has a mug line.
3. Run this mutation:
   ```graphql
   mutation($metafields: [MetafieldsSetInput!]!) {
     metafieldsSet(metafields: $metafields) { userErrors { field message } }
   }
   ```
   with variables:
   ```json
   { "metafields": [{
       "ownerId": "gid://shopify/Order/<id>",
       "namespace": "custom",
       "key": "mug_choice",
       "type": "json",
       "value": "{\"tile_id\":\"<tileId>\",\"image_url\":\"<_image_url of that line>\",\"source\":\"redeem\",\"updated_at\":\"<new Date().toISOString()>\"}"
   }] }
   ```
   The value is `JSON.stringify` with the keys in exactly this order: `tile_id, image_url, source, updated_at`. Any `userErrors` → `{ok:false, debug:{reason:"save_failed", userErrors}}`.
4. Then run:
   ```graphql
   mutation($id: ID!, $tags: [String!]!) {
     tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
   }
   ```
   with `{ id: <order gid>, tags: ["mug:ready"] }`. Tag errors are **only logged**; the call still returns ok.
5. Return `{ ok: true, tileId }`.

**What marks a mug as printed or locked: nothing on the live site.**

- The live code never checks or sets any lock: no tag, metafield, fulfilment status or job state.
- `mug:ready` means "a photo was chosen", not "locked".
- The only real signals are outside redeem:
  - `mug_fulfillment_jobs.state` and `gelato_order_id` in `kztxlpfrullqzphkvkiv` (2.6)
  - the Shopify fulfilment the pipeline creates on the mug line (`shopify_fulfillment_id`; the line's `unfulfilledQuantity` then becomes 0)
- The data shows customers re-choosing after printing had started (2.6).

### 4.6 File naming

- **Single download** (`redeem-download`):
  - Filename: `magic-portrait-{theme}-{n}.{ext}`.
  - `theme = (_theme || "portrait").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()`, so "Bathroom Bliss" becomes `bathroom-bliss`.
  - `n` is the 1-based position of that line among the lines that have `_image_url` **and** `lineTileId` (`_tile_id ?? (_masterpiece==="true" ? _image_id : undefined)`). In practice this equals the portrait's index in the `portraits` array + 1. If the same tile id appears twice, the last one wins.
  - `ext` comes from the upstream `Content-Type`: contains `jpeg`/`jpg` → `jpg`, `png` → `png`, `webp` → `webp`, `tiff` → `tiff`, anything else → `jpg`.
  - Response headers: `Content-Type: <upstream>`, `Content-Disposition: attachment; filename="<filename>"`, `Cache-Control: no-store`.
- **Zip** (`redeem-download-all`):
  - Filename: `magic-portraits-{safeName}.zip`, where `safeName = (order.name || "order").replace(/[^a-z0-9#-]+/gi, "-")`. **The `#` is kept**, so the result is `magic-portraits-#1001.zip`. This confirms `magic-portraits-{orderName}.zip`.
  - Entries are named `magic-portrait-{theme}-{i}.{ext}`, with `theme` and `ext` as above.
  - `i` counts only images that downloaded successfully. Failed fetches are skipped silently, so numbering can differ from the single download.
  - Only lines with `_image_url && _tile_id` are included (no Masterpiece `_image_id` fallback).
  - Images are fetched one at a time and the whole zip is built in memory. Headers: `Content-Type: application/zip`, the Content-Disposition above, `Cache-Control: no-store`.

### 4.7 Page states, copy and events

**Page states:**

- Document title: "Redeem your free gift". H1 "Redeem your free gift". Subtext "Confirm the email on your order to pick your free mug photo and download your portraits."
- Form fields:
  - "Order number" (only without `:orderId`; its placeholder text is an example order number)
  - "Email on your order" (placeholder `you@example.com`)
  - Button "View my order", with a spinner while loading
- Lookup not ok → "We couldn't match that order number and email. Check the email on your order confirmation and try again."
- Lookup exception → "Something went wrong. Please try again."
- Loading shows skeletons: one bar and four squares.
- Loaded: "Order {orderName}".
- **Mug section** (when `mug.present`):
  - Heading: "Confirm or change your mug photo" if there is a current choice, else "Pick the photo for your free mug".
  - Text: "Tap a portrait to choose. You can change it any time before printing."
  - A 2- or 3-column grid of portraits, **deduped by `tileId`**. The selected tile gets a pink ring and a check.
  - "Save mug photo" is disabled when nothing is selected, while saving, or when the selection equals the saved choice.
  - Success toast: "Saved — we'll print this one ✨". Failure toast: "Couldn't save your mug photo. Try again."
- **Downloads section** (when `downloads.enabled`):
  - Heading "Download your portraits", text "High-resolution files included with your order."
  - Grid of portraits (**not** deduped), each with a "Download" button, plus "Download all".
  - Failure toast: "Download failed."
- **Neither section applies:** "Your order's being made — there's nothing to customize here right now."

**Events.** Every event goes through `track()`:

- It goes to GA4, PostHog and the `track-event` edge function. That function writes the main site's events table, which syncs into `analytics_events_mirror`.
- No redeem event maps to a Meta pixel event.
- `track()` auto-adds the stored UTM/click params, `session_id`, `lptemp_session_id`, `email` (once known) and `currency`.
- The `track-event` body is `{event_name, properties, session_id, magic_id, click_id, email, page_url, page_path, referrer, user_agent, device_type, country, fbp, fbc}`.
- Every route change also fires a global `page_view` event.

| event | when | properties | mirror count (since 2026-06-08) |
|---|---|---|---|
| `page_view_redeem` | mount | `page_path:"/redeem"`, `order_id_in_url`, `order_param` (raw URL/input value) | 4,018 |
| `redeem_lookup_submitted` | submit | `has_order_in_url`, `email_domain` | 2,202 |
| `redeem_lookup_succeeded` | ok | `order_id` (numeric), `order_name`, `portrait_count`, `mug_present`, `mug_already_chosen`, `downloads_enabled`; then `setTrackingEmail(email)` | 1,801 |
| `redeem_lookup_failed` | not ok / throw | `reason` (`debug.reason` or `"lookup_not_ok"` / error message / `"invoke_error"`), `had_order_in_url`, `email_domain` | 400 (397 `lookup_not_ok`, 3 `bad_body`) |
| `redeem_mug_section_viewed` | first render with mug | `order_id`, `portrait_count`, `mug_already_chosen` | 1,625 |
| `redeem_mug_tile_selected` | tap a different tile | `order_id`, `tile_id`, `previous_tile_id`, `is_change: true` (always true), `portrait_index` | 2,488 |
| `redeem_mug_save_clicked` | save | `order_id`, `tile_id`, `is_first_save` | 968 |
| `redeem_mug_saved` | save ok | `order_id`, `tile_id` | 968 |
| `redeem_mug_save_failed` | save fail | `order_id`, `tile_id`, `reason` | 1 |
| `redeem_download_clicked` | per file | `order_id`, `tile_id`, `portrait_index` | 1,378 |
| `redeem_download_completed` | blob received | `order_id`, `tile_id`, `filename`, `bytes` | 763 |
| `redeem_download_failed` | error | `order_id`, `tile_id`, `reason` | 8 |
| `redeem_download_all_clicked` | zip | `order_id`, `portrait_count` | 520 |
| `redeem_download_all_completed` | zip ok | `order_id`, `portrait_count`, `filename`, `bytes` | **16, last on 2026-07-26** |
| `redeem_download_all_failed` | zip fail | `order_id`, `reason` | **500** (498 `download_failed`) |

The vault's own event names and properties live in `analytics.md`. Should the vault also emit these legacy names so existing dashboards keep working? Section 9.

---

## 5. Source 4: Shopify Admin GraphQL (vault)

### 5.1 Connection

- `POST https://{SHOPIFY_STORE_DOMAIN}/admin/api/{vault.shopify_api_version}/graphql.json` (the version is a setting, not an env var)
- Headers: `Content-Type: application/json` and `X-Shopify-Access-Token: <token>`, server-side only.
- **Token (client credentials grant):** `POST https://{SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, form body `grant_type=client_credentials&client_id={SHOPIFY_CLIENT_ID}&client_secret={SHOPIFY_CLIENT_SECRET}` → `{ access_token, scope, expires_in }` (`expires_in` ≈ 86 400 s). The token is cached in memory per instance until 5 minutes before it expires; concurrent requests share one token request. On a GraphQL `401` the client fetches a fresh token and retries **once**. A token failure surfaces as `shopify_token_http_<status>[: <error code>]` (never the response body). If no client id/secret is set, a permanent `SHOPIFY_ADMIN_ACCESS_TOKEN` is used as is (no refresh).
- Version: `2025-07`, the same as live (setting `vault.shopify_api_version`).
- Every query below was **validated by running it** against the Shopify MCP's pinned Admin schema, which is newer than 2025-07. Each run used a placeholder email or id and returned no rows.
  - The live code's `customer { email }` **no longer exists** in that schema. The vault uses `customer { defaultEmailAddress { emailAddress } }`. That field also exists in 2025-07 (**UNVERIFIED**, high confidence).
  - The mutations were checked against the schema (arguments, input fields and payloads) but **not executed**, under the read-only rule.
- **Scopes the token needs** (all **UNVERIFIED**; the token was not inspected):
  - `read_orders`
  - `read_all_orders`, otherwise orders older than 60 days are hidden
  - `read_customers` for `order.customer`
  - `write_orders` for `metafieldsSet` and `tagsAdd` on orders. The app's name ("r_orders") suggests it may be read-only.
- Rate limits: cost-based throttling. On a `THROTTLED` error, back off and retry.

### 5.2 Orders by customer email (paged)

Variables: `{ "search": "email:\"customer@example.com\"", "first": 25, "after": null }`.

```graphql
query VaultOrdersByEmail($search: String!, $first: Int!, $after: String) {
  orders(first: $first, after: $after, query: $search, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    edges {
      cursor
      node {
        id
        legacyResourceId
        name
        createdAt
        processedAt
        cancelledAt
        test
        email
        customer { id firstName lastName defaultEmailAddress { emailAddress } }
        displayFinancialStatus
        displayFulfillmentStatus
        tags
        statusPageUrl
        mugChoice: metafield(namespace: "custom", key: "mug_choice") { value type updatedAt compareDigest }
        lineItems(first: 100) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              name
              quantity
              currentQuantity
              unfulfilledQuantity
              product { id legacyResourceId }
              variant { id legacyResourceId }
              customAttributes { key value }
              image { url altText width height }
            }
          }
        }
      }
    }
  }
}
```

- **Pagination:** loop while `pageInfo.hasNextPage`, passing `after: endCursor`.
- **More than 100 lines:** if an order's `lineItems.pageInfo.hasNextPage` is true, page that order's lines with:
  ```graphql
  query VaultOrderLineItemsPage($id: ID!, $after: String) {
    order(id: $id) {
      id
      lineItems(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id title quantity currentQuantity unfulfilledQuantity
          product { id legacyResourceId }
          variant { id legacyResourceId }
          customAttributes { key value }
          image { url altText width height }
        } }
      }
    }
  }
  ```
- **Search semantics:**
  - `email:` matches the order's email. Whether it is case-insensitive is **UNVERIFIED**.
  - It may miss orders placed under another email by the same customer account. To also catch those, look the customer up and run a second search with `customer_id:<legacyId>`, then dedupe by `id`. Whether this is needed is **UNVERIFIED**.
  - Exclude `test: true` orders. Show `cancelledAt` orders as cancelled.
- **Enum values** for the status chips:
  - `displayFinancialStatus`: `AUTHORIZED, EXPIRED, PAID, PARTIALLY_PAID, PARTIALLY_REFUNDED, PENDING, REFUNDED, VOIDED`
  - `displayFulfillmentStatus`: `FULFILLED, FULFILLMENT_NOT_REQUIRED, IN_PROGRESS, ON_HOLD, OPEN, PARTIALLY_FULFILLED, PENDING_FULFILLMENT, REQUEST_DECLINED, RESTOCKED, SCHEDULED, UNFULFILLED`
- **"Is a customer"** (`vault_members.is_customer`): at least one order with `displayFinancialStatus` in `PAID, PARTIALLY_REFUNDED, PARTIALLY_PAID` and `cancelledAt` null. The exact set is a product decision (**UNVERIFIED**).

### 5.3 Re-read one order before any write

```graphql
query VaultOrderForRedeem($id: ID!) {
  order(id: $id) {
    id
    legacyResourceId
    name
    email
    customer { id firstName lastName defaultEmailAddress { emailAddress } }
    cancelledAt
    displayFinancialStatus
    displayFulfillmentStatus
    tags
    mugChoice: metafield(namespace: "custom", key: "mug_choice") { value updatedAt compareDigest }
    lineItems(first: 100) {
      pageInfo { hasNextPage endCursor }
      edges { node { id quantity unfulfilledQuantity product { id } variant { id } customAttributes { key value } } }
    }
  }
}
```

The live resolver for an order name, which the vault needs only for links like `/orders/1001`:

```graphql
query VaultResolveOrderByName($search: String!) {
  orders(first: 1, query: $search) { edges { node { id name } } }
}
```

Variables: `{ "search": "name:#1001" }`. Always re-check ownership after resolving.

### 5.4 `metafieldsSet`: save the mug choice

```graphql
mutation VaultSetMugChoice($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id namespace key value updatedAt compareDigest }
    userErrors { field message code elementIndex }
  }
}
```

```json
{ "metafields": [{
    "ownerId": "gid://shopify/Order/<legacyResourceId>",
    "namespace": "custom",
    "key": "mug_choice",
    "type": "json",
    "value": "{\"tile_id\":\"<tileId>\",\"image_url\":\"<_image_url of the matching line>\",\"source\":\"redeem\",\"updated_at\":\"<ISO 8601 UTC>\"}",
    "compareDigest": "<mugChoice.compareDigest from 5.3, or null if no metafield yet>"
}] }
```

- Keep the value byte-compatible with live: same keys, same order, and `source: "redeem"`. The pipeline has only ever seen `source = "redeem"`, and whether it filters on that is **UNVERIFIED**.
- `compareDigest` is optional (`MetafieldsSetInput { ownerId!, namespace, key!, type, value!, compareDigest }`). The vault should send it to avoid lost updates. Live does not.

### 5.5 `tagsAdd`

```graphql
mutation VaultTagOrder($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node { id }
    userErrors { field message }
  }
}
```

Variables: `{ "id": "gid://shopify/Order/<id>", "tags": ["mug:ready"] }`. This is idempotent. Unlike live, the vault reports tag errors to its activity log.

### 5.6 Webhook: `orders/paid`

- **Topic:** `orders/paid` (GraphQL enum `ORDERS_PAID`; needs `read_orders`). It fires when an order is paid.
- **Existing subscriber:** imagegen-prod's attribution worker already consumes it (7,067 jobs since 2026-05-11). The vault needs its own subscription at `/api/webhooks/shopify/orders-paid` (`SPEC.md` §12).
- **Payload fields the vault relies on** (REST-style JSON, confirmed present in stored payloads):
  - `id` (numeric), `admin_graphql_api_id` (`gid://shopify/Order/…`), `name` (`#1001`), `order_number`
  - `email`, `contact_email`, `customer.id`, `customer.email`
  - `created_at`, `processed_at`, `financial_status`, `cancelled_at`, `test`, `tags`
  - `line_items[]`: `id`, `product_id`, `variant_id`, `title`, `quantity`, `properties[] { name, value }` (same keys as 4.2)
- **Headers:** verify `X-Shopify-Hmac-Sha256`, the base64 HMAC-SHA256 of the **raw** body, before parsing. It must match the app's client secret (`SHOPIFY_CLIENT_SECRET`, for webhooks the app registers) or the store's notification key (`SHOPIFY_WEBHOOK_SECRET`, for webhooks made in Shopify Admin › Notifications). A mismatch logs one line (topic only) and returns 401. Use `X-Shopify-Webhook-Id` for idempotency. `X-Shopify-Topic` and `X-Shopify-Shop-Domain` identify the source.
- **Creating the subscription** is not done here because it is a write. It is either done in the custom app's admin settings, or with:
  ```graphql
  mutation VaultCreateOrdersPaidWebhook($sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: ORDERS_PAID, webhookSubscription: $sub) {
      webhookSubscription { id }
      userErrors { field message }
    }
  }
  ```
  with `{ "sub": { "uri": "https://my.magicportraits.ai/api/webhooks/shopify/orders-paid", "format": "JSON" } }`. The input fields `uri`, `format`, `filter`, `includeFields`, `metafieldNamespaces`, `metafields` and `name` were confirmed. Which secret signs webhooks for this custom app is **UNVERIFIED**.

---

## 6. Redeem behaviour spec for the vault

The goal is to reproduce live exactly (section 4) and fix the issues in section 8. The vault authorizes with the **signed-in session**, not with an email in the request body.

### 6.1 Ownership

An order belongs to the signed-in email `E` when `E === order.email.toLowerCase()` or `E === order.customer.defaultEmailAddress.emailAddress.toLowerCase()`. Every redeem endpoint re-fetches the order (5.3) and re-checks this. A failure returns 404 with `{error:"not_found"}`, with no detail.

### 6.2 Parsing an order

This is a faithful port of `redeem-get-order`. Keep it exact.

```ts
const DOWNLOAD_PRODUCT_GIDS = new Set(settings['redeem.download_product_ids'].map(id => `gid://shopify/Product/${id}`));

function attrMap(attrs: { key: string; value: string }[] | null | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of attrs ?? []) m[a.key] = a.value;          // a later duplicate key wins
  return m;
}

export function parseRedeemOrder(order: AdminOrder) {
  const portraits: { tileId: string; imageUrl: string; theme: string | null; size: string | null; tileType: string | null; lineItemId: string }[] = [];
  let mugPresent = false;
  let mugLineCurrentTileId: string | null = null;
  let mugLineItemId: string | null = null;
  let downloadsEnabled = false;

  for (const ln of order.lineItems) {                       // ALL lines (paged), not just the first 50
    const a = attrMap(ln.customAttributes);
    if (ln.product?.id && DOWNLOAD_PRODUCT_GIDS.has(ln.product.id)) downloadsEnabled = true;
    if (a._addon === 'hires_download') downloadsEnabled = true;
    if (a._masterpiece === 'true') downloadsEnabled = true;  // every Masterpiece line includes the hi-res file
    if (a._free_gift === 'magic_mug') {
      mugPresent = true;
      mugLineItemId = ln.id;
      mugLineCurrentTileId =
        a._mug_portrait_tile_id && a._mug_portrait_tile_id !== 'none_selected' ? a._mug_portrait_tile_id : null;
    }
    const lineTileId = a._tile_id ?? (a._masterpiece === 'true' ? a._image_id : undefined); // '' is kept by ?? and then fails the truthy check
    if (a._image_url && lineTileId && a._free_gift !== 'magic_mug') {
      portraits.push({
        tileId: lineTileId, imageUrl: a._image_url,
        theme: a._theme ?? null, size: a._size ?? null,
        tileType: a._tile_type ?? (a._masterpiece === 'true' ? 'masterpiece' : null),
        lineItemId: ln.id,
      });
    }
  }

  let currentTileId: string | null = null;
  const mf = order.mugChoice?.value;
  if (mf) { try { const p = JSON.parse(mf); if (p?.tile_id) currentTileId = String(p.tile_id); } catch { /* ignore */ } }
  if (!currentTileId) currentTileId = mugLineCurrentTileId;

  return {
    orderName: order.name,
    orderId: String(order.legacyResourceId),
    portraits,                                   // keep duplicates; dedupe by tileId only where 6.4 says
    mug: { present: mugPresent, currentTileId, lineItemId: mugLineItemId },
    downloads: { enabled: downloadsEnabled },
  };
}
```

Notes:

- Line `quantity` is ignored, as on live: one line is one portrait.
- Photo-tile lines (`_tile_type: "photo"`, the customer's uploads) count as portraits on live, both for the mug and for downloads. Keep that.

### 6.3 Portrait id rule (used everywhere)

`lineTileId = _tile_id ?? (_masterpiece === "true" ? _image_id : undefined)`.

The vault uses this one rule in get, save, single download and zip. Live uses it only in get and single download, which causes bugs 8.4 and 8.5.

### 6.4 Mug section

- Show it when `mug.present`.
- The picker lists portraits **deduped by `tileId`**. Order of first appearance is kept; the last duplicate's data is used, the same as `new Map(...).values()` on live.
- **Save is allowed only when all of these hold:**
  1. the order is owned (6.1)
  2. `mug.present`
  3. `order.cancelledAt` is null
  4. the mug is not locked (6.6)
  5. `tileId` is one of this order's portrait tile ids (6.3)
- Then run `metafieldsSet` (5.4, with `compareDigest`) and `tagsAdd ["mug:ready"]` (5.5).
- Copy: `SPEC.md` §11 ("Saved. This is the photo we'll print."). The live copy is in 4.7.

### 6.5 Downloads

- Show them when `downloads.enabled` (4.4 rule, all three products plus `_addon` plus `_masterpiece`).
- Single-file and zip downloads both **re-check `downloads.enabled` on the server**.
- One file per portrait. Numbering is `n` = index in `portraits` + 1, the same in single files and the zip.
- File names (4.6):
  - single: `magic-portrait-{theme}-{n}.{ext}`
  - zip: `magic-portraits-{orderName with [^a-z0-9#-]+ → "-"}.zip`
- Fetch the source only if its host is in `redeem.allowed_image_hosts`.
- Serve through the vault's authenticated route, or a short-lived signed URL the vault mints for its own copy, per `SPEC.md` §11. Never return the raw `_image_url` as the download link.
- Zip: stream it rather than building it in memory, and report files that are missing.

### 6.6 Mug lock rule (vault)

The mug choice is **locked** if any of these is true:

1. `mug_fulfillment_jobs` (2.6) has a row with `shopify_order_id = order.legacyResourceId` and `shopify_line_item_id = <mug line legacy id>`, and either:
   - its `state` is in setting `redeem.mug_lock_states` (default `["draft_created","submitted","passed","printed","shipped","delivered"]`), **or**
   - its `gelato_order_id` is not null.
2. The mug line's `unfulfilledQuantity = 0`: fulfilled or removed.
3. `order.cancelledAt` is not null. Show it as cancelled rather than locked.

When locked, show "Your mug is being printed with this photo" (`SPEC.md` §11) and reject saves with 409.

Open points, all **UNVERIFIED**:

- whether `generating` and `file_ready` should also lock. The pipeline applied 7 reselections in those states.
- what `manual_approval = 'cancelled'` means

### 6.7 Status chips (`SPEC.md` §11)

| chip | when |
|---|---|
| "Free mug · choose photo" | `mug.present && !currentTileId && !locked` |
| "N downloads ready" | `downloads.enabled`, where N = `portraits.length` |
| "Mug printed" | locked by 6.6 rule 1 or 2 |
| fulfilment | `displayFulfillmentStatus` |

### 6.8 Errors (vault)

- No `debug` fields in any response, and no other person's data.
- Codes:
  - 404 when the order is not found or not owned
  - 409 when locked or not eligible
  - 422 for an invalid tile
  - 502 when the upstream image fetch fails
- Log the reason server-side only.

### 6.9 Events

Use the names in `analytics.md`. The legacy names and properties in 4.7 are for reference and parity.

### 6.10 Links

- **"Create a new portrait":** `links.start_portrait_url` = `https://magicportraits.ai/start`. The route `/start` is confirmed in `App.tsx`; `/` redirects there.
- **"Order as wall art" / "Order more":**
  - Template: `https://magicportraits.ai/order?product_id=8471707222212&magicid=999&session={lptemp_session_id}`. This is the exact string `/reveal` and `/generating` use.
  - `session` is the main site's `user_sessions` id, `lptemp_session_id` from the mirror (2.4), **not** the Imagen session id.
  - That page loads every Imagen batch in that `user_sessions` row, not just one session.
  - When no `lptemp_session_id` is known, fall back to `links.start_portrait_url`.
  - `8471707222212` is the default master product id in `cartStore.ts`.
  - Whether old `user_sessions` rows still resolve is **UNVERIFIED**.

---

## 7. Constants (seed rows for `settings`)

`type` and `section` use the values allowed by `schema.md`. "Where used" means the live site unless marked "vault".

| key | value | type | section | where used |
|---|---|---|---|---|
| `redeem.mug_variant_id` | `46177764769988` | shopify_id | redeem | live checkout mug line (`cartStore.ts`, as `gid://shopify/ProductVariant/46177764769988`). Vault: secondary mug-line check and display |
| `redeem.mug_product_id` | `8600824643780` | shopify_id | redeem | product on every mug line in recent orders ("Magic Mug with Photo") |
| `redeem.mug_gift_attr_key` | `_free_gift` | text | redeem | mug detection (4.3) |
| `redeem.mug_gift_attr_value` | `magic_mug` | text | redeem | mug detection |
| `redeem.mug_line_tile_attr_key` | `_mug_portrait_tile_id` | text | redeem | fallback current choice |
| `redeem.mug_none_selected_value` | `none_selected` | text | redeem | "no choice" sentinel |
| `redeem.mug_metafield_namespace` | `custom` | text | redeem | `metafieldsSet` and the read |
| `redeem.mug_metafield_key` | `mug_choice` | text | redeem | same |
| `redeem.mug_metafield_type` | `json` | text | redeem | same |
| `redeem.mug_choice_source` | `redeem` | text | redeem | `source` inside the metafield JSON |
| `redeem.mug_ready_tag` | `mug:ready` | text | redeem | `tagsAdd` after save |
| `redeem.mug_lock_states` | `["draft_created","submitted","passed","printed","shipped","delivered"]` | list | redeem | vault lock rule (6.6). Proposed, **UNVERIFIED** cut-off |
| `redeem.mug_gelato_product_uid` | `mug_product_msz_11-oz_mmat_ceramic-black_cl_4-0` | text | redeem | mug line `_gelato_product_uid` (reference only) |
| `redeem.mug_print_file_url_template` | `https://kztxlpfrullqzphkvkiv.supabase.co/storage/v1/object/public/mug-prints/mugs/{tile_id_lower}.pdf` | text | redeem | `_print_file_url` at checkout (reference only) |
| `redeem.mug_display_value` | `{"USD":49,"CAD":70,"GBP":45,"EUR":50}` | json | redeem | advertised mug value, display only (`mugValue.ts`) |
| `redeem.download_product_ids` | `["8596065026244","8629738045636","8801988214980"]` | list | redeem | downloads-enabled rule (4.4) |
| `redeem.hires_addon_attr_key` | `_addon` | text | redeem | downloads-enabled rule |
| `redeem.hires_addon_attr_value` | `hires_download` | text | redeem | same |
| `redeem.hires_variant_id` | `46302430429380` | shopify_id | redeem | current hi-res line (product 8629738045636), reference |
| `redeem.masterpiece_attr_key` | `_masterpiece` | text | redeem | downloads-enabled rule and portrait id fallback |
| `redeem.masterpiece_attr_value` | `true` | text | redeem | same |
| `redeem.masterpiece_digital_variant_id` | `46936933630148` | shopify_id | redeem | "Masterpiece Digital File" (product 8801988214980), reference |
| `redeem.tile_id_attr_key` | `_tile_id` | text | redeem | portrait id (6.3) |
| `redeem.masterpiece_image_id_attr_key` | `_image_id` | text | redeem | portrait id fallback on Masterpiece lines |
| `redeem.image_url_attr_key` | `_image_url` | text | redeem | portrait image |
| `redeem.theme_attr_key` | `_theme` | text | redeem | file names; holds Imagen `themes.name` |
| `redeem.file_name_template` | `magic-portrait-{theme}-{n}.{ext}` | text | redeem | single files and zip entries |
| `redeem.file_default_theme` | `portrait` | text | redeem | when `_theme` is empty |
| `redeem.zip_name_template` | `magic-portraits-{orderName}.zip` | text | redeem | `{orderName}` sanitized with `/[^a-z0-9#-]+/gi → "-"` |
| `redeem.allowed_image_hosts` | `["ngyunrirwrjudbgaijek.supabase.co","afqxjwizbmpzmvzzkzdb.supabase.co","storyboards-magic-portraits.s3.us-east-2.amazonaws.com"]` | list | redeem | vault download fetch allow-list (observed hosts; completeness **UNVERIFIED**) |
| `redeem.order_line_items_page_size` | `100` | number | redeem | vault (live uses 50 with no paging) |
| `vault.shopify_api_version` | `2025-07` | text | vault | Admin GraphQL version (live uses the same) |
| `vault.order_search_page_size` | `25` | number | vault | `orders(first:)` in 5.2 |
| `vault.imagen_public_image_base_url` | `https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/` | text | vault | `image_url = base + images.image_path` |
| `vault.imagen_main_app_id` | `00000000-0000-0000-0000-000000000002` | text | vault | reference: the main-site app id in imagegen-prod |
| `vault.mirror_session_property` | `imagegen_session_id` | text | vault | the mirror → Imagen link |
| `vault.mirror_lptemp_property` | `lptemp_session_id` | text | vault | deep-link id (6.10) |
| `vault.mirror_session_since` | `2026-05-12` | date | vault | shown as "portraits from before this date may be missing" |
| `vault.include_recommendation_children` | `true` | boolean | vault | add `session_recommendations` children (3.6) |
| `vault.mirror_expand_by_browser_session` | `false` | boolean | vault | optional 2.5 expansion |
| `links.start_portrait_url` | `https://magicportraits.ai/start` | text | vault | "Create a new portrait" |
| `links.order_session_url_template` | `https://magicportraits.ai/order?product_id=8471707222212&magicid=999&session={lptemp_session_id}` | text | vault | "Order as wall art" / "Order more" |

---

## 8. Known issues in the live redeem (the vault must not repeat them)

1. **Debug field leaks the order email.**
   - On an email mismatch, `redeem-get-order` returns `{ok:false, debug:{orderEmail, customerEmail, emailReceived, orderInput, lookupMethod, resolvedId, …}}` to the browser.
   - Anyone with an order number gets the customer's email and Shopify customer email, and order numbers are sequential.
   - Every function's `debug` also exposes env var names and presence (`tokenEnvName`, `tokenPresent`, …), and `message: String(e)` on exceptions.
   - The page then sends `debug.reason` to analytics.
2. **Order number plus email is the only credential.**
   - The endpoints are public (`verify_jwt=false`), have CORS `*`, and have no rate limit or captcha.
   - `page_view_redeem` sends the raw order param to analytics.
3. **No eligibility check in `redeem-download`.**
   - It checks ownership but never checks `downloads.enabled`.
   - Any order with portrait lines (prints only, no hi-res purchase) can download every file for free by calling the function directly.
   - It also fetches whatever URL is in `_image_url`. That attribute is set client-side in the cart, so the server will fetch any URL (an open proxy / SSRF risk).
4. **No guards in `redeem-save-mug`.**
   - No check that the order has a mug line (any order can get the `mug:ready` tag and metafield).
   - No lock or printed check: 9 reselections were logged after the job was submitted to Gelato.
   - No cancelled or refunded check, and no concurrency check (`compareDigest`).
   - `tagsAdd` errors are ignored (it returns ok).
   - It matches `_tile_id` only, so legacy Masterpiece tiles (with `_image_id` only) show in the picker but fail with `invalid_tile`.
5. **"Download all" is broken for current products.**
   - `redeem-download-all` enables downloads only for the legacy product `8596065026244`.
   - Orders with the current hi-res product `8629738045636` (`_addon=hires_download`) or Masterpiece get `no_downloads`.
   - The client then shows "Download failed."
   - In the mirror: 520 clicks, 500 failures, and 16 successes, the last on 2026-07-26.
   - It also skips Masterpiece `_image_id` lines, numbers files differently from single downloads, builds the zip in memory and fetches one file at a time.
6. **Public, non-expiring image URLs.**
   - Imagen bucket `images` is public. `_image_url` and `mug_choice.image_url` are permanent public links.
   - Photo-tile uploads (`tiles-uploads`) and mug print PDFs (`mug-prints`) are public too.
   - Replacement lines instead carry **signed URLs that expire**, so their downloads break later.
7. **Only the first 50 line items** are read. Larger orders lose portraits or the mug line.
8. **UI details:**
   - The download grid is not deduped by `tileId`, so duplicate React keys occur.
   - `redeem_mug_tile_selected` always sends `is_change: true`.
   - `redeem_lookup_failed.reason` is `lookup_not_ok` for almost every failure, because most branches set no `debug.reason`.
9. **Failures are HTTP 200** in `redeem-get-order` and `redeem-save-mug` (`{ok:false}`). Only some download failures use 502 or 500.
10. **No shared code.** The helpers are copied into four functions and have already drifted (items 4 and 5).
11. **Deprecated field.** `customer { email }` is removed in newer Admin API versions. The live code pins `2025-07`.
12. **Data exposure next to redeem** (outside the vault's scope; report to the owner):
    - `analytics_events_mirror` has an `"anon read"` policy with `USING (true)`.
    - imagegen-prod `images` and `sessions` are readable by anon with `true`.
    - Anyone holding those projects' anon keys can list emails, sessions and every image path.
    - Also, `shopify-dailyreport.paypal_subscription_ledger`, `daily_discounts` and `imagegen-prod.dashboard_users` have RLS disabled (from the Supabase advisor).

---

## 9. Open questions and UNVERIFIED items

1. **r_orders token scopes.** Does it have `write_orders`, needed for `metafieldsSet` and `tagsAdd`? The name suggests read-only. Does it have `read_all_orders` (orders older than 60 days) and `read_customers`? Also unknown: the store's `*.myshopify.com` domain, and which secret signs its webhooks.
2. **Deployed edge functions = repo HEAD.** Reading project `afqxjwizbmpzmvzzkzdb` was not permitted. The event data supports the code as read.
3. **Mug lock cut-off.** Where does the mug pipeline run? (No edge functions were found in `kztxlpfrullqzphkvkiv`.) After which state does it stop applying a new `custom.mug_choice`? Does it filter on `source`? What do `manual_approval` values mean for the customer? The proposed default is in 6.6.
4. **`lower(email)` expression index on the mirror** (2.4). It needs the project owner's approval; it was not created. Without it, 876 emails (2.3%) stored only in mixed case are missed unless the typed spelling matches.
5. ~~Read-only database role.~~ **Decided:** the read-only `vault_reader` role (created 3 Nov); no service-role keys.
6. **Include recommendation child sessions?** They are not in the mirror. The default here is yes.
7. **Optional browser-session expansion** (2.5). Its size is unknown, and it carries a shared-device risk.
8. **Shopify `email:` search.** Is it case-insensitive? Should it be combined with a `customer_id:` search?
9. **Thumbnails.** Is Supabase image transformation (`/storage/v1/render/image/public/images/...?width=`) enabled on imagegen-prod? It was not checked; without it, use full images or the vault's own resizing.
10. **`Customer.defaultEmailAddress` in `2025-07`.** Confirmed in the newer pinned schema only.
11. **Deep link.** Does `/order?...&session={lptemp_session_id}` still work for old sessions? It depends on `get-user-session-by-id` and the main site's `user_sessions` table on `afqxjwizbmpzmvzzkzdb`, which was not read.
12. **Image hosts.** Is `redeem.allowed_image_hosts` complete? It is based on the last 300 orders.
13. ~~Legacy event names.~~ **Decided:** keep the live `redeem_*` names (`analytics.md`, Orders, downloads & mugs).
14. **"Is a customer" status set** (5.2). This is a product decision.
15. **PostgREST variants** in 2.4 and 3.6 were not executed. The SQL versions were run (EXPLAIN ANALYZE) on live data.
16. ~~Revenue events and refunds.~~ **Decided:** cancelled and fully refunded orders don't count (§3.6).

---

## 10. Source 5: Klaviyo (events and profiles, write-only)

Read from the live site's code on 3 Nov 2026 (`src/lib/analytics/*`, `supabase/functions/track-event`). My Magic Portraits follows the same conventions so its events land on the same Klaviyo profiles. What we send and why is in `SPEC.md` §14a.

**How the live site uses Klaviyo today**
- **Server side:** edge function `track-event`.
  - Posts to `https://a.klaviyo.com/api/events/` with `Authorization: Klaviyo-API-Key <KLAVIYO_PRIVATE_KEY>` and `revision: 2024-02-15`.
  - Sends only an allow-list: `page_view`, `image_uploaded`, `add_to_cart`, `checkout_started`, `order_placed`, `magic_shopify`, `funnel_portrait_generated`.
  - The metric name is the internal snake_case event name, and the profile is identified by `email`, or `anonymous_id` = session id.
  - It forwards all event properties, including the email, and makes a random `$event_id` (so retries can double-count).
- **Client side:**
  - The onsite `_learnq` queue, and Client Profiles / Subscriptions APIs with public company id `LD5CnH`, revision `2024-10-15`.
  - Custom profile properties use exact, case-sensitive keys with spaces: `Pets Name`, `Source`.

**What My Magic Portraits does differently**
- Server-side only (no client snippet), through the `outbound_events` outbox (`schema.md`).
- Sends only the events in `klaviyo.events`, with a fixed property list per event (`SPEC.md` §14a), never "all properties".
- Sends our activity id as `unique_id`, so a retried event is deduplicated by Klaviyo.
- Never sends message text, recipient names or emails, or card images.

**Create an event**
```http
POST https://a.klaviyo.com/api/events/
Authorization: Klaviyo-API-Key {KLAVIYO_PRIVATE_KEY}
revision: {klaviyo.api_revision}
Content-Type: application/json

{ "data": { "type": "event", "attributes": {
    "metric":  { "data": { "type": "metric",  "attributes": { "name": "card_created" } } },
    "profile": { "data": { "type": "profile", "attributes": { "email": "customer@example.com" } } },
    "properties": { "card_id": "C-8f3k2q", "theme_name": "Christmas", "category": "Holidays",
                    "delivery": "email", "scheduled": false, "cards_created_total": 1, "first_card": true },
    "time": "2026-11-03T09:14:00Z",
    "unique_id": "<outbound_events.id>"
} } }
```
A `202` is success. On `429`, honour `Retry-After`. On `5xx`, retry with backoff. On `4xx` other than 429, mark the row `failed` and show it in Settings › Data sources.

**Set profile properties**
Use `POST https://a.klaviyo.com/api/profile-import/` (create or update by email) with the same headers:
```json
{ "data": { "type": "profile", "attributes": {
    "email": "customer@example.com",
    "properties": { "My MP Has Free Gift": true, "My MP Cards Created": 1,
                    "My MP Last Card At": "2026-11-03T09:14:00Z", "My MP Portraits": 18,
                    "My MP Mug Photo Needed": false } } } }
```
Only these five properties, only for people who already have a Shopify order or signed in. Never for recipients.

**Deletion**
On a data-deletion request, call `POST https://a.klaviyo.com/api/data-privacy-deletion-jobs/` for the email (`klaviyo.delete_on_request`).

**Key scopes** (create a dedicated private key for this app, not the live site's):
- `events:write`, `profiles:write`, `data-privacy:write`
- `metrics:read`, for the connection test in Part 0 and Settings › Data sources.

**Checked in the Klaviyo account (connector, read only, 3 Nov 2026)**
- **Account:** `LD5CnH`, "Storyboards Inc", time zone US/Pacific.
  - Default sender: `hi@storyboards.io` ("Storyboards").
  - The only sending domain is `sending.storyboards.io` (marketing, active). **There is no `magicportraits.ai` sending domain in Klaviyo yet**, so flows can't send as `@magicportraits.ai` until one is added (SPEC Q10).
- **Live order events:**
  - Shopify integration `Placed Order` (metric `Wjhmq4`): about 1,470 in Aug, 1,050 in Sep, 1,070 in Oct.
  - The site's own `order_placed` (`TuxDHG`): 1,098 / 745 / 784.
- **Dead order events:** API `Placed Order` (`Rt6UrM`) and API `Purchase` (`LCxaFy`) have had **zero events since August**.
  - The two live flows "Purchase Thank You - checkout." (`VN2KbH`) and "Purchase Thank You" (`SPQs3Q`) trigger on them, so they send nothing.
  - In the last 90 days, the only flows that sent email were the two "MP Welcome - Masterpiece" flows, "Magic Welcome Flow" and "Magic Cart Abandonment".
  - **So no post-purchase email currently goes out from Klaviyo**, and the free gift flow won't double up with one.
- **"Gift Card Flow - Nov 20, 2024"** (`YdcVRd`, live) triggers on `Credit Gift Received`, which is VIP store credit. This is unrelated, and it's one more reason not to call our cards "gift cards".
- **"VIP portal email login"** (`TrvVqS`, live) already sends a sign-in email from a Klaviyo flow, so a sign-in link in a Klaviyo email has a precedent here.
- **Flow naming:** recent flows use `MP <Name> (YYYY-MM)`, e.g. "MP Welcome - Masterpiece v2 (2026-10)". Name ours the same way.
- None of our event names exist yet as metrics, so there are no collisions. A metric appears in Klaviyo when its first event arrives, so the flows can only be built after the app has sent one test event of each.

**Still UNVERIFIED**
- The revision date to pin: the live site uses `2024-02-15` (server) and `2024-10-15` (client). Test the newest stable revision in Part 0 and save it in `klaviyo.api_revision`.


## 11. Source 6: the shop's Shopify reads and writes (`docs/shop.md`)

All behind `lib/shop/sources/` (fixtures + live), separate from `lib/sources/`, so /redeem is unaffected.

**Admin GraphQL** (the r_orders app, same token as §5): the Store collection (`collection(id) { products(sortKey: COLLECTION_DEFAULT) { … metafield(namespace: "mmp_shop", key: …) variants { metafields(namespace: "mmp_shop") } } }`), `metafieldDefinitions(ownerType: PRODUCT | PRODUCTVARIANT, namespace: "mmp_shop")`, `codeDiscountNodeByCode(code)`, `customers(query: "email:…") { tags }`. Writes (CLAUDE.md allowed write 5): `metafieldsSet` / `metafieldsDelete` on `mmp_shop.page`, `mmp_shop.occasions`, `mmp_shop.template`; `metafieldDefinitionUpdate` (occasion choices); `metafieldDefinitionCreate` (missing `mmp_shop` definitions). Needs `read_products`, `read_discounts`, `read_customers`, `write_products`. The read queries were run against the live store on 10 Nov 2026.

**Storefront GraphQL** (allowed write 4), `https://{SHOPIFY_STORE_DOMAIN}/api/{shop.storefront_api_version}/graphql.json` with `SHOPIFY_STOREFRONT_TOKEN` (public, header `X-Shopify-Storefront-Access-Token`) or `SHOPIFY_STOREFRONT_PRIVATE_TOKEN` (header `Shopify-Storefront-Private-Token`), server only: `cartCreate` (lines with attributes, `buyerIdentity.email`, `discountCodes`, cart attributes), `cart(id)`, `cartLinesAdd`, `cartLinesUpdate`, `cartLinesRemove`, `cartDiscountCodesUpdate`, `cartAttributesUpdate`. Every shop product must be published to the token's sales channel. Our cart is kept in step by `_vault_line_id`; prices on the cart page are the Storefront cart's `cost` figures.

**orders/paid** (§5.6, the existing webhook): after the gift-offer handling, `note_attributes` `_source` = `shop` and `_vault_cart_id` mark that cart paid (`shop_order_paid`). A failure there never changes the webhook's reply.

**Fulfilment's fresh links:** `POST /api/shop/fulfilment/image` with `{ "line_id": "<_vault_line_id>" }` and header `x-shop-signature: hex(HMAC-SHA256(SHOP_FULFILMENT_SECRET, line_id))` returns `{ image_url, preview_url, valid_days }` (signed links for new uploads and previews; public pictures as they are). 404 when `SHOP_FULFILMENT_SECRET` isn't set.

**Events mirror** (read-only, `vault_reader`): past portrait uploads (`shop.mirror_upload_event` / `shop.mirror_upload_property`, default `funnel_portrait_generated` / `original_image_url`) and dropped photo tiles (`shop.mirror_tile_event`, default `tile_dropped` with `tile_type` = `photo`), by `email = any($1)` as in §2.4.
