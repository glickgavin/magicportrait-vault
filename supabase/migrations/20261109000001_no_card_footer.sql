-- 9 Nov: cards no longer carry the "Made with Magic Portraits AI" line. Clears the setting only while it
-- still holds that old default, so a super user's own wording is never overwritten.
update public.settings
set value = '""'::jsonb, updated_by = 'migration', updated_at = now()
where key = 'cards.footer_text' and value = '"Made with Magic Portraits AI"'::jsonb;
