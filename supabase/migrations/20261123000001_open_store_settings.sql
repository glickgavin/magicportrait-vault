-- The open store (docs/open-store.md): its settings live under `open_store.*`. Additive: the settings
-- table's key and section checks now also allow a section name with an underscore, and the `open_store` section.
alter table public.settings drop constraint if exists settings_key_check;
alter table public.settings add constraint settings_key_check
  check (key ~ '^[a-z][a-z_]*\.[a-z0-9_.]+$');

alter table public.settings drop constraint if exists settings_section_check;
alter table public.settings add constraint settings_section_check
  check (section in ('cards','gift','redeem','auth','vault','themes','brand','email','links','tracking','klaviyo','shop','open_store','site'));
