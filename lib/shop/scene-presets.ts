import { z } from "zod";

/**
 * Lifestyle photos of Store products made with an image model (Settings › Shop › Room photos).
 * Pure: the preset shapes and defaults (kept in settings), the prompt and the stored file names.
 * The server side (model call, storage) is lib/shop/scenes.ts.
 */

export const PRINT_ASPECTS = ["1:1", "2:3", "3:4", "4:5", "5:7"] as const;
export const PHOTO_ASPECTS = ["1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "16:9"] as const;
export type PrintAspect = (typeof PRINT_ASPECTS)[number];
export type PhotoAspect = (typeof PHOTO_ASPECTS)[number];

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40);
const picturePath = z.string().max(500).regex(/^\/[A-Za-z0-9._\-/]+\.(jpg|jpeg|png|webp)$/, "A path in the app like /shop-samples/scenes/beagle-peg.jpg");

export type SceneProduct = { handle: string; text: string; print_aspect: PrintAspect };
export type ScenePreset = { id: string; product: string; label: string; picture: string; scene: string; photo_aspect: PhotoAspect };

export const sceneProductsSchema = z
  .array(z.object({ handle: z.string().regex(/^[a-z0-9-]{1,120}$/), text: z.string().min(20).max(1200), print_aspect: z.enum(PRINT_ASPECTS) }))
  .max(30) as unknown as z.ZodType<SceneProduct[]>;

export const scenePresetsSchema = z
  .array(
    z.object({
      id: slug,
      product: z.string().regex(/^[a-z0-9-]{1,120}$/),
      label: z.string().min(1).max(80),
      picture: picturePath,
      scene: z.string().min(20).max(2000),
      photo_aspect: z.enum(PHOTO_ASPECTS).default("4:5"),
    }),
  )
  .max(60)
  .refine((a) => new Set(a.map((p) => p.id)).size === a.length, "Each scene needs its own id") as unknown as z.ZodType<ScenePreset[]>;

export const DEFAULT_SCENE_RULES = [
  "Make one photorealistic lifestyle photograph for an online gift shop, as if taken by a professional interiors photographer in a real, lived-in home.",
  "{product}",
  "The first image shows this product as a plain studio render with a blank white print area. Use it only for the product's shape, proportions, thickness, edges and material. Do not copy its background, props or lighting.",
  "The second image is the picture printed on the product. Reproduce it exactly: the same subject, colours, composition and any lettering, printed edge to edge across the print area, not redrawn, restyled, mirrored, cropped differently or given a border.",
  "The scene: {scene}",
  "The product is the hero: sharp, well lit, fully visible and the first thing you notice, with nothing covering the printed picture. Furniture and props look real and in true scale with the product, styled but not cluttered. Natural soft light, true-to-life colours, gentle depth of field so the background falls slightly out of focus.",
  "No added text, logos, watermarks, price tags or other copies of the picture anywhere in the photo. Any people look natural and relaxed, and any animals look like real animals.",
].join("\n\n");

export const DEFAULT_SCENE_PRODUCTS: SceneProduct[] = [
  {
    handle: "magic-pillow-with-photo",
    print_aspect: "1:1",
    text: "The product is a square throw pillow in soft, smooth woven fabric, plump, with slightly rounded corners and a hidden zip. The picture is printed edge to edge across the whole front in full colour and follows the fabric's gentle curves.",
  },
  {
    handle: "masterpiece-copy",
    print_aspect: "2:3",
    text: "The product is a frameless wall print, 16 × 24 inches, portrait orientation, mounted on rigid lightweight board about a quarter of an inch thick with clean black edges. It hangs flat against the wall with no frame, mat or glass, and the picture covers the whole front edge to edge.",
  },
  {
    handle: "magic-puzzle",
    print_aspect: "3:4",
    text: "The product is a 252-piece jigsaw puzzle, about 11 × 14 inches, assembled, in portrait orientation. The picture is printed across the whole puzzle with a soft satin finish, and the classic interlocking cut lines are faintly visible across it.",
  },
  {
    handle: "acrylic-block",
    print_aspect: "5:7",
    text: "The product is a freestanding clear acrylic photo block, 5 × 7 inches, portrait orientation, about three quarters of an inch thick, with polished edges. The picture is printed on its back face, so it is seen through the thick clear acrylic with a glassy depth and bright, light-catching edges. It stands upright on its own with no stand or frame.",
  },
];

const S = "/shop-samples/scenes";

