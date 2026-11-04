-- Review fix 16 (4 Nov): the menu pictures, the live site's own menu images in menu order
-- (Pet Portraits, Masterpiece, Family Portraits, Memorial, Photo Tiles, Photo Books).
-- Writes only while the setting is still empty, so a super user's later edit is never overwritten.
-- The hashed file names change if the live site rebuilds its images: update them in Settings then.
update public.settings
set value = '[
  "https://magicportraits.ai/assets/bathroom-bliss-2-pets-journal-mPP682ud.webp",
  "https://magicportraits.ai/assets/menu-thumb-Ci7IOwNH.jpg",
  "https://magicportraits.ai/assets/family-comic-QWhGvouU.webp",
  "https://magicportraits.ai/assets/theme-heavenly-W3hXFflb.webp",
  "https://magicportraits.ai/assets/tile-baby-CVc1dsU0.webp",
  "https://magicportraits.ai/assets/book-pfi0Oqve.webp"
]'::jsonb,
    updated_by = 'migration',
    updated_at = now()
where key = 'links.menu_thumbnails' and value = '[]'::jsonb;
