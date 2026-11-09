# App database (new Supabase project "magic-vault")

This covers only the app's **own** tables (internal code name "vault") in the new Supabase project. Shopify, Imagen and the events mirror are read live and never copied (see `docs/data.md`).

Write these as SQL migrations in `supabase/migrations/`. Defaults and checks below are requirements; index names are up to you.

## Access model

- **RLS on every table, deny by default.** The browser never queries tables directly. All reads and writes go through server code (route handlers / server actions) using the service role, behind one data-access layer that checks who the caller is.
- `public.is_super_user(email text) returns boolean` reads `super_users`. Server code calls it for every `/settings` request and every admin API.
- Emails are always stored lower-cased and trimmed. Add a `check (email = lower(email))` on every email column.
- Every table has `created_at timestamptz not null default now()`. Mutable tables also have `updated_at` with a trigger.

## Tables

### settings
Master data and variables, edited in Settings. Secrets never go here.

| column | type | notes |
|---|---|---|
| key | text pk | dotted, e.g. `cards.message_max_chars` |
| value | jsonb not null | |
| type | text not null | `text` · `number` · `boolean` · `choice` · `list` · `json` · `shopify_id` · `date` |
| section | text not null | `cards` · `gift` · `redeem` · `auth` · `vault` · `themes` · `brand` · `email` · `links` · `tracking` · `klaviyo` |
| label | text not null | shown in Settings |
| description | text | |
| options | jsonb | allowed values for `choice` |
| updated_by | text | email |
| updated_at | timestamptz | |

### settings_history
`id bigserial pk`, `key text`, `old_value jsonb`, `new_value jsonb`, `changed_by text`, `changed_at timestamptz default now()`. Written by a trigger on `settings`.

### super_users
`email text pk`, `added_by text`, `created_at`.
Seed: `gavin@storyboards.io`, `gideon@storyboards.io` (added_by `seed`).

### vault_members
One row per person we know: someone who signed in, got a free gift offer, or was looked up by a super user.

| column | type | notes |
|---|---|---|
| id | uuid unique not null default gen_random_uuid() | opaque id used in admin URLs (`/settings/customers/[id]`) |
| email | text pk | |
| created_via | text not null | `sign_in` · `gift_offer` · `admin_lookup` |
| first_signed_in_at | timestamptz null | null until they first sign in |
| display_name | text | from Shopify customer, else null |
| shopify_customer_id | text | |
| is_customer | boolean not null default false | has at least one paid order |
| first_order_at | timestamptz | |
| imagen_sessions | jsonb not null default '[]' | cached lookup: `[{imagen_session_id, lptemp_session_id}]` (the lptemp id builds the "Order as wall art" link) |
| portrait_count | int | cached |
| lookup_refreshed_at | timestamptz | the cache is 10 minutes |
| first_seen_at, last_seen_at | timestamptz | |

### theme_categories
`id uuid pk`, `slug text unique`, `name text`, `sort_order int`, `reminder_enabled boolean default false` (seasonal reminder email, `SPEC.md` §12).
Seed: `holidays` Holidays 1, `new-year` New Year 2, `birthdays` Birthdays 3, `general` General 4.

### themes
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| slug | text unique | `christmas` |
| name | text | `Christmas` |
| category_id | uuid fk → theme_categories | |
| available_from, available_to | date null | null = always; the year is ignored for repeating holidays when `repeats_yearly` |
| repeats_yearly | boolean default true | |
| sort_order | int | |
| status | text | `draft` · `live` · `archived` |

### theme_versions
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| theme_id | uuid fk | |
| slug | text | unique per theme, e.g. `snowfall`; the full slug used in events is `christmas-snowfall` |
| name | text | `Snowfall` |
| status | text | `draft` · `live` · `archived` |
| is_new | boolean default false | "New" badge |
| sort_order | int | |
| background_path | text not null | Storage `theme-assets/…` |
| overlay_path | text null | PNG with alpha |
| thumbnail_path | text | made on publish |
| layout | jsonb not null | see Layout JSON below |
| message_ideas | text[] default '{}' | may use `{pet}` (pet name from the Imagen session) and `{to}`; ideas with `{pet}` are skipped when the pet name isn't known. The first usable idea pre-fills the first card (SPEC §8.0). |
| message_max_chars | int null | null → `cards.message_max_chars` |
| published_at | timestamptz | |