export const DEFAULT_SCENE_PRESETS: ScenePreset[] = [
  {
    id: "pillow-sofa",
    product: "magic-pillow-with-photo",
    label: "Pillow on a linen sofa",
    picture: `${S}/beagle-peg.jpg`,
    photo_aspect: "4:5",
    scene:
      "A bright Scandinavian living room. The pillow sits upright against the back cushion of a soft oatmeal linen three-seater sofa, turned slightly toward the camera, with a chunky cream knit throw folded over the arm. A light oak side table holds a ceramic lamp and a trailing pothos; a jute rug and pale wood floor below. Late-afternoon window light from the left. Camera at seated eye level with a 50mm lens; the pillow fills about a third of the frame.",
  },
  {
    id: "pillow-velvet-dog",
    product: "magic-pillow-with-photo",
    label: "Pillow on a velvet sofa, dog beside it",
    picture: `${S}/shepherd-peg.jpg`,
    photo_aspect: "4:5",
    scene:
      "A warm, lived-in living room in the evening. The pillow leans against the arm of a deep forest-green velvet sofa while a real German Shepherd, looking like the dog in the picture, sleeps curled up on the seat beside it with its chin near the pillow. A brass floor lamp glows; bookshelves and framed prints are softly blurred behind, with a hint of Christmas tree lights far in the background. Camera low at seat height with a 35mm lens.",
  },
  {
    id: "pillow-bed",
    product: "magic-pillow-with-photo",
    label: "Pillow on a made bed",
    picture: `${S}/admiral-cat.jpg`,
    photo_aspect: "4:5",
    scene:
      "A calm bedroom in soft morning light through sheer curtains. The pillow is propped in front of two plain white sleeping pillows against an upholstered linen headboard, on a neatly made bed with white sheets and a sage-green waffle blanket. A bedside table with a small lamp, a book and a mug; a real ginger cat stretched out at the foot of the bed, out of focus. Camera slightly above the bed with a 50mm lens, the pillow in the centre.",
  },
  {
    id: "masterpiece-living",
    product: "masterpiece-copy",
    label: "Masterpiece above a sideboard",
    picture: `${S}/admiral-teddy.jpg`,
    photo_aspect: "4:5",
    scene:
      "An elegant living room in soft daylight from a window on the right. The print hangs centred at eye level on a warm white wall above a low walnut sideboard that holds a stack of art books, a brass candlestick and a vase of dried eucalyptus. A caramel leather armchair and a tall fiddle-leaf fig at the edges of the frame; herringbone oak floor. Straight-on view with a 35mm lens; the print is about 40% of the frame's height.",
  },
  {
    id: "masterpiece-hallway-dog",
    product: "masterpiece-copy",
    label: "Masterpiece in a hallway, beagle below",
    picture: `${S}/beagle-peg-2.jpg`,
    photo_aspect: "4:5",
    scene:
      "A bright entrance hallway in natural daylight from the front door. The print hangs on a pale greige wall above a slim oak console table with a ceramic key bowl, a small plant and a pair of gloves; a real beagle sits on the runner rug below, looking up at the print. A wool coat on a hook at the edge of the frame, stairs softly blurred. Camera at standing height, slightly to the side, with a 28mm lens.",
  },
  {
    id: "masterpiece-study",
    product: "masterpiece-copy",
    label: "Masterpiece in a study, person at the desk",
    picture: `${S}/tommy-boy.jpg`,
    photo_aspect: "4:5",
    scene:
      "A calm study with deep green walls in warm evening light. The print hangs centred above a wide oak desk with a closed laptop, a brass desk lamp switched on, a coffee cup and a few notebooks; a woman in a cream sweater sits at the desk with her back to the camera, looking up at the print. Bookshelves at the side. Camera just behind her shoulder with a 35mm lens; the print is the clear focus.",
  },
  {
    id: "puzzle-dining",
    product: "magic-puzzle",
    label: "Puzzle on a dining table",
    picture: `${S}/husky-journal.jpg`,
    photo_aspect: "4:5",
    scene:
      "The completed puzzle lies flat on a solid oak dining table, every interlocking piece visible across the picture, with its cardboard box lid propped beside it and a few loose pieces near the edge. A mug of hot cocoa, a plate of gingerbread cookies and a small pine-sprig centrepiece; dining chairs and a softly lit kitchen behind. Overhead pendant light plus window light. Camera at a 45-degree angle from above with a 35mm lens; the puzzle fills about half the frame.",
  },
  {
    id: "puzzle-family",
    product: "magic-puzzle",
    label: "Puzzle with a family finishing it",
    picture: `${S}/lamb-plumber.jpg`,
    photo_aspect: "4:5",
    scene:
      "Two pairs of hands, a parent's and a child's in knitted sleeves, press the last pieces into the nearly finished puzzle on a wooden coffee table; the picture is complete apart from two gaps near one corner. A sofa with cushions behind and a lit Christmas tree glowing softly in the background, warm evening lamp light, the box lid and a bowl of clementines on the table. Camera close, from the side and slightly above table height, with a 50mm lens.",
  },
  {
    id: "puzzle-coffee-dog",
    product: "magic-puzzle",
    label: "Puzzle on a coffee table, bulldog watching",
    picture: `${S}/bartholomew.jpg`,
    photo_aspect: "4:5",
    scene:
      "The finished puzzle lies on a low walnut coffee table in a cosy living room, its interlocking piece lines visible; a real English bulldog rests its chin on the edge of the table, gazing at it. A cream boucle sofa behind, a wool rug, a tray with a teapot and a lit candle. Soft afternoon light. Camera above at a 60-degree angle with a 35mm lens; the puzzle is large in the frame.",
  },
  {
    id: "block-sideboard",
    product: "acrylic-block",
    label: "Acrylic block on a sideboard",
    picture: `${S}/cat-plumber.jpg`,
    photo_aspect: "4:5",
    scene:
      "A bright living room in morning light from a window on the left that makes the acrylic's edges glow. The block stands on a mid-century walnut sideboard beside a small stack of design books, a white ceramic bud vase with a single olive branch and a brass candle holder; a round mirror and a sofa are softly blurred behind. Camera at the sideboard's height, slightly to the side, with an 85mm lens; the block is the clear hero.",
  },
  {
    id: "block-desk",
    product: "acrylic-block",
    label: "Acrylic block on a desk",
    picture: `${S}/frenchie-journal.jpg`,
    photo_aspect: "4:5",
    scene:
      "A light oak home-office desk by a window with soft daylight. The block stands next to a laptop with its lid half open, a ceramic coffee mug, a pair of glasses and a small succulent; a person's hand rests near the laptop at the edge of the frame, and a leafy plant is blurred behind. Camera at desk height with an 85mm lens and shallow depth of field; the block is sharp.",
  },
  {
    id: "block-mantel",
    product: "acrylic-block",
    label: "Acrylic block on a Christmas mantel",
    picture: `${S}/rottweiler-plumber.jpg`,
    photo_aspect: "4:5",
    scene:
      "A cosy living room at Christmas, lit by firelight and warm fairy lights. The block stands centred on a white-painted fireplace mantel decorated with a pine garland and small brass candlesticks, with two knitted stockings hanging below; a real Rottweiler lies on the rug in front of the fire, softly out of focus. Camera at mantel height with a 70mm lens; the block is centred and sharp.",
  },
];

