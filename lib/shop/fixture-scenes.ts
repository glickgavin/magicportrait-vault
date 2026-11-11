/**
 * Made-up blank product photos for fixtures, golden tests and local dev (no imports, so
 * scripts/gen-shop-fixtures.ts can use it under plain Node). Each scene's zone matches what the
 * script draws. Real templates are made in Settings › Shop on the product's own Shopify photos.
 */
export const SCENE_SIZE = 1000;

export type FixtureScene = {
  name: string;
  zone:
    | { kind: "corners"; points: [[number, number], [number, number], [number, number], [number, number]] }
    | { kind: "wrap"; left: number; right: number; top: number; bottom: number; curve: number; spread: number };
  mask: { kind: "none" | "rounded" | "circle"; radius: number };
  blend: "normal" | "multiply";
};

export const FIXTURE_SCENES: Record<string, FixtureScene> = {
  poster: { name: "poster", zone: { kind: "corners", points: [[0.33, 0.17], [0.67, 0.185], [0.665, 0.62], [0.335, 0.635]] }, mask: { kind: "none", radius: 0 }, blend: "normal" },
  acrylic: { name: "acrylic", zone: { kind: "corners", points: [[0.32, 0.16], [0.68, 0.16], [0.68, 0.66], [0.32, 0.66]] }, mask: { kind: "rounded", radius: 0.03 }, blend: "normal" },
  tile: { name: "tile", zone: { kind: "corners", points: [[0.27, 0.2], [0.71, 0.18], [0.73, 0.62], [0.29, 0.64]] }, mask: { kind: "rounded", radius: 0.02 }, blend: "normal" },
  mug: { name: "mug", zone: { kind: "wrap", left: 0.27, right: 0.6, top: 0.32, bottom: 0.72, curve: 0.025, spread: 0.75 }, mask: { kind: "none", radius: 0 }, blend: "multiply" },
  ornament: { name: "ornament", zone: { kind: "corners", points: [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]] }, mask: { kind: "circle", radius: 0.5 }, blend: "normal" },
  pillow: { name: "pillow", zone: { kind: "corners", points: [[0.24, 0.22], [0.76, 0.22], [0.76, 0.74], [0.24, 0.74]] }, mask: { kind: "rounded", radius: 0.06 }, blend: "multiply" },
  puzzle: { name: "puzzle", zone: { kind: "corners", points: [[0.2, 0.3], [0.8, 0.28], [0.84, 0.72], [0.16, 0.74]] }, mask: { kind: "none", radius: 0 }, blend: "normal" },
};

export function fixtureTemplate(scene: keyof typeof FIXTURE_SCENES) {
  const s = FIXTURE_SCENES[scene];
  return {
    v: 1 as const,
    background: { media_id: `fixture:${s.name}`, url: `/fixtures/shop/${s.name}.jpg`, w: SCENE_SIZE, h: SCENE_SIZE },
    zone: s.zone,
    overlay: null,
    mask: s.mask,
    blend: s.blend,
  };
}