### cards
Kept forever. Rows are deleted only by a data-deletion request.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| public_id | text unique | `C-` + 6 lower-case base36, shown to staff |
| share_slug | text unique | 16+ random url-safe chars |
| sender_email | text not null | |
| from_name | text not null | |
| to_name | text not null | |
| recipient_email | text null | |
| message | text not null | |
| theme_id, version_id | uuid fk | |
| imagen_session_id, imagen_image_id | text | the source portrait |
| portrait_path | text | cached copy in Storage `portraits/…` |
| crop | jsonb | `{zoom, x, y}` |
| jpeg_path | text | Storage `cards/…` |
| delivery | text | `email` · `self` |
| scheduled_for | timestamptz null | |
| status | text | `rendering` · `ready` · `scheduled` · `emailed` · `opened` · `failed` · `cancelled` |
| share_hidden | boolean default false | set by super users |
| render_ms | int | |
| entry_point | text | `order_email` · `thankyou_popup` · `reminder_email` · `site_menu` · `home` · `my_cards` · `my_portraits` · `order_page` · `make_another` · `use_again` (same list as the `entry_point` property in `docs/analytics.md`) |
| gift_offer_id | uuid null fk → gift_offers | |
| reused_from | uuid null fk → cards | "Use again" |

Indexes: `(sender_email, created_at desc)`, `(status, scheduled_for)`, `(created_at desc)`, plus trigram on `to_name`, `from_name`, `sender_email` for the admin search.

### card_deliveries
`id uuid pk`, `card_id fk`, `type` (`email` · `resend` · `download` · `link_copy` · `share`), `channel` (`whatsapp` · `messages` · `facebook` · `instagram` · `native` · null), `provider_message_id`, `status` (`queued` · `sent` · `delivered` · `opened` · `bounced` · `failed` · `done`), `error`, `opened_at`, `created_at`, `updated_at`.

### gift_offers
One per Shopify order: the free gift offer email and the pop-up link.
`id uuid pk`, `shopify_order_id text unique`, `order_name`, `email`, `paid_at timestamptz`, `send_after timestamptz`, `sent_at`, `email_opened_at`, `first_used_at`, `status` (`pending` · `sent` · `skipped` · `failed`), `skip_reason`, `token_hash text unique` (hash of the opaque `/g/[token]` value; the token itself is never stored), `token_expires_at timestamptz`.

### activity_log
Append-only. Kept forever, except for anonymisation on a deletion request.

| column | type | notes |
|---|---|---|
| id | bigserial pk | |
| occurred_at | timestamptz not null default now() | |
| email | text | the person the event is about (null for anonymous recipients) |
| event | text not null | same name as the PostHog event |
| source | text not null | `vault` · `shopify` · `imagen` · `email` |
| ref_type | text | `card` · `order` · `session` · `image` · `setting` · `theme` · `version` |
| ref_id | text | |
| props | jsonb not null default '{}' | **never** message text or recipient details |
| actor | text not null | `customer` · `recipient` · `system` · `super_user:<email>` |

Indexes: `(email, occurred_at desc)`, `(event, occurred_at desc)`, `(occurred_at desc)`, `(ref_type, ref_id)`. Block `update` and `delete` for all roles except the deletion function.

