# Live site layout reference (magicportraits.ai)

These are verbatim copies of the live Magic Portraits header, slide-out menu, footer and design tokens. They are here so that **Magic Portraits Vault** (Next.js) can reproduce the layout exactly.

- **Source:** Lovable project `7e35fe57-6b58-4bb6-9c93-3f6a5d344588` ("Magic Shopify Studio"), ref `HEAD`, copied 2026-11-03. The stack is Vite + React 18 + react-router-dom + Tailwind v3 + shadcn/ui + i18next.
- Each file keeps its original repo path under this folder.
- These files are for reference only. They import `react-router-dom`, `@/lib/analytics` and `@/stores/funnelStore`, so they will not compile in Next.js as they are.

## Files copied

| Path | What it is |
|---|---|
| `src/components/FunnelLayout.tsx` | **The header.** It is also the page shell: sticky header + `<main>` + optional footer. |
| `src/components/SiteMenu.tsx` | **The slide-out menu.** It holds the hamburger trigger and the left drawer. |
| `src/components/Footer.tsx` | **The footer.** |
| `src/components/CartStatusButton.tsx` | The shopping-bag button on the right of the header, with its count badge. |
| `src/components/LanguageSwitcher.tsx` | The language dropdown. It is rendered in the **footer**, not the header. |
| `src/components/LocalizedLink.tsx` | A `<Link>` that keeps the `/es`, `/fr` … prefix. The menu and footer use it. |
| `src/components/LanguageSync.tsx` | Syncs i18next and `<html lang>` with the URL. It is mounted in `App.tsx`. |
| `src/components/ui/sheet.tsx` | The shadcn Sheet (Radix Dialog) that the menu drawer uses. |
| `src/components/ui/button.tsx` | The shadcn Button, with the brand gradient as its default variant. |
| `src/lib/langRoutes.ts` | `DEFAULT_LANG`, `SUPPORTED_LANGS`, `stripLang`, `localizePath`. |
| `src/hooks/useLang.ts` | Reads the active language from the URL. |
| `src/lib/i18n.ts` | i18next initialisation. |
| `src/lib/shopifyLogin.ts` | The "VIP Login" popup. |
| `src/lib/utils.ts` | `cn()`. |
| `src/lib/benefitThresholds.ts` | Provides `BASKET_SEED_LIMIT`, which the cart badge estimate uses. |
| `src/assets/MP-Logo-2.svg` | **The only logo the header, menu and footer use** (537×103). |
| `tailwind.config.ts`, `src/index.css`, `components.json` | Design tokens and shadcn config. |
| `src/App.tsx` | The route list. One value is redacted (see Redactions). |

### Binary assets (paths only, not copied)

These are the menu thumbnails imported by `SiteMenu.tsx`, in order 01–06:
- `src/assets/bathroom-bliss-2-pets-journal.webp` (Pet Portraits)
- `src/assets/masterpiece/menu-thumb.jpg` (Masterpiece)
- `src/assets/family-comic.webp` (Family Portraits)
- `src/assets/theme-heavenly.webp` (Memorial)
- `src/assets/tile-baby.webp` (Photo Tiles)
- `src/assets/book.webp` (Photo Books)

Favicons are referenced from `index.html` and live in `public/`: `favicon.svg`, `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `favicon-96x96.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `site.webmanifest`. The `theme-color` is `#F24BDF`.

Other logo files exist in `src/assets/`: `logo.svg`, `mp-logo.svg`, `Logo-MP.svg` and `magic-portraits-header.{png,webp}`. The header, menu and footer **do not** use them, so I did not read them.

