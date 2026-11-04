import type { Crop, Layout } from "@/lib/render/layout";

export type ClientVersion = {
  id: string;
  fullSlug: string;
  versionSlug: string;
  themeName: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  isNew: boolean;
  inSeason: boolean;
  layout: Layout;
  backgroundUrl: string;
  overlayUrl: string | null;
  thumbnailUrl: string | null;
  messageIdeas: string[];
  messageMaxChars: number | null;
  photoBg: string;
};

export type ClientPortrait = { imageId: string; imageUrl: string; ordered: boolean; sessionId: string; width: number | null; height: number | null };
export type ClientSession = { sessionId: string; themeName: string | null; petName: string | null; createdAt: string; portraits: ClientPortrait[] };

export type BuilderData = {
  versions: ClientVersion[];
  categories: { slug: string; name: string; inSeason: boolean; count: number }[];
  sessions: ClientSession[];
  firstName: string;
  footerText: string;
  maxChars: number;
  scheduleMaxDays: number;
  schedulingEnabled: boolean;
  cardsCount: number;
  defaults: { versionId: string | null; imageId: string | null };
};

export type Draft = {
  versionId: string | null;
  imageId: string | null;
  crop: Crop;
  to: string;
  from: string;
  message: string;
  messageTouched: boolean;
  delivery: "self" | "email";
  recipientEmail: string;
  when: "now" | "later";
  scheduledLocal: string;
  entryPoint: string | null;
  reusedFrom: string | null;
  flow: "first" | "full";
  editingCardId: string | null;
};

export const EMPTY_DRAFT: Draft = {
  versionId: null,
  imageId: null,
  crop: { zoom: 1, x: 0, y: 0 },
  to: "",
  from: "",
  message: "",
  messageTouched: false,
  delivery: "self",
  recipientEmail: "",
  when: "now",
  scheduledLocal: "",
  entryPoint: null,
  reusedFrom: null,
  flow: "full",
  editingCardId: null,
};
