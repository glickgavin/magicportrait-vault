import type { RawPastUpload } from "../images";

/**
 * Past photos from the events mirror (docs/shop.md › Images): the photos people uploaded to make a
 * portrait, and the photo-tile photos they dropped on the main site. Read-only, by email.
 */
export type MirrorTileUpload = { tileId: string; createdAt: string };
export type MirrorImageProps = { uploadEvent: string; uploadProperty: string; tileEvent: string; limit: number };

export interface ShopImagesSource {
  readonly kind: "live" | "fixtures";
  pastUploads(emails: string[], p: MirrorImageProps): Promise<RawPastUpload[]>;
  photoTileUploads(emails: string[], p: MirrorImageProps): Promise<MirrorTileUpload[]>;
}

/** Made-up rows for the fixture people only. */
export class ShopImagesFixtures implements ShopImagesSource {
  readonly kind = "fixtures" as const;
  private uploads = new Map<string, RawPastUpload[]>([
    [
      "sam@example.com",
      [
        { url: "https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/user-uploads/fx-sam-dog-park.jpg", createdAt: "2026-10-20T10:00:00Z" },
        { url: "https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/user-uploads/fx-sam-dog-park.jpg", createdAt: "2026-10-21T10:00:00Z" },
      ],
    ],
  ]);
  private tiles = new Map<string, MirrorTileUpload[]>([["sam@example.com", [{ tileId: "0b1f4c1e-7d2a-4c55-9e0a-5f9f2b9b0001", createdAt: "2026-10-25T09:00:00Z" }]]]);

  async pastUploads(emails: string[]) {
    return emails.flatMap((e) => structuredClone(this.uploads.get(e) ?? []));
  }
  async photoTileUploads(emails: string[]) {
    return emails.flatMap((e) => structuredClone(this.tiles.get(e) ?? []));
  }
}
