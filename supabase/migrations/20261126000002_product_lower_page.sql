-- The product page's lower sections (26 Nov; docs/open-store.md › Product page, items 9 and 12 to 18).
-- "How it works" is now a section with photos (open_store.how_steps, added by seed.sql like every new key);
-- the old list of three lines, open_store.how_it_works, is no longer read anywhere.
delete from public.settings where key = 'open_store.how_it_works';
