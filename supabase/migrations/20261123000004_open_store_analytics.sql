-- The open store, part 5 (docs/open-store.md › Where each event goes): business events before a visitor has a
-- proven email are logged with email null and ref_type = 'store_visitor', ref_id = the visitor id. Additive.
alter table public.activity_log drop constraint if exists activity_log_ref_type_check;
alter table public.activity_log add constraint activity_log_ref_type_check
  check (ref_type is null or ref_type in ('card','order','session','image','setting','theme','version','category','customer','request','delivery','store_visitor'));
