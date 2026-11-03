/** Links to the main site. The base comes from the `links.main_site_url` setting. */
export const MAIN_SITE_DEFAULT = "https://magicportraits.ai";

export function mainSite(base: string, path: string): string {
  return base.replace(/\/$/, "") + path;
}

export const PRODUCT_ITEMS = [
  { n: "01", titleKey: "ui.menu.petTitle", descKey: "ui.menu.petDesc", path: "/start", tint: "#EADFD0" },
  { n: "02", titleKey: "ui.menu.masterpieceTitle", descKey: "ui.menu.masterpieceDesc", path: "/masterpiece", tint: "#E3DAEC" },
  { n: "03", titleKey: "ui.menu.familyTitle", descKey: "ui.menu.familyDesc", path: "/humans", tint: "#DCE6EF" },
  { n: "04", titleKey: "ui.menu.memorialTitle", descKey: "ui.menu.memorialDesc", path: "/memorial", tint: "#E6E2D6" },
  { n: "05", titleKey: "ui.menu.tilesTitle", descKey: "ui.menu.tilesDesc", path: "/photo-tiles", tint: "#EFDDE0" },
  { n: "06", titleKey: "ui.menu.booksTitle", descKey: "ui.menu.booksDesc", path: "/photo-books", tint: "#DDE8DC" },
] as const;

export const CART_PATH = "/order?product_id=8471707222212&magicid=999";
