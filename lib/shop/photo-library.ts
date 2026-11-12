// Made by scripts/mockups/export_library.py from the mockup renders; don't edit by hand.
// The files are in public/shop-library/. Rooms match Store products by Shopify handle.
import type { Template } from "@/lib/shop/template";

export type LibraryImage = { src: string; w: number; h: number };
export type LibraryRoom = {
  id: string;
  product: string;
  productTitle: string;
  printAspect: string;
  scene: string;
  background: LibraryImage;
  overlay: LibraryImage | null;
  zone: Template["zone"];
  mask: Template["mask"];
  blend: Template["blend"];
  photos: (LibraryImage & { picture: string })[];
};
export type LibraryStudioPhoto = LibraryImage & {
  id: string;
  product: string;
  productTitle: string;
  picture: string;
};

export const LIBRARY_ROOMS: LibraryRoom[] = [
  {
    id: "room-pillow-sofa",
    product: "magic-pillow-with-photo",
    productTitle: "Magic Pillow with Photo",
    printAspect: "1:1",
    scene:
      "On a champagne velvet sofa, a rust cushion behind it, a lamp on the side table and daylight from the window.",
    background: {
      src: "/shop-library/rooms/room-pillow-sofa/background.jpg",
      w: 1200,
      h: 1200,
    },
    overlay: {
      src: "/shop-library/rooms/room-pillow-sofa/overlay.webp",
      w: 1200,
      h: 1200,
    },
    zone: {
      kind: "corners",
      points: [
        [0.32359, 0.35764],
        [0.63416, 0.35962],
        [0.63177, 0.67286],
        [0.31941, 0.66816],
      ],
    },
    mask: {
      kind: "none",
      radius: 0,
    },
    blend: "multiply",
    photos: [
      {
        picture: "beagle-peg",
        src: "/shop-library/rooms/room-pillow-sofa/photos/beagle-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "shepherd-peg",
        src: "/shop-library/rooms/room-pillow-sofa/photos/shepherd-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "beagle-peg-2",
        src: "/shop-library/rooms/room-pillow-sofa/photos/beagle-peg-2.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-teddy",
        src: "/shop-library/rooms/room-pillow-sofa/photos/admiral-teddy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-cat",
        src: "/shop-library/rooms/room-pillow-sofa/photos/admiral-cat.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "tommy-boy",
        src: "/shop-library/rooms/room-pillow-sofa/photos/tommy-boy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "bartholomew",
        src: "/shop-library/rooms/room-pillow-sofa/photos/bartholomew.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "husky-journal",
        src: "/shop-library/rooms/room-pillow-sofa/photos/husky-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "frenchie-journal",
        src: "/shop-library/rooms/room-pillow-sofa/photos/frenchie-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "cat-plumber",
        src: "/shop-library/rooms/room-pillow-sofa/photos/cat-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "lamb-plumber",
        src: "/shop-library/rooms/room-pillow-sofa/photos/lamb-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "rottweiler-plumber",
        src: "/shop-library/rooms/room-pillow-sofa/photos/rottweiler-plumber.jpg",
        w: 1200,
        h: 1200,
      },
    ],
  },
  {
    id: "room-masterpiece-sideboard",
    product: "masterpiece-copy",
    productTitle: "Masterpiece",
    printAspect: "2:3",
    scene: "Above a walnut sideboard with flowers, books and a lit candle.",
    background: {
      src: "/shop-library/rooms/room-masterpiece-sideboard/background.jpg",
      w: 1200,
      h: 1200,
    },
    overlay: {
      src: "/shop-library/rooms/room-masterpiece-sideboard/overlay.webp",
      w: 1200,
      h: 1200,
    },
    zone: {
      kind: "corners",
      points: [
        [0.37453, 0.19057],
        [0.62547, 0.19057],
        [0.62753, 0.56847],
        [0.37247, 0.56847],
      ],
    },
    mask: {
      kind: "none",
      radius: 0,
    },
    blend: "multiply",
    photos: [
      {
        picture: "beagle-peg",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/beagle-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "shepherd-peg",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/shepherd-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "beagle-peg-2",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/beagle-peg-2.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-teddy",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/admiral-teddy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-cat",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/admiral-cat.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "tommy-boy",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/tommy-boy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "bartholomew",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/bartholomew.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "husky-journal",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/husky-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "frenchie-journal",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/frenchie-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "cat-plumber",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/cat-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "lamb-plumber",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/lamb-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "rottweiler-plumber",
        src: "/shop-library/rooms/room-masterpiece-sideboard/photos/rottweiler-plumber.jpg",
        w: 1200,
        h: 1200,
      },
    ],
  },
  {
    id: "room-puzzle-table",
    product: "magic-puzzle",
    productTitle: "Magic Puzzle",
    printAspect: "3:4",
    scene:
      "Finished on an oak dining table, upright, with the box lid, a cup of tea, flowers and velvet chairs behind.",
    background: {
      src: "/shop-library/rooms/room-puzzle-table/background.jpg",
      w: 1200,
      h: 1200,
    },
    overlay: {
      src: "/shop-library/rooms/room-puzzle-table/overlay.webp",
      w: 1200,
      h: 1200,
    },
    zone: {
      kind: "corners",
      points: [
        [0.30541, 0.3612],
        [0.66911, 0.38517],
        [0.67128, 0.85392],
        [0.1591, 0.80598],
      ],
    },
    mask: {
      kind: "none",
      radius: 0,
    },
    blend: "multiply",
    photos: [
      {
        picture: "beagle-peg",
        src: "/shop-library/rooms/room-puzzle-table/photos/beagle-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "shepherd-peg",
        src: "/shop-library/rooms/room-puzzle-table/photos/shepherd-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "beagle-peg-2",
        src: "/shop-library/rooms/room-puzzle-table/photos/beagle-peg-2.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-teddy",
        src: "/shop-library/rooms/room-puzzle-table/photos/admiral-teddy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-cat",
        src: "/shop-library/rooms/room-puzzle-table/photos/admiral-cat.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "tommy-boy",
        src: "/shop-library/rooms/room-puzzle-table/photos/tommy-boy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "bartholomew",
        src: "/shop-library/rooms/room-puzzle-table/photos/bartholomew.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "husky-journal",
        src: "/shop-library/rooms/room-puzzle-table/photos/husky-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "frenchie-journal",
        src: "/shop-library/rooms/room-puzzle-table/photos/frenchie-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "cat-plumber",
        src: "/shop-library/rooms/room-puzzle-table/photos/cat-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "lamb-plumber",
        src: "/shop-library/rooms/room-puzzle-table/photos/lamb-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "rottweiler-plumber",
        src: "/shop-library/rooms/room-puzzle-table/photos/rottweiler-plumber.jpg",
        w: 1200,
        h: 1200,
      },
    ],
  },
  {
    id: "room-block-sideboard",
    product: "acrylic-block",
    productTitle: "Acrylic Block",
    printAspect: "5:7",
    scene:
      "Standing on the walnut sideboard by the window, between books with a candle and a vase of flowers.",
    background: {
      src: "/shop-library/rooms/room-block-sideboard/background.jpg",
      w: 1200,
      h: 1200,
    },
    overlay: {
      src: "/shop-library/rooms/room-block-sideboard/overlay.webp",
      w: 1200,
      h: 1200,
    },
    zone: {
      kind: "corners",
      points: [
        [0.39907, 0.34223],
        [0.60368, 0.34365],
        [0.6015, 0.67196],
        [0.40035, 0.65619],
      ],
    },
    mask: {
      kind: "none",
      radius: 0,
    },
    blend: "multiply",
    photos: [
      {
        picture: "beagle-peg",
        src: "/shop-library/rooms/room-block-sideboard/photos/beagle-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "shepherd-peg",
        src: "/shop-library/rooms/room-block-sideboard/photos/shepherd-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "beagle-peg-2",
        src: "/shop-library/rooms/room-block-sideboard/photos/beagle-peg-2.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-teddy",
        src: "/shop-library/rooms/room-block-sideboard/photos/admiral-teddy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-cat",
        src: "/shop-library/rooms/room-block-sideboard/photos/admiral-cat.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "tommy-boy",
        src: "/shop-library/rooms/room-block-sideboard/photos/tommy-boy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "bartholomew",
        src: "/shop-library/rooms/room-block-sideboard/photos/bartholomew.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "husky-journal",
        src: "/shop-library/rooms/room-block-sideboard/photos/husky-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "frenchie-journal",
        src: "/shop-library/rooms/room-block-sideboard/photos/frenchie-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "cat-plumber",
        src: "/shop-library/rooms/room-block-sideboard/photos/cat-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "lamb-plumber",
        src: "/shop-library/rooms/room-block-sideboard/photos/lamb-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "rottweiler-plumber",
        src: "/shop-library/rooms/room-block-sideboard/photos/rottweiler-plumber.jpg",
        w: 1200,
        h: 1200,
      },
    ],
  },
  {
    id: "room-block-desk",
    product: "acrylic-block",
    productTitle: "Acrylic Block",
    printAspect: "5:7",
    scene: "On an oak desk with a laptop, a cup of tea, a notebook and a lamp.",
    background: {
      src: "/shop-library/rooms/room-block-desk/background.jpg",
      w: 1200,
      h: 1200,
    },
    overlay: {
      src: "/shop-library/rooms/room-block-desk/overlay.webp",
      w: 1200,
      h: 1200,
    },
    zone: {
      kind: "corners",
      points: [
        [0.44391, 0.33971],
        [0.62993, 0.34843],
        [0.6258, 0.66442],
        [0.44534, 0.63633],
      ],
    },
    mask: {
      kind: "none",
      radius: 0,
    },
    blend: "multiply",
    photos: [
      {
        picture: "beagle-peg",
        src: "/shop-library/rooms/room-block-desk/photos/beagle-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "shepherd-peg",
        src: "/shop-library/rooms/room-block-desk/photos/shepherd-peg.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "beagle-peg-2",
        src: "/shop-library/rooms/room-block-desk/photos/beagle-peg-2.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-teddy",
        src: "/shop-library/rooms/room-block-desk/photos/admiral-teddy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "admiral-cat",
        src: "/shop-library/rooms/room-block-desk/photos/admiral-cat.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "tommy-boy",
        src: "/shop-library/rooms/room-block-desk/photos/tommy-boy.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "bartholomew",
        src: "/shop-library/rooms/room-block-desk/photos/bartholomew.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "husky-journal",
        src: "/shop-library/rooms/room-block-desk/photos/husky-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "frenchie-journal",
        src: "/shop-library/rooms/room-block-desk/photos/frenchie-journal.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "cat-plumber",
        src: "/shop-library/rooms/room-block-desk/photos/cat-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "lamb-plumber",
        src: "/shop-library/rooms/room-block-desk/photos/lamb-plumber.jpg",
        w: 1200,
        h: 1200,
      },
      {
        picture: "rottweiler-plumber",
        src: "/shop-library/rooms/room-block-desk/photos/rottweiler-plumber.jpg",
        w: 1200,
        h: 1200,
      },
    ],
  },
];

