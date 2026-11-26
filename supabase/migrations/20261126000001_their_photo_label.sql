-- The photo slot keeps one heading in every state, "Their photo" (26 Nov; docs/open-store.md › Product page).
-- Only the untouched seed value changes: a label a super user has written stays as it is.
update public.settings
set value = jsonb_set(value, '{0,label}', '"Their photo"'::jsonb)
where key = 'open_store.photos'
  and updated_by = 'seed'
  and value -> 0 ->> 'label' = 'Add their photo';
