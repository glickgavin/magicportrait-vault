import { z } from "zod";
import { DEFAULT_SCENE_PRESETS, DEFAULT_SCENE_PRODUCTS, DEFAULT_SCENE_RULES, scenePresetsSchema, sceneProductsSchema } from "../shop/scene-presets.ts";

/** IANA time zone check (kept here, not imported, so scripts/gen-seed.ts runs under plain Node). */
const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * Every setting the app reads, declared once: type, section, default and validation.
 * `supabase/seed.sql` is generated from this file (scripts/gen-seed.ts); a test keeps them in sync.
 * Secrets never go here (CLAUDE.md).
 */
export const SECTIONS = ["cards", "gift", "redeem", "auth", "vault", "themes", "brand", "email", "links", "tracking", "klaviyo", "shop", "open_store", "site", "printers"] as const;
export type Section = (typeof SECTIONS)[number];
export const SETTING_TYPES = ["text", "number", "boolean", "choice", "list", "json", "shopify_id", "date"] as const;
export type SettingType = (typeof SETTING_TYPES)[number];

export type SettingDef<T> = {
  type: SettingType;
  section: Section;
  label: string;
  description?: string;
  default: T;
  options?: readonly string[];
  schema: z.ZodType<T>;
  /** Shown read-only in Settings (e.g. must match an external system). */
  readOnly?: boolean;
};

type Meta = { label: string; description?: string; readOnly?: boolean };

const bool = (section: Section, d: boolean, m: Meta): SettingDef<boolean> => ({ type: "boolean", section, default: d, schema: z.boolean(), ...m });
const num = (section: Section, d: number, m: Meta & { min?: number; max?: number; int?: boolean }): SettingDef<number> => {
  let s = z.number();
  if (m.int !== false) s = s.int();
  if (m.min !== undefined) s = s.min(m.min);
  if (m.max !== undefined) s = s.max(m.max);
  return { type: "number", section, default: d, schema: s, label: m.label, description: m.description, readOnly: m.readOnly };
};
const text = (section: Section, d: string, m: Meta & { max?: number; pattern?: RegExp; allowEmpty?: boolean }): SettingDef<string> => {
  let s = z.string().max(m.max ?? 2000);
  if (m.pattern) s = s.regex(m.pattern);
  if (m.allowEmpty === false) s = s.min(1);
  return { type: "text", section, default: d, schema: s, label: m.label, description: m.description, readOnly: m.readOnly };
};
const url = (section: Section, d: string, m: Meta): SettingDef<string> => ({ type: "text", section, default: d, schema: httpUrl(), ...m });
const choice = <const O extends readonly [string, ...string[]]>(section: Section, options: O, d: O[number], m: Meta): SettingDef<O[number]> => ({
  type: "choice",
  section,
  default: d,
  options,
  schema: z.enum(options) as unknown as z.ZodType<O[number]>,
  ...m,
});
const list = (section: Section, d: string[], m: Meta & { item?: z.ZodString; max?: number }): SettingDef<string[]> => ({
  type: "list",
  section,
  default: d,
  schema: z.array(m.item ?? z.string().min(1).max(500)).max(m.max ?? 200),
  label: m.label,
  description: m.description,
});
const shopifyId = (section: Section, d: string, m: Meta): SettingDef<string> => ({ type: "shopify_id", section, default: d, schema: z.string().regex(/^\d{6,20}$/), ...m });
const date = (section: Section, d: string, m: Meta): SettingDef<string> => ({ type: "date", section, default: d, schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ...m });
const json = <T>(section: Section, d: T, schema: z.ZodType<T>, m: Meta): SettingDef<T> => ({ type: "json", section, default: d, schema, ...m });

/** A photo slot's words on the open store's product page (docs/open-store.md › Photos and names). */
export type PhotoSlotWords = { label: string; name_label?: string; name_placeholder?: string };
export const photoSlotsSchema = z
  .array(z.object({ label: z.string().min(1).max(60), name_label: z.string().max(80).optional(), name_placeholder: z.string().max(30).optional() }).strict())
  .min(1)
  .max(4);
export type ReassuranceRow = { icon: "truck" | "heart" | "lock" | "gift" | "star" | "clock"; text: string };
const dayRange = /^\d{1,2}(-\d{1,2})?$/;

export type PromoBarSetting = { id: string; on: boolean; text: string; link_label: string; link_url: string; audience: "everyone" | "normal" | "vip"; starts: string; ends: string; style: "tint" | "gradient"; closable: boolean };

const httpUrl = () => z.string().max(2000).regex(/^https:\/\/[^\s]+$/, "Must be an https:// link");
const numericId = z.string().regex(/^\d{6,20}$/);
const host = z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i);