export const LIBRARY_STUDIO: LibraryStudioPhoto[] = [
  {
    id: "magic-pillow",
    product: "magic-pillow-with-photo",
    productTitle: "Magic Pillow with Photo",
    picture: "frenchie-journal",
    src: "/shop-library/studio/magic-pillow.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "masterpiece",
    product: "masterpiece-copy",
    productTitle: "Masterpiece",
    picture: "admiral-teddy",
    src: "/shop-library/studio/masterpiece.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "magic-puzzle",
    product: "magic-puzzle",
    productTitle: "Magic Puzzle",
    picture: "tommy-boy",
    src: "/shop-library/studio/magic-puzzle.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "acrylic-block",
    product: "acrylic-block",
    productTitle: "Acrylic Block",
    picture: "cat-plumber",
    src: "/shop-library/studio/acrylic-block.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "acrylic-square-block",
    product: "acrylic-square-block",
    productTitle: "Acrylic Square Block",
    picture: "beagle-peg",
    src: "/shop-library/studio/acrylic-square-block.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "magic-mug",
    product: "magic-mug-with-photo-copy-1",
    productTitle: "Magic Mug with Photo",
    picture: "rottweiler-plumber",
    src: "/shop-library/studio/magic-mug.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "magic-xmas-ornaments",
    product: "magic-xmas-ornaments-set-of-3",
    productTitle: "Magic Xmas Ornaments",
    picture: "lamb-plumber",
    src: "/shop-library/studio/magic-xmas-ornaments.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "magic-poster",
    product: "magic-poster",
    productTitle: "Magic Poster",
    picture: "husky-journal",
    src: "/shop-library/studio/magic-poster.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "acrylic-print",
    product: "acrylic-print",
    productTitle: "Acrylic Print",
    picture: "admiral-cat",
    src: "/shop-library/studio/acrylic-print.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "acrylic-glass-art",
    product: "acrylic-glass-art",
    productTitle: "Acrylic Glass Art",
    picture: "beagle-peg-2",
    src: "/shop-library/studio/acrylic-glass-art.jpg",
    w: 1100,
    h: 1100,
  },
  {
    id: "magic-portrait-tile",
    product: "magic-portrait-copy",
    productTitle: "Magic Portrait Tile",
    picture: "shepherd-peg",
    src: "/shop-library/studio/magic-portrait-tile.jpg",
    w: 1100,
    h: 1100,
  },
];

/** "beagle-peg-2" → "Beagle peg 2" */
export function pictureLabel(slug: string): string {
  const s = slug.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