### Skipped (I stopped at one level)
- `src/stores/funnelStore.ts` is the Zustand store. `CartStatusButton` reads two values from it: `activeTileCount` and `masterpiece?.variantId`. Its behaviour is summarised below.
- `src/lib/analytics/*` contains `track()`. Its behaviour is summarised below.
- `src/locales/{en,es,fr,it,de}.json` were not copied. The English `ui.*` block these components use is reproduced below.
- `index.html` was not copied because it holds the PostHog project key and the GTM, GA4 and Meta Pixel IDs. The font tags from it are quoted below.
- npm packages: `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `class-variance-authority`, `lucide-react`, `clsx`, `tailwind-merge`, `tailwindcss-animate`, `@tailwindcss/typography`, `i18next`, `react-i18next`, `@intercom/messenger-js-sdk`. I did not read `package.json`, so their versions are not recorded.

## How the header, menu and footer are mounted

- **There is no global layout.** `App.tsx` is a flat `<Routes>` list. Each page wraps its own content in `<FunnelLayout …>`. I checked this in `About.tsx` and `Masterpiece.tsx`, which both use `<FunnelLayout variant="home" showFooter>`. I did not check every page; checkout and utility pages such as `/order`, `/redeem` and `/vip_portal` may differ.
- `FunnelLayout` has three variants:
  - `home`: hamburger (`<SiteMenu/>`) on the left, centred logo, cart on the right. `hideMenu` removes the hamburger. Masterpiece style pages use this when a visitor lands on them directly.
  - `titled`: "← Back" (`t('ui.back')`) on the left, the page title centred, cart on the right.
  - `minimal`: title centred, cart on the right.
- The footer appears only when `showFooter` is passed. `FunnelLayout` always renders the full footer. `Footer` also accepts `compact`, which hides Products, the dot divider, VIP Login, About Us and Follow us. I did not trace which pages use `compact`.
- `/` redirects to `/start`, or to `/humans` when the URL has `?cat=human`.

## Every link

### Header (`FunnelLayout`, variant `home`)
| Element | Target |
|---|---|
| Hamburger | Opens the `SiteMenu` drawer |
| Logo | **Not a link.** It is a plain `<img alt="Magic Portraits AI">` (`h-9 w-auto`, absolutely centred). |
| Shopping bag | `navigate('/order?product_id=8471707222212&magicid=999')`. It adds `&session=<sessionStorage.lptemp_session_id>` when that value exists. It does nothing while inactive or when already on `/order`. The path is **not** language-prefixed. |
| Back (`titled` variant only) | `navigate(backTo)` or `navigate(-1)` |

### Slide-out menu (`SiteMenu`)
Lead label: **"Make something"** (`ui.menu.lead`).

| # | Label → description | Route |
|---|---|---|
| 01 | Pet Portraits → "12+ themes · from your photo" | `/start` |
| 02 | Masterpiece → "You and your pet, painted." | `/masterpiece` |
| 03 | Family Portraits → "Hilariously, wonderfully you" | `/humans` |
| 04 | Memorial → "Keep them close, forever" | `/memorial` |
| 05 | Photo Tiles → "Printed & shipped in 24h" | `/photo-tiles` |
| 06 | Photo Books → "Your whole story" | `/photo-books` |

Utility rows at the bottom of the drawer:
| Label | Target |
|---|---|
| FAQ (MessageCircle icon) | `/faq` |
| Chat With Us (Headphones icon) | `window.Intercom('show')`. It is a button, not a link. |
| About Us (Info icon) | `/about` |

The drawer header shows the logo (not a link, `h-8`) and an X close button. All routes go through `LocalizedLink`, so they keep the language prefix.

### Footer (`Footer`)
| Section | Label | Target |
|---|---|---|
| Products: | Pet Portraits | `/start` |
| | Masterpiece | `/masterpiece` |
| | Family Portraits | `/humans` |
| | Photo Tiles | `/photo-tiles` |
| | Photo Books | `/photo-books` |
| Legal | Terms of Use | `/terms`. This is a plain `Link` with **no language prefix**. |
| | Privacy Policy | `/privacy`. This is a plain `Link` with **no language prefix**. |
| | FAQ | `/faq` (localized) |
| Actions | Chat With Us (MessageCircleQuestion icon) | `window.Intercom('show')` |
| | **VIP Login** (Crown icon) | `openShopifyLogin()` opens a **500×650 popup** to `https://shopify.com/4283367495/account`, the Shopify Customer Account login. If the popup is blocked, it does a full redirect to the same URL. |
| | About Us | `/about` (localized) |
| Follow us: | Instagram icon | `https://www.instagram.com/storyboardsphotos/` (`target="_blank" rel="noopener noreferrer"`) |
| | Facebook icon | `https://www.facebook.com/storyboardsbot` (same attributes) |
| | Language switcher | Navigates to `localizePath(base, code)`, keeping search and hash |

Notes on the footer:
- Memorial appears in the menu but **not** in the footer's Products list.
- The footer logo is not a link.
- A comment in `Footer.tsx` lists the external URLs used before the SPA migration.
- The keys `ui.footer.faceswapTees`, `ui.menu.faceswapTitle` and `ui.menu.faceswapDesc` exist but nothing renders them. Face Swap Tees was taken out of the navigation, but the `/faceswap` route still exists.

