-- Print files for personalised lines (docs/shop.md › Personalisation layer, docs/data.md › Print files): for a paid
-- order with lines the customer personalised and a printer other than Dreamship, the app composes the print file
-- (picture + layer) and links it from the order. One more kind of printer job; same table and statuses. Additive.
alter table public.printer_jobs drop constraint if exists printer_jobs_kind_check;
alter table public.printer_jobs add constraint printer_jobs_kind_check check (kind in ('dreamship_artwork','print_file'));