export const REGISTRY = {
  // ---------- cards: the product ----------
  "cards.enabled": bool("cards", false, { label: "Greeting cards on", description: "Off: the builder says “Cards are paused” and every entry point is hidden. Turning it on is the launch." }),
  "cards.who_can_create": choice("cards", ["customers_with_order", "everyone_with_portrait"] as const, "customers_with_order", { label: "Who can make cards" }),
  "cards.per_customer": text("cards", "unlimited", { label: "Cards per customer", description: "“unlimited”, or a number per month", pattern: /^(unlimited|[1-9]\d{0,3})$/ }),
  "cards.price": choice("cards", ["free"] as const, "free", { label: "Price", description: "Only free is built in v1." }),
  "cards.message_max_chars": num("cards", 220, { label: "Message max characters", min: 20, max: 1000 }),
  "cards.size_px": json("cards", { w: 1500, h: 2100 }, z.object({ w: z.number().int().min(300).max(4000), h: z.number().int().min(300).max(5600) }), { label: "Card size (px)" }),
  "cards.jpeg_quality": num("cards", 90, { label: "JPEG quality", min: 50, max: 100 }),
  "cards.email_sender_name": text("cards", "{from} via Magic Portraits", { label: "Card email sender name", description: "{from} is the sender's first name", allowEmpty: false, max: 120 }),
  "cards.footer_text": text("cards", "", { label: "Card footer line", description: "Small line along the bottom of every card. Empty (default) shows none.", max: 80 }),
  "cards.first_card_mode": choice("cards", ["one_screen", "full_builder"] as const, "one_screen", { label: "First card", description: "one_screen shows FirstCard to people with no cards (SPEC §8.0)." }),
  "cards.first_card_default_version": text("cards", "with-love-love", { label: "First card default design", description: "theme-version slug (e.g. with-love-love) used when nothing is in season", pattern: /^[a-z0-9-]+$/ }),
  "cards.scheduling_enabled": bool("cards", false, {
    label: "Scheduled sending",
    description: "On: the Message step offers “Send now or pick a date” again. Off (default): cards are created first, then sent from the ready screen at once.",
  }),
  "cards.email_sends_per_day": num("cards", 20, { label: "Card emails per person per day", description: "Limits Send on the ready screen (and resends) per signed-in person, so the cards inbox can't be used for spam.", min: 1, max: 1000000 }),
  "cards.schedule_max_days": num("cards", 366, { label: "Furthest a card can be scheduled (days)", min: 1, max: 730 }),
  "cards.signed_url_seconds": num("cards", 600, { label: "Card image link lifetime (s)", min: 60, max: 86400 }),

  // ---------- gift: the offer ----------
  "gift.offer_email_enabled": bool("gift", false, {
    label: "Free gift offer email",
    description: "After a qualifying paid order (Shopify orders/paid webhook), sends the offer with a one-tap link to make a free card. Channel below. Also sends free_gift_unlocked to Klaviyo for segments.",
  }),
  "gift.offer_email_channel": choice("gift", ["agentmail", "klaviyo"] as const, "agentmail", {
    label: "Offer email sent by",
    description: "agentmail: this app sends it from the cards inbox and tracks sent, delivered, bounced and clicked. klaviyo: a Klaviyo flow on free_gift_unlocked sends it (don't use both).",
  }),
  "gift.offer_email_subject": text("gift", "A free gift with your order {order}", { label: "Offer email subject", description: "{order} becomes the order number, e.g. #1001.", allowEmpty: false, max: 120 }),
  "gift.popup_enabled": bool("gift", false, { label: "Thank-you pop-up link" }),
  "gift.popup_email_later_enabled": bool("gift", false, { label: "“Later, email me the link”", description: "Turn on once the Klaviyo offer flow exists." }),
  "gift.popup_window_minutes": num("gift", 60, { label: "Pop-up link window (minutes after payment)", min: 5, max: 1440 }),
  "gift.reminder_email_enabled": bool("gift", false, { label: "Seasonal reminder event" }),
  "gift.reminder_days_before": num("gift", 14, { label: "Reminder days before season", min: 1, max: 90 }),
  "gift.reminder_skip_if_card_within_days": num("gift", 60, { label: "Skip reminder if a card was made within (days)", min: 0, max: 365 }),
  "gift.unlock_rule": choice("gift", ["any_paid_order", "qualifying_products"] as const, "any_paid_order", { label: "Which orders unlock the free gift" }),
  "gift.qualifying_product_ids": list("gift", [], { label: "Qualifying product ids", item: numericId }),
  "gift.link_valid_days": num("gift", 30, { label: "One-tap link valid (days)", min: 1, max: 90 }),
  "gift.offer_email_delay_minutes": num("gift", 0, { label: "Offer email delay after payment (minutes)", min: 0, max: 10080 }),
  "gift.offer_link_rate_limit_per_hour": num("gift", 30, { label: "Pop-up link requests per IP per hour", min: 1, max: 1000000 }),

  // ---------- redeem ----------
  "redeem.downloads_enabled": bool("redeem", true, { label: "Downloads on (kill switch)" }),
  "redeem.mug_offer_active": bool("redeem", true, { label: "Mug choice open", description: "Off: the mug section is read-only." }),
  "redeem.mug_lock_mode": choice("redeem", ["print_status", "days_after_order"] as const, "print_status", { label: "Mug lock rule" }),
  "redeem.mug_lock_days": num("redeem", 14, { label: "Lock mug after (days, days_after_order mode)", min: 0, max: 365 }),
  "redeem.mug_reminder_after_days": num("redeem", 2, { label: "Mug photo reminder after (days)", min: 0, max: 60 }),
  "redeem.mug_reminder_enabled": bool("redeem", false, { label: "Mug photo reminder event", description: "Sends mug_photo_needed to Klaviyo for orders with no photo chosen." }),
  "redeem.mug_reminder_max_age_days": num("redeem", 30, { label: "Mug reminders only for orders newer than (days)", min: 1, max: 365 }),
  "redeem.mug_variant_id": shopifyId("redeem", "46177764769988", { label: "Mug variant id" }),
  "redeem.mug_product_id": shopifyId("redeem", "8600824643780", { label: "Mug product id" }),
  "redeem.mug_gift_attr_key": text("redeem", "_free_gift", { label: "Mug line attribute key", allowEmpty: false }),
  "redeem.mug_gift_attr_value": text("redeem", "magic_mug", { label: "Mug line attribute value", allowEmpty: false }),
  "redeem.mug_line_tile_attr_key": text("redeem", "_mug_portrait_tile_id", { label: "Mug line tile attribute", allowEmpty: false }),
  "redeem.mug_none_selected_value": text("redeem", "none_selected", { label: "“No choice” value", allowEmpty: false }),
  "redeem.mug_metafield_namespace": text("redeem", "custom", { label: "Mug metafield namespace", allowEmpty: false }),
  "redeem.mug_metafield_key": text("redeem", "mug_choice", { label: "Mug metafield key", allowEmpty: false }),
  "redeem.mug_metafield_type": text("redeem", "json", { label: "Mug metafield type", allowEmpty: false }),
  "redeem.mug_choice_source": text("redeem", "redeem", { label: "Mug choice source", allowEmpty: false }),
  "redeem.mug_ready_tag": text("redeem", "mug:ready", { label: "Mug ready tag", allowEmpty: false }),
  "redeem.mug_lock_states": list("redeem", ["draft_created", "submitted", "passed", "printed", "shipped", "delivered"], { label: "Print states that lock the mug" }),
  "redeem.mug_gelato_product_uid": text("redeem", "mug_product_msz_11-oz_mmat_ceramic-black_cl_4-0", { label: "Gelato product uid (reference)" }),
  "redeem.mug_print_file_url_template": text("redeem", "https://kztxlpfrullqzphkvkiv.supabase.co/storage/v1/object/public/mug-prints/mugs/{tile_id_lower}.pdf", { label: "Print file URL template (reference)" }),
  "redeem.mug_display_value": json("redeem", { USD: 49, CAD: 70, GBP: 45, EUR: 50 } as Record<string, number>, z.record(z.string().regex(/^[A-Z]{3}$/), z.number().min(0)), { label: "Advertised mug value" }),
  "redeem.download_product_ids": list("redeem", ["8596065026244", "8629738045636", "8801988214980"], { label: "Products that include downloads", item: numericId }),
  "redeem.hires_addon_attr_key": text("redeem", "_addon", { label: "Hi-res add-on attribute", allowEmpty: false }),
  "redeem.hires_addon_attr_value": text("redeem", "hires_download", { label: "Hi-res add-on value", allowEmpty: false }),
  "redeem.hires_variant_id": shopifyId("redeem", "46302430429380", { label: "Hi-res variant (reference)" }),
  "redeem.masterpiece_attr_key": text("redeem", "_masterpiece", { label: "Masterpiece attribute", allowEmpty: false }),
  "redeem.masterpiece_attr_value": text("redeem", "true", { label: "Masterpiece value", allowEmpty: false }),
  "redeem.masterpiece_digital_variant_id": shopifyId("redeem", "46936933630148", { label: "Masterpiece digital variant (reference)" }),
  "redeem.tile_id_attr_key": text("redeem", "_tile_id", { label: "Tile id attribute", allowEmpty: false }),
  "redeem.masterpiece_image_id_attr_key": text("redeem", "_image_id", { label: "Masterpiece image id attribute", allowEmpty: false }),
  "redeem.image_url_attr_key": text("redeem", "_image_url", { label: "Image URL attribute", allowEmpty: false }),
  "redeem.theme_attr_key": text("redeem", "_theme", { label: "Theme attribute", allowEmpty: false }),
  "redeem.file_name_template": text("redeem", "magic-portrait-{theme}-{n}.{ext}", { label: "Download file name", allowEmpty: false }),
  "redeem.file_default_theme": text("redeem", "portrait", { label: "File name theme fallback", allowEmpty: false }),
  "redeem.zip_name_template": text("redeem", "magic-portraits-{orderName}.zip", { label: "Zip file name", allowEmpty: false }),
  "redeem.allowed_image_hosts": list("redeem", ["ngyunrirwrjudbgaijek.supabase.co", "afqxjwizbmpzmvzzkzdb.supabase.co", "storyboards-magic-portraits.s3.us-east-2.amazonaws.com"], { label: "Allowed image hosts", item: host }),
  "redeem.order_line_items_page_size": num("redeem", 100, { label: "Line items per page", min: 10, max: 250 }),
  "redeem.download_rate_limit_per_hour": num("redeem", 120, { label: "Downloads per person per hour", min: 1, max: 1000000 }),

  // ---------- auth ----------
  "auth.code_valid_minutes": num("auth", 10, { label: "Sign-in code valid (minutes)", description: "Must match the Supabase Auth OTP expiry (600 s).", readOnly: true }),
  "auth.code_rate_limit_per_hour": num("auth", 6, { label: "Code requests per email per hour", min: 1, max: 1000000 }),
  "auth.code_ip_rate_limit_per_hour": num("auth", 30, { label: "Code requests per IP per hour", min: 1, max: 1000000 }),
  "auth.verify_rate_limit_per_hour": num("auth", 20, { label: "Code checks per email per hour", min: 1, max: 1000000 }),
  "auth.test_signin_enabled": bool("auth", false, {
    label: "Test sign-in (no code, previews only)",
    description: "On: the sign-in page lets anyone who can open a preview sign in as any email without a code. Never works on the production site, whatever this says. Turn off when testing is done.",
  }),
  "auth.link_ip_rate_limit_per_hour": num("auth", 60, { label: "One-tap link opens per IP per hour", min: 1, max: 1000000 }),

  // ---------- vault: data-source plumbing ----------
  "vault.first_order_offer": text("vault", "", { label: "First-order offer (creators)", description: "Short text, e.g. “10% off with code FIRST10”. Empty hides it.", max: 200 }),
  "vault.first_order_offer_code": text("vault", "", { label: "First-order offer code", max: 40 }),
  "vault.lookup_cache_minutes": num("vault", 10, { label: "Portrait lookup cache (minutes)", min: 0, max: 1440 }),
  "vault.lookup_rate_limit_per_hour": num("vault", 120, { label: "Lookups per person per hour", min: 1, max: 1000000 }),
  "vault.profile_memory_seconds": num("vault", 60, {
    label: "Keep a person's orders and portraits between pages (seconds)",
    description: "Each server keeps what it read from Shopify and Imagen for this long, so moving between pages doesn't read it all again. Never stored in the database. 0 reads them live on every page.",
    min: 0,
    max: 600,
  }),
  "vault.recent_sessions": num("vault", 3, {
    label: "Sessions shown at first",
    description: "Portraits, the card builder and the shop's picture lists show the newest this many Imagen sessions, with Show more for the rest. 0 shows them all.",
    min: 0,
    max: 1000,
  }),
  "vault.recent_orders": num("vault", 3, {
    label: "Orders read at first",
    description: "Pages read the newest this many Shopify orders; older ones are read only when these don't show the free gift. 0 reads them all.",
    min: 0,
    max: 250,
  }),
  "vault.slow_call_log_ms": num("vault", 500, { label: "Log calls slower than (ms)", description: "Server logs a [perf] line (step and time only) for any outside call that takes longer. 0 turns it off.", min: 0, max: 60000 }),
  "vault.shopify_api_version": text("vault", "2025-07", { label: "Shopify Admin API version", pattern: /^\d{4}-\d{2}$/ }),
  "vault.order_search_page_size": num("vault", 25, { label: "Orders per page", min: 1, max: 250 }),
  "vault.imagen_public_image_base_url": url("vault", "https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/", { label: "Imagen public image base" }),
  "vault.imagen_main_app_id": text("vault", "00000000-0000-0000-0000-000000000002", { label: "Imagen main-site app id (reference)" }),
  "vault.mirror_session_property": text("vault", "imagegen_session_id", { label: "Mirror session property", allowEmpty: false }),
  "vault.mirror_lptemp_property": text("vault", "lptemp_session_id", { label: "Mirror deep-link property", allowEmpty: false }),
  "vault.mirror_session_since": date("vault", "2026-05-12", { label: "Mirror starts on" }),
  "vault.include_recommendation_children": bool("vault", true, { label: "Include recommendation child sessions" }),
  "vault.mirror_expand_by_browser_session": bool("vault", false, { label: "Expand by browser session (shared-device risk)" }),

  // ---------- themes ----------
  "themes.in_season_days_before": num("themes", 45, { label: "In season (days before start)", min: 0, max: 180 }),

  // ---------- brand ----------
  "brand.timezone": {
    type: "text",
    section: "brand",
    default: "America/Los_Angeles",
    schema: z.string().refine(isTimeZone, "Must be a time zone name such as America/Los_Angeles"),
    label: "Business time zone",
    description: "Settings and reports use it: the dashboard's days (Today, 7 and 30 days, cards per day) and every date and time shown in Settings. Pacific time switches between PST and PDT on its own.",
  },
  "brand.support_email": text("brand", "", { label: "Support email", max: 200 }),

  // ---------- email ----------
  "email.from_cards": text("email", "{from} via Magic Portraits <cards@magicportraitspartners.com>", { label: "Card sender", description: "The address must be the AgentMail inbox.", allowEmpty: false }),
  "email.from_system": text("email", "My Magic Portraits <cards@magicportraitspartners.com>", { label: "System sender (codes, links, confirmations)", allowEmpty: false }),
  "email.footer_company": text("email", "StoryBoards", { label: "Email footer: company", allowEmpty: false, max: 80 }),
  "email.footer_address": text("email", "", { label: "Email footer: company address", description: "Shown after the company name. Empty hides it.", max: 200 }),
  "email.chat_url": url("email", "https://magicportraits.ai", { label: "Email footer: “Chat with us” link" }),
  "email.privacy_url": url("email", "https://magicportraits.ai/privacy", { label: "Email footer: Privacy Policy link" }),
  "email.reply_to": text("email", "support@magicportraits.ai", { label: "Reply-to", allowEmpty: false }),

  // ---------- links ----------
  "links.main_site_url": url("links", "https://magicportraits.ai", { label: "Main site" }),
  "links.start_portrait_url": url("links", "https://magicportraits.ai/start", { label: "Create a new portrait" }),
  "links.order_session_url_template": text("links", "https://magicportraits.ai/order?product_id=8471707222212&magicid=999&session={lptemp_session_id}", { label: "Order as wall art link", allowEmpty: false }),
  "links.sample_cards": list("links", ["/sample-cards/merry-christmas.webp", "/sample-cards/christmas-charm.webp", "/sample-cards/snowy-window.webp"], {
    label: "Sample cards (three images, left to right)",
    description: "Finished greeting cards with a portrait, 5 × 7, shown fanned out on the sign-in page and on home. A path on this site or an https:// link.",
    max: 3,
    item: z.string().max(2000).regex(/^(https:\/\/|\/)[^\s]+$/, "An https:// link, or a path on this site starting with /"),
  }),
  "links.menu_thumbnails": list("links", [], { label: "Menu thumbnails (six image URLs)", max: 6, item: httpUrl() }),
  "links.vip_login_url": url("links", "https://shopify.com/4283367495/account", { label: "VIP Login" }),

  // ---------- tracking ----------
  "tracking.entry_links": list("tracking", ["invoice"], {
    label: "Tracked entry links",
    description: "Names allowed in https://my.magicportraits.ai/from/<name> (e.g. the invoice email's link). Each click is counted, then the person goes to the site; a sign-in that follows is credited to it.",
    max: 20,
    item: z.string().regex(/^[a-z0-9-]{1,32}$/),
  }),
  "tracking.entry_link_valid_hours": num("tracking", 24, {
    label: "Signed entry links valid (hours)",
    description: "A signed /from/<name>?o=…&t=…&s=… link (the invoice email) signs the order's customer straight in for this long after the email was made; after that it asks them to sign in.",
    min: 1,
    max: 168,
  }),
  "tracking.posthog_project_id": text("tracking", "540098", { label: "PostHog project id" }),
  "tracking.posthog_ui_host": url("tracking", "https://us.posthog.com", { label: "PostHog app" }),

  // ---------- klaviyo ----------
  "klaviyo.enabled": bool("klaviyo", false, { label: "Send to Klaviyo", description: "Off: outbox rows are marked skipped." }),
  "klaviyo.api_revision": text("klaviyo", "2024-10-15", { label: "Klaviyo API revision", pattern: /^\d{4}-\d{2}-\d{2}(\.pre)?$/ }),
  "klaviyo.events": list("klaviyo", ["free_gift_unlocked", "free_gift_link_requested", "vault_signed_in", "card_created", "card_email_sent", "card_recipient_email_opened", "gift_reminder_due", "mug_photo_needed", "redeem_mug_saved"], { label: "Events sent to Klaviyo" }),
  "klaviyo.include_signin_link": bool("klaviyo", true, { label: "Include one-tap link in events (SPEC Q11)" }),
  "klaviyo.profile_properties": bool("klaviyo", true, { label: "Update profile properties" }),
  "klaviyo.delete_on_request": bool("klaviyo", true, { label: "Klaviyo deletion on data requests" }),
  "klaviyo.max_attempts": num("klaviyo", 8, { label: "Outbox attempts before giving up", min: 1, max: 30 }),
  // ---------- shop: Gifts and Products pages (docs/shop.md) ----------
  "shop.enabled": bool("shop", false, { label: "Shop on for customers", description: "Off: /gifts, /products and /cart are 404 for customers and no shop menu item, tile, cart icon or promotion bar shows. Turning it on is the shop's launch." }),
  "shop.super_user_preview": bool("shop", false, { label: "Shop preview for super users", description: "On: super users see the shop on the live site while it is still off for customers." }),
  "shop.collection_id": shopifyId("shop", "328021508292", { label: "Store collection id", description: "Every shop product sits in this Shopify collection; its manual order is the order on both pages." }),
  "shop.metafield_namespace": text("shop", "mmp_shop", { label: "Shop metafield namespace", description: "The only product fields the app may write (CLAUDE.md).", readOnly: true }),
  "shop.top_picks_count": num("shop", 5, { label: "Product ideas per picture", min: 1, max: 12 }),
  "shop.product_cache_minutes": num("shop", 5, { label: "Product cache (minutes)", min: 0, max: 60 }),
  "shop.catalog_changed_at": num("shop", 0, { label: "Shop products last changed in Settings", description: "Set automatically whenever Settings › Shop saves to Shopify, so every server reloads the products at once instead of waiting for the product cache.", readOnly: true, min: 0, max: 9_999_999_999_999 }),
  "shop.discount_code_normal": text("shop", "SITEWIDE OFF", { label: "Discount code: normal customers", description: "A Shopify discount code limited to the Store collection. Empty: no discount.", max: 60 }),
  "shop.discount_code_vip": text("shop", "", { label: "Discount code: VIP customers", description: "Empty: VIPs get the normal code.", max: 60 }),
  "shop.vip_customer_tag": text("shop", "VIP", { label: "VIP customer tags", description: "The Shopify customer tags that mark a VIP, separated by commas, e.g. VIP, member-active. A customer with any one of them is a VIP (any case).", allowEmpty: false, max: 300 }),
  "shop.discount_label_normal": text("shop", "Member price", { label: "Discount label: normal", allowEmpty: false, max: 40 }),
  "shop.discount_label_vip": text("shop", "VIP price", { label: "Discount label: VIP", allowEmpty: false, max: 40 }),
  "shop.default_min_short_side_px": num("shop", 1000, { label: "Default smallest picture for a size (short side, px)", description: "Used when a variant has no mmp_shop.min_short_side_px.", min: 100, max: 20000 }),
  "shop.default_max_crop_pct": num("shop", 30, { label: "Default most a size may crop (%)", description: "Used when a variant has no mmp_shop.max_crop_pct.", min: 0, max: 90 }),
  "shop.cart_max_lines": num("shop", 20, { label: "Most lines in a cart", min: 1, max: 100 }),
  "shop.cart_line_max_qty": num("shop", 10, { label: "Most of one item", min: 1, max: 100 }),
  "shop.cart_expiry_days": num("shop", 30, { label: "Clear an untouched cart after (days)", min: 1, max: 365 }),
  "shop.gift_message_max_chars": num("shop", 200, { label: "Gift message max characters", min: 20, max: 1000 }),
  "shop.fulfilment_link_days": num("shop", 90, { label: "New-upload link for fulfilment (days)", min: 1, max: 365 }),
  "shop.upload_max_mb": num("shop", 20, { label: "Largest upload (MB)", min: 1, max: 20 }),
  "shop.upload_min_short_side_px": num("shop", 1000, { label: "Smallest upload (short side, px)", min: 200, max: 6000 }),
  "shop.upload_jpeg_quality": num("shop", 92, { label: "Upload JPEG quality", min: 60, max: 100 }),
  "shop.upload_rate_limit_per_hour": num("shop", 20, { label: "Uploads per person per hour", min: 1, max: 1000000 }),
  "shop.image_link_seconds": num("shop", 600, { label: "New-upload preview link lifetime (s)", min: 60, max: 86400 }),
  "shop.image_fetch_timeout_ms": num("shop", 8000, { label: "Reading a picture's size: timeout (ms)", min: 1000, max: 30000 }),
  "shop.image_fetch_max_mb": num("shop", 30, { label: "Reading a picture's size: largest file (MB)", min: 1, max: 100 }),
  "shop.photo_tile_base_url": url("shop", "https://afqxjwizbmpzmvzzkzdb.supabase.co/storage/v1/object/public/tiles-uploads/order-uploads/", { label: "Photo-tile uploads folder", description: "Where the main site keeps photo-tile photos; a mirror tile_id is the file name here." }),
  "shop.photo_tile_extensions": list("shop", ["jpg", "jpeg", "png"], { label: "Photo-tile file extensions to try", max: 6, item: z.string().regex(/^[a-z0-9]{2,5}$/) }),
  "shop.mirror_upload_event": text("shop", "funnel_portrait_generated", { label: "Mirror event for portrait uploads", allowEmpty: false, max: 80 }),
  "shop.mirror_upload_property": text("shop", "original_image_url", { label: "Mirror property: uploaded photo URL", allowEmpty: false, max: 80 }),
  "shop.mirror_tile_event": text("shop", "tile_dropped", { label: "Mirror event for photo tiles", allowEmpty: false, max: 80 }),
  "shop.mirror_images_limit": num("shop", 200, { label: "Most past photos read per person", min: 10, max: 2000 }),
  "shop.template_sample_pictures": list("shop", ["/shop-samples/portrait.jpg", "/shop-samples/square.jpg"], {
    label: "Template editor sample pictures",
    description: "The pictures the template editor's live preview puts on the product (a path in the app like /shop-samples/portrait.jpg, or an https:// link that allows cross-origin use).",
    item: z.string().max(500).regex(/^(\/[A-Za-z0-9._\-/]+|https:\/\/[^\s]+)$/, "A path like /shop-samples/portrait.jpg or an https:// link"),
    max: 4,
  }),
  "shop.template_upload_max_px": num("shop", 2400, { label: "Template uploads: longest side kept (px)", description: "Uploaded template photos and overlays are scaled down to this.", min: 800, max: 6000 }),
  "shop.template_upload_max_mb": num("shop", 4, { label: "Template uploads: largest file sent (MB)", description: "The editor shrinks big photos before sending; the server refuses anything larger. Vercel's own limit is 4.5 MB.", min: 1, max: 4 }),
  "shop.template_image_hosts": list("shop", ["cdn.shopify.com"], { label: "Template photo hosts", description: "Where blank product photos and overlays may be loaded from (the product's own Shopify media).", item: host, max: 10 }),
  "shop.scene_model": text("shop", "google/gemini-3-pro-image", {
    label: "Room photos: image model",
    description: "The Vercel AI Gateway model that makes room photos in Settings › Shop › Room photos (creator/model). It must take pictures in and give a picture back.",
    pattern: /^[a-z0-9-]+\/[a-z0-9._-]+$/,
  }),
  "shop.scene_image_size": choice("shop", ["1K", "2K", "4K"] as const, "2K", { label: "Room photos: size", description: "Asked of the model. 2K is about 1800 × 2200 px for a 4:5 photo; 4K costs nearly twice as much." }),
  "shop.scene_daily_limit": num("shop", 60, { label: "Room photos: most made per day", description: "Each one is charged to the team's AI Gateway (about $0.13 at 2K with the default model).", min: 0, max: 1000 }),
  "shop.scene_prompt_rules": text("shop", DEFAULT_SCENE_RULES, {
    label: "Room photos: instructions to the model",
    description: "Sent with every room photo. {product} becomes the product's description and {scene} the scene's.",
    max: 6000,
    allowEmpty: false,
  }),
  "shop.scene_products": json("shop", DEFAULT_SCENE_PRODUCTS, sceneProductsSchema, {
    label: "Room photos: products",
    description: "For each Store product (by Shopify handle): how to describe it to the model, and the shape of its print area, which the picture is cropped to first.",
  }),
  "shop.scene_presets": json("shop", DEFAULT_SCENE_PRESETS, scenePresetsSchema, {
    label: "Room photos: scenes",
    description: "Each scene: an id, the product's handle, a label, the sample picture it uses by default (a path in the app), the scene description and the photo's shape.",
  }),
  "shop.scene_sample_pictures": list(
    "shop",
    DEFAULT_SCENE_PRESETS.map((p) => p.picture),
    { label: "Room photos: sample pictures", description: "The pictures a scene can use instead of its own (paths in the app).", item: z.string().max(500).regex(/^\/[A-Za-z0-9._\-/]+\.(jpg|jpeg|png|webp)$/), max: 40 },
  ),
  "shop.preview_width_px": num("shop", 800, { label: "Preview image width (px)", min: 200, max: 2400 }),
  "shop.currency": text("shop", "USD", { label: "Shop currency (ISO code)", description: "How prices are written on the shop's pages; the cart and checkout use Shopify's own figures.", pattern: /^[A-Z]{3}$/ }),
  "shop.customer_type_cache_minutes": num("shop", 10, { label: "VIP check cache (minutes)", min: 0, max: 1440 }),
  "shop.cart_rate_limit_per_hour": num("shop", 120, { label: "Cart changes per person per hour", min: 1, max: 1000000 }),
  "shop.checkout_rate_limit_per_hour": num("shop", 20, { label: "Checkouts started per person per hour", min: 1, max: 1000000 }),
  "shop.change_strip_count": num("shop", 12, { label: "Pictures in the Change picture strip", min: 3, max: 48 }),
  "shop.storefront_api_version": text("shop", "2025-07", { label: "Shopify Storefront API version", pattern: /^\d{4}-\d{2}$/ }),

  // ---------- open_store: the Magic Store at /store (docs/open-store.md) ----------
  "open_store.enabled": bool("open_store", false, { label: "Magic Store on for everyone", description: "Off: /store and /api/store are 404 for everyone (except super users with the preview on). Turning it on is the store's launch." }),
  "open_store.super_user_preview": bool("open_store", false, { label: "Magic Store preview for super users", description: "On: super users see /store on the live site while it is still off for everyone else." }),
  "open_store.collection": text("open_store", "magic-store", { label: "Magic Store collection (handle)", description: "Only products in this Shopify collection appear anywhere in the store, and only they use the Magic Store fields. A product joins or leaves the store by being added to or removed from it in Shopify.", pattern: /^[a-z0-9][a-z0-9-]{0,99}$/, allowEmpty: false, max: 100 }),
  "open_store.picture_options": list("open_store", ["Frame", "Color", "Colour"], {
    label: "Options shown with pictures",
    description: "Product options (by name, any case) whose choices show a picture on the product page: the value's swatch in Shopify, else that variant's own first photo. Any option with Shopify swatches on every value shows them too.",
    max: 20,
  }),
  "open_store.theme_category": text("open_store", "magicstore", { label: "Imagen themes: only this category", description: "The theme lists (here, on each product and in Shopify's dropdown) show only Imagen themes in this category, matched without case, spaces or dashes, plus any theme a product already uses. Empty: every theme.", max: 80 }),
  "open_store.menu_handle": text("open_store", "magic-store", { label: "Category menu (Shopify navigation handle)", description: "The category circles: each item of this menu links to a collection. Edited in Shopify admin › Online Store › Navigation.", pattern: /^[a-z0-9][a-z0-9-]{0,99}$/, allowEmpty: false, max: 100 }),
  "open_store.home_collection": text("open_store", "magic-store", { label: "Collection shown at /store (handle)", pattern: /^[a-z0-9][a-z0-9-]{0,99}$/, allowEmpty: false, max: 100 }),
  "open_store.storefront_publication_id": text("open_store", "", { label: "Storefront sales channel (publication id)", description: "The Shopify publication the Storefront token sells through (gid://shopify/Publication/…). Products not published to it are hidden, since carts can't add them. Empty: not checked.", pattern: /^(gid:\/\/shopify\/Publication\/\d{1,20})?$/, max: 60 }),
  "open_store.products_per_page": num("open_store", 24, { label: "Products per page (then Show more)", min: 4, max: 96 }),
  "open_store.discount_code": text("open_store", "", { label: "Discount code on every Magic Store cart", description: "A Shopify discount code. Empty: no code (an automatic Shopify discount still applies at checkout).", max: 60 }),
  "open_store.discount_label": text("open_store", "Sale price", { label: "Discount label", allowEmpty: false, max: 40 }),
  "open_store.shipping_days": text("open_store", "2-3", { label: "Shipping time (working days)", description: "Added to a size's making time for the delivery estimate, e.g. 2-3. Empty: no estimate.", pattern: /^(\d{1,2}(-\d{1,2})?)?$/, max: 5 }),
  "open_store.reassurance": json(
    "open_store",
    [
      { icon: "truck", text: "Delivery estimate shown before you pay" },
      { icon: "heart", text: "Printed to order, just for you" },
      { icon: "lock", text: "Secure checkout with Shopify" },
    ] as ReassuranceRow[],
    z.array(z.object({ icon: z.enum(["truck", "heart", "lock", "gift", "star", "clock"]), text: z.string().min(1).max(80) }).strict()).max(4) as unknown as z.ZodType<ReassuranceRow[]>,
    { label: "Shopping info rows", description: "Up to 4 short rows under the product, each with an icon (truck, heart, lock, gift, star or clock)." },
  ),
  "open_store.how_it_works": list("open_store", ["Add a clear photo of your pet", "We paint them in about a minute", "We print it and send it to you"], { label: "How it works (steps)", max: 4, item: z.string().min(1).max(120) }),
  "open_store.upload_max_px": num("open_store", 2048, { label: "Photos: shrunk to this longest side in the browser (px)", min: 512, max: 6000 }),
  "open_store.min_photo_px": num("open_store", 600, { label: "Photos: smallest short side (px)", min: 200, max: 4000 }),
  "open_store.more_gifts_step": num("open_store", 4, { label: "“On more gifts”: products shown at first and per “See more gifts”", description: "2 × 2 on phones, one row on desktop at 4.", min: 2, max: 12 }),
  "open_store.slow_after_s": num("open_store", 90, { label: "“Still painting” after (s)", min: 10, max: 600 }),
  "open_store.timeout_s": num("open_store", 240, { label: "Give up on a picture after (s)", min: 30, max: 1800 }),
  "open_store.generations_per_visitor_per_day": num("open_store", 5, { label: "Pictures per visitor per day", min: 1, max: 1000000 }),
  "open_store.generations_per_ip_per_day": num("open_store", 15, { label: "Pictures per IP per day", min: 1, max: 1000000 }),
  "open_store.generations_daily_cap": num("open_store", 1500, { label: "Pictures per day, everyone together", description: "After this, product pages say the studio is busy and show the sample pictures.", min: 0, max: 1000000 }),
  "open_store.visitor_cookie_days": num("open_store", 365, { label: "Visitor cookie lasts (days)", min: 1, max: 730 }),
  "open_store.ask_email_while_painting": bool("open_store", true, { label: "Ask for an email while painting", description: "An optional box under the picture while it's made: we email the picture when it's ready." }),
  "open_store.email_link_days": num("open_store", 30, { label: "The email's link works for (days)", min: 1, max: 90 }),
  "open_store.emails_per_address_per_day": num("open_store", 3, { label: "“Your picture is ready” emails per address per day", min: 1, max: 1000000 }),
  "open_store.klaviyo_list_id": text("open_store", "", { label: "Klaviyo list for store subscribers", description: "Optional. Visitors who tick “Send me offers” are subscribed with consent; with a list id they're added to that list too.", pattern: /^[A-Za-z0-9]*$/, max: 40 }),
  "open_store.klaviyo_source": text("open_store", "Magic Store: while painting", { label: "Klaviyo consent source", description: "Recorded with the subscription.", max: 80 }),
  "open_store.picture_email_subject": text("open_store", "{name}'s picture is ready", { label: "“Your picture is ready” email subject", description: "{name} is the pet's name, or “Your” without one.", max: 120 }),
  // Printers (docs/dreamship.md › Part C). The app never changes a Dreamship order's status; these are only its own settings.
  "dreamship.sync_enabled": bool("printers", false, { label: "Daily check of linked products", description: "Compares each linked product with Dreamship once a day. It only reports; it never writes." }),
  "dreamship.import_wait_hours": num("printers", 6, { label: "Wait for Dreamship to import a paid order (hours)", description: "After this, the order is flagged on this page.", min: 1, max: 72 }),
  "dreamship.sale_pct": num("printers", 60, { label: "Sale for the margin check (% off)", min: 0, max: 95 }),
  "dreamship.min_margin_pct": num("printers", 30, { label: "Flag margins below (%)", min: 0, max: 95 }),
  "printers.print_files_to_order": bool("printers", false, { label: "Link personalised print files from the order", description: "Off: the app still makes the print files for personalised lines and lists them here, but doesn't write their links on the Shopify order (mmp_shop.print_files). Turn on once the print system reads them and CLAUDE.md allows the write." }),
  "dreamship.api_url": text("printers", "https://api.dreamship.com/v1", { label: "Dreamship API address", pattern: /^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._-]+)*$/, max: 200 }),
  "open_store.posthog_dashboard_url": text("open_store", "", { label: "PostHog dashboard link", description: "The “Magic Store” dashboard, linked from this page.", pattern: /^(https:\/\/[^\s]+)?$/, max: 300 }),
  // Store defaults for the product fields (PRODUCT_FIELDS below): a product's own value wins.
  "open_store.photos": json("open_store", [{ label: "Their photo", name_label: "Their name (optional, shown on the picture)", name_placeholder: "Teddy" }] as PhotoSlotWords[], photoSlotsSchema as unknown as z.ZodType<PhotoSlotWords[]>, {
    label: "Default photo slots' words",
    description: "Slot 1 uses the first entry's label and name label, slot 2 the second, and so on. How many photos a product takes comes from its Imagen theme.",
  }),
  "open_store.ask_name": bool("open_store", true, { label: "Ask for the pet's name by default", description: "The name next to the photo, used by Imagen to make the picture. A product can turn it off (e.g. when its personalisation layer asks for the name)." }),
  "open_store.name_max": num("open_store", 14, { label: "Default name length (characters)", min: 1, max: 40 }),
  "open_store.photo_tips": text("open_store", "Best results: one pet, facing the camera, in good light, with the whole head in the picture.", { label: "Default photo tips", max: 300 }),
  "open_store.subject": choice("open_store", ["pet", "person", "any"] as const, "pet", { label: "Default subject (changes the copy only)" }),
  "open_store.images_to_show": num("open_store", 4, { label: "Default results to show (Pick your favourite)", min: 1, max: 8 }),
  "open_store.step_labels": list("open_store", ["Uploading your photo", "Painting {name}", "Putting it on your {product}"], { label: "Default progress steps", description: "{name} becomes the name typed (or “your pet”), {product} the product.", max: 3, item: z.string().min(1).max(80) }),

  // ---------- site: the whole of My Magic Portraits ----------
  "site.promo_bars": json(
    "site",
    [] as PromoBarSetting[],
    z.array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{1,40}$/),
        on: z.boolean(),
        text: z.string().min(1).max(200),
        link_label: z.string().max(40).default(""),
        link_url: z.string().max(300).regex(/^(\/[^\s]*|https:\/\/[^\s]+)$/, "A path like /gifts or an https:// link").or(z.literal("")).default(""),
        audience: z.enum(["everyone", "normal", "vip"]).default("everyone"),
        starts: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
        ends: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
        style: z.enum(["tint", "gradient"]).default("tint"),
        closable: z.boolean().default(true),
      }),
    ).max(10) as unknown as z.ZodType<PromoBarSetting[]>,
    { label: "Promotion bars", description: "Shown above the header while the shop is visible. One for everyone, or one for normal customers and one for VIPs. Dates are business-time days (inclusive). The text is cut at site.promo_bar_max_chars." },
  ),
  "site.promo_bar_max_chars": num("site", 90, { label: "Promotion bar max characters", min: 20, max: 200 }),
} as const;

