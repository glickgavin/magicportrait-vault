/**
 * Seed themes: the 10 target looks from designs/screens/CardPreview.dc.html.
 * Backgrounds are placeholders shipped with the app (`builtin:` paths under public/theme-placeholders),
 * so the live project needs no Storage upload. Real artwork replaces them via Settings › Template editor.
 * Imported by scripts (relative imports only).
 */
export type Look = {
  bg: string;
  ink: string;
  accent: string;
  photoBg: string;
  frame: string;
  headline: string;
  sub: string;
  decor: "confetti" | "balloons" | "star" | "snow" | "fireworks" | "bubbles" | "leaves" | "pines" | "hearts";
};

export type SeedVersion = { slug: string; name: string; look: Look; ideas: string[]; isNew?: boolean };
export type SeedTheme = {
  slug: string;
  name: string;
  category: string;
  from: string | null; // MM-DD (repeats yearly)
  to: string | null;
  sort: number;
  versions: SeedVersion[];
};

export const SEED_CATEGORIES = [
  { slug: "holidays", name: "Holidays", sort: 1 },
  { slug: "new-year", name: "New Year", sort: 2 },
  { slug: "birthdays", name: "Birthdays", sort: 3 },
  { slug: "general", name: "General", sort: 4 },
] as const;

export const SEED_THEMES: SeedTheme[] = [
  {
    slug: "christmas",
    name: "Christmas",
    category: "holidays",
    from: "11-01",
    to: "12-31",
    sort: 1,
    versions: [
      {
        slug: "classic",
        name: "Classic star",
        look: { bg: "#1E4D3A", ink: "#FFF8EC", accent: "#E9B949", photoBg: "#2F6A52", frame: "#E9B949", headline: "Merry Christmas", sub: "AND A JOYFUL SEASON", decor: "star" },
        ideas: ["Merry Christmas! {pet} and I are sending you all our love this season.", "Wishing you a cosy Christmas full of warmth and laughter.", "Season's greetings from our little family to yours!"],
      },
      {
        slug: "snowfall",
        name: "Snowfall",
        isNew: true,
        look: { bg: "#F2F6F9", ink: "#7A1F2B", accent: "#A3202F", photoBg: "#DCE6EE", frame: "#FFFFFF", headline: "Happy Christmas", sub: "WARMEST WISHES", decor: "snow" },
        ideas: ["Happy Christmas! {pet} insisted on sending this one.", "Warmest wishes for a magical Christmas and a happy new year.", "Thinking of you this Christmas. Can't wait to see you soon!"],
      },
    ],
  },
  {
    slug: "happy-holidays",
    name: "Happy Holidays",
    category: "holidays",
    from: "11-15",
    to: "01-05",
    sort: 2,
    versions: [
      {
        slug: "winter",
        name: "Winter pines",
        look: { bg: "#F3EEE4", ink: "#23422F", accent: "#9A3B2E", photoBg: "#E2DACB", frame: "#FFFFFF", headline: "Happy Holidays", sub: "WARM WISHES THIS SEASON", decor: "pines" },
        ideas: ["Happy holidays from {pet} and me!", "Wishing you peace, joy and plenty of rest this season.", "Warm wishes to you and yours this holiday season."],
      },
    ],
  },
  {
    slug: "new-year",
    name: "New Year",
    category: "new-year",
    from: "12-15",
    to: "01-15",
    sort: 1,
    versions: [
      {
        slug: "midnight",
        name: "Midnight",
        look: { bg: "#141A33", ink: "#F5F1E6", accent: "#E7C46A", photoBg: "#263056", frame: "#E7C46A", headline: "Happy New Year", sub: "HERE’S TO 2027", decor: "fireworks" },
        ideas: ["Happy New Year! Here's to a wonderful 2027 from {pet} and me.", "Cheers to new adventures in the year ahead!", "Wishing you a year full of happiness and good health."],
      },
      {
        slug: "champagne",
        name: "Champagne",
        look: { bg: "#F8F1E2", ink: "#3B2F1A", accent: "#8A6516", photoBg: "#EADBB8", frame: "#FFFFFF", headline: "Cheers to 2027", sub: "HAPPY NEW YEAR", decor: "bubbles" },
        ideas: ["Cheers to 2027! May it bring you every happiness.", "{pet} and I are raising a glass to you this New Year.", "Here's to another year of friendship and fun."],
      },
    ],
  },
  {
    slug: "birthday",
    name: "Birthday",
    category: "birthdays",
    from: null,
    to: null,
    sort: 1,
    versions: [
      {
        slug: "confetti",
        name: "Confetti",
        look: { bg: "#FFF6EC", ink: "#2A1B3D", accent: "#B5401F", photoBg: "#F7D9C4", frame: "#FFFFFF", headline: "Happy Birthday", sub: "MAKE A WISH", decor: "confetti" },
        ideas: ["Wishing you the happiest day. Thought you would love seeing {pet} in his royal robes!", "Happy birthday! Hope your day is as wonderful as you are.", "Another year of you is something to celebrate. Have the best day!"],
      },
      {
        slug: "balloons",
        name: "Balloons",
        look: { bg: "#EAF4FF", ink: "#14304F", accent: "#2457B8", photoBg: "#CFE2F7", frame: "#FFFFFF", headline: "Happy Birthday", sub: "ANOTHER YEAR OF YOU", decor: "balloons" },
        ideas: ["Happy birthday from {pet} and me!", "Here's to you and another brilliant year.", "Have a fantastic birthday, you deserve it!"],
      },
    ],
  },
  {
    slug: "thank-you",
    name: "Thank you",
    category: "general",
    from: null,
    to: null,
    sort: 1,
    versions: [
      {
        slug: "botanical",
        name: "Botanical",
        look: { bg: "#F1F4EC", ink: "#263A2A", accent: "#41693E", photoBg: "#D9E4D1", frame: "#FFFFFF", headline: "Thank You", sub: "FROM THE BOTTOM OF MY HEART", decor: "leaves" },
        ideas: ["Thank you so much. {pet} and I are so grateful!", "Thank you for everything. It meant the world to me.", "Just a little note to say thank you."],
      },
    ],
  },
  {
    slug: "with-love",
    name: "With love",
    category: "general",
    from: null,
    to: null,
    sort: 2,
    versions: [
      {
        slug: "love",
        name: "Hearts",
        look: { bg: "#FBEFF1", ink: "#5A1F33", accent: "#A8304F", photoBg: "#F3D5DC", frame: "#FFFFFF", headline: "With Love", sub: "THINKING OF YOU", decor: "hearts" },
        ideas: ["Sending you lots of love from {pet} and me.", "Just thinking of you and wanted to say hello.", "You mean the world to us. With all our love."],
      },
    ],
  },
  {
    slug: "congratulations",
    name: "Congratulations",
    category: "general",
    from: null,
    to: null,
    sort: 3,
    versions: [
      {
        slug: "confetti",
        name: "Confetti",
        look: { bg: "#EEF3F8", ink: "#1E3550", accent: "#2C5E8F", photoBg: "#D6E2EE", frame: "#FFFFFF", headline: "Congratulations", sub: "SO PROUD OF YOU", decor: "confetti" },
        ideas: ["Congratulations! {pet} and I are so proud of you.", "Huge congratulations on your amazing news!", "You did it! So proud of you."],
      },
    ],
  },
];

