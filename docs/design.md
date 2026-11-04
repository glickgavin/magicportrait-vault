# Design reference

My Magic Portraits must look like part of magicportraits.ai: the same header, menu, footer, fonts, colours and buttons. The live site's own code for these is in `reference/live-site/` (see its README). **Copy from there first**, then use the tokens below to fill any gaps. Where the two disagree, the live site wins.

The screen designs are in `designs/` (see `designs/README.md`).

## Tokens

| Token | Value |
|---|---|
| Page background | `#F3F1E7` (hsl 48 33% 93%) |
| Menu sheet background | `#FBF6EE` |
| Text | `rgba(0,0,0,0.8)`; secondary `rgba(0,0,0,0.6)` |
| Primary gradient (main buttons, active tabs, banners) | `linear-gradient(89deg, #FF8F3F -4.82%, #F24BDF 52.24%, #DD07C4 102.1%)` |
| Avatar gradient | `linear-gradient(135deg, #FF8F3F, #F24BDF 55%, #DD07C4)` |
| Accent pinks | `#B8059F` (links), `#8E047B` (link hover, badge text), `#FDE7FA` (tinted backgrounds) |
| Selected border | `#DD07C4` |
| Card radius | 20 px |
| Button radius | 12 px |
| Button shadow | `0 2px 0 0 rgba(0,0,0,0.07), 0 -2px 0 0 rgba(0,0,0,0.12) inset` |
| Settings sidebar | `#2B2B2B`; content area white |

**Fonts**
- **Plus Jakarta Sans** 400/500/600/700/800 for all UI.
- **DM Serif Display** for card headlines and card text.
- **League Gothic** for the menu's big product numerals (01–06).

Load them with `next/font/google`. The card renderer needs the same font files on the server (put the TTFs in `assets/fonts/`).

## Header (every page)

- Height 56 px, background `#F3F1E7`.
- **Left:** hamburger, opens the menu sheet.
- **Centre:** the Magic Portraits logo, centred (`left: 50%; transform: translateX(-50%)`). It is 36 px tall on the live site, but **30 px tall (`top: 13px`) whenever the initials circle or the Sign-in icon shows**. At 36 px the circle overlaps the logo on phones. Check at 360 px.
- **Right:** the avatar (no cart icon: removed in the 4 Nov review). A 34 px circle with the person's initials, at `right: 12px`, inside a 44 px tap target.
  - Avatar gradient background, white 13 px weight 800 initials.
  - Ring: `box-shadow: 0 0 0 2px #F3F1E7, 0 0 0 3.5px rgba(221,7,196,0.35)`.
  - Signed out: a person-outline icon with the label "Sign in".

## Menu sheet

The same as the live site's menu, with a **MY MAGIC PORTRAITS** group added at the top:

- Create a card (with a "NEW" badge)
- My cards
- My portraits
- Orders, downloads & mugs

Then, unchanged from the live site:
- "Make something" 01–06: Pet Portraits, Masterpiece, Family Portraits, Memorial, Photo Tiles, Photo Books.
- FAQ, Chat With Us, About Us.

At the bottom, a signed-in block: avatar, name, email, Sign out.

Links to the main site go to `links.main_site_url` + the live path from `reference/live-site/README.md`.

## Footer

The live site's footer, unchanged: Chat With Us · VIP Login · About Us, Follow us, Products (Pet Portraits, Masterpiece, Family Portraits, Photo Tiles, Photo Books), Terms of Use · Privacy Policy · FAQ.

## Components to build once and reuse

- `Header`, `MenuSheet`, `Footer`, `Avatar` / `AccountMenu`
- `PrimaryButton` (gradient), `SecondaryButton` (white with border), `Chip` / `Tab` (gradient when active), `Badge` (ORDERED, NEW, status)
- `CardPreview`: the live card at any size, drawn from the same layout JSON the server renderer uses, so the preview matches the JPEG. The design's `CardPreview` board shows the 10 target looks.
- `PortraitGrid` (one grid, newest first, 3 across on a phone; each portrait whole at its own shape in an equal cell; radio-group selection), `ThemeTile`, `StepHeader` ("Step 2 of 3", pinned under the header at `top: 56px`, tight padding, a plain arrow back button with a 44 px tap target and a visible focus ring, no container), the compact pinned preview on the Portrait step (pinned only when the screen is at least 700 px tall), `StickyFooterBar` (Next / Create)
- `ReadyActions` (Ready screen): email box with **Send** beside it (then "Sent to j***@… · Resend"), **Share** (the share sheet; **Copy link** where there is none) and **Download** side by side. No app buttons.
- Admin: `AdminShell` (sidebar groups INSIGHTS · SETUP · GREETING CARDS · REDEEM · SYSTEM), `KpiTile`, `DataTable` (search, filters, paging, CSV), `Timeline`, `StatusPill`

## Behaviour

- **Mobile first.** Design at 390 px and check at 360 px. Bottom bars stay above the iOS home indicator (`env(safe-area-inset-bottom)`).
- Horizontal theme rows scroll with snap and hide the scrollbar.
- Selections use real radio groups, with a check mark in the tile's top-right corner.
- Loading uses skeletons that match the content shape. The card render shows the three progress lines from `M4Creating`.
- Empty and error states use the app's voice: short, kind, and with one clear next step.
- No layout shift when images load: give every image its aspect ratio (portraits 1:1 unless Imagen says otherwise; cards 5:7).