export type Registry = typeof REGISTRY;
export type SettingKey = keyof Registry;
export type SettingValue<K extends SettingKey> = Registry[K] extends SettingDef<infer T> ? (T extends boolean ? boolean : T extends number ? number : T) : never;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(REGISTRY, key);
}

export function getDef(key: SettingKey): SettingDef<unknown> {
  return REGISTRY[key] as unknown as SettingDef<unknown>;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validates a value for a registered key. Unregistered keys (“Add variable”) take any JSON up to 10 kB. */
export function validateSetting(key: string, value: unknown): ValidationResult<unknown> {
  if (!isSettingKey(key)) {
    if (!/^[a-z][a-z_]*\.[a-z0-9_.]+$/.test(key)) return { ok: false, error: "Keys look like section.name" };
    const size = JSON.stringify(value ?? null).length;
    return size <= 10_000 ? { ok: true, value } : { ok: false, error: "Too large" };
  }
  const r = getDef(key).schema.safeParse(value);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => i.message).join("; ") };
  return { ok: true, value: r.data };
}

/** Keys that must stay off on the live project until launch (BUILD.md). */
export const LAUNCH_SWITCHES: SettingKey[] = ["cards.enabled", "gift.offer_email_enabled", "gift.popup_enabled", "gift.popup_email_later_enabled", "gift.reminder_email_enabled", "klaviyo.enabled", "redeem.mug_reminder_enabled", "shop.enabled", "shop.super_user_preview", "open_store.enabled", "open_store.super_user_preview"];