/** The full prompt for one preset: the rules with the product's text and the scene put in. */
export function scenePrompt(rules: string, product: SceneProduct, preset: ScenePreset, note?: string): string {
  const body = rules.replace("{product}", product.text).replace("{scene}", preset.scene);
  const extra = note?.trim() ? `\n\nAlso: ${note.trim().slice(0, 500)}` : "";
  return body + extra;
}

export function aspectRatio(a: string): number {
  const [w, h] = a.split(":").map(Number);
  return w > 0 && h > 0 ? w / h : 1;
}

/** A short, safe name for a picture from its path or file name: "beagle-peg" from "/shop-samples/scenes/beagle-peg.jpg". */
export function pictureSlug(name: string): string {
  const base = (name.split("/").pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  const s = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || "picture";
}

/**
 * Stored file name: <yyyymmdd>.<preset>.<picture>.<12 hex>.<w>x<h>.jpg under shop-scenes/<product handle>/.
 * Everything the gallery shows is in the name, so listing a folder is enough.
 */
const NAME = /^(\d{8})\.([a-z0-9-]{1,40})\.([a-z0-9-]{1,40})\.([a-f0-9]{12})\.(\d{2,5})x(\d{2,5})\.jpg$/;

export type SceneFile = { day: string; preset: string; picture: string; id: string; width: number; height: number };

export function sceneFileName(f: SceneFile): string {
  return `${f.day}.${f.preset}.${f.picture}.${f.id}.${f.width}x${f.height}.jpg`;
}

export function parseSceneFileName(name: string): SceneFile | null {
  const m = NAME.exec(name);
  if (!m) return null;
  return { day: m[1], preset: m[2], picture: m[3], id: m[4], width: Number(m[5]), height: Number(m[6]) };
}

/** yyyymmdd in UTC. */
export function dayStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
