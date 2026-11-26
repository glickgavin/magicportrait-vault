import type { QualityFeature } from "./lower";

/**
 * A product's "quality" block in the shape the Magic Store fields editor edits: always four features. Plain (not a
 * client module), because the server page builds the editor's starting values with it.
 */
export type QualityFormValue = { photo: string; alt: string; features: QualityFeature[] };

export const NO_FEATURE: QualityFeature = { icon: "check", title: "", sub: "" };

export function qualityForm(q: { photo: string; alt?: string; features: QualityFeature[] } | null): QualityFormValue {
  const f = q?.features ?? [];
  return { photo: q?.photo ?? "", alt: q?.alt ?? "", features: [0, 1, 2, 3].map((i) => ({ ...NO_FEATURE, ...f[i] })) };
}