/*
 * ---------- Product fields (docs/open-store.md › Product settings use the store's settings framework) ----------
 * Declared like settings: type, default, validation, label and help text. They differ only in scope (a product
 * or a variant) and where the value lives: a `mmp_shop` metafield in Shopify (inside the `generation` JSON for
 * the picture settings) instead of the `settings` table. Each falls back to a store setting or its own default.
 * Read them with getProductSetting() / getVariantSetting() (lib/settings/product.ts).
 */
export type ProductFieldDef<T> = {
  scope: "product" | "variant";
  /** The mmp_shop metafield; `jsonKey` when the value is one key of a JSON metafield. */
  metafield: string;
  jsonKey?: string;
  /** The Shopify metafield type (for writes). */
  metafieldType: string;
  type: SettingType;
  /** Which store uses it: both stores (shared), or only the Magic Store. */
  store: "both" | "open_store";
  label: string;
  description?: string;
  schema: z.ZodType<T>;
  /** The store setting used when the product has no value (or a bad one). */
  fallback?: SettingKey;
  default?: T;
  options?: readonly string[];
};
const pf = <T>(d: ProductFieldDef<T>) => d;

export const PRODUCT_FIELDS = {
  short_description: pf<string>({ scope: "product", metafield: "short_description", metafieldType: "multi_line_text_field", type: "text", store: "both", label: "Short description", description: "A sentence or two, then lines starting with “- ” for bullets. Empty: the product's own Shopify description.", schema: z.string().max(1500), default: "" }),
  imagen_theme: pf<string>({ scope: "product", metafield: "imagen_theme", metafieldType: "single_line_text_field", type: "text", store: "open_store", label: "Imagen theme", description: "The art style a visitor's picture is made in. Required for a product people make pictures on.", schema: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,80}$/, "An Imagen theme slug, e.g. bathroom-01"), default: "" }),
  photos: pf<PhotoSlotWords[]>({ scope: "product", metafield: "generation", jsonKey: "photos", metafieldType: "json", type: "json", store: "open_store", label: "Photo slots' words", schema: photoSlotsSchema as unknown as z.ZodType<PhotoSlotWords[]>, fallback: "open_store.photos" }),
  ask_name: pf<boolean>({ scope: "product", metafield: "generation", jsonKey: "ask_name", metafieldType: "json", type: "boolean", store: "open_store", label: "Ask for the pet's name", description: "The name next to the photo, used by Imagen to make the picture. Turn off when the personalisation layer asks for the name, so customers aren't asked twice.", schema: z.boolean(), fallback: "open_store.ask_name" }),
  name_max: pf<number>({ scope: "product", metafield: "generation", jsonKey: "name_max", metafieldType: "json", type: "number", store: "open_store", label: "Name length (characters)", schema: z.number().int().min(1).max(40), fallback: "open_store.name_max" }),
  photo_tips: pf<string>({ scope: "product", metafield: "generation", jsonKey: "photo_tips", metafieldType: "json", type: "text", store: "open_store", label: "Photo tips", schema: z.string().min(1).max(300), fallback: "open_store.photo_tips" }),
  subject: pf<"pet" | "person" | "any">({ scope: "product", metafield: "generation", jsonKey: "subject", metafieldType: "json", type: "choice", options: ["pet", "person", "any"], store: "open_store", label: "Subject (changes the copy only)", schema: z.enum(["pet", "person", "any"]), fallback: "open_store.subject" }),
  images_to_show: pf<number>({ scope: "product", metafield: "generation", jsonKey: "images_to_show", metafieldType: "json", type: "number", store: "open_store", label: "Results to show", schema: z.number().int().min(1).max(8), fallback: "open_store.images_to_show" }),
  step_labels: pf<string[]>({ scope: "product", metafield: "generation", jsonKey: "step_labels", metafieldType: "json", type: "list", store: "open_store", label: "Progress steps", description: "{name} and {product} are filled in.", schema: z.array(z.string().min(1).max(80)).length(3), fallback: "open_store.step_labels" }),
  related: pf<string[]>({ scope: "product", metafield: "related", metafieldType: "list.product_reference", type: "list", store: "open_store", label: "More gifts", description: "The products under “On more gifts”, in order. Empty: chosen from the same collection.", schema: z.array(z.string().regex(/^gid:\/\/shopify\/Product\/\d{1,20}$/)).max(12), default: [] }),
  open_store_related: pf<boolean>({ scope: "product", metafield: "open_store_related", metafieldType: "boolean", type: "boolean", store: "open_store", label: "Related only", description: "Shown only under “On more gifts”, with the visitor's picture, never in the grid.", schema: z.boolean(), default: false }),
  details: pf<string>({ scope: "product", metafield: "details", metafieldType: "multi_line_text_field", type: "text", store: "open_store", label: "Size and materials", schema: z.string().max(2000), default: "" }),
  badge: pf<string>({ scope: "variant", metafield: "badge", metafieldType: "single_line_text_field", type: "text", store: "open_store", label: "Badge", description: "A short label on the size chip, e.g. Bestseller.", schema: z.string().min(1).max(24), default: "" }),
  lead_days: pf<string>({ scope: "variant", metafield: "lead_days", metafieldType: "single_line_text_field", type: "text", store: "open_store", label: "Making time (working days)", description: "e.g. 4-6. With the store's shipping time it gives the delivery estimate.", schema: z.string().regex(dayRange, "Working days, e.g. 4-6"), default: "" }),
} as const;

export type ProductFieldKey = keyof typeof PRODUCT_FIELDS;
export type ProductFieldValue<K extends ProductFieldKey> = (typeof PRODUCT_FIELDS)[K] extends ProductFieldDef<infer T> ? T : never;
