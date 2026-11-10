import { z } from "zod";

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
export const SECTIONS = ["cards", "gift", "redeem", "auth", "vault", "themes", "brand", "email", "links", "tracking", "klaviyo", "shop", "site"] as const;
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
  "shop.discount_code_normal": text("shop", "SITEWIDE OFF", { label: "Discount code: normal customers", description: "A Shopify discount code limited to the Store collection. Empty: no discount.", max: 60 }),
  "shop.discount_code_vip": text("shop", "", { label: "Discount code: VIP customers", description: "Empty: VIPs get the normal code.", max: 60 }),
  "shop.vip_customer_tag": text("shop", "VIP", { label: "VIP customer tag", description: "The Shopify customer tag that marks a VIP.", allowEmpty: false, max: 60 }),
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
  "shop.storefront_api_version": text("shop", "2025-07", { label: "Shopify Storefront API version", pattern: /^\d{4}-\d{2}$/ }),

  // ---------- site: the whole of My Magic Portraits ----------
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
    if (!/^[a-z]+\.[a-z0-9_.]+$/.test(key)) return { ok: false, error: "Keys look like section.name" };
    const size = JSON.stringify(value ?? null).length;
    return size <= 10_000 ? { ok: true, value } : { ok: false, error: "Too large" };
  }
  const r = getDef(key).schema.safeParse(value);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => i.message).join("; ") };
  return { ok: true, value: r.data };
}

/** Keys that must stay off on the live project until launch (BUILD.md). */
export const LAUNCH_SWITCHES: SettingKey[] = ["cards.enabled", "gift.offer_email_enabled", "gift.popup_enabled", "gift.popup_email_later_enabled", "gift.reminder_email_enabled", "klaviyo.enabled", "redeem.mug_reminder_enabled", "shop.enabled", "shop.super_user_preview"];