/** The default layout from docs/schema.md, coloured for a look. */
export function defaultLayout(look: Look) {
  return {
    canvas: { w: 1500, h: 2100 },
    photo: { x: 270, y: 470, w: 960, h: 960, shape: "rounded", radius: 36, frame: { color: look.frame, width: 28 } },
    text: {
      to: { x: 150, y: 1560, w: 1200, h: 90, font: "DM Serif Display", size: 64, color: look.ink, align: "center", template: "Dear {to}," },
      message: { x: 150, y: 1650, w: 1200, h: 230, font: "Plus Jakarta Sans", size: 46, lineHeight: 1.35, color: look.ink, align: "center", maxLines: 4 },
      from: { x: 150, y: 1890, w: 1200, h: 80, font: "DM Serif Display", size: 56, color: look.ink, align: "center", template: "With love, {from}" },
    },
    footer: { y: 2040, size: 26, color: look.ink },
  };
}

export function builtinBackground(themeSlug: string, versionSlug: string) {
  return `builtin:${themeSlug}-${versionSlug}.jpg`;
}
export function builtinThumbnail(themeSlug: string, versionSlug: string) {
  return `builtin:thumbs/${themeSlug}-${versionSlug}.jpg`;
}

/** One live version per category in the local test stack (seed.test.sql). */
export const TEST_LIVE_VERSIONS = ["christmas/snowfall", "christmas/classic", "new-year/midnight", "birthday/confetti", "with-love/love", "thank-you/botanical"];

/** Fixture super user for the local test stack only (never magic-vault). */
export const TEST_SUPER_USER = "super@example.com";
