/** Shapes shared by the live and fixtures implementations of each external source. */

export type Attr = { key: string; value: string };

export type ShopifyLineItem = {
  id: string; // gid://shopify/LineItem/…
  title: string;
  quantity: number;
  currentQuantity: number;
  unfulfilledQuantity: number;
  productId: string | null; // gid
  productLegacyId: string | null;
  variantId: string | null;
  variantLegacyId: string | null;
  customAttributes: Attr[];
  imageUrl: string | null;
};

export type FinancialStatus = "AUTHORIZED" | "EXPIRED" | "PAID" | "PARTIALLY_PAID" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "VOIDED";

export type ShopifyOrder = {
  id: string; // gid://shopify/Order/…
  legacyId: string;
  name: string; // #1001
  createdAt: string;
  processedAt: string | null;
  cancelledAt: string | null;
  test: boolean;
  email: string | null;
  customer: { id: string; firstName: string | null; lastName: string | null; email: string | null } | null;
  financialStatus: FinancialStatus | null;
  fulfillmentStatus: string | null;
  tags: string[];
  statusPageUrl: string | null;
  total: { amount: string; currency: string } | null;
  mugChoice: { value: string; updatedAt: string | null; compareDigest: string | null } | null;
  lineItems: ShopifyLineItem[];
};

export type MetafieldWriteResult = { ok: true } | { ok: false; reason: string };

export interface ShopifySource {
  readonly kind: "live" | "fixtures";
  ordersByEmail(email: string): Promise<ShopifyOrder[]>;
  orderById(gidOrLegacyId: string): Promise<ShopifyOrder | null>;
  resolveOrderByName(name: string): Promise<{ id: string; name: string } | null>;
  setMugChoice(input: { orderGid: string; namespace: string; key: string; type: string; value: string; compareDigest: string | null }): Promise<MetafieldWriteResult>;
  addTags(orderGid: string, tags: string[]): Promise<MetafieldWriteResult>;
  ping(): Promise<{ shop: string; scopes: string[]; auth?: "client_credentials" | "static_token" }>;
}

export type MirrorSession = {
  imagenSessionId: string;
  lptempSessionId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type MugJob = {
  shopifyLineItemId: string;
  tileId: string | null;
  state: string;
  gelatoOrderId: string | null;
  shopifyFulfillmentId: string | null;
  mugReady: boolean;
  manualApproval: string | null;
  trackingUrl: string | null;
  updatedAt: string;
};

export interface MirrorSource {
  readonly kind: "live" | "fixtures";
  sessionsForEmail(candidates: string[], opts?: { expandByBrowserSession?: boolean }): Promise<MirrorSession[]>;
  mugJobs(orderLegacyId: string): Promise<MugJob[]>;
  ping(): Promise<{ rows: number }>;
}

export type ImagenPortraitRow = {
  imageId: string;
  sessionId: string;
  sessionCreatedAt: string;
  sessionStatus: string;
  isRecommendationChild: boolean;
  parentSessionId: string | null;
  petName: string | null;
  themeId: string | null;
  themeName: string | null;
  themeSlug: string | null;
  createdAt: string;
  tileIndex: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  imagePath: string;
  imageUrl: string;
  ordered: boolean; // revenue_events
  shopifyOrderIds: string[];
  shopifyLineItemIds: string[];
  firstOrderedAt: string | null;
};

export interface ImagenSource {
  readonly kind: "live" | "fixtures";
  portraits(sessionIds: string[], opts: { includeChildren: boolean; imageBaseUrl: string }): Promise<ImagenPortraitRow[]>;
  sessions(sessionIds: string[]): Promise<{ id: string; createdAt: string; status: string; petName: string | null; themeName: string | null }[]>;
  ping(): Promise<{ rows: number }>;
}