### email_suppressions
`email text`, `scope` (`card_emails`: the recipients' "Don't email me cards" · `all`: bounce, complaint or deletion), `reason` (`unsubscribe` · `bounce` · `complaint` · `deletion`), `created_at`. Primary key `(email, scope)`.

### outbound_events
The outbox for Klaviyo (and any later destination). A row is written in the same transaction as the action, sent at once, and retried by `/api/cron/flush-outbox` every minute with backoff.

| column | type | notes |
|---|---|---|
| id | uuid pk | also sent as Klaviyo's `unique_id` |
| destination | text not null | `klaviyo` |
| kind | text not null | `event` · `profile` |
| dedupe_key | text unique | e.g. `free_gift_unlocked:<order_id>`, `mug_photo_needed:<order_id>`, so each fires once |
| email | text | the profile it's about |
| payload | jsonb not null | the exact request body; **never** message text or recipient details |
| status | text not null | `pending` · `sent` · `failed` · `skipped` (Klaviyo off) |
| attempts | int not null default 0 | gives up after 8 attempts |
| next_attempt_at, sent_at | timestamptz | |
| last_error | text | |

A data-deletion request deletes the person's rows here too, and calls Klaviyo's profile deletion request (`klaviyo.delete_on_request`, default on).

### rate_limits
`key text`, `window_start timestamptz`, `count int`, primary key `(key, window_start)`. A function `hit_rate_limit(key, window_seconds, max)` does an atomic upsert and returns whether the call is allowed. A cron job deletes windows older than a day. Keys look like `code:<email-hash>`, `code-ip:<ip-hash>`, `download:<email-hash>`, `offer-link:<ip-hash>`.

### data_requests
`id uuid pk`, `email`, `type` (`export` · `delete`), `requested_by`, `status`, `completed_at`, `notes`.

### processed_webhooks
`source` (`shopify` · `agentmail`), `webhook_id` (`X-Shopify-Webhook-Id` or `svix-id`), `topic`, `created_at`; primary key `(source, webhook_id)`. Makes webhook handlers idempotent.

### data_source_checks
`source text pk`, `ok`, `checked_at`, `last_ok_at`, `ms`, `detail jsonb` (counts and timings only), `checked_by`. Powers the status cards in Settings › Data sources.

## Storage buckets

| bucket | public | contents |
|---|---|---|
| `theme-assets` | yes (read) | backgrounds, overlays, thumbnails, sample portrait |
| `portraits` | no | cached copies of chosen Imagen portraits |
| `cards` | no | rendered JPEGs; served via short-lived signed URLs or the `/c/[slug]/image` route |

## Layout JSON (`theme_versions.layout`)

All coordinates are in pixels on the 1500 × 2100 canvas.

```json
{
  "canvas": { "w": 1500, "h": 2100 },
  "photo": { "x": 210, "y": 520, "w": 1080, "h": 1080, "shape": "rounded", "radius": 48,
             "frame": { "color": "#FFFFFF", "width": 30 }, "fit": "adapt" },
  "text": {
    "to":      { "x": 150, "y": 1660, "w": 1200, "font": "DM Serif Display", "size": 64, "color": "#3B1F0E", "align": "center", "template": "Dear {to}," },
    "message": { "x": 150, "y": 1740, "w": 1200, "h": 220, "font": "Plus Jakarta Sans", "size": 44, "lineHeight": 1.35, "color": "#3B1F0E", "align": "center", "valign": "middle", "maxLines": 4 },
    "from":    { "x": 150, "y": 1980, "w": 1200, "font": "DM Serif Display", "size": 56, "color": "#3B1F0E", "align": "center", "template": "With love, {from}" }
  }
}
```

`shape` is one of `rect` · `rounded` · `circle` · `arch` (a rectangle with a semicircular top of radius `w/2`, capped at `h/2` for wide boxes). The fonts are listed once in `lib/render/fonts.ts` (`FONT_DEFS`): the brand fonts DM Serif Display and Plus Jakarta Sans, plus 12 Google Fonts (9 Nov): Playfair Display, Lora, Cormorant Garamond (serif); Montserrat, Poppins, Nunito (sans); Great Vibes, Dancing Script, Pacifico, Caveat, Lobster, Amatic SC (script and handwriting). All SIL Open Font License. Their files (latin subset, one `.woff2` per weight, with licences) are in `public/fonts/card/`, fetched by `scripts/fetch-card-fonts.mjs`; the server renderer registers them and the browser preview loads the same files, so they match. A zone's `weight` snaps to one the font has (default per font). To add a font: add it to `FONT_DEFS` and run the script. Text is shrunk down to `minSize` (default 70% of `size`) before wrapping, and never overflows its box.

- `y` is the **top** of each text box. `to` and `from` are single lines (box height ≈ `size × 1.25`) that shrink to fit `w`.
- `message.valign` is `top` (default) or `middle`; `middle` centres the wrapped lines vertically in the `h` box.
- `photo.frame` is drawn **inside** the photo box, over the portrait's edge; `width: 0` means no frame (the background art supplies it).
- **`photo.fit`** (4 Nov review): `"adapt"` or `"cover"`. With `"adapt"`, `photo` (x, y, w, h) is the **maximum photo area**: the portrait is fitted inside it at its own aspect ratio, centred, with no crop, and the frame and shape follow the fitted box (`rect`/`rounded` shrink to it, `arch` keeps its semicircular top across the fitted width, `circle` stays a cover-cropped circle). With `"cover"`, the box stays as designed and the portrait is cover-cropped into it (the old behaviour). When `fit` is missing it is `"cover"` if `frame.width` is 0 (the art draws the frame, so the window must line up with it) and `"adapt"` otherwise. The fitting lives in `lib/render/layout.ts` (`fittedPhoto`), shared by the preview and the server render; both read the portrait's size from the loaded image. The template editor labels the zone "Maximum photo area" and previews and test-renders with a square or a 3:4 sample.
- Layer order: background, frame, portrait (clipped to `shape`), text, optional footer line (`cards.footer_text`, empty by default since 9 Nov), then the **overlay on top of everything** (its transparent areas show what is below).

## Seed data

- Settings: every key in the table in `docs/data.md` § Constants, plus:

| key | value |
|---|---|
| `cards.enabled` | false |
| `cards.who_can_create` | customers_with_order (or everyone_with_portrait) |
| `cards.per_customer` | unlimited (or a number per month) |
| `cards.price` | free |
| `cards.message_max_chars` | 220 |
| `cards.size_px` | `{"w":1500,"h":2100}` |
| `cards.jpeg_quality` | 90 |
| `cards.email_sender_name` | "{from} via Magic Portraits" |
| `cards.footer_text` | "Made with Magic Portraits AI" |
| `gift.offer_email_enabled` | false |
| `gift.popup_enabled` | false |
| `gift.popup_window_minutes` | 60 (the pop-up link only works this long after payment) |
| `gift.reminder_email_enabled` | false |
| `gift.reminder_days_before` | 14 |
| `gift.reminder_skip_if_card_within_days` | 60 |
| `gift.unlock_rule` | any_paid_order (or qualifying_products) |
| `gift.qualifying_product_ids` | [] |
| `gift.link_valid_days` | 30 |
| `gift.offer_email_delay_minutes` | 0 |
| `cards.first_card_mode` | one_screen (or full_builder) |
| `cards.first_card_default_version` | `with-love-love` (full `theme-version` slug; used when nothing is in season) |
| `redeem.mug_reminder_after_days` | 2 |
| `gift.popup_email_later_enabled` | false (turn on once the Klaviyo offer flow exists) |
| `klaviyo.enabled` | false (on once the key is set and the flows exist) |
| `klaviyo.api_revision` | "2024-10-15" (the live site's client revision; update after testing) |
| `klaviyo.events` | `["free_gift_unlocked","free_gift_link_requested","vault_signed_in","card_created","card_email_sent","card_recipient_email_opened","gift_reminder_due","mug_photo_needed","redeem_mug_saved"]` |
| `klaviyo.include_signin_link` | true (SPEC Q11) |
| `klaviyo.profile_properties` | true |
| `klaviyo.delete_on_request` | true |
| `redeem.downloads_enabled` | true (kill switch) |
| `redeem.mug_offer_active` | true (off = the mug choice is read-only) |
| `redeem.mug_lock_mode` | print_status (or days_after_order) |
| `redeem.mug_lock_days` | 14 (used with days_after_order) |
| `auth.code_valid_minutes` | 10 (must match the Supabase Auth OTP expiry; Settings shows it read-only with that note) |
| `vault.first_order_offer` | "" |
| `vault.lookup_cache_minutes` | 10 |
| `themes.in_season_days_before` | 45 |
| `brand.support_email` | "" |
| `email.from_cards` | "{from} via Magic Portraits <cards@magicportraitspartners.com>" (the address must be the AgentMail inbox) |
| `email.reply_to` | "support@magicportraits.ai" (proposed) |
| `links.main_site_url` | "https://magicportraits.ai" |
| `links.start_portrait_url` | (from `docs/data.md`) |
| `links.menu_thumbnails` | [] (six image URLs for the menu's product list; placeholders until set, SPEC Q9) |

- Placeholder artwork ships with the app (`public/theme-placeholders`, referenced as `builtin:<file>`), because the live project only gets SQL. Real artwork uploaded in the template editor goes to the `theme-assets` bucket.
- The four categories, and themes Christmas, Happy Holidays, New Year, Birthday, Thank you, With love and Congratulations. Each has one version with a plain placeholder background (a generated solid colour plus a headline) and a default layout. The 10 versions in the designs (`CardPreview` variants) are the target set; real artwork comes from the designers (`ThemeSpec`).
- **Theme pack** (`assets/themes/`, manifest `themes.json`): 12 finished versions for New Year, Christmas and Birthday (2 general + 2 pet-centric each). Settings › Theme library › Import theme pack loads them into `magic-vault` as drafts; the local test stack loads them as live.
- **Two seed files:**
  - `supabase/seed.sql` (the live project, `magic-vault`): every version is **draft**, and every `cards.enabled` and `gift.*` switch is off. It is idempotent (`on conflict do nothing`), so re-running it never overwrites what a super user changed.
  - `supabase/seed.test.sql` (the local test stack only, never `magic-vault`): one **live** version per category, `cards.enabled = true`, and fixture people. The e2e tests have something to pick.
