-- The open store, part 4 (docs/open-store.md › Cart and checkout, Asking for their email, Visitors and sign-in).
-- Additive: three checks gain a value each, and store_generations gains the email-while-painting columns.

-- "Your picture is ready" links are sign-in links with their own purpose.
alter table public.signin_links drop constraint if exists signin_links_purpose_check;
alter table public.signin_links add constraint signin_links_purpose_check
  check (purpose in ('gift_offer','admin_resend','mug_reminder','gift_reminder','store_picture'));

-- A paid open-store order creates the member if needed.
alter table public.vault_members drop constraint if exists vault_members_created_via_check;
alter table public.vault_members add constraint vault_members_created_via_check
  check (created_via in ('sign_in','gift_offer','admin_lookup','store_order'));

-- Klaviyo marketing subscriptions (only when an open-store visitor ticked the box), through the outbox.
alter table public.outbound_events drop constraint if exists outbound_events_kind_check;
alter table public.outbound_events add constraint outbound_events_kind_check
  check (kind in ('event','profile','deletion','subscription'));

-- One "Your picture is ready" email per picture: who asked (lower-cased) and when it went.
alter table public.store_generations add column if not exists email_to text check (email_to is null or email_to = lower(trim(email_to)));
alter table public.store_generations add column if not exists email_consent boolean not null default false;
alter table public.store_generations add column if not exists emailed_at timestamptz;
