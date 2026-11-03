# Theme pack source

These scripts generate the artwork in `assets/themes/`. They draw everything as SVG and render it with Chromium, through Python Playwright and Pillow.

- `art.py`: drawing primitives (paw, bone, fish, sparkle, firework, balloon, pine sprig, holly, bow, party hat and so on).
- `templates.py`: one function per theme version, returning its defs, background, overlay, layout, message ideas and sample message.
- `portrait.py`: the made-up illustrated sample dog used only for previews.
- `build.py`: renders the background JPEG, the overlay PNG and the previews, and writes `layout.json`. Run `python3 build.py [version-slug …]`.

Fonts (all OFL) are loaded from a local `fonts/` folder of `@fontsource` WOFF2 files. Get them with `npm pack` for `@fontsource/dm-serif-display`, `plus-jakarta-sans`, `league-gothic`, `fredoka`, `caveat`, `great-vibes` and `fraunces`, then copy their `files/*latin-*-normal.woff2` and `*-italic.woff2` into `fonts/`.

The headline fonts (Fredoka, Caveat, Great Vibes, Fraunces, League Gothic) are only baked into the background art. The text the app draws at render time uses only the approved fonts.