## Fonts

They are loaded with Google Fonts `<link>` tags in `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=League+Gothic&display=swap" rel="stylesheet">
```

| Family | Weights | Use |
|---|---|---|
| **Plus Jakarta Sans** | 300, 400, 500, 600, 700, 800 | `font-sans`. `tailwind.config.ts` **replaces** `theme.fontFamily` rather than extending it: `sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif']`. This is the body font everywhere. |
| **DM Serif Display** | 400, regular + italic | `font-serif`: `['"DM Serif Display"', 'Georgia', 'serif']`. It does not appear in the header, menu or footer. |
| **League Gothic** | 400 | Only for the menu numerals 01–06, through an inline style: `'League Gothic', 'Oswald', Impact, sans-serif`. 15px, `letter-spacing: 0.08em`, `rgba(0,0,0,0.2)`. |

Weights used in these components:
- Menu item titles: 800 (`font-extrabold`), 22px, `tracking-[-0.01em]`.
- Menu lead label: 600, 12px (`text-xs`), uppercase, `tracking-[0.22em]`, `#DD07C4`.
- Menu descriptions: 13px, `rgba(0,0,0,0.55)`.
- Menu utility rows: 15px.
- Footer "Products:" heading: 700, 16px. Footer links: 14px.
- `titled`/`minimal` header title: 600, 16px.

In Next.js, `next/font/google` can load Plus Jakarta Sans, DM Serif Display and League Gothic at these weights.

## Colour, gradient, radius and button tokens

From `src/index.css` (`:root`) and `tailwind.config.ts`. Hex values marked ≈ are my own conversions from HSL.

| Token | Exact value | Notes |
|---|---|---|
| `--background` | `48 33% 93%` used as `hsl(var(--background))` | ≈ `#F3F1E7`, a warm cream. Page and header background. |
| `--foreground` | `0 0% 0% / 0.8` | `rgba(0,0,0,0.8)`. The alpha is part of the token, so `text-foreground/xx` opacity modifiers will produce an invalid colour. |
| `--card` / `--popover` | `0 0% 100%` | white |
| `--muted` | `rgba(0, 0, 0, 0.05)` | used raw (`var(--muted)`, not wrapped in `hsl()`) |
| `--muted-foreground` | `0 0% 0% / 0.6` | |
| `--border` / `--input` | `rgba(0, 0, 0, 0.10)` | used raw (`var(--border)`) |
| `--primary` | `222.2 47.4% 11.2%` | shadcn slate default. The brand colour is the gradient below, not this. |
| `--secondary` / `--accent` | `210 40% 96.1%` | shadcn default. The ghost button hover uses `--accent`. |
| `--destructive` | `0 84.2% 60.2%` | |
| `--ring` | `222.2 84% 4.9%` | |
| `--brand-pink` | `318 97% 45%` | ≈ `#E2039F`. Tailwind name `brand-pink`. |
| **`--primary-gradient`** | `linear-gradient(89deg, #FF8F3F -4.82%, #F24BDF 52.24%, #DD07C4 102.1%)` | Primary CTA backgrounds, the cart badge, gradient text (`.grad-text` on the About page). |
| `--primary-shadow` | `0 2px 0 0 rgba(0, 0, 0, 0.07), 0 -2px 0 0 rgba(0, 0, 0, 0.12) inset` | |
| `--radius` | `1.25rem` (20px) | `rounded-lg` = 20px, `rounded-md` = 16px, `rounded-sm` = 12px, `rounded-xsm` = 8px |

Colours hardcoded in the header, menu and footer:
- Magenta for icons and the lead label: `#DD07C4`. The footer and LanguageSwitcher write it as `#dd07c4`.
- Menu active-title gradient: `linear-gradient(90deg, #FF8F3F 0%, #F24BDF 50%, #DD07C4 100%)`, clipped to the text.
- Logo gradient: the same three stops, `#FF8F3F` → `#F24BDF` (offset 0.5337) → `#DD07C4`. The wordmark is `black` at 0.8 opacity; the sub-mark is `#333333` and black at 0.5.
- Menu drawer background: `#FBF6EE`.
- Menu dividers: `1px solid rgba(0,0,0,0.08)`.
- Menu thumbnails: 56×56, `rounded-[10px]`, shadow `0 2px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.08)`. The active item grows to 68×68 with a glow shadow: `0 0 0 1px rgba(221,7,196,0.16), 0 8px 28px rgba(221,7,196,0.28)`.
- Menu overlay: `bg-black/80`.
- Footer background: `rgba(0,0,0,0.05)`, with top corners `rounded-[32px]`.
- Footer text: muted `rgba(0,0,0,0.5)`, strong `rgba(0,0,0,0.8)`.
- Footer pill buttons (Chat, VIP, language): background `rgba(0,0,0,0.05)`, radius `12px`, 14px text, `px-4 py-2`. The language pill uses `px-3`.

