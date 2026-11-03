# Theme pack: New Year, Christmas, Birthday (Nov 2026)

There are 12 ready-made theme versions, two general and two pet-centric for each occasion. They follow the artwork spec (`designs/screens/ThemeSpec`, `docs/schema.md` › Layout JSON). The contact sheet is `designs/screenshots/ThemePack.jpg`.

| Theme (category) | Version | Audience | Photo shape |
|---|---|---|---|
| New Year (`new-year`) | Midnight Gold | general | arch |
| | Champagne Toast | general | rounded |
| | Pawsome New Year | pet | rounded |
| | Pet Resolutions | pet | rect (polaroid) |
| Christmas (`holidays`) | Evergreen & Gold | general | arch |
| | Winter Wreath | general | circle (wreath overlay) |
| | Pawsitively Merry | pet | rounded |
| | Dear Santa | pet | rect (polaroid) |
| Birthday (`birthdays`) | Confetti Pop | general | rounded |
| | Balloon Bouquet | general | rect |
| | Pawty Time | pet | circle |
| | Treats On Me | pet | rect (scalloped) |

## Files per version
`<theme>/<version>/`:
- `<theme>-<version>-background.jpg`: 1500 × 2100, sRGB, JPEG q90, all under 600 KB. The headline lettering is part of the art.
- `<theme>-<version>-overlay.png`: transparent PNG, the same size, all under 600 KB. It holds only what sits on top of the portrait at its edges (sparkles, the wreath, tape, a party hat on the frame). It covers less than 0.1% of the face area.
- `layout.json`: the `theme_versions.layout` value.
- `<theme>-<version>-preview.jpg`: 750 × 1050, made with a **made-up illustrated sample portrait** and sample text. It is for review only and is not uploaded.

`themes.json` lists every version with its files, `sort_order`, `is_new`, `audience` and `message_ideas` (`{pet}` and `{to}` placeholders, as in `docs/schema.md`).

## Layout rules these files rely on
- The text zones use only the approved fonts (DM Serif Display for To/From, Plus Jakarta Sans for the message).
- `y` is the **top** of each text box. To and From are one line (box height ≈ `size × 1.25`) and shrink to fit the width.
- The message uses `valign: "middle"`, so short messages sit centred in their box rather than leaving a gap above the sign-off.
- `photo.frame` is drawn **inside** the photo box, over the portrait's edge. When `frame.width` is 0, the frame is part of the background art (polaroid, scallops, wreath).
- Every template was tested with a 220-character message, a long recipient name and a long sender name. Everything fits at full size, with no shrinking needed.
- The `to`/`from` templates vary: Dear Santa uses "To {to}," and "Love, {from}".

## Loading them
- **Super users:** Settings › Theme library › **Import theme pack** reads `themes.json`, uploads the files to `theme-assets/<theme>/<version>/`, creates any missing themes in the right category, and creates each version as **draft** with its layout and message ideas. It is idempotent by (theme slug, version slug). Then review and publish in the template editor.
- **Local test stack:** `seed.test.sql` (or the test setup script) loads the pack as **live** versions, so e2e and the renderer's golden images use real artwork.

## Changing them
The artwork is generated from code: `designs/theme-pack-source/` (`templates.py` holds each design; `build.py` renders them with Playwright). Edit a template there and re-run `python3 build.py <version-slug>` to regenerate its files.
