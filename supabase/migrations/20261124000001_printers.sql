-- Printers (docs/dreamship.md › Part C): the `printers` settings section for `dreamship.*`. Additive.
alter table public.settings drop constraint if exists settings_section_check;
alter table public.settings add constraint settings_section_check
  check (section in ('cards','gift','redeem','auth','vault','themes','brand','email','links','tracking','klaviyo','shop','open_store','site','printers'));