**Buttons:**
- The default `Button` variant uses `bg-[image:var(--primary-gradient)] text-white shadow-[0_2px_0_0_rgba(0,0,0,0.07),inset_0_-2px_0_0_rgba(0,0,0,0.12)] hover:opacity-90 rounded-sm`. `rounded-sm` is 12px. Sizes: default `h-10 px-4`, `lg` `h-11 px-8`, `icon` `h-10 w-10`.
- Page CTAs, for example on About, override this with `rounded-[12px] px-7 h-12 text-base font-semibold`, white text and `backgroundImage: var(--primary-gradient)`.
- In practice, almost every interactive element in these components uses a 12px radius.

## i18n

- The stack is **i18next + react-i18next**. `src/lib/i18n.ts` bundles `src/locales/{en,es,fr,it,de}.json` into a single `translation` namespace, with `lng: 'en'`, `fallbackLng: 'en'` and `escapeValue: false`. It is imported for side effects in `main.tsx`.
- Components call `const { t } = useTranslation()` and then `t('ui.menu.petTitle')` and similar. The menu stores keys (`titleKey`, `descKey`) in `NAV_ITEMS` and resolves them when it renders.
- **The language comes from the URL.** English is unprefixed; other languages use `/es`, `/fr`, `/it` or `/de` (`SUPPORTED_LANGS`).
  - `useLang()` reads the language from the URL.
  - `LanguageSync`, mounted once in `App.tsx`, calls `i18n.changeLanguage(lang)` and sets `<html lang>`.
  - `LocalizedLink` adds the prefix to internal links.
  - Only the routes in `LOCALIZED_ROUTES` (`App.tsx`) have prefixed versions.
  - `LanguageSwitcher` hides itself on any page outside its own `LOCALIZED_BASE_PATHS` list. That list leaves out `/masterpiece`, `/order` and `/reveal`, which do exist in `LOCALIZED_ROUTES`.
- These strings are not translated: the cart `aria-label` ("Your order" / "Your order, N items"), the logo `alt` texts, and the switcher's language names (each language is written in its own language on purpose).
- **For the English-only vault:** keep the same `t('ui.…')` keys and a single `en` resource, and keep a `LocalizedLink`-style wrapper (on English it returns the path unchanged). Later languages can then be added without touching the components. You can leave out `LanguageSwitcher` until a second language exists. On English pages it renders the "🇺🇸 English" pill in the footer.

The English strings these components use, an excerpt of `src/locales/en.json`:
```json
{
  "ui": {
    "back": "Back",
    "footer": {
      "products": "Products:",
      "petPortraits": "Pet Portraits",
      "faceswapTees": "Face Swap Tees",
      "masterpiece": "Masterpiece",
      "familyPortraits": "Family Portraits",
      "photoTiles": "Photo Tiles",
      "photoBooks": "Photo Books",
      "terms": "Terms of Use",
      "privacy": "Privacy Policy",
      "faq": "FAQ",
      "chat": "Chat With Us",
      "vip": "VIP Login",
      "about": "About Us",
      "followUs": "Follow us:"
    },
    "menu": {
      "open": "Open menu",
      "close": "Close menu",
      "lead": "Make something",
      "petTitle": "Pet Portraits",
      "petDesc": "12+ themes · from your photo",
      "faceswapTitle": "Face Swap Tees",
      "faceswapDesc": "You wear them. They wear you.",
      "masterpieceTitle": "Masterpiece",
      "masterpieceDesc": "You and your pet, painted.",
      "familyTitle": "Family Portraits",
      "familyDesc": "Hilariously, wonderfully you",
      "memorialTitle": "Memorial",
      "memorialDesc": "Keep them close, forever",
      "tilesTitle": "Photo Tiles",
      "tilesDesc": "Printed & shipped in 24h",
      "booksTitle": "Photo Books",
      "booksDesc": "Your whole story"
    }
  }
}
```

## Other notable behaviour

