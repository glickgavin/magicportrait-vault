-- 9 Nov: a design's own placeholder portrait for the template editor's preview, test render and the
-- published thumbnail. Null = the built-in sample portrait.
alter table public.theme_versions add column sample_portrait_path text;
