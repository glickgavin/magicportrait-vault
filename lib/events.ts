/**
 * Every event name the app may send, from docs/analytics.md. Nothing else is allowed.
 * `business: true` → PostHog AND activity_log. `false` → PostHog only (UI events).
 * `browser: true` → may be sent from the browser through POST /api/track.
 */
export type EventDef = { business: boolean; browser?: boolean; klaviyo?: boolean };

const ui: EventDef = { business: false };
const biz: EventDef = { business: true };
const bizBrowser: EventDef = { business: true, browser: true };
const bizKlaviyo: EventDef = { business: true, klaviyo: true };

export const EVENTS = {
  // Entry points
  gift_offer_email_sent: biz,
  gift_popup_shown: ui,
  gift_popup_cta_tapped: ui,
  gift_popup_dismissed: ui,
  menu_create_card_tapped: ui,
  free_gift_link_requested: bizKlaviyo,
  gift_reminder_email_sent: biz,

  // Sign-in
  page_view_vault_signin: ui,
  vault_code_requested: biz,
  vault_code_verified: ui,
  vault_code_failed: ui,
  vault_signed_in: bizKlaviyo,
  vault_test_signin: biz,
  vault_lookup_succeeded: biz,
  vault_lookup_empty: biz,

  // My Magic Portraits area
  page_view_vault_home: ui,
  page_view_vault_portraits: ui,
  vault_filter_changed: ui,
  vault_order_wall_art_tapped: ui,
  vault_new_portrait_tapped: ui,
  page_view_vault_guest: ui,
  vault_cards_locked_viewed: ui,
  vault_offer_tapped: ui,
  page_view_vault_home_first: ui,
  page_view_vault_empty: ui,
  page_view_vault_orders: ui,
  page_view_vault_order: ui,

  // Card builder
  page_view_card_theme: ui,
  card_category_selected: ui,
  card_theme_selected: bizBrowser,
  page_view_card_portrait: ui,
  card_portrait_selected: bizBrowser,
  card_crop_adjusted: ui,
  page_view_card_message: ui,
  card_message_idea_used: ui,
  card_delivery_selected: ui,
  card_create_tapped: bizBrowser,
  card_render_completed: biz,
  error_card_render_failed: biz,
  page_view_card_ready: ui,
  page_view_card_creating: ui,
  card_step_back: ui,

  // First card
  page_view_card_first: ui,
  card_first_design_changed: bizBrowser,
  card_first_photo_changed: bizBrowser,
  card_first_idea_changed: bizBrowser,
  card_first_full_builder_opened: bizBrowser,

  // After creating
  card_email_sent: bizKlaviyo,
  card_downloaded: bizBrowser,
  card_link_copied: bizBrowser,
  card_shared: bizBrowser,
  card_another_tapped: bizBrowser,
  page_view_vault_cards: ui,
  card_reused: bizBrowser,
  card_resent: biz,
  card_cancelled: biz,
  card_schedule_changed: biz,
  card_created: bizKlaviyo,

  // Recipient
  card_recipient_email_opened: bizKlaviyo,
  page_view_card_received: ui,
  card_recipient_saved: bizBrowser,
  card_recipient_cta_tapped: biz,
  card_recipient_email_bounced: biz,
  card_recipient_unsubscribed: biz,
  page_view_card_unsubscribe: ui,
  page_view_offer_unsubscribe: ui,

  // Redeem (live names)
  page_view_redeem: ui,
  redeem_lookup_submitted: ui,
  redeem_lookup_succeeded: ui,
  redeem_lookup_failed: biz,
  redeem_download_clicked: ui,
  redeem_download_completed: bizBrowser,
  redeem_download_failed: bizBrowser,
  redeem_download_all_clicked: ui,
  redeem_download_all_completed: bizBrowser,
  redeem_download_all_failed: bizBrowser,
  redeem_mug_section_viewed: ui,
  redeem_mug_tile_selected: ui,
  redeem_mug_save_clicked: ui,
  redeem_mug_saved: bizKlaviyo,
  redeem_mug_save_failed: biz,
  redeem_mug_locked_viewed: ui,

  // Account
  account_menu_opened: ui,
  vault_signed_out: bizBrowser,

  // Settings
  settings_viewed: ui,
  setting_changed: biz,
  super_user_added: biz,
  super_user_removed: biz,
  admin_theme_created: biz,
  admin_version_published: biz,
  admin_version_archived: biz,
  data_source_tested: biz,
  admin_customer_viewed: biz,
  admin_card_viewed: biz,
  admin_card_resent: biz,
  admin_card_share_hidden: biz,
  admin_card_share_shown: biz,
  admin_cards_exported: biz,
  admin_data_exported: biz,
  admin_data_deleted: biz,
  admin_signin_link_resent: biz,
  admin_theme_updated: biz,
  admin_category_updated: biz,
  admin_version_updated: biz,

  // Lifecycle (server)
  vault_signin_link_used: biz,
  gift_offer_email_opened: biz,
  gift_offer_email_failed: biz,
  gift_offer_email_bounced: biz,
  gift_offer_skipped: biz,
  free_gift_unlocked: bizKlaviyo,
  gift_reminder_due: bizKlaviyo,
  mug_photo_needed: bizKlaviyo,
  error_klaviyo_send_failed: biz,
} as const satisfies Record<string, EventDef>;

export type EventName = keyof typeof EVENTS;

export function isEventName(name: string): name is EventName {
  return Object.prototype.hasOwnProperty.call(EVENTS, name);
}

export function isBusinessEvent(name: EventName): boolean {
  return EVENTS[name].business;
}

export function isBrowserBusinessEvent(name: string): name is EventName {
  return isEventName(name) && EVENTS[name].business && (EVENTS[name] as EventDef).browser === true;
}

/** Keys that must never appear in event props (privacy rule). */
export const FORBIDDEN_PROP_KEYS = [
  "message",
  "message_text",
  "to_name",
  "recipient_name",
  "recipient_email",
  "recipient",
  "to",
  "text",
] as const;

/** Removes forbidden keys; used by every sender. */
export function scrubProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if ((FORBIDDEN_PROP_KEYS as readonly string[]).includes(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}