**Sticky header.**
- Classes: `sticky top-0 z-40`, height `h-14` (56px).
- Background: `bg-background/95`, `backdrop-blur`, and `supports-[backdrop-filter]:bg-background/70`.
- Bottom border: `border-b border-border`, which is `rgba(0,0,0,0.10)`.
- The inner row is `max-w-2xl` (672px) and `px-4`, even on pages whose body is 1100px wide.
- It does nothing on scroll: no hide or reveal, and no shadow change.
- The logo is `absolute left-1/2 -translate-x-1/2`. The cart sits at `absolute right-4`.

**Hamburger.** A ghost icon `Button`, `h-10 w-10 rounded-[12px]`, with `hover:bg-black/5`. The lucide `Menu` icon is `h-8 w-8` (`md:h-9 md:w-9`), `strokeWidth 2.5`, colour `rgba(0,0,0,0.8)`.

**Drawer.**
- It is a Radix Dialog sheet from the left: `w-full sm:max-w-[420px]`. Opening animates over 500ms and closing over 300ms (`tailwindcss-animate`).
- The default shadcn close X is hidden with `[&>button]:hidden` and replaced by a custom 36px button with a `rgba(0,0,0,0.05)` background.
- It closes on overlay click, on Esc, and when any item is clicked.
- The active item is the one where `stripLang(pathname) === item.to` exactly, so `/masterpiece/<slug>` is not marked active. The active item gets the gradient title and the larger, glowing thumbnail.
- The list is a 3-column grid: `grid-cols-[24px_1fr_64px] gap-4 py-4`.

**Cart count source.** `CartStatusButton` does **not** read the Shopify cart. The count is worked out like this:
- If `useFunnelStore().activeTileCount >= 0` (the live count that `/order` publishes), the count is that number.
- Otherwise it estimates from `sessionStorage['lptemp_handoff'].images`. It ignores images with `kind === 'masterpiece'`, groups the rest by `imagegen_session_id`, and counts up to `BASKET_SEED_LIMIT = 6` per group.
- It adds 1 if `masterpiece.variantId` is set.

The button has two states:
- **Inactive** (nothing generated this session): 40% opacity and does nothing.
- **Active:** hover `rgba(0,0,0,0.05)`. The badge sits top-right: 18px minimum, 11px bold white text, background `var(--primary-gradient)`.

The icon is lucide `ShoppingBag`, `h-5 w-5`, inside a 36px round button.

**Analytics fired from these components.** Only `SiteMenu` fires events explicitly. Each one is `track("cta_pressed", { button_label, location: "site_menu" })`, with these `button_label` values:
- `site_menu_opened`
- `site_menu_magic_portraits`, `site_menu_masterpiece`, `site_menu_human_portraits`, `site_menu_memorial`, `site_menu_photo_tiles`, `site_menu_photo_books`
- `site_menu_faq`, `site_menu_contact_support`, `site_menu_about`

`track()` (`src/lib/analytics/index.ts`) sends each event to GA4 (client), PostHog (client) and a server-side `trackCustom` (DB + Klaviyo + Meta CAPI). It adds session id, tracking params, email and currency to every event. `cta_pressed` is **not** mapped to a Meta Pixel event.

The header, cart and footer fire no explicit events. Clicks on them reach PostHog only through `autocapture: true` in `index.html`.

App-level events and behaviour:
- `AnalyticsTracker` fires `page_view` on every pathname change.
- `TrackingParamsSync` keeps `utm_*`, `fbclid`, `gclid`, `click_id` and `ref` on the URL across menu and footer navigation, using sessionStorage and `replace`. Reproduce this in the vault if attribution has to survive navigation.

**Chat.** Intercom is initialised in `App.tsx` with `hide_default_launcher: true`, so the "Chat With Us" buttons are the only way in. They call `window.Intercom('show')`.

## Redactions

- `src/App.tsx`: the Intercom `app_id` passed to `Intercom({...})` is replaced with `<REDACTED: INTERCOM_APP_ID>`. It is a public Messenger workspace identifier rather than a secret, but I redacted it to be safe. Get it from the Intercom workspace settings and supply it as an env var such as `NEXT_PUBLIC_INTERCOM_APP_ID`.
- No other copied file contains a key, secret or token. `.env` was not read.
- `index.html` was not copied because of its analytics IDs and keys.
- The VIP Login URL (`shopify.com/4283367495/account`) contains the Shopify shop ID, which is public. It was kept because it is the requested VIP Login target.
- None of the copied files contain customer data.
